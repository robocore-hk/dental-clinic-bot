import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error { constructor(public status: number, public code: string, msg: string) { super(msg); } }

async function req<T>(method: string, path: string, body?: unknown, raw?: { data: Blob | ArrayBuffer; type: string }): Promise<T> {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: raw ? { 'content-type': raw.type } : body !== undefined ? { 'content-type': 'application/json' } : {},
    body: raw ? raw.data : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'error', j.message ?? `Request failed (${r.status})`);
  return j as T;
}
export const get = <T = any>(p: string) => req<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => req<T>('POST', p, b);
export const patch = <T = any>(p: string, b: unknown) => req<T>('PATCH', p, b);
export const put = <T = any>(p: string, b: unknown) => req<T>('PUT', p, b);
export const del = <T = any>(p: string) => req<T>('DELETE', p);
export const upload = <T = any>(p: string, data: Blob, type: string) => req<T>('POST', p, undefined, { data, type });

export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const p = useRef(path); p.current = path;
  const reload = useCallback(async () => {
    const at = p.current; if (!at) return;
    try { const d = await get<T>(at); if (p.current === at) { setData(d); setError(null); } }
    catch (e: any) { if (p.current === at) setError(e.message); }
    finally { if (p.current === at) setLoading(false); }
  }, []);
  useEffect(() => { setData(null); setLoading(!!path); if (path) reload(); }, [path, reload]);
  useEffect(() => {
    if (!path || !opts.poll) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, opts.poll);
    return () => clearInterval(t);
  }, [path, opts.poll, reload]);
  return { data, error, loading, reload, setData };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e: any) { toast(e.message ?? 'Something went wrong', true); return null; }
    finally { setBusy(false); }
  }, []);
  return { busy, run };
}

type Toast = { id: number; text: string; err: boolean };
let listeners: ((t: Toast[]) => void)[] = []; let toasts: Toast[] = []; let n = 0;
export function toast(text: string, err = false) {
  const t = { id: ++n, text, err }; toasts = [...toasts, t]; listeners.forEach((l) => l(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); listeners.forEach((l) => l(toasts)); }, err ? 6000 : 3200);
}
export function useToasts() {
  const [t, setT] = useState<Toast[]>(toasts);
  useEffect(() => { listeners.push(setT); return () => { listeners = listeners.filter((l) => l !== setT); }; }, []);
  return t;
}
export const ago = (t?: number | null) => {
  if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now'; if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`; return new Date(t).toLocaleString();
};
export const LANGS = [
  { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }, { id: 'zh-Hans', label: '简体' }, { id: 'zh-Hant', label: '繁體' },
] as const;
export const emptyLoc = () => ({ en: '', es: '', 'zh-Hans': '', 'zh-Hant': '' });
