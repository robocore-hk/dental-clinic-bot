import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { LayoutGrid, Stethoscope, Library, Inbox, Bot, Map as MapIcon, BarChart3, Shield, LogOut, KeyRound } from 'lucide-react';
import './styles.css';
import { get, post, useApi, useAction } from './api';
import { Field, Loading, Modal, Toasts } from './ui';
import { Overview } from './pages/Overview';
import { Dentists } from './pages/Dentists';
import { Content } from './pages/Content';
import { InboxPage } from './pages/Inbox';
import { Robots } from './pages/Robots';
import { MapPage } from './pages/MapPage';
import { Stats } from './pages/Stats';
import { Admin } from './pages/Admin';

export type User = { id: string; email: string; name: string; role: 'admin' | 'owner' };
export type Page = 'overview' | 'dentists' | 'content' | 'inbox' | 'robots' | 'map' | 'stats' | 'admin';

function Login({ onDone }: { onDone: (u: User) => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const { busy, run } = useAction();
  return <div className="login">
    <div className="login-art">
      <img src="/wordmark.svg" alt="Zeeno Robotics" />
      <p>Clinic dashboard for the temi patient concierge.</p>
    </div>
    <form className="login-card" onSubmit={(e) => { e.preventDefault(); run(() => post<{ user: User }>('/api/auth/login', { email, password: pw })).then((r) => r && onDone(r.user)); }}>
      <div className="kicker">Zeeno Robotics</div>
      <h1>Sign in</h1>
      <p className="subtle">Platform admins see every clinic. Clinic staff see only the offices assigned to them.</p>
      <Field label="Email"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
      <button className="btn primary" disabled={busy}>Sign in</button>
    </form>
  </div>;
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const { busy, run } = useAction();
  return <Modal title="Change password" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
    <button className="btn primary" disabled={busy || next.length < 8} onClick={() => run(() => post('/api/auth/password', { current: cur, next }), 'Password changed').then((r) => r && onClose())}>Save</button></>}>
    <Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
    <Field label="New password" hint="At least 8 characters."><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
  </Modal>;
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1).split('/')[0] as Page) || 'overview');
  const [cid, setCid] = useState<string | null>(() => localStorage.getItem('zeeno.clinic'));
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => { get<{ user: User | null }>('/api/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { location.hash = page; }, [page]);
  const g = useApi<{ clinics: any[] }>(user ? '/api/clinics' : null);
  const clinics = g.data?.clinics ?? [];
  useEffect(() => { if (clinics.length && !clinics.some((x) => x.id === cid)) setCid(clinics[0].id); }, [clinics, cid]);
  useEffect(() => { if (cid) localStorage.setItem('zeeno.clinic', cid); }, [cid]);
  if (user === undefined) return <div className="center-page"><Loading /></div>;
  if (!user) return <><Login onDone={setUser} /><Toasts /></>;
  const clinic = clinics.find((x) => x.id === cid) ?? null;
  const nav: [Page, string, any][] = [['overview', 'Clinic', LayoutGrid], ['dentists', 'Dentists', Stethoscope], ['content', 'Clinical content', Library], ['inbox', 'Inbox', Inbox], ['robots', 'Robots', Bot], ['map', 'Map', MapIcon], ['stats', 'Statistics', BarChart3]];
  if (user.role === 'admin') nav.push(['admin', 'Admin', Shield]);
  const needClinic = page !== 'admin' && page !== 'stats';
  return <div className="shell">
    <aside className="side">
      <div className="brand"><img src="/favicon.png" alt="" /><div><b>Zeeno Dental</b><small>for temi</small></div></div>
      <div className="side-label">Clinic</div>
      <select className="input" value={cid ?? ''} onChange={(e) => setCid(e.target.value)} disabled={!clinics.length}>
        {!clinics.length && <option value="">No clinic assigned</option>}
        {clinics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <nav>{nav.map(([k, label, Icon]) => <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}><Icon size={18} />{label}</button>)}</nav>
      <div className="side-foot">
        <div className="me"><span className="avatar">{(user.name || user.email)[0]?.toUpperCase()}</span><div><b>{user.name || user.email}</b><small>{user.role === 'admin' ? 'Zeeno admin' : 'Clinic staff'}</small></div></div>
        <div className="row"><button className="icon-btn" title="Change password" onClick={() => setPwOpen(true)}><KeyRound size={16} /></button>
          <button className="icon-btn" title="Sign out" onClick={() => post('/api/auth/logout').finally(() => setUser(null))}><LogOut size={16} /></button></div>
      </div>
    </aside>
    <main className="main">
      {needClinic && !clinic ? (g.loading ? <Loading /> : <div className="empty big">No clinic is assigned yet. {user.role === 'admin' ? 'Create one in Admin.' : 'Ask a Zeeno administrator to assign one.'}</div>)
        : page === 'overview' && clinic ? <Overview clinic={clinic} reload={g.reload} />
        : page === 'dentists' && clinic ? <Dentists cid={clinic.id} />
        : page === 'content' && clinic ? <Content cid={clinic.id} />
        : page === 'inbox' && clinic ? <InboxPage cid={clinic.id} />
        : page === 'robots' && clinic ? <Robots cid={clinic.id} user={user} clinics={clinics} go={setPage} />
        : page === 'map' && clinic ? <MapPage cid={clinic.id} />
        : page === 'stats' ? <Stats cid={clinic?.id ?? null} admin={user.role === 'admin'} clinics={clinics} />
        : page === 'admin' && user.role === 'admin' ? <Admin me={user} reloadClinics={g.reload} /> : null}
    </main>
    {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    <Toasts />
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
