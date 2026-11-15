/**
 * Zeeno Dental for temi — Cloudflare Worker (D1 + Workers AI).
 *
 *  /api/auth/*       dashboard login (Zeeno admin / clinic owner)
 *  /api/admin/*      clinics, owner accounts, cross-clinic stats
 *  /api/clinics/*    dentists, approved content, destinations, import, inbox
 *  /api/robots/*     pairing, settings, map, floor-plan overlay, commands
 *  /api/robot/*      temi app (robot bearer token)
 *  /c/:token         staff-issued aftercare page (no patient identity)
 *  /*                dashboard
 *
 * Phase 2 is not implemented: queue display, medical forms, consent capture,
 * remote video, and automated reminders. Contact reception is an inbox alert only.
 */
import { DASHBOARD } from './static';

export interface Env { DB: D1Database; AI?: { run(model: string, input: unknown): Promise<any> }; BOOTSTRAP_ADMIN?: string }

type User = { id: string; email: string; name: string; role: 'admin' | 'owner' };
type Robot = { id: string; clinic_id: string | null; name: string; settings: string; version: number };

const LANGS = ['en', 'es', 'zh-Hans', 'zh-Hant'] as const;
const now = () => Date.now();
const uid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rand = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
const parse = <T = any>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const loc = (o: any) => { const r: Record<string, string> = {}; for (const l of LANGS) r[l] = String(o?.[l] ?? ''); return r; };

class HttpError extends Error { constructor(public status: number, public code: string, msg?: string) { super(msg ?? code); } }
const bad = (code: string, msg?: string) => new HttpError(400, code, msg);
const J = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const DEFAULT_SETTINGS = {
  defaultLang: 'en',
  languages: ['en', 'es', 'zh-Hans', 'zh-Hant'],
  pin: '2408',
  kiosk: true,
  speed: 'slow',
  backwards: true,
  greetCooldownMin: 8,
  idleClearSeconds: 90,
  idleHomeMinutes: 0,
};

async function hashPw(pw: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}

const CHUNK = 900_000;
async function putAsset(env: Env, bytes: Uint8Array, mime: string) {
  const id = uid('a_') + rand(6);
  const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const stmts = [env.DB.prepare('INSERT INTO assets (id,mime,size,chunks,created_at) VALUES (?,?,?,?,?)').bind(id, mime, bytes.length, n, now())];
  for (let i = 0; i < n; i++) stmts.push(env.DB.prepare('INSERT INTO asset_chunks (asset_id,idx,data) VALUES (?,?,?)').bind(id, i, bytes.subarray(i * CHUNK, (i + 1) * CHUNK)));
  await env.DB.batch(stmts);
  return id;
}
async function getAsset(env: Env, id: string) {
  const a = await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(id).first<any>();
  if (!a) return null;
  const rows = (await env.DB.prepare('SELECT data FROM asset_chunks WHERE asset_id=? ORDER BY idx').bind(id).all<any>()).results;
  const out = new Uint8Array(a.size); let o = 0;
  for (const r of rows) { const b = new Uint8Array(r.data); out.set(b, o); o += b.length; }
  return { mime: a.mime as string, bytes: out };
}
async function dropAsset(env: Env, id?: string | null) { if (id) await env.DB.batch([env.DB.prepare('DELETE FROM asset_chunks WHERE asset_id=?').bind(id), env.DB.prepare('DELETE FROM assets WHERE id=?').bind(id)]); }
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const COOKIE = 'zeenos';
async function sessionUser(req: Request, env: Env): Promise<User | null> {
  const auth = req.headers.get('authorization');
  let tok = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!tok) tok = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? null;
  if (!tok) return null;
  const row = await env.DB.prepare('SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(tok), now()).first<User>();
  return row ?? null;
}
async function needUser(req: Request, env: Env) { const u = await sessionUser(req, env); if (!u) throw new HttpError(401, 'unauthorized', 'Please sign in.'); return u; }
async function needAdmin(req: Request, env: Env) { const u = await needUser(req, env); if (u.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admin only.'); return u; }
async function canClinic(env: Env, u: User, cid: string) {
  if (u.role === 'admin') { if (!(await env.DB.prepare('SELECT 1 FROM clinics WHERE id=?').bind(cid).first())) throw new HttpError(404, 'not_found'); return; }
  const ok = await env.DB.prepare('SELECT 1 FROM owner_clinics WHERE user_id=? AND clinic_id=?').bind(u.id, cid).first();
  if (!ok) throw new HttpError(403, 'forbidden', 'This clinic is not assigned to you.');
}
async function userRobot(env: Env, u: User, rid: string) {
  const r = await env.DB.prepare('SELECT * FROM robots WHERE id=?').bind(rid).first<any>();
  if (!r) throw new HttpError(404, 'not_found', 'Robot not found.');
  if (u.role !== 'admin') { if (!r.clinic_id) throw new HttpError(403, 'forbidden'); await canClinic(env, u, r.clinic_id); }
  return r;
}
async function robotAuth(req: Request, env: Env): Promise<Robot> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Robot is not paired.');
  const r = await env.DB.prepare('SELECT id,clinic_id,name,settings,version FROM robots WHERE token_hash=?').bind(await sha(auth.slice(7))).first<Robot>();
  if (!r) throw new HttpError(401, 'unauthorized', 'Robot is not paired.');
  return r;
}
const bump = (env: Env, cid: string) => env.DB.prepare('UPDATE clinics SET version=version+1, updated_at=? WHERE id=?').bind(now(), cid).run();
const normLoc = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function packLoc(prefix: string, o: any) {
  const src = o?.[prefix] && typeof o[prefix] === 'object' ? o[prefix] : o;
  return {
    [`${prefix}_en`]: String(src?.en ?? o?.[`${prefix}_en`] ?? ''),
    [`${prefix}_es`]: String(src?.es ?? o?.[`${prefix}_es`] ?? ''),
    [`${prefix}_zh_hans`]: String(src?.['zh-Hans'] ?? src?.zh_hans ?? o?.[`${prefix}_zh_hans`] ?? ''),
    [`${prefix}_zh_hant`]: String(src?.['zh-Hant'] ?? src?.zh_hant ?? o?.[`${prefix}_zh_hant`] ?? ''),
  };
}
const unpack = (r: any, prefix: string) => ({ en: r[`${prefix}_en`] ?? '', es: r[`${prefix}_es`] ?? '', 'zh-Hans': r[`${prefix}_zh_hans`] ?? '', 'zh-Hant': r[`${prefix}_zh_hant`] ?? '' });

function clinicOut(g: any) {
  if (!g) return null;
  return {
    id: g.id, name: g.name, address: g.address ?? '', phone: g.phone ?? '', email: g.email ?? '', website: g.website ?? '',
    hours: parse(g.hours, {}), parking: parse(g.parking, {}), payment: parse(g.payment, {}), accessibility: parse(g.accessibility, {}), welcome: parse(g.welcome, {}),
    reviewer: g.reviewer ?? '', data_source_url: g.data_source_url ?? '', version: g.version, created_at: g.created_at, updated_at: g.updated_at,
  };
}
function dentistOut(r: any) {
  return { id: r.id, clinic_id: r.clinic_id, name: r.name, role: r.role, bio: unpack(r, 'bio'), languages: parse(r.languages, []), specialties: r.specialties, photo_url: r.photo_url, active: !!r.active };
}
function contentOut(r: any) {
  return {
    id: r.id, clinic_id: r.clinic_id, kind: r.kind, slug: r.slug, category: r.category, sort_order: r.sort_order,
    version_label: r.version_label, reviewer: r.reviewer, approved: !!r.approved, active: r.active !== 0, media_kind: r.media_kind, media_url: r.media_url,
    title: unpack(r, 'title'), body: unpack(r, 'body'), updated_at: r.updated_at,
  };
}
function destOut(r: any) {
  return { id: r.id, clinic_id: r.clinic_id, location_name: r.location_name, kind: r.kind, requires_staff: !!r.requires_staff, sort_order: r.sort_order, active: r.active !== 0, label: unpack(r, 'label'), note: unpack(r, 'note') };
}
function cleanSettings(s: any) {
  const o: any = { ...DEFAULT_SETTINGS, ...s };
  const langs = Array.isArray(o.languages) ? o.languages.filter((l: string) => (LANGS as readonly string[]).includes(l)) : DEFAULT_SETTINGS.languages;
  o.languages = langs.length ? langs : DEFAULT_SETTINGS.languages;
  if (!(LANGS as readonly string[]).includes(o.defaultLang)) o.defaultLang = o.languages[0];
  if (!['slow', 'medium', 'high'].includes(o.speed)) o.speed = 'slow';
  o.pin = String(o.pin ?? '2408').replace(/\D/g, '').slice(0, 8) || '2408';
  o.kiosk = !!o.kiosk; o.backwards = o.backwards !== false;
  o.greetCooldownMin = Math.min(120, Math.max(1, Number(o.greetCooldownMin) || 8));
  o.idleClearSeconds = Math.min(600, Math.max(30, Number(o.idleClearSeconds) || 90));
  o.idleHomeMinutes = Math.min(120, Math.max(0, Number(o.idleHomeMinutes) || 0));
  return o;
}
const robotOut = (r: any) => ({
  id: r.id, clinic_id: r.clinic_id, name: r.name, serial: r.serial, paired: !!r.token_hash,
  pair_code: r.pair_expires > now() ? r.pair_code : null, pair_expires: r.pair_expires,
  settings: cleanSettings(parse(r.settings, {})), status: parse(r.status, {}), last_seen: r.last_seen,
  online: !!r.last_seen && now() - r.last_seen < 60_000, locations: parse(r.locations, []),
});

async function upd(env: Env, table: string, id: string, vals: Record<string, any>, extra = '') {
  const keys = Object.keys(vals); if (!keys.length) return;
  await env.DB.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')}${extra} WHERE id=?`).bind(...keys.map((k) => vals[k] ?? null), id).run();
}

const CLINIC_TEXT = ['name', 'address', 'phone', 'email', 'website', 'reviewer', 'data_source_url'] as const;
function clinicPatch(b: any) {
  const v: Record<string, any> = {};
  for (const k of CLINIC_TEXT) if (b && k in b && b[k] !== undefined) v[k] = String(b[k] ?? '');
  for (const k of ['hours', 'parking', 'payment', 'accessibility', 'welcome'] as const) {
    if (b && b[k] && typeof b[k] === 'object') v[k] = JSON.stringify(loc(b[k]));
  }
  return v;
}

async function insertContent(env: Env, cid: string, a: any) {
  const t = packLoc('title', a), body = packLoc('body', a);
  const id = uid('c_');
  await env.DB.prepare(`INSERT INTO content (id,clinic_id,kind,slug,category,sort_order,version_label,reviewer,approved,media_kind,media_url,
    title_en,title_es,title_zh_hans,title_zh_hant,body_en,body_es,body_zh_hans,body_zh_hant,active,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).bind(
    id, cid, String(a.kind || 'faq'), String(a.slug || id), String(a.category || ''), Number(a.sort_order) || 0,
    String(a.version_label || '1.0'), String(a.reviewer || ''), a.approved === 0 || a.approved === false ? 0 : 1,
    String(a.media_kind || 'text'), String(a.media_url || ''),
    t.title_en, t.title_es, t.title_zh_hans, t.title_zh_hant, body.body_en, body.body_es, body.body_zh_hans, body.body_zh_hant, now(),
  ).run();
  return id;
}

function csv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = (rows.shift() ?? []).map((x) => x.trim());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}
function rowToContent(r: Record<string, string>) {
  const g = (...k: string[]) => { for (const x of k) if (r[x]) return r[x]; return ''; };
  return {
    kind: g('kind') || 'faq', slug: g('slug'), category: g('category'), sort_order: parseInt(g('sort_order') || '0') || 0,
    version_label: g('version_label', 'version') || '1.0', reviewer: g('reviewer'), approved: g('approved') === '0' ? 0 : 1,
    media_kind: g('media_kind') || 'text', media_url: g('media_url'),
    title: { en: g('title_en'), es: g('title_es'), 'zh-Hans': g('title_zh_hans', 'title_zh-Hans'), 'zh-Hant': g('title_zh_hant', 'title_zh-Hant') },
    body: { en: g('body_en'), es: g('body_es'), 'zh-Hans': g('body_zh_hans', 'body_zh-Hans'), 'zh-Hant': g('body_zh_hant', 'body_zh-Hant') },
  };
}
async function fetchSheetCsv(url: string, tab?: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw bad('bad_url', 'Paste a Google Sheets link.');
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  const u = tab ? `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
    : `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? '&gid=' + gid : ''}`;
  const r = await fetch(u, { redirect: 'follow' });
  const t = await r.text();
  if (!r.ok || t.trimStart().startsWith('<')) throw bad('sheet_private', 'The sheet could not be read. Share it as "Anyone with the link can view", or upload a CSV.');
  return t;
}

async function bundle(env: Env, cid: string) {
  const [g, dentists, content, destinations] = await Promise.all([
    env.DB.prepare('SELECT * FROM clinics WHERE id=?').bind(cid).first<any>(),
    env.DB.prepare('SELECT * FROM dentists WHERE clinic_id=? ORDER BY name').bind(cid).all<any>(),
    env.DB.prepare('SELECT * FROM content WHERE clinic_id=? ORDER BY kind, sort_order, version_label').bind(cid).all<any>(),
    env.DB.prepare('SELECT * FROM destinations WHERE clinic_id=? ORDER BY sort_order, location_name').bind(cid).all<any>(),
  ]);
  return { clinic: clinicOut(g), dentists: dentists.results.map(dentistOut), content: content.results.map(contentOut), destinations: destinations.results.map(destOut) };
}

const STOP = new Set('the a an to of and or for is in on my me do you how what when where your this that with from are was can el la los las de y que un una en por para con del al una una una mi su cómo como qué que una'.split(/\s+/));
function tokens(s: string) {
  const out: string[] = [];
  for (const m of s.toLowerCase().match(/[a-záéíóúüñ0-9]{3,}/g) ?? []) if (!STOP.has(m)) out.push(m);
  const cjk = [...s].filter((ch) => ch >= '\u4e00' && ch <= '\u9fff');
  for (let i = 0; i < cjk.length; i++) { out.push(cjk[i]); if (i) out.push(cjk[i - 1] + cjk[i]); }
  return out;
}
function scoreItem(q: string[], item: any) {
  const title = `${item.title_en} ${item.title_es} ${item.title_zh_hans} ${item.title_zh_hant}`.toLowerCase();
  const body = `${item.body_en} ${item.body_es} ${item.body_zh_hans} ${item.body_zh_hant} ${item.category}`.toLowerCase();
  let s = 0;
  for (const t of q) { if (title.includes(t)) s += 3; else if (body.includes(t)) s += 1; }
  return s;
}
const ESCALATE: Record<string, string> = {
  en: 'I can only answer from this clinic’s approved guide, and I could not find that there. I do not give personal dental advice. Reception can help.',
  es: 'Solo puedo responder con la guía aprobada por la clínica, y no encontré eso. No doy consejos dentales personales. Recepción puede ayudarle.',
  'zh-Hans': '我只能根据诊所已审核的内容回答，这里没有找到对应说明。我不会提供针对个人的牙科建议。前台可以协助您。',
  'zh-Hant': '我只能根據診所已審核的內容回答，這裡沒有找到對應說明。我不會提供針對個人的牙科建議。前台可以協助您。',
};
function pickLang(lang: string) { return (LANGS as readonly string[]).includes(lang) ? lang : 'en'; }
function textOf(item: any, lang: string, field: 'title' | 'body') {
  const key = field === 'title' ? 'title' : 'body';
  const map: Record<string, string> = { en: item[`${key}_en`], es: item[`${key}_es`], 'zh-Hans': item[`${key}_zh_hans`], 'zh-Hant': item[`${key}_zh_hant`] };
  return map[lang] || map.en || '';
}
async function answer(env: Env, rb: Robot, body: any) {
  const qRaw = String(body.question ?? '').slice(0, 400).trim();
  const lang = pickLang(String(body.lang ?? 'en'));
  if (!qRaw) throw bad('empty_question');
  const sensitive = /@/.test(qRaw) || (qRaw.match(/\d/g) ?? []).length >= 7;
  if (!rb.clinic_id) return { confident: false, answer: ESCALATE[lang], source: '', version: '', reviewer: '', contentId: null };
  const rows = (await env.DB.prepare("SELECT * FROM content WHERE clinic_id=? AND active=1 AND approved=1 AND kind IN ('faq','orientation','explainer','oral')").bind(rb.clinic_id).all<any>()).results;
  const q = sensitive ? [] : tokens(qRaw);
  let best: any = null, bestS = 0;
  for (const r of rows) { const s = scoreItem(q, r); if (s > bestS) { bestS = s; best = r; } }
  let chosen = bestS >= 3 ? best : null;
  if (!chosen && !sensitive && env.AI && rows.length && qRaw.length <= 240) {
    try {
      const list = rows.slice(0, 60).map((r: any) => `${r.id} | ${r.kind} | ${r.title_en}`).join('\n');
      const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'Match the visitor question to one approved clinic item. Reply with only the id from the list, or NONE. Do not add advice, diagnosis or a recommendation.' },
          { role: 'user', content: `Items:\n${list}\n\nQuestion:\n${qRaw}` },
        ],
        max_tokens: 40, temperature: 0,
      });
      const id = String(out?.response ?? '').trim().split(/\s+/)[0];
      chosen = rows.find((r: any) => r.id === id) ?? null;
    } catch { /* approved text only; a model failure is an escalation */ }
  }
  await env.DB.prepare('INSERT INTO events (robot_id,clinic_id,type,ref,value,at) VALUES (?,?,?,?,?,?)')
    .bind(rb.id, rb.clinic_id, 'faq', chosen?.id ?? null, chosen?.category || chosen?.kind || 'none', now()).run();
  if (!chosen) return { confident: false, answer: ESCALATE[lang], source: '', version: '', reviewer: '', contentId: null };
  return {
    confident: true, answer: textOf(chosen, lang, 'body'), title: textOf(chosen, lang, 'title'),
    source: textOf(chosen, lang, 'title'), version: chosen.version_label, reviewer: chosen.reviewer, contentId: chosen.id, kind: chosen.kind,
  };
}

async function queue(env: Env, rid: string, type: string, payload: unknown = {}) {
  const id = uid('m_');
  if (type === 'map_refresh' || type === 'sync')
    await env.DB.prepare("UPDATE commands SET status='superseded', updated_at=? WHERE robot_id=? AND type=? AND status='pending'").bind(now(), rid, type).run();
  await env.DB.prepare('INSERT INTO commands (id,robot_id,type,payload,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id, rid, type, JSON.stringify(payload), 'pending', now(), now()).run();
  await env.DB.prepare('UPDATE robots SET live_until=? WHERE id=?').bind(now() + 60_000, rid).run();
  return id;
}
const logEvent = (env: Env, rb: Robot, type: string, ref: string | null, value: string | null) =>
  env.DB.prepare('INSERT INTO events (robot_id,clinic_id,type,ref,value,at) VALUES (?,?,?,?,?,?)').bind(rb.id, rb.clinic_id, type, ref, value, now()).run();

type H = (req: Request, env: Env, p: Record<string, string>, url: URL) => Promise<Response>;
const routes: [string, RegExp, string[], H][] = [];
function on(method: string, path: string, h: H) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push([method, re, keys, h]);
}
const body = async (req: Request) => { try { return await req.json<any>(); } catch { throw bad('bad_json'); } };

on('POST', '/api/auth/login', async (req, env) => {
  const b = await body(req);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(String(b.email ?? '').trim().toLowerCase()).first<any>();
  if (!u || (await hashPw(String(b.password ?? ''), u.pw_salt)) !== u.pw_hash) throw new HttpError(401, 'bad_login', 'Email or password is incorrect.');
  const tok = rand(32);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha(tok), u.id, now() + 14 * 864e5),
    env.DB.prepare('UPDATE users SET last_login=? WHERE id=?').bind(now(), u.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
  ]);
  return J({ user: { id: u.id, email: u.email, name: u.name, role: u.role }, token: tok }, 200,
    { 'set-cookie': `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 86400}` });
});
on('POST', '/api/auth/logout', async (req, env) => {
  const tok = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(tok)).run();
  return J({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
});
on('GET', '/api/auth/me', async (req, env) => J({ user: await sessionUser(req, env) }));
on('POST', '/api/auth/password', async (req, env) => {
  const u = await needUser(req, env); const b = await body(req);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first<any>();
  if ((await hashPw(String(b.current ?? ''), row.pw_salt)) !== row.pw_hash) throw bad('bad_password', 'Current password is incorrect.');
  if (String(b.next ?? '').length < 8) throw bad('weak_password', 'Use at least 8 characters.');
  const salt = rand(12);
  await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?').bind(await hashPw(b.next, salt), salt, u.id).run();
  return J({ ok: true });
});

on('GET', '/api/admin/users', async (req, env) => {
  await needAdmin(req, env);
  const users = (await env.DB.prepare('SELECT id,email,name,role,created_at,last_login FROM users ORDER BY role, email').all<any>()).results;
  const links = (await env.DB.prepare('SELECT * FROM owner_clinics').all<any>()).results;
  return J({ users: users.map((u: any) => ({ ...u, clinic_ids: links.filter((l: any) => l.user_id === u.id).map((l: any) => l.clinic_id) })) });
});
on('POST', '/api/admin/users', async (req, env) => {
  await needAdmin(req, env); const b = await body(req);
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('bad_email', 'Enter a valid email.');
  if (String(b.password ?? '').length < 8) throw bad('weak_password', 'Use a password of at least 8 characters.');
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) throw bad('exists', 'A user with this email already exists.');
  const id = uid('u_'), salt = rand(12);
  const role = b.role === 'admin' ? 'admin' : 'owner';
  const stmts = [env.DB.prepare('INSERT INTO users (id,email,name,role,pw_hash,pw_salt,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, email, String(b.name ?? ''), role, await hashPw(b.password, salt), salt, now())];
  for (const g of Array.isArray(b.clinic_ids) ? b.clinic_ids : []) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO owner_clinics (user_id,clinic_id) VALUES (?,?)').bind(id, g));
  await env.DB.batch(stmts);
  return J({ id });
});
on('PATCH', '/api/admin/users/:id', async (req, env, p) => {
  const me = await needAdmin(req, env); const b = await body(req);
  const stmts: D1PreparedStatement[] = [];
  if (b.name !== undefined) stmts.push(env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(String(b.name), p.id));
  if (b.role !== undefined && p.id !== me.id) stmts.push(env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role === 'admin' ? 'admin' : 'owner', p.id));
  if (b.password) { if (String(b.password).length < 8) throw bad('weak_password', 'Use at least 8 characters.'); const salt = rand(12); stmts.push(env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?').bind(await hashPw(b.password, salt), salt, p.id)); }
  if (Array.isArray(b.clinic_ids)) {
    stmts.push(env.DB.prepare('DELETE FROM owner_clinics WHERE user_id=?').bind(p.id));
    for (const g of b.clinic_ids) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO owner_clinics (user_id,clinic_id) VALUES (?,?)').bind(p.id, g));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return J({ ok: true });
});
on('DELETE', '/api/admin/users/:id', async (req, env, p) => {
  const me = await needAdmin(req, env);
  if (p.id === me.id) throw bad('self', 'You cannot delete your own account.');
  await env.DB.batch([env.DB.prepare('DELETE FROM users WHERE id=?').bind(p.id), env.DB.prepare('DELETE FROM owner_clinics WHERE user_id=?').bind(p.id), env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(p.id)]);
  return J({ ok: true });
});
on('POST', '/api/admin/clinics', async (req, env) => {
  await needAdmin(req, env); const b = await body(req);
  if (!String(b.name ?? '').trim()) throw bad('name_required', 'Enter a clinic name.');
  const id = uid('g_'); const v = clinicPatch(b);
  const keys = ['id', 'created_at', 'updated_at', ...Object.keys(v)];
  await env.DB.prepare(`INSERT INTO clinics (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(id, now(), now(), ...Object.values(v)).run();
  return J({ id });
});
on('DELETE', '/api/admin/clinics/:cid', async (req, env, p) => {
  await needAdmin(req, env);
  const tables = ['clinics:id', 'dentists:clinic_id', 'content:clinic_id', 'destinations:clinic_id', 'owner_clinics:clinic_id', 'arrivals:clinic_id', 'alerts:clinic_id', 'feedback:clinic_id', 'escorts:clinic_id', 'takeaway:clinic_id'];
  await env.DB.batch(tables.map((s) => { const [t, c] = s.split(':'); return env.DB.prepare(`DELETE FROM ${t} WHERE ${c}=?`).bind(p.cid); }));
  await env.DB.prepare('UPDATE robots SET clinic_id=NULL WHERE clinic_id=?').bind(p.cid).run();
  return J({ ok: true });
});
on('GET', '/api/admin/stats', async (req, env) => {
  await needAdmin(req, env);
  const since = now() - 30 * 864e5;
  const clinics = (await env.DB.prepare('SELECT id,name FROM clinics ORDER BY name').all<any>()).results;
  const events = (await env.DB.prepare('SELECT clinic_id, type, COUNT(*) n FROM events WHERE at>? GROUP BY clinic_id, type').bind(since).all<any>()).results;
  const arrivals = (await env.DB.prepare('SELECT clinic_id, COUNT(*) n FROM arrivals WHERE created_at>? GROUP BY clinic_id').bind(since).all<any>()).results;
  const alerts = (await env.DB.prepare('SELECT clinic_id, COUNT(*) n FROM alerts WHERE created_at>? GROUP BY clinic_id').bind(since).all<any>()).results;
  const feedback = (await env.DB.prepare('SELECT clinic_id, COUNT(*) n FROM feedback WHERE created_at>? GROUP BY clinic_id').bind(since).all<any>()).results;
  return J({ since, clinics, events, arrivals, alerts, feedback });
});

on('GET', '/api/clinics', async (req, env) => {
  const u = await needUser(req, env);
  const q = u.role === 'admin'
    ? env.DB.prepare('SELECT g.*, (SELECT COUNT(*) FROM content a WHERE a.clinic_id=g.id) n_content, (SELECT COUNT(*) FROM robots r WHERE r.clinic_id=g.id) n_robots FROM clinics g ORDER BY name')
    : env.DB.prepare('SELECT g.*, (SELECT COUNT(*) FROM content a WHERE a.clinic_id=g.id) n_content, (SELECT COUNT(*) FROM robots r WHERE r.clinic_id=g.id) n_robots FROM clinics g JOIN owner_clinics o ON o.clinic_id=g.id WHERE o.user_id=? ORDER BY name').bind(u.id);
  const rows = (await q.all<any>()).results.map((g: any) => ({ ...clinicOut(g), n_content: g.n_content, n_robots: g.n_robots }));
  return J({ clinics: rows });
});
on('GET', '/api/clinics/:cid', async (req, env, p) => { const u = await needUser(req, env); await canClinic(env, u, p.cid); return J(await bundle(env, p.cid)); });
on('PATCH', '/api/clinics/:cid', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid);
  await upd(env, 'clinics', p.cid, clinicPatch(await body(req)), ', version=version+1, updated_at=' + now());
  return J({ ok: true });
});
on('GET', '/api/clinics/:cid/stats', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid);
  const since = now() - 30 * 864e5;
  const byType = (await env.DB.prepare('SELECT type, COUNT(*) n FROM events WHERE clinic_id=? AND at>? GROUP BY type').bind(p.cid, since).all()).results;
  const topContent = (await env.DB.prepare("SELECT e.ref, c.kind, c.title_en, COUNT(*) n FROM events e LEFT JOIN content c ON c.id=e.ref WHERE e.clinic_id=? AND e.at>? AND e.ref IS NOT NULL GROUP BY e.ref ORDER BY n DESC LIMIT 12").bind(p.cid, since).all()).results;
  const arrivals = await env.DB.prepare('SELECT COUNT(*) n FROM arrivals WHERE clinic_id=? AND created_at>?').bind(p.cid, since).first<any>();
  const walkins = await env.DB.prepare("SELECT COUNT(*) n FROM arrivals WHERE clinic_id=? AND kind='walkin' AND created_at>?").bind(p.cid, since).first<any>();
  const alerts = await env.DB.prepare('SELECT COUNT(*) n FROM alerts WHERE clinic_id=? AND created_at>?').bind(p.cid, since).first<any>();
  const feedback = await env.DB.prepare('SELECT COUNT(*) n FROM feedback WHERE clinic_id=? AND created_at>?').bind(p.cid, since).first<any>();
  const open = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM arrivals WHERE clinic_id=? AND status='open') + (SELECT COUNT(*) FROM alerts WHERE clinic_id=? AND status='open') + (SELECT COUNT(*) FROM escorts WHERE clinic_id=? AND status='pending') n").bind(p.cid, p.cid, p.cid).first<any>();
  return J({ byType, topContent, arrivals: arrivals?.n ?? 0, walkins: walkins?.n ?? 0, alerts: alerts?.n ?? 0, feedback: feedback?.n ?? 0, openInbox: open?.n ?? 0 });
});
on('GET', '/api/clinics/:cid/inbox', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid);
  const [arrivals, alerts, feedback, escorts] = await Promise.all([
    env.DB.prepare('SELECT * FROM arrivals WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100').bind(p.cid).all<any>(),
    env.DB.prepare('SELECT * FROM alerts WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100').bind(p.cid).all<any>(),
    env.DB.prepare('SELECT * FROM feedback WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100').bind(p.cid).all<any>(),
    env.DB.prepare('SELECT * FROM escorts WHERE clinic_id=? ORDER BY created_at DESC LIMIT 100').bind(p.cid).all<any>(),
  ]);
  return J({ arrivals: arrivals.results, alerts: alerts.results, feedback: feedback.results, escorts: escorts.results });
});

async function ack(env: Env, table: string, id: string, cid: string) {
  await env.DB.prepare(`UPDATE ${table} SET status='acknowledged', acknowledged_at=? WHERE id=? AND clinic_id=?`).bind(now(), id, cid).run();
}
on('POST', '/api/clinics/:cid/arrivals/:id/ack', async (req, env, p) => { const u = await needUser(req, env); await canClinic(env, u, p.cid); await ack(env, 'arrivals', p.id, p.cid); return J({ ok: true }); });
on('POST', '/api/clinics/:cid/alerts/:id/ack', async (req, env, p) => { const u = await needUser(req, env); await canClinic(env, u, p.cid); await ack(env, 'alerts', p.id, p.cid); return J({ ok: true }); });
on('POST', '/api/clinics/:cid/feedback/:id/ack', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid);
  await env.DB.prepare("UPDATE feedback SET status='acknowledged' WHERE id=? AND clinic_id=?").bind(p.id, p.cid).run();
  return J({ ok: true });
});
on('POST', '/api/clinics/:cid/escorts/:id', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid); const b = await body(req);
  const status = b.status === 'approved' ? 'approved' : 'declined';
  await env.DB.prepare('UPDATE escorts SET status=?, decided_at=? WHERE id=? AND clinic_id=?').bind(status, now(), p.id, p.cid).run();
  return J({ ok: true, status });
});
on('POST', '/api/clinics/:cid/aftercare', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid); const b = await body(req);
  const robot = await userRobot(env, u, String(b.robot_id || ''));
  if (robot.clinic_id !== p.cid) throw new HttpError(403, 'forbidden');
  const item = await env.DB.prepare("SELECT id FROM content WHERE id=? AND clinic_id=? AND kind='aftercare' AND approved=1 AND active=1").bind(b.content_id, p.cid).first<any>();
  if (!item) throw bad('not_approved', 'Choose an approved aftercare version.');
  const id = await queue(env, robot.id, 'aftercare_show', { contentId: item.id });
  return J({ id, delivery: 'queued', reached_robot: false, note: 'The robot will show this when it next checks in.' });
});

on('POST', '/api/clinics/:cid/dentists', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid); const b = await body(req);
  if (!String(b.name ?? '').trim()) throw bad('name_required', 'Enter a name.');
  const bio = packLoc('bio', b); const id = uid('d_');
  await env.DB.prepare('INSERT INTO dentists (id,clinic_id,name,role,bio_en,bio_es,bio_zh_hans,bio_zh_hant,languages,specialties,photo_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, p.cid, b.name, String(b.role ?? ''), bio.bio_en, bio.bio_es, bio.bio_zh_hans, bio.bio_zh_hant, JSON.stringify(b.languages ?? []), String(b.specialties ?? ''), String(b.photo_url ?? ''), now()).run();
  await bump(env, p.cid); return J({ id });
});
on('PATCH', '/api/dentists/:id', async (req, env, p) => {
  const u = await needUser(req, env); const b = await body(req);
  const row = await env.DB.prepare('SELECT clinic_id FROM dentists WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  const v: Record<string, any> = {};
  for (const k of ['name', 'role', 'specialties', 'photo_url'] as const) if (k in b) v[k] = String(b[k] ?? '');
  if (b.bio) Object.assign(v, packLoc('bio', b));
  if (b.languages) v.languages = JSON.stringify(b.languages);
  if (b.active !== undefined) v.active = b.active ? 1 : 0;
  await upd(env, 'dentists', p.id, v); await bump(env, row.clinic_id); return J({ ok: true });
});
on('DELETE', '/api/dentists/:id', async (req, env, p) => {
  const u = await needUser(req, env);
  const row = await env.DB.prepare('SELECT clinic_id FROM dentists WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  await env.DB.prepare('DELETE FROM dentists WHERE id=?').bind(p.id).run(); await bump(env, row.clinic_id); return J({ ok: true });
});

on('POST', '/api/clinics/:cid/content', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid);
  const id = await insertContent(env, p.cid, await body(req)); await bump(env, p.cid); return J({ id });
});
on('PATCH', '/api/content/:id', async (req, env, p) => {
  const u = await needUser(req, env); const b = await body(req);
  const row = await env.DB.prepare('SELECT clinic_id FROM content WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  const v: Record<string, any> = {};
  for (const k of ['kind', 'slug', 'category', 'version_label', 'reviewer', 'media_kind', 'media_url'] as const) if (k in b) v[k] = String(b[k] ?? '');
  if ('sort_order' in b) v.sort_order = Number(b.sort_order) || 0;
  if ('approved' in b) v.approved = b.approved ? 1 : 0;
  if ('active' in b) v.active = b.active ? 1 : 0;
  if (b.title) Object.assign(v, packLoc('title', b));
  if (b.body) Object.assign(v, packLoc('body', b));
  await upd(env, 'content', p.id, v, ', updated_at=' + now()); await bump(env, row.clinic_id); return J({ ok: true });
});
on('DELETE', '/api/content/:id', async (req, env, p) => {
  const u = await needUser(req, env);
  const row = await env.DB.prepare('SELECT clinic_id FROM content WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  await env.DB.prepare('DELETE FROM content WHERE id=?').bind(p.id).run(); await bump(env, row.clinic_id); return J({ ok: true });
});
on('POST', '/api/clinics/:cid/import', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid); const b = await body(req);
  const text = b.csv ? String(b.csv) : await fetchSheetCsv(String(b.url ?? b.sheet_url ?? ''), b.tab ? String(b.tab) : undefined);
  const rows = csv(text).map(rowToContent).filter((a) => a.title.en || a.title.es || a.title['zh-Hans'] || a.title['zh-Hant']);
  if (!rows.length) throw bad('no_rows', 'No rows found. The first row must be column names such as kind, slug, title_en, body_en.');
  const existing = (await env.DB.prepare('SELECT id, kind, slug, version_label FROM content WHERE clinic_id=?').bind(p.cid).all<any>()).results;
  if (b.mode === 'replace') await env.DB.prepare('DELETE FROM content WHERE clinic_id=?').bind(p.cid).run();
  let added = 0, updated = 0;
  for (const r of rows) {
    const hit = b.mode === 'replace' ? null : existing.find((e: any) => e.kind === r.kind && e.slug === r.slug && e.version_label === r.version_label);
    if (hit) {
      const v = { ...packLoc('title', r), ...packLoc('body', r), category: r.category, sort_order: r.sort_order, reviewer: r.reviewer, approved: r.approved, media_kind: r.media_kind, media_url: r.media_url };
      await upd(env, 'content', hit.id, v, ', updated_at=' + now()); updated++;
    } else { await insertContent(env, p.cid, r); added++; }
  }
  if (b.url || b.sheet_url) await env.DB.prepare('UPDATE clinics SET data_source_url=? WHERE id=?').bind(String(b.url || b.sheet_url), p.cid).run();
  await bump(env, p.cid);
  return J({ added, updated, total: rows.length });
});

on('POST', '/api/clinics/:cid/destinations', async (req, env, p) => {
  const u = await needUser(req, env); await canClinic(env, u, p.cid); const b = await body(req);
  const name = normLoc(b.location_name || b.label?.en || '');
  if (!name) throw bad('name_required', 'Enter the temi location name.');
  const label = packLoc('label', b), note = packLoc('note', b); const id = uid('l_');
  await env.DB.prepare(`INSERT INTO destinations (id,clinic_id,location_name,kind,requires_staff,sort_order,label_en,label_es,label_zh_hans,label_zh_hant,note_en,note_es,note_zh_hans,note_zh_hant)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, p.cid, name, String(b.kind || 'waiting'), b.requires_staff ? 1 : 0, Number(b.sort_order) || 0,
    label.label_en, label.label_es, label.label_zh_hans, label.label_zh_hant, note.note_en, note.note_es, note.note_zh_hans, note.note_zh_hant).run();
  await bump(env, p.cid); return J({ id });
});
on('PATCH', '/api/destinations/:id', async (req, env, p) => {
  const u = await needUser(req, env); const b = await body(req);
  const row = await env.DB.prepare('SELECT clinic_id FROM destinations WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  const v: Record<string, any> = {};
  if (b.location_name) v.location_name = normLoc(b.location_name);
  if (b.kind) v.kind = String(b.kind);
  if ('requires_staff' in b) v.requires_staff = b.requires_staff ? 1 : 0;
  if ('sort_order' in b) v.sort_order = Number(b.sort_order) || 0;
  if ('active' in b) v.active = b.active ? 1 : 0;
  if (b.label) Object.assign(v, packLoc('label', b));
  if (b.note) Object.assign(v, packLoc('note', b));
  await upd(env, 'destinations', p.id, v); await bump(env, row.clinic_id); return J({ ok: true });
});
on('DELETE', '/api/destinations/:id', async (req, env, p) => {
  const u = await needUser(req, env);
  const row = await env.DB.prepare('SELECT clinic_id FROM destinations WHERE id=?').bind(p.id).first<any>(); if (!row) throw new HttpError(404, 'not_found');
  await canClinic(env, u, row.clinic_id);
  await env.DB.prepare('DELETE FROM destinations WHERE id=?').bind(p.id).run(); await bump(env, row.clinic_id); return J({ ok: true });
});

on('GET', '/api/robots', async (req, env, _p, url) => {
  const u = await needUser(req, env); const cid = url.searchParams.get('clinic');
  let rows: any[];
  if (cid) { await canClinic(env, u, cid); rows = (await env.DB.prepare('SELECT * FROM robots WHERE clinic_id=? ORDER BY name').bind(cid).all()).results; }
  else if (u.role === 'admin') rows = (await env.DB.prepare('SELECT * FROM robots ORDER BY name').all()).results;
  else rows = (await env.DB.prepare('SELECT r.* FROM robots r JOIN owner_clinics o ON o.clinic_id=r.clinic_id WHERE o.user_id=? ORDER BY r.name').bind(u.id).all()).results;
  return J({ robots: rows.map(robotOut) });
});
on('POST', '/api/robots', async (req, env) => {
  const u = await needUser(req, env); const b = await body(req);
  if (b.clinic_id) await canClinic(env, u, b.clinic_id); else if (u.role !== 'admin') throw bad('clinic_required');
  const id = uid('r_'); const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare('INSERT INTO robots (id,clinic_id,name,pair_code,pair_expires,settings,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, b.clinic_id ?? null, String(b.name || 'temi'), code, now() + 7 * 864e5, JSON.stringify(DEFAULT_SETTINGS), now()).run();
  return J({ id, pair_code: code });
});
on('PATCH', '/api/robots/:rid', async (req, env, p) => {
  const u = await needUser(req, env); const r = await userRobot(env, u, p.rid); const b = await body(req);
  const v: Record<string, any> = {};
  if (b.name !== undefined) v.name = String(b.name);
  if (b.clinic_id !== undefined) { if (b.clinic_id) await canClinic(env, u, b.clinic_id); else if (u.role !== 'admin') throw new HttpError(403, 'forbidden'); v.clinic_id = b.clinic_id || null; }
  if (b.settings) v.settings = JSON.stringify(cleanSettings({ ...parse(r.settings, {}), ...b.settings }));
  await upd(env, 'robots', p.rid, v, ', version=version+1');
  await queue(env, p.rid, 'sync');
  return J({ ok: true });
});
on('DELETE', '/api/robots/:rid', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  await env.DB.batch(['robots:id', 'robot_maps:robot_id', 'overlays:robot_id', 'commands:robot_id'].map((s) => { const [t, c] = s.split(':'); return env.DB.prepare(`DELETE FROM ${t} WHERE ${c}=?`).bind(p.rid); }));
  return J({ ok: true });
});
on('POST', '/api/robots/:rid/pair', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare('UPDATE robots SET pair_code=?, pair_expires=? WHERE id=?').bind(code, now() + 7 * 864e5, p.rid).run();
  return J({ pair_code: code });
});
on('POST', '/api/robots/:rid/commands', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid); const b = await body(req);
  if (!['sync', 'map_refresh', 'goto', 'stop', 'home', 'speak', 'aftercare_show'].includes(b.type)) throw bad('bad_command');
  return J({ id: await queue(env, p.rid, b.type, b.payload ?? {}) });
});
on('GET', '/api/robots/:rid/pose', async (req, env, p) => {
  const u = await needUser(req, env); const r = await userRobot(env, u, p.rid);
  await env.DB.prepare('UPDATE robots SET live_until=? WHERE id=?').bind(now() + 30_000, p.rid).run();
  const fresh = r.pose_at && now() - r.pose_at < 20_000;
  return J({ pose: fresh ? parse(r.pose, null) : null, at: r.pose_at, status: r.last_seen && now() - r.last_seen < 60_000 ? 'online' : 'offline', robot: parse(r.status, {}) });
});
on('GET', '/api/robots/:rid/map', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  const m = await env.DB.prepare('SELECT * FROM robot_maps WHERE robot_id=?').bind(p.rid).first<any>();
  const pending = await env.DB.prepare("SELECT id,type,payload,created_at FROM commands WHERE robot_id=? AND status IN ('pending','sent') AND type IN ('map_refresh','location_add','location_delete') AND created_at>? ORDER BY created_at DESC LIMIT 1").bind(p.rid, now() - 120_000).first<any>();
  const lastEdit = await env.DB.prepare("SELECT type,payload,status,result,updated_at FROM commands WHERE robot_id=? AND type IN ('location_add','location_delete') AND status IN ('done','failed') ORDER BY updated_at DESC LIMIT 1").bind(p.rid).first<any>();
  const lastMap = await env.DB.prepare("SELECT status,result FROM commands WHERE robot_id=? AND type='map_refresh' AND status IN ('done','failed') ORDER BY updated_at DESC LIMIT 1").bind(p.rid).first<any>();
  const overlay = m ? await env.DB.prepare('SELECT * FROM overlays WHERE robot_id=? AND map_id=?').bind(p.rid, m.map_id).first<any>() : null;
  return J({
    map: m ? { ...m, flip_y: !!m.flip_y, locations: parse(m.locations, []), png: `/api/assets/${m.asset_id}` } : null,
    overlay: overlay ? { ...overlay, locked: !!overlay.locked, url: overlay.asset_id ? `/api/assets/${overlay.asset_id}` : null } : null,
    pending: pending ? { ...pending, payload: parse(pending.payload, {}) } : null,
    lastEdit: lastEdit ? { type: lastEdit.type, ok: lastEdit.status === 'done', reason: parse<any>(lastEdit.result, {})?.reason ?? null, name: parse<any>(lastEdit.payload, {})?.name } : null,
    lastError: lastMap && lastMap.status === 'failed' ? parse<any>(lastMap.result, {})?.reason ?? 'map_unavailable' : null,
  });
});
on('POST', '/api/robots/:rid/map/refresh', async (req, env, p) => { const u = await needUser(req, env); await userRobot(env, u, p.rid); return J({ id: await queue(env, p.rid, 'map_refresh') }); });
on('POST', '/api/robots/:rid/locations', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid); const b = await body(req);
  const name = normLoc(b.name); if (!name) throw bad('name_required', 'Enter a location name.');
  if (name === 'home base') throw bad('reserved', 'home base is reserved for the charging station.');
  if (![b.x, b.y].every((n) => Number.isFinite(Number(n)))) throw bad('bad_point');
  return J({ id: await queue(env, p.rid, 'location_add', { name, x: Number(b.x), y: Number(b.y), yaw: Number(b.yaw ?? 0) }) });
});
on('DELETE', '/api/robots/:rid/locations/:name', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  const name = normLoc(decodeURIComponent(p.name)); if (name === 'home base') throw bad('reserved', 'home base cannot be deleted.');
  return J({ id: await queue(env, p.rid, 'location_delete', { name }) });
});
on('POST', '/api/robots/:rid/goto', async (req, env, p) => { const u = await needUser(req, env); await userRobot(env, u, p.rid); const b = await body(req); return J({ id: await queue(env, p.rid, 'goto', { location: normLoc(b.location) }) }); });
on('POST', '/api/robots/:rid/overlay/image', async (req, env, p, url) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  const m = await env.DB.prepare('SELECT map_id,width,height FROM robot_maps WHERE robot_id=?').bind(p.rid).first<any>();
  if (!m) throw bad('no_map', 'Load the temi map first.');
  const mime = req.headers.get('content-type') ?? 'image/png';
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw bad('bad_image', 'Upload a PNG, JPEG or WebP image.');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > 6 * 1024 * 1024) throw bad('too_big', 'Image must be under 6 MB.');
  const w = Number(url.searchParams.get('w')), h = Number(url.searchParams.get('h'));
  const old = await env.DB.prepare('SELECT asset_id FROM overlays WHERE robot_id=? AND map_id=?').bind(p.rid, m.map_id).first<any>();
  const asset = await putAsset(env, bytes, mime);
  const scale = Math.min(m.width / w, m.height / h);
  await env.DB.prepare(`INSERT INTO overlays (robot_id,map_id,asset_id,img_w,img_h,cx,cy,scale,rot,opacity,locked,display,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0.5,0,'half',?)
    ON CONFLICT(robot_id,map_id) DO UPDATE SET asset_id=excluded.asset_id,img_w=excluded.img_w,img_h=excluded.img_h,cx=excluded.cx,cy=excluded.cy,scale=excluded.scale,rot=0,opacity=0.5,locked=0,display='half',updated_at=excluded.updated_at`)
    .bind(p.rid, m.map_id, asset, w, h, m.width / 2, m.height / 2, scale, now()).run();
  await dropAsset(env, old?.asset_id);
  return J({ ok: true });
});
on('PUT', '/api/robots/:rid/overlay', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid); const b = await body(req);
  const m = await env.DB.prepare('SELECT map_id FROM robot_maps WHERE robot_id=?').bind(p.rid).first<any>(); if (!m) throw bad('no_map');
  const o = await env.DB.prepare('SELECT * FROM overlays WHERE robot_id=? AND map_id=?').bind(p.rid, m.map_id).first<any>(); if (!o) throw bad('no_overlay', 'Upload a floor plan first.');
  const num = (k: string) => (Number.isFinite(Number(b[k])) ? Number(b[k]) : o[k]);
  const display = ['temi', 'half', 'plan'].includes(b.display) ? b.display : o.display;
  await env.DB.prepare('UPDATE overlays SET cx=?,cy=?,scale=?,rot=?,opacity=?,locked=?,display=?,updated_at=? WHERE robot_id=? AND map_id=?')
    .bind(num('cx'), num('cy'), Math.max(0.0001, num('scale')), num('rot'), Math.min(1, Math.max(0, num('opacity'))), b.locked === undefined ? o.locked : b.locked ? 1 : 0, display, now(), p.rid, m.map_id).run();
  return J({ ok: true });
});
on('DELETE', '/api/robots/:rid/overlay', async (req, env, p) => {
  const u = await needUser(req, env); await userRobot(env, u, p.rid);
  const m = await env.DB.prepare('SELECT map_id FROM robot_maps WHERE robot_id=?').bind(p.rid).first<any>(); if (!m) return J({ ok: true });
  const o = await env.DB.prepare('SELECT asset_id FROM overlays WHERE robot_id=? AND map_id=?').bind(p.rid, m.map_id).first<any>();
  await env.DB.prepare('DELETE FROM overlays WHERE robot_id=? AND map_id=?').bind(p.rid, m.map_id).run(); await dropAsset(env, o?.asset_id);
  return J({ ok: true });
});
on('GET', '/api/assets/:id', async (_req, env, p) => {
  const a = await getAsset(env, p.id); if (!a) return new Response('Not found', { status: 404 });
  return new Response(a.bytes, { headers: { 'content-type': a.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
});

on('POST', '/api/robot/pair', async (req, env) => {
  const b = await body(req); const code = String(b.code ?? '').replace(/\D/g, '');
  const r = await env.DB.prepare('SELECT id,name FROM robots WHERE pair_code=? AND pair_expires>?').bind(code, now()).first<any>();
  if (!code || !r) throw new HttpError(404, 'bad_code', 'Pairing code not found or expired. Create a new code in the dashboard.');
  const tok = rand(32);
  await env.DB.prepare('UPDATE robots SET token_hash=?, pair_code=NULL, pair_expires=NULL, serial=?, last_seen=? WHERE id=?').bind(await sha(tok), String(b.serial ?? ''), now(), r.id).run();
  return J({ token: tok, robotId: r.id, name: r.name });
});
on('GET', '/api/robot/config', async (req, env) => {
  const rb = await robotAuth(req, env);
  const b = rb.clinic_id ? await bundle(env, rb.clinic_id) : { clinic: null, dentists: [], content: [], destinations: [] };
  const content = b.content.filter((c) => c.approved && c.active);
  return J({
    robot: { id: rb.id, name: rb.name }, settings: cleanSettings(parse(rb.settings, {})),
    version: `${rb.version}.${b.clinic?.version ?? 0}`,
    clinic: b.clinic, dentists: b.dentists.filter((d) => d.active), content, destinations: b.destinations.filter((d) => d.active),
  });
});
on('PUT', '/api/robot/settings', async (req, env) => {
  const rb = await robotAuth(req, env); const b = await body(req);
  await env.DB.prepare('UPDATE robots SET settings=?, version=version+1 WHERE id=?').bind(JSON.stringify(cleanSettings({ ...parse(rb.settings, {}), ...b })), rb.id).run();
  return J({ ok: true });
});
on('POST', '/api/robot/heartbeat', async (req, env) => {
  const rb = await robotAuth(req, env); const b = await body(req);
  const t = now();
  const sets = ['last_seen=?', 'status=?']; const vals: any[] = [t, JSON.stringify({ battery: b.battery, charging: b.charging, mode: b.mode, app: b.app, map_id: b.mapId ?? null, kiosk: b.kiosk })];
  if (b.pose && Number.isFinite(b.pose.x)) { sets.push('pose=?', 'pose_at=?'); vals.push(JSON.stringify({ x: b.pose.x, y: b.pose.y, yaw: b.pose.yaw }), t); }
  if (Array.isArray(b.locations)) { sets.push('locations=?'); vals.push(JSON.stringify(b.locations.slice(0, 500))); }
  await env.DB.prepare(`UPDATE robots SET ${sets.join(',')} WHERE id=?`).bind(...vals, rb.id).run();
  const row = await env.DB.prepare('SELECT live_until, version, clinic_id FROM robots WHERE id=?').bind(rb.id).first<any>();
  const g = row.clinic_id ? await env.DB.prepare('SELECT version FROM clinics WHERE id=?').bind(row.clinic_id).first<any>() : null;
  const cmds = (await env.DB.prepare("SELECT id,type,payload FROM commands WHERE robot_id=? AND status='pending' ORDER BY created_at LIMIT 8").bind(rb.id).all<any>()).results;
  if (cmds.length) await env.DB.batch(cmds.map((c: any) => env.DB.prepare("UPDATE commands SET status='sent', updated_at=? WHERE id=?").bind(t, c.id)));
  await env.DB.prepare("UPDATE commands SET status='failed', result='{\"reason\":\"timeout\"}', updated_at=? WHERE robot_id=? AND status='sent' AND updated_at<?").bind(t, rb.id, t - 180_000).run();
  const live = (row.live_until ?? 0) > t;
  return J({ live, interval: live ? 2000 : 15000, version: `${row.version}.${g?.version ?? 0}`, commands: cmds.map((c: any) => ({ id: c.id, type: c.type, payload: parse(c.payload, {}) })) });
});
on('POST', '/api/robot/commands/:id', async (req, env, p) => {
  const rb = await robotAuth(req, env); const b = await body(req);
  await env.DB.prepare('UPDATE commands SET status=?, result=?, updated_at=? WHERE id=? AND robot_id=?').bind(b.ok ? 'done' : 'failed', JSON.stringify({ reason: b.reason ?? null }), now(), p.id, rb.id).run();
  return J({ ok: true });
});
on('POST', '/api/robot/map', async (req, env) => {
  const rb = await robotAuth(req, env); const m = await body(req);
  if (!m.png || !m.width || !m.height) throw bad('bad_map');
  const old = await env.DB.prepare('SELECT asset_id FROM robot_maps WHERE robot_id=?').bind(rb.id).first<any>();
  const asset = await putAsset(env, b64ToBytes(m.png), 'image/png');
  await env.DB.prepare(`INSERT INTO robot_maps (robot_id,map_id,map_name,width,height,resolution,origin_x,origin_y,flip_y,asset_id,locations,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(robot_id) DO UPDATE SET map_id=excluded.map_id,map_name=excluded.map_name,width=excluded.width,height=excluded.height,resolution=excluded.resolution,origin_x=excluded.origin_x,origin_y=excluded.origin_y,flip_y=excluded.flip_y,asset_id=excluded.asset_id,locations=excluded.locations,updated_at=excluded.updated_at`)
    .bind(rb.id, String(m.mapId ?? 'map'), String(m.mapName ?? ''), m.width, m.height, m.resolution, m.originX, m.originY, m.flipY ? 1 : 0, asset, JSON.stringify(m.locations ?? []), now()).run();
  await dropAsset(env, old?.asset_id);
  if (m.pose) await env.DB.prepare('UPDATE robots SET pose=?, pose_at=? WHERE id=?').bind(JSON.stringify(m.pose), now(), rb.id).run();
  return J({ ok: true });
});
on('POST', '/api/robot/ask', async (req, env) => J(await answer(env, await robotAuth(req, env), await body(req))));
on('POST', '/api/robot/events', async (req, env) => {
  const rb = await robotAuth(req, env); const b = await body(req);
  const list = (Array.isArray(b.events) ? b.events : []).slice(0, 40);
  if (list.length) await env.DB.batch(list.map((e: any) => env.DB.prepare('INSERT INTO events (robot_id,clinic_id,type,ref,value,at) VALUES (?,?,?,?,?,?)').bind(rb.id, rb.clinic_id, String(e.type ?? '').slice(0, 30), e.ref ?? null, e.value == null ? null : String(e.value).slice(0, 80), Number(e.at) || now())));
  return J({ ok: true });
});

function clip(s: unknown, n: number) { return String(s ?? '').trim().slice(0, n); }
on('POST', '/api/robot/arrivals', async (req, env) => {
  const rb = await robotAuth(req, env); if (!rb.clinic_id) throw new HttpError(409, 'unpaired_clinic', 'This robot is not assigned to a clinic.');
  const b = await body(req);
  const kind = b.kind === 'walkin' ? 'walkin' : 'arrival';
  const id = uid('v_');
  await env.DB.prepare(`INSERT INTO arrivals (id,clinic_id,robot_id,kind,reference,patient_name,appointment_time,service,preferred_date,contact_name,contact_phone,contact_email,status,delivery,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'open','stored',?)`).bind(id, rb.clinic_id, rb.id, kind, clip(b.reference, 40), clip(b.patient_name, 80), clip(b.appointment_time, 40),
    clip(b.service, 80), clip(b.preferred_date, 40), clip(b.contact_name, 80), clip(b.contact_phone, 40), clip(b.contact_email, 80), now()).run();
  await logEvent(env, rb, kind === 'walkin' ? 'walkin' : 'arrival', null, kind);
  return J({ id, delivery: 'stored', reached_staff: true, completed_checkin: false });
});
on('POST', '/api/robot/alerts', async (req, env) => {
  const rb = await robotAuth(req, env); if (!rb.clinic_id) throw new HttpError(409, 'unpaired_clinic', 'This robot is not assigned to a clinic.');
  const b = await body(req);
  const reason = ['appointment', 'accessibility', 'unwell', 'question', 'nervous'].includes(b.reason) ? b.reason : 'question';
  const id = uid('n_');
  await env.DB.prepare('INSERT INTO alerts (id,clinic_id,robot_id,reason,note,private,status,delivery,created_at) VALUES (?,?,?,?,?,?,\'open\',\'stored\',?)')
    .bind(id, rb.clinic_id, rb.id, reason, clip(b.note, 240), b.private ? 1 : reason === 'nervous' || reason === 'unwell' ? 1 : 0, now()).run();
  await logEvent(env, rb, 'alert', null, reason);
  return J({ id, delivery: 'stored', reached_staff: true });
});
on('POST', '/api/robot/feedback', async (req, env) => {
  const rb = await robotAuth(req, env); if (!rb.clinic_id) throw new HttpError(409, 'unpaired_clinic', 'This robot is not assigned to a clinic.');
  const b = await body(req);
  const id = uid('f_');
  await env.DB.prepare('INSERT INTO feedback (id,clinic_id,robot_id,ease,help,comment,contact_me,contact_details,status,delivery,created_at) VALUES (?,?,?,?,?,?,?,?,\'open\',\'stored\',?)')
    .bind(id, rb.clinic_id, rb.id, clip(b.ease, 20), clip(b.help, 20), clip(b.comment, 500), b.contact_me ? 1 : 0, b.contact_me ? clip(b.contact_details, 120) : '', now()).run();
  await logEvent(env, rb, 'feedback', null, clip(b.ease, 20));
  return J({ id, delivery: 'stored', reached_staff: true, public: false });
});
on('POST', '/api/robot/escorts', async (req, env) => {
  const rb = await robotAuth(req, env); if (!rb.clinic_id) throw new HttpError(409, 'unpaired_clinic', 'This robot is not assigned to a clinic.');
  const b = await body(req);
  const dest = await env.DB.prepare('SELECT * FROM destinations WHERE id=? AND clinic_id=?').bind(b.destination_id, rb.clinic_id).first<any>();
  if (!dest) throw bad('unknown_destination');
  if (!dest.requires_staff) return J({ id: null, delivery: 'not_required', status: 'approved', reached_staff: false });
  const id = uid('e_');
  await env.DB.prepare('INSERT INTO escorts (id,clinic_id,robot_id,destination_id,location_name,label,status,delivery,created_at) VALUES (?,?,?,?,?,?,\'pending\',\'stored\',?)')
    .bind(id, rb.clinic_id, rb.id, dest.id, dest.location_name, dest.label_en, now()).run();
  await logEvent(env, rb, 'escort', dest.id, 'pending');
  return J({ id, delivery: 'stored', reached_staff: true, status: 'pending' });
});
on('GET', '/api/robot/escorts/:id', async (req, env, p) => {
  const rb = await robotAuth(req, env);
  const row = await env.DB.prepare('SELECT id,status,delivery,location_name FROM escorts WHERE id=? AND robot_id=?').bind(p.id, rb.id).first<any>();
  if (!row) throw new HttpError(404, 'not_found');
  return J(row);
});
on('POST', '/api/robot/aftercare/token', async (req, env) => {
  const rb = await robotAuth(req, env); if (!rb.clinic_id) throw new HttpError(409, 'unpaired_clinic', 'This robot is not assigned to a clinic.');
  const b = await body(req);
  const item = await env.DB.prepare("SELECT id FROM content WHERE id=? AND clinic_id=? AND kind='aftercare' AND approved=1").bind(b.content_id, rb.clinic_id).first<any>();
  if (!item) throw bad('not_approved', 'That instruction is not an approved aftercare version.');
  const token = rand(12); const lang = pickLang(String(b.lang ?? 'en'));
  await env.DB.prepare('INSERT INTO takeaway (token,clinic_id,content_id,lang,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(token, rb.clinic_id, item.id, lang, now() + 7 * 864e5, now()).run();
  await logEvent(env, rb, 'aftercare', item.id, item.id ? 'issued' : null);
  const origin = new URL(req.url).origin;
  return J({ token, url: `${origin}/c/${token}`, delivery: 'stored', expires_in_days: 7 });
});
on('GET', '/api/health', async () => J({ ok: true, service: 'zeeno-dental', at: now() }));

function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
async function takeawayPage(env: Env, token: string) {
  const row = await env.DB.prepare('SELECT * FROM takeaway WHERE token=?').bind(token).first<any>();
  if (!row || row.expires_at < now()) return new Response('This page has expired. Please ask the clinic for another copy.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const item = await env.DB.prepare('SELECT * FROM content WHERE id=?').bind(row.content_id).first<any>();
  const clinic = await env.DB.prepare('SELECT * FROM clinics WHERE id=?').bind(row.clinic_id).first<any>();
  if (!item || !clinic) return new Response('Not found', { status: 404 });
  const lang = pickLang(row.lang);
  const title = esc(textOf(item, lang, 'title'));
  const bodyHtml = esc(textOf(item, lang, 'body')).replace(/\n/g, '<br>');
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#F4F7F9;color:#101010;font-family:"DM Sans",system-ui,sans-serif}main{max-width:680px;margin:0 auto;padding:32px 20px 64px}h1{font-family:"Space Grotesk",sans-serif;color:#000F3A;font-size:32px;margin:8px 0 12px}.kicker{color:#1F1FFF;letter-spacing:.14em;text-transform:uppercase;font-size:12px;font-weight:700}.card{background:#fff;border:1px solid #DFE3E6;border-radius:18px;padding:22px}.meta{color:#54595F;font-size:14px}.phone{color:#1F1FFF;font-weight:700}</style></head>
<body><main><div class="kicker">Zeeno · ${esc(clinic.name)}</div><h1>${title}</h1><p class="meta">Version ${esc(item.version_label)} · Reviewed by ${esc(item.reviewer || clinic.reviewer || 'the clinic')}</p>
<div class="card">${bodyHtml}</div><p class="meta">Clinic ${esc(clinic.phone || '')} ${clinic.email ? '· ' + esc(clinic.email) : ''}</p><p class="phone">${esc(clinic.phone || '')}</p>
<p class="meta">This page has no patient name. It is general aftercare chosen by the clinic, not a personal prescription.</p></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

async function ensureBootstrap(env: Env) {
  if (!env.BOOTSTRAP_ADMIN) return;
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM users').first<any>();
  if (n?.n) return;
  const [email, pw] = env.BOOTSTRAP_ADMIN.split(':');
  if (!email || !pw) return;
  const salt = rand(12);
  await env.DB.prepare('INSERT INTO users (id,email,name,role,pw_hash,pw_salt,created_at) VALUES (?,?,?,?,?,?,?)').bind(uid('u_'), email.toLowerCase(), 'Zeeno administrator', 'admin', await hashPw(pw, salt), salt, now()).run();
}

const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY' };
const bin = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let booted = false;
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/c/')) return takeawayPage(env, url.pathname.slice(3));
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!booted) { await ensureBootstrap(env); booted = true; }
        for (const [m, re, keys, h] of routes) {
          if (m !== req.method) continue;
          const hit = url.pathname.match(re); if (!hit) continue;
          return await h(req, env, Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(hit[i + 1])])), url);
        }
        return J({ error: 'not_found' }, 404);
      } catch (e: any) {
        if (e instanceof HttpError) return J({ error: e.code, message: e.message }, e.status);
        console.error(e);
        return J({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500);
      }
    }
    const files = DASHBOARD as Record<string, [string, string]>;
    const hit = files[url.pathname] ?? (url.pathname.includes('.') ? null : files['/index.html']);
    if (!hit) return new Response('Not found', { status: 404, headers: SEC });
    return new Response(bin(hit[1]), { headers: { ...SEC, 'content-type': hit[0], 'cache-control': url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache' } });
  },
};
