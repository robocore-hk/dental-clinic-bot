import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { del, emptyLoc, patch, post, useAction, useApi } from '../api';
import { Empty, Field, Loading, LocEditor, Modal, PageHead } from '../ui';

const blank = () => ({ name: '', role: '', specialties: '', photo_url: '', languages: ['en'], bio: emptyLoc() });

export function Dentists({ cid }: { cid: string }) {
  const q = useApi<any>(`/api/clinics/${cid}`);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const rows = q.data?.dentists ?? [];
  const save = () => run(async () => {
    if (edit.id) await patch(`/api/dentists/${edit.id}`, edit);
    else await post(`/api/clinics/${cid}/dentists`, edit);
  }, 'Dentist saved').then((r) => { if (r) { setEdit(null); q.reload(); } });
  return <div>
    <PageHead kicker="People" title="Dentists"><button className="btn primary" onClick={() => setEdit(blank())}><Plus size={16} />Add dentist</button></PageHead>
    <p className="subtle">Profiles shown to patients. These replace the gallery’s artists. Do not put patient information here.</p>
    {q.loading ? <Loading /> : !rows.length ? <Empty>No dentists yet.</Empty> : <div className="list">
      {rows.map((d: any) => <div key={d.id} className="item" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <button className="btn ghost" onClick={() => setEdit({ ...d, bio: d.bio || emptyLoc(), languages: d.languages || [] })}><b>{d.name}</b><div className="subtle">{d.role} · {(d.languages || []).join(', ')} · {d.specialties}</div></button>
        <button className="icon-btn" onClick={() => confirm(`Remove ${d.name}?`) && run(() => del(`/api/dentists/${d.id}`), 'Removed').then(q.reload)}><Trash2 size={16} /></button>
      </div>)}
    </div>}
    {edit && <Modal title={edit.id ? 'Edit dentist' : 'Add dentist'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy || !edit.name} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Role"><input className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></Field>
        <Field label="Specialties"><input className="input" value={edit.specialties} onChange={(e) => setEdit({ ...edit, specialties: e.target.value })} /></Field>
        <Field label="Photo URL"><input className="input" value={edit.photo_url} onChange={(e) => setEdit({ ...edit, photo_url: e.target.value })} /></Field>
      </div>
      <Field label="Languages spoken" hint="en, es, zh-Hans, zh-Hant"><input className="input" value={(edit.languages || []).join(', ')} onChange={(e) => setEdit({ ...edit, languages: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} /></Field>
      <LocEditor label="Bio" value={edit.bio} onChange={(bio) => setEdit({ ...edit, bio })} area />
    </Modal>}
  </div>;
}
