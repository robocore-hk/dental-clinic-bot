import { useApi } from '../api';
import { Loading, PageHead } from '../ui';

export function Stats({ cid, admin, clinics }: { cid: string | null; admin: boolean; clinics: any[] }) {
  const one = useApi<any>(cid ? `/api/clinics/${cid}/stats` : null);
  const all = useApi<any>(admin ? '/api/admin/stats' : null);
  return <div>
    <PageHead kicker="Usage" title={admin ? 'Statistics' : 'Clinic statistics'} />
    <p className="subtle">Counts of journeys and content views. Free-text questions and patient names are not stored in these figures.</p>
    {!cid ? null : one.loading && !one.data ? <Loading /> : <div>
      <h2>{clinics.find((c) => c.id === cid)?.name}</h2>
      <div className="grid">
        <div className="card stat"><b>{one.data?.arrivals ?? 0}</b><span>Arrival notices, 30 days</span></div>
        <div className="card stat"><b>{one.data?.walkins ?? 0}</b><span>Appointment requests</span></div>
        <div className="card stat"><b>{one.data?.alerts ?? 0}</b><span>Reception alerts</span></div>
        <div className="card stat"><b>{one.data?.feedback ?? 0}</b><span>Feedback notes</span></div>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>Activity</h3>
        <table><tbody>{(one.data?.byType ?? []).map((r: any) => <tr key={r.type}><td>{r.type}</td><td>{r.n}</td></tr>)}</tbody></table>
        <h3>Content used</h3>
        <table><tbody>{(one.data?.topContent ?? []).map((r: any) => <tr key={r.ref}><td>{r.title_en || r.kind || r.ref}</td><td>{r.n}</td></tr>)}</tbody></table>
      </section>
    </div>}
    {admin && <section style={{ marginTop: 28 }}>
      <h2>All clinics</h2>
      {all.loading && !all.data ? <Loading /> : <table>
        <thead><tr><th>Clinic</th><th>Arrivals</th><th>Alerts</th><th>Feedback</th><th>Events</th></tr></thead>
        <tbody>{(all.data?.clinics ?? []).map((c: any) => {
          const n = (rows: any[]) => rows.filter((r) => r.clinic_id === c.id).reduce((s, r) => s + (r.n || 0), 0);
          return <tr key={c.id}><td>{c.name}</td><td>{n(all.data.arrivals)}</td><td>{n(all.data.alerts)}</td><td>{n(all.data.feedback)}</td><td>{n(all.data.events)}</td></tr>;
        })}</tbody>
      </table>}
    </section>}
  </div>;
}
