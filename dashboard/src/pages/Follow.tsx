import { useState } from 'react';
import { emptyLoc, post, useAction, useApi } from '../api';
import { Field, LocEditor, PageHead } from '../ui';

/** Clinic-controlled reminders and medical-form templates. Staff mark reminders sent; nothing is emailed or texted from here. */
export function Follow({ cid }: { cid: string }) {
  const forms = useApi<any>(`/api/clinics/${cid}/inbox`);
  const temps = useApi<any>(`/api/clinics/${cid}/reminder-templates`);
  const { busy, run } = useAction();
  const [form, setForm] = useState<any>({ slug: 'health-history', version_label: '1.0', reviewer: '', approved: false, title: emptyLoc(), intro: emptyLoc(), fieldsText: '[{"id":"medicines","type":"text","required":true,"label":{"en":"Medicines you take","es":"Medicinas que toma","zh-Hans":"正在服用的药物","zh-Hant":"正在服用的藥物"}}]' });
  const [rem, setRem] = useState<any>({ name: 'Next visit', body: emptyLoc() });
  const [due, setDue] = useState({ label: '', channel: 'phone', contact: '', message: '', due: '' });
  return <div>
    <PageHead kicker="Phase 2" title="Forms and reminders" />
    <p className="subtle">Medical forms are completed on the patient’s phone. Reminders stay pending until a person sends them and marks them sent. This dashboard does not send SMS or email.</p>
    <section className="card">
      <h2>Form template</h2>
      <div className="form-grid">
        <Field label="Slug"><input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
        <Field label="Version"><input className="input" value={form.version_label} onChange={(e) => setForm({ ...form, version_label: e.target.value })} /></Field>
        <Field label="Reviewer"><input className="input" value={form.reviewer} onChange={(e) => setForm({ ...form, reviewer: e.target.value })} /></Field>
      </div>
      <label className="row"><input type="checkbox" checked={!!form.approved} onChange={(e) => setForm({ ...form, approved: e.target.checked })} /> Approved for patients</label>
      <LocEditor label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
      <LocEditor label="Introduction" value={form.intro} onChange={(intro) => setForm({ ...form, intro })} area />
      <Field label="Fields JSON" hint="Each field needs id, type (text or longtext), required, and label in four languages."><textarea className="input" rows={8} value={form.fieldsText} onChange={(e) => setForm({ ...form, fieldsText: e.target.value })} /></Field>
      <button className="btn primary" disabled={busy} onClick={() => {
        let fields: unknown[] = [];
        try { fields = JSON.parse(form.fieldsText); } catch { return; }
        run(() => post(`/api/clinics/${cid}/forms`, { ...form, fields }), 'Form saved').then(forms.reload);
      }}>Save form</button>
      <ul>{(forms.data?.form_templates ?? []).map((t: any) => <li key={t.id}>{t.title?.en || t.slug} · v{t.version_label} · {t.approved ? 'approved' : 'draft'} · {t.reviewer}</li>)}</ul>
    </section>
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Reminder template</h2>
      <Field label="Name"><input className="input" value={rem.name} onChange={(e) => setRem({ ...rem, name: e.target.value })} /></Field>
      <LocEditor label="Message" value={rem.body} onChange={(body) => setRem({ ...rem, body })} area />
      <button className="btn" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/reminder-templates`, rem), 'Template saved').then(temps.reload)}>Save template</button>
      <ul>{(temps.data?.templates ?? []).map((t: any) => <li key={t.id}>{t.name}</li>)}</ul>
    </section>
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Reminder for staff to send</h2>
      <div className="form-grid">
        <Field label="Who (a label, not a medical record)"><input className="input" value={due.label} onChange={(e) => setDue({ ...due, label: e.target.value })} /></Field>
        <Field label="Preferred channel"><select className="input" value={due.channel} onChange={(e) => setDue({ ...due, channel: e.target.value })}><option value="phone">Phone</option><option value="email">Email</option><option value="none">Do not contact</option></select></Field>
        <Field label="Contact"><input className="input" value={due.contact} onChange={(e) => setDue({ ...due, contact: e.target.value })} /></Field>
        <Field label="Due"><input className="input" type="datetime-local" value={due.due} onChange={(e) => setDue({ ...due, due: e.target.value })} /></Field>
      </div>
      <Field label="Message"><textarea className="input" rows={3} value={due.message} onChange={(e) => setDue({ ...due, message: e.target.value })} /></Field>
      <button className="btn primary" disabled={busy || due.channel === 'none'} onClick={() => run(() => post(`/api/clinics/${cid}/reminders`, { ...due, due_at: due.due ? new Date(due.due).getTime() : null }), 'Reminder saved as pending').then(forms.reload)}>Save pending reminder</button>
      <table><tbody>{(forms.data?.reminders ?? []).map((r: any) => <tr key={r.id}><td>{r.label}</td><td>{r.channel}</td><td>{r.status}</td><td>{r.message}</td>
        <td>{r.status === 'pending' && <button className="btn small" disabled={busy} onClick={() => run(() => post(`/api/clinics/${cid}/reminders/${r.id}`, { status: 'sent' }), 'Marked sent by staff').then(forms.reload)}>Mark sent</button>}</td>
      </tr>)}</tbody></table>
    </section>
  </div>;
}
