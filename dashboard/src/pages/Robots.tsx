import { useEffect, useState } from 'react';
import { Plus, Battery, BatteryCharging, Wifi, WifiOff, KeyRound, RefreshCw, Map as MapIcon, Trash2 } from 'lucide-react';
import { ago, del, patch, post, useAction, useApi } from '../api';
import { Empty, Field, Loading, Modal, PageHead, Toggle } from '../ui';
import type { Page, User } from '../main';

const LANGS = [['en', 'English'], ['es', 'Español'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文']] as const;

function RobotSettings({ robot, clinics, user, onSaved }: { robot: any; clinics: any[]; user: User; onSaved: () => void }) {
  const [s, setS] = useState<any>(robot.settings); const [name, setName] = useState(robot.name); const [cid, setCid] = useState(robot.clinic_id ?? '');
  useEffect(() => { setS(robot.settings); setName(robot.name); setCid(robot.clinic_id ?? ''); }, [robot.id]); // eslint-disable-line
  const { busy, run } = useAction();
  const langs: string[] = s.languages ?? [];
  return <div>
    <div className="form-grid">
      <Field label="Robot name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Clinic on this robot"><select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>{user.role === 'admin' && <option value="">None</option>}{clinics.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      <Field label="Staff PIN" hint="Opens settings and aftercare on the robot."><input className="input mono" value={s.pin} maxLength={8} onChange={(e) => setS({ ...s, pin: e.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="Default language"><select className="input" value={s.defaultLang} onChange={(e) => setS({ ...s, defaultLang: e.target.value })}>{LANGS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
      <Field label="Driving speed"><select className="input" value={s.speed} onChange={(e) => setS({ ...s, speed: e.target.value })}><option value="slow">Slow</option><option value="medium">Medium</option><option value="high">Fast</option></select></Field>
      <Field label="Greeting cooldown (minutes)" hint="Avoid greeting the same seated patient again inside this window."><input className="input" type="number" min={1} max={120} value={s.greetCooldownMin} onChange={(e) => setS({ ...s, greetCooldownMin: Number(e.target.value) })} /></Field>
      <Field label="Clear personal details after idle (seconds)"><input className="input" type="number" min={30} max={600} value={s.idleClearSeconds} onChange={(e) => setS({ ...s, idleClearSeconds: Number(e.target.value) })} /></Field>
      <Field label="Return to charger when idle (minutes, 0 = off)"><input className="input" type="number" min={0} max={120} value={s.idleHomeMinutes} onChange={(e) => setS({ ...s, idleHomeMinutes: Number(e.target.value) })} /></Field>
    </div>
    <div className="col">
      <div className="row">{LANGS.map(([id, label]) => <button type="button" key={id} className={`chip ${langs.includes(id) ? 'on' : ''}`} onClick={() => {
        const next = langs.includes(id) ? langs.filter((l) => l !== id) : [...langs, id];
        if (next.length) setS({ ...s, languages: next, defaultLang: next.includes(s.defaultLang) ? s.defaultLang : next[0] });
      }}>{label}</button>)}</div>
      <Toggle checked={!!s.backwards} onChange={(v) => setS({ ...s, backwards: v })} label="Drive backwards while escorting, so the screen faces the patient" />
      <Toggle checked={!!s.kiosk} onChange={(v) => setS({ ...s, kiosk: v })} label="Kiosk mode (hide the temi top bar and keep the app in front)" />
    </div>
    <div className="row end"><button className="btn primary" disabled={busy} onClick={() => run(() => patch(`/api/robots/${robot.id}`, { name, clinic_id: cid || null, settings: s }), 'Saved. The robot updates within a few seconds.').then(onSaved)}>Save robot settings</button></div>
  </div>;
}

export function Robots({ cid, user, clinics, go }: { cid: string; user: User; clinics: any[]; go: (p: Page) => void }) {
  const r = useApi<any>(`/api/robots?clinic=${cid}`, { poll: 5000 });
  const [sel, setSel] = useState<string | null>(null); const [adding, setAdding] = useState(false); const [newName, setNewName] = useState('temi');
  const [code, setCode] = useState<string | null>(null);
  const { busy, run } = useAction();
  const robots = r.data?.robots ?? [];
  const robot = robots.find((x: any) => x.id === sel) ?? robots[0];
  return <div>
    <PageHead kicker="Fleet" title="Robots"><button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} />Add robot</button></PageHead>
    {r.loading ? <Loading /> : !robots.length ? <Empty>No robots yet. Add one, then enter the 6-digit code on the robot: settings gear, PIN, then pair.</Empty> :
      <div className="split">
        <div className="list">{robots.map((x: any) => <button key={x.id} className={`item ${robot?.id === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
          <div className="row" style={{ justifyContent: 'space-between' }}><b>{x.name}</b>{x.online ? <span className="chip ok"><Wifi size={12} />Online</span> : <span className="chip"><WifiOff size={12} />{x.paired ? ago(x.last_seen) : 'Not paired'}</span>}</div>
          <small className="row gap8">{x.status?.battery != null && <>{x.status.charging ? <BatteryCharging size={14} /> : <Battery size={14} />}{x.status.battery}%</>}{x.status?.mode && <span>· {x.status.mode}</span>}</small>
        </button>)}</div>
        {robot && <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{robot.name}</h2>
            <div className="row">
              <button className="btn small" onClick={() => go('map')}><MapIcon size={14} />Map</button>
              <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/robots/${robot.id}/commands`, { type: 'sync' }), 'Robot will reload')}><RefreshCw size={14} />Sync</button>
              <button className="btn small" disabled={busy} onClick={() => run(() => post<any>(`/api/robots/${robot.id}/pair`)).then((x) => x && setCode(x.pair_code))}><KeyRound size={14} />Pair code</button>
              <button className="btn small danger ghost" onClick={() => confirm(`Remove ${robot.name}?`) && run(() => del(`/api/robots/${robot.id}`), 'Removed').then(r.reload)}><Trash2 size={14} /></button>
            </div>
          </div>
          {robot.pair_code && <div className="callout"><b>Pairing code <span className="mono big-code">{robot.pair_code}</span></b><p className="subtle">Valid for 7 days, one use. On temi: gear, PIN 2408 unless you changed it, then enter the code.</p></div>}
          <p className="subtle">{robot.locations?.length ?? 0} temi locations · kiosk {robot.status?.kiosk ? 'on' : 'off'} · app {robot.status?.app ?? '–'}</p>
          <RobotSettings robot={robot} clinics={clinics} user={user} onSaved={r.reload} />
        </section>}
      </div>}
    {adding && <Modal title="Add a robot" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button>
      <button className="btn primary" disabled={busy || !newName} onClick={() => run(() => post<any>('/api/robots', { name: newName, clinic_id: cid })).then((x) => { if (x) { setAdding(false); setCode(x.pair_code); setSel(x.id); r.reload(); } })}>Create</button></>}>
      <Field label="Name"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
    </Modal>}
    {code && <Modal title="Pair the robot" onClose={() => setCode(null)} footer={<button className="btn primary" onClick={() => setCode(null)}>Done</button>}>
      <div className="big-code mono">{code}</div>
      <p className="subtle">Enter this on the robot. Until a robot is paired it uses the bundled sample clinic.</p>
    </Modal>}
  </div>;
}
