import { useState } from 'react';
import { del, patch, post, useAction, useApi } from '../api';
import { Empty, Field, Loading, Modal, PageHead } from '../ui';
import type { User } from '../main';

export function Admin({ me, reloadClinics }: { me: User; reloadClinics: () => void }) {
  const users = useApi<any>('/api/admin/users');
  const clinics = useApi<any>('/api/clinics');
  const [clinic, setClinic] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const { busy, run } = useAction();
  const list = clinics.data?.clinics ?? [];
  return <div>
    <PageHead kicker="Zeeno" title="Platform admin">
      <button className="btn" onClick={() => setClinic({ name: '', address: '', phone: '' })}>New clinic</button>
      <button className="btn primary" onClick={() => setUser({ email: '', name: '', password: '', role: 'owner', clinic_ids: [] })}>New staff login</button>
    </PageHead>
    <p className="subtle">Create dental offices and assign one or more of them to a clinic-owner login. Owners cannot see other clinics.</p>
    <h2>Clinics</h2>
    {clinics.loading ? <Loading /> : !list.length ? <Empty>No clinics yet.</Empty> : <table><tbody>{list.map((c: any) => <tr key={c.id}><td><b>{c.name}</b><div className="subtle">{c.address}</div></td><td>{c.n_content} items</td><td>{c.n_robots} robots</td>
      <td><button className="btn small danger ghost" onClick={() => confirm(`Delete ${c.name}? Content and inbox history for this clinic are removed.`) && run(() => del(`/api/admin/clinics/${c.id}`), 'Clinic deleted').then(() => { clinics.reload(); reloadClinics(); })}>Delete</button></td></tr>)}</tbody></table>}
    <h2>People</h2>
    {users.loading ? <Loading /> : <table><thead><tr><th>Email</th><th>Role</th><th>Clinics</th><th></th></tr></thead><tbody>
      {(users.data?.users ?? []).map((u: any) => <tr key={u.id}><td>{u.name}<div className="subtle">{u.email}</div></td><td>{u.role}</td><td>{(u.clinic_ids || []).length}</td>
        <td className="row"><button className="btn small" onClick={() => setUser({ ...u, password: '' })}>Edit</button>
          {u.id !== me.id && <button className="btn small danger ghost" onClick={() => confirm(`Delete ${u.email}?`) && run(() => del(`/api/admin/users/${u.id}`), 'Deleted').then(users.reload)}>Delete</button>}</td></tr>)}
    </tbody></table>}
    {clinic && <Modal title="New clinic" onClose={() => setClinic(null)} footer={<><button className="btn" onClick={() => setClinic(null)}>Cancel</button>
      <button className="btn primary" disabled={busy || !clinic.name} onClick={() => run(() => post('/api/admin/clinics', clinic), 'Clinic created').then((r) => { if (r) { setClinic(null); clinics.reload(); reloadClinics(); } })}>Create</button></>}>
      <Field label="Name"><input className="input" value={clinic.name} onChange={(e) => setClinic({ ...clinic, name: e.target.value })} /></Field>
      <Field label="Address"><input className="input" value={clinic.address} onChange={(e) => setClinic({ ...clinic, address: e.target.value })} /></Field>
      <Field label="Phone"><input className="input" value={clinic.phone} onChange={(e) => setClinic({ ...clinic, phone: e.target.value })} /></Field>
    </Modal>}
    {user && <Modal title={user.id ? 'Edit login' : 'New login'} onClose={() => setUser(null)} footer={<><button className="btn" onClick={() => setUser(null)}>Cancel</button>
      <button className="btn primary" disabled={busy || !user.email || (!user.id && (user.password || '').length < 8)} onClick={() => run(() => user.id ? patch(`/api/admin/users/${user.id}`, user) : post('/api/admin/users', user), 'Saved').then((r) => { if (r) { setUser(null); users.reload(); } })}>Save</button></>}>
      <Field label="Name"><input className="input" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} /></Field>
      <Field label="Email"><input className="input" value={user.email} disabled={!!user.id} onChange={(e) => setUser({ ...user, email: e.target.value })} /></Field>
      <Field label={user.id ? 'New password (optional)' : 'Password'}><input className="input" type="password" value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })} /></Field>
      <Field label="Role"><select className="input" value={user.role} onChange={(e) => setUser({ ...user, role: e.target.value })}><option value="owner">Clinic owner / staff</option><option value="admin">Zeeno admin</option></select></Field>
      <Field label="Assigned clinics">{list.map((c: any) => <label key={c.id} className="row"><input type="checkbox" checked={(user.clinic_ids || []).includes(c.id)} onChange={(e) => {
        const ids = new Set<string>(user.clinic_ids || []); if (e.target.checked) ids.add(c.id); else ids.delete(c.id); setUser({ ...user, clinic_ids: [...ids] });
      }} />{c.name}</label>)}</Field>
    </Modal>}
  </div>;
}
