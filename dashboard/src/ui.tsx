import { createPortal } from 'react-dom';
import { ReactNode, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { LANGS, useToasts } from './api';

export function Modal({ title, children, footer, onClose, wide }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(<div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>, document.body);
}
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
export const Loading = ({ text }: { text?: string }) => <div className="loading"><Loader2 className="spin" size={18} /> {text ?? 'Loading…'}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return <div className="seg" role="radiogroup">{options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="track"><span className="knob" /></span><span>{label}</span></label>;
}
export function Toasts() {
  const t = useToasts();
  return <div className="toasts">{t.map((x) => <div key={x.id} className={`toast ${x.err ? 'err' : ''}`}>{x.text}</div>)}</div>;
}
export function PageHead({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return <div className="page-head"><div>{kicker && <div className="kicker">{kicker}</div>}<h1>{title}</h1></div><div className="row">{children}</div></div>;
}
export function LocEditor({ label, value, onChange, area }: { label: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void; area?: boolean }) {
  const [lang, setLang] = useState('en');
  const v = value || {};
  return <Field label={label}>
    <Segmented value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
    {area
      ? <textarea className="input" rows={6} value={v[lang] ?? ''} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} />
      : <input className="input" value={v[lang] ?? ''} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} />}
  </Field>;
}
export function Delivery({ value }: { value?: string }) {
  const ok = value === 'stored' || value === 'queued';
  return <span className={`chip ${ok ? 'ok' : 'bad'}`}>{ok ? 'In the staff inbox' : value || 'Not confirmed'}</span>;
}
