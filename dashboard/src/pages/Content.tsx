import { useMemo, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { del, emptyLoc, patch, post, useAction, useApi } from '../api';
import { Empty, Field, Loading, LocEditor, Modal, PageHead, Toggle } from '../ui';

const KINDS = ['faq', 'explainer', 'orientation', 'oral', 'aftercare', 'anxiety', 'children', 'consent'];
const blank = (kind = 'faq') => ({ kind, slug: '', category: '', sort_order: 0, version_label: '1.0', reviewer: '', approved: false, media_kind: 'text', media_url: '', title: emptyLoc(), body: emptyLoc() });

export function Content({ cid }: { cid: string }) {
  const q = useApi<any>(`/api/clinics/${cid}`);
  const [kind, setKind] = useState('all');
  const [edit, setEdit] = useState<any>(null);
  const [imp, setImp] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [url, setUrl] = useState(q.data?.clinic?.data_source_url ?? '');
  const [mode, setMode] = useState('merge');
  const { busy, run } = useAction();
  const rows = useMemo(() => (q.data?.content ?? []).filter((c: any) => kind === 'all' || c.kind === kind), [q.data, kind]);
  const save = () => run(async () => {
    if (edit.id) await patch(`/api/content/${edit.id}`, edit); else await post(`/api/clinics/${cid}/content`, edit);
  }, 'Content saved').then((r) => { if (r) { setEdit(null); q.reload(); } });
  const doImport = () => run(() => post(`/api/clinics/${cid}/import`, csvText ? { csv: csvText, mode } : { url, mode }), 'Import finished').then((r) => { if (r) { setImp(false); q.reload(); } });
  return <div>
    <PageHead kicker="Library" title="Clinical content">
      <button className="btn" onClick={() => { setUrl(q.data?.clinic?.data_source_url ?? ''); setImp(true); }}><Upload size={16} />Import</button>
      <button className="btn primary" onClick={() => setEdit(blank(kind === 'all' ? 'faq' : kind))}><Plus size={16} />Add</button>
    </PageHead>
    <p className="subtle">Approved items are the only answers the robot may give. Each item has a version and a reviewer. Aftercare is shown only after a staff member selects the version.</p>
    <div className="filters">{['all', ...KINDS].map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
    {q.loading ? <Loading /> : !rows.length ? <Empty>Nothing in this library yet. Import the sample CSV or add an item.</Empty> : <table>
      <thead><tr><th>Title</th><th>Kind</th><th>Version</th><th>Reviewer</th><th>Approved</th><th></th></tr></thead>
      <tbody>{rows.map((c: any) => <tr key={c.id}>
        <td><button className="btn ghost" onClick={() => setEdit(c)}>{c.title?.en || c.slug}</button><div className="subtle">{c.slug}</div></td>
        <td>{c.kind}</td><td>{c.version_label}</td><td>{c.reviewer}</td><td>{c.approved ? 'Yes' : 'Draft'}</td>
        <td><button className="icon-btn" onClick={() => confirm('Delete this version?') && run(() => del(`/api/content/${c.id}`), 'Deleted').then(q.reload)}><Trash2 size={14} /></button></td>
      </tr>)}</tbody>
    </table>}
    {edit && <Modal wide title={edit.id ? 'Edit content' : 'New content'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy || !edit.slug} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Kind"><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Slug" hint="Stable id. Same slug can have more than one version."><input className="input" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
        <Field label="Category"><input className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
        <Field label="Version"><input className="input" value={edit.version_label} onChange={(e) => setEdit({ ...edit, version_label: e.target.value })} /></Field>
        <Field label="Reviewer"><input className="input" value={edit.reviewer} onChange={(e) => setEdit({ ...edit, reviewer: e.target.value })} /></Field>
        <Field label="Sort"><input className="input" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
        <Field label="Media"><select className="input" value={edit.media_kind} onChange={(e) => setEdit({ ...edit, media_kind: e.target.value })}><option>text</option><option>diagram</option><option>video</option></select></Field>
        <Field label="Media URL" hint="Optional https video. Leave blank for the on-screen diagram placeholder."><input className="input" value={edit.media_url} onChange={(e) => setEdit({ ...edit, media_url: e.target.value })} /></Field>
      </div>
      <Toggle checked={!!edit.approved} onChange={(v) => setEdit({ ...edit, approved: v })} label="Approved for patients" />
      <LocEditor label="Title" value={edit.title} onChange={(title) => setEdit({ ...edit, title })} />
      <LocEditor label="Body" value={edit.body} onChange={(body) => setEdit({ ...edit, body })} area />
    </Modal>}
    {imp && <Modal title="Import clinical content" onClose={() => setImp(false)} footer={<><button className="btn" onClick={() => setImp(false)}>Cancel</button><button className="btn primary" disabled={busy || (!csvText && !url)} onClick={doImport}>Import</button></>}>
      <p className="subtle">Use the columns in <b>samples/clinical-content.csv</b>. A link-shared Google Sheet with that header works, or paste a CSV. No customer sheet is configured until you save a URL on the clinic.</p>
      <Field label="Google Sheet URL"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></Field>
      <Field label="Or CSV"><textarea className="input" rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} /></Field>
      <Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}><option value="merge">Merge by kind + slug + version</option><option value="replace">Replace the whole library</option></select></Field>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsvText(await f.text()); }} />
    </Modal>}
  </div>;
}
