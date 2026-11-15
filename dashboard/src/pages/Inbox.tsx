import { useState } from 'react';
import { ago, post, useAction, useApi } from '../api';
import { Delivery, Empty, Field, Loading, PageHead } from '../ui';

export function InboxPage({ cid }: { cid: string }) {
  const q = useApi<any>(`/api/clinics/${cid}/inbox`, { poll: 8000 });
  const bundle = useApi<any>(`/api/clinics/${cid}`);
  const robots = useApi<any>(`/api/robots?clinic=${cid}`, { poll: 15000 });
  const [tab, setTab] = useState<'arrivals' | 'alerts' | 'escorts' | 'feedback' | 'aftercare'>('arrivals');
  const [robot, setRobot] = useState('');
  const [contentId, setContentId] = useState('');
  const { busy, run } = useAction();
  const data = q.data;
  const aftercare = (bundle.data?.content ?? []).filter((c: any) => c.kind === 'aftercare' && c.approved);
  return <div>
    <PageHead kicker="Operations" title="Inbox" />
    <p className="subtle">Names and contact details stay in this staff view. They are not shown on public screens or in ordinary statistics.</p>
    <div className="tabs">
      {(['arrivals', 'alerts', 'escorts', 'feedback', 'aftercare'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {q.loading && !data ? <Loading /> : tab === 'arrivals' ? <Table rows={data?.arrivals} empty="No arrivals or requests yet." cols={['When', 'Type', 'Details', 'Delivery', '']} render={(r: any) => <>
      <td>{ago(r.created_at)}</td><td>{r.kind === 'walkin' ? 'Request' : 'Arrival assistance'}</td>
      <td>{r.kind === 'walkin' ? `${r.service} · ${r.preferred_date} · ${r.contact_name} ${r.contact_phone} ${r.contact_email}` : `${r.patient_name} · ${r.appointment_time} · ref ${r.reference || '—'}`}<div className="subtle">Not a completed check-in.</div></td>
      <td><Delivery value={r.delivery} /> {r.status}</td>
      <td>{r.status === 'open' && <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/arrivals/${r.id}/ack`), 'Acknowledged').then(q.reload)}>Acknowledge</button>}</td>
    </>} /> : tab === 'alerts' ? <Table rows={data?.alerts} empty="No reception alerts." cols={['When', 'Reason', 'Note', 'Delivery', '']} render={(r: any) => <>
      <td>{ago(r.created_at)}</td><td>{r.reason}{r.private ? ' · private' : ''}</td><td>{r.note}</td><td><Delivery value={r.delivery} /> {r.status}</td>
      <td>{r.status === 'open' && <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/alerts/${r.id}/ack`), 'Acknowledged').then(q.reload)}>Acknowledge</button>}</td>
    </>} /> : tab === 'escorts' ? <Table rows={data?.escorts} empty="No room-ready requests." cols={['When', 'Place', 'Status', 'Delivery', '']} render={(r: any) => <>
      <td>{ago(r.created_at)}</td><td>{r.label || r.location_name}</td><td>{r.status}</td><td><Delivery value={r.delivery} /></td>
      <td>{r.status === 'pending' && <div className="row"><button className="btn small primary" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/escorts/${r.id}`, { status: 'approved' }), 'Room marked ready').then(q.reload)}>Room ready</button>
        <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/escorts/${r.id}`, { status: 'declined' }), 'Not ready').then(q.reload)}>Not ready</button></div>}</td>
    </>} /> : tab === 'feedback' ? <Table rows={data?.feedback} empty="No feedback yet." cols={['When', 'Visit', 'Comment', 'Contact', '']} render={(r: any) => <>
      <td>{ago(r.created_at)}</td><td>{r.ease} / {r.help}</td><td>{r.comment}</td><td>{r.contact_me ? r.contact_details : '—'}</td>
      <td>{r.status === 'open' && <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/feedback/${r.id}/ack`), 'Noted').then(q.reload)}>Mark seen</button>}</td>
    </>} /> : <section className="card">
      <h2>Send aftercare to a robot</h2>
      <p className="subtle">Staff choose the procedure and the instruction version. The patient cannot pick it. The robot shows it on the next check-in. Delivery here means the command was queued, not that the patient has read it.</p>
      <Field label="Robot"><select className="input" value={robot} onChange={(e) => setRobot(e.target.value)}><option value="">Choose</option>{(robots.data?.robots ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label="Approved version"><select className="input" value={contentId} onChange={(e) => setContentId(e.target.value)}><option value="">Choose</option>{aftercare.map((c: any) => <option key={c.id} value={c.id}>{c.title?.en} · v{c.version_label} · {c.reviewer}</option>)}</select></Field>
      <button className="btn primary" disabled={busy || !robot || !contentId} onClick={() => run(() => post(`/api/clinics/${cid}/aftercare`, { robot_id: robot, content_id: contentId }), 'Queued for the robot')}>Queue on robot</button>
    </section>}
  </div>;
}

function Table({ rows, empty, cols, render }: { rows?: any[]; empty: string; cols: string[]; render: (r: any) => any }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return <table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id}>{render(r)}</tr>)}</tbody></table>;
}
