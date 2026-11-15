import { useEffect, useState } from 'react';
import { patch, useAction, useApi } from '../api';
import { Field, Loading, LocEditor, PageHead } from '../ui';

export function Overview({ clinic, reload }: { clinic: any; reload: () => void }) {
  const s = useApi<any>(`/api/clinics/${clinic.id}/stats`);
  const [f, setF] = useState<any>(clinic);
  useEffect(() => setF(clinic), [clinic.id]); // eslint-disable-line
  const { busy, run } = useAction();
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return <div>
    <PageHead kicker="Office" title={clinic.name}><button className="btn primary" disabled={busy} onClick={() => run(() => patch(`/api/clinics/${clinic.id}`, f), 'Clinic saved').then(reload)}>Save clinic</button></PageHead>
    <div className="grid">
      <div className="card stat"><b>{s.data?.arrivals ?? '–'}</b><span>Arrivals, 30 days</span></div>
      <div className="card stat"><b>{s.data?.walkins ?? '–'}</b><span>Appointment requests</span></div>
      <div className="card stat"><b>{s.data?.alerts ?? '–'}</b><span>Reception alerts</span></div>
      <div className="card stat"><b>{s.data?.openInbox ?? '–'}</b><span>Open inbox items</span></div>
    </div>
    {s.loading && !s.data ? <Loading /> : null}
    <section className="card" style={{ marginTop: 16 }}>
      <div className="form-grid">
        <Field label="Clinic name"><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Address"><input className="input" value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Email"><input className="input" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Default clinical reviewer" hint="Shown on content that does not name its own reviewer."><input className="input" value={f.reviewer ?? ''} onChange={(e) => set('reviewer', e.target.value)} /></Field>
        <Field label="Google Sheet URL" hint="Link-shared sheet using the sample column schema. Import it from Clinical content."><input className="input" value={f.data_source_url ?? ''} onChange={(e) => set('data_source_url', e.target.value)} /></Field>
        <Field label="Booking page URL" hint="Optional. The robot can show this as a QR code. It does not confirm an appointment."><input className="input" value={f.booking_url ?? ''} onChange={(e) => set('booking_url', e.target.value)} /></Field>
        <Field label="Video call temi user id" hint="Designated receptionist or interpreter. Leave blank to hide the call button."><input className="input" value={f.video_user_id ?? ''} onChange={(e) => set('video_user_id', e.target.value)} /></Field>
        <Field label="Video call display name"><input className="input" value={f.video_name ?? ''} onChange={(e) => set('video_name', e.target.value)} /></Field>
      </div>
      <LocEditor label="Welcome" value={f.welcome} onChange={(v) => set('welcome', v)} area />
      <LocEditor label="Hours" value={f.hours} onChange={(v) => set('hours', v)} area />
      <LocEditor label="Parking" value={f.parking} onChange={(v) => set('parking', v)} area />
      <LocEditor label="Payment" value={f.payment} onChange={(v) => set('payment', v)} area />
      <LocEditor label="Accessibility" value={f.accessibility} onChange={(v) => set('accessibility', v)} area />
    </section>
  </div>;
}
