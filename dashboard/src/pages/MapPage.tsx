import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize, MapPinPlus, Trash2, RefreshCw, Home, Layers, Lock, Unlock, Upload, Navigation, Square, Plus } from 'lucide-react';
import { ago, del, emptyLoc, patch, post, put, upload, useAction, useApi } from '../api';
import { Empty, Field, Loading, LocEditor, Modal, PageHead, Segmented, Toggle } from '../ui';

const HOME = 'home base';
type Pin = { name: string; x: number; y: number; yaw: number };
type Ov = { cx: number; cy: number; scale: number; rot: number; opacity: number };
type Display = 'temi' | 'half' | 'plan';

const mapErrorText = (e?: string | null) => !e ? null : e.includes('permission') ? 'The robot needs the Map permission. Open Zeeno on temi and allow it.' : 'The robot could not read its map. Save a map on temi, then refresh.';
const editErrorText = (e: any) => `Could not ${e.type === 'location_add' ? 'save' : 'delete'} “${e.name}”${e.reason ? ` (${e.reason})` : ''}.`;

async function prepareImage(file: File): Promise<{ blob: Blob; w: number; h: number; type: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('This file is not an image.')); i.src = url; });
    const k = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    let type = 'image/png';
    let blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), type));
    if (blob.size > 3.5e6) { type = 'image/jpeg'; blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), type, 0.88)); }
    return { blob, w, h, type };
  } finally { URL.revokeObjectURL(url); }
}

export function MapView({ robot, dests, reloadDests }: { robot: any; dests: any[]; reloadDests: () => void }) {
  const [mapPoll, setMapPoll] = useState(4000);
  const m = useApi<any>(`/api/robots/${robot.id}/map`, { poll: mapPoll });
  const live = useApi<any>(`/api/robots/${robot.id}/pose`, { poll: 2000 });
  useEffect(() => { setMapPoll(m.data?.pending || !m.data?.map ? 4000 : 30000); }, [m.data?.pending, m.data?.map]);
  const map = m.data?.map; const pending = m.data?.pending; const serverOv = m.data?.overlay;
  const { busy, run } = useAction();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [z, setZ] = useState(1); const [rot, setRot] = useState(0); const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'go' | 'add' | 'delete' | 'align'>('go');
  const [draft, setDraft] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [name, setName] = useState(''); const [destId, setDestId] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null); const [toGo, setToGo] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [ov, setOv] = useState<Ov | null>(null);
  const [display, setDisplay] = useState<Display>('temi');
  const drag = useRef<{ x: number; y: number; px: number; py: number; ov?: Ov; moved: boolean } | null>(null);
  const requested = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preDest = useRef<string | null>(null);

  useEffect(() => { if (serverOv) { setOv({ cx: serverOv.cx, cy: serverOv.cy, scale: serverOv.scale, rot: serverOv.rot, opacity: serverOv.opacity }); setDisplay(serverOv.display); } else setOv(null); },
    [serverOv?.asset_id, serverOv?.updated_at]); // eslint-disable-line
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  const fit = () => { if (!map) return; setZ(Math.min(size.w / map.width, size.h / map.height) * 0.92); setPan({ x: 0, y: 0 }); setRot(0); };
  useEffect(() => { fit(); }, [map?.map_id, map?.width, map?.height, size.w, size.h]); // eslint-disable-line
  useEffect(() => { if (!m.loading && !map && !pending && !requested.current) { requested.current = true; post(`/api/robots/${robot.id}/map/refresh`).then(m.reload).catch(() => {}); } }, [m.loading, map, pending]); // eslint-disable-line

  const toPx = (x: number, y: number) => { const c = (x - map.origin_x) / map.resolution + 0.5; const r = (y - map.origin_y) / map.resolution + 0.5; return { px: c, py: map.height - r }; };
  const toWorld = (px: number, py: number) => ({ x: map.origin_x + (px - 0.5) * map.resolution, y: map.origin_y + (map.height - py - 0.5) * map.resolution });
  const rad = (rot * Math.PI) / 180;
  const screenToPx = (sx: number, sy: number) => {
    const dx = sx - (size.w / 2 + pan.x); const dy = sy - (size.h / 2 + pan.y);
    const ux = (dx * Math.cos(-rad) - dy * Math.sin(-rad)) / z; const uy = (dx * Math.sin(-rad) + dy * Math.cos(-rad)) / z;
    return { px: ux + map.width / 2, py: uy + map.height / 2 };
  };
  const screenDeltaToPx = (dx: number, dy: number) => ({ x: (dx * Math.cos(-rad) - dy * Math.sin(-rad)) / z, y: (dx * Math.sin(-rad) + dy * Math.cos(-rad)) / z });
  const zoomAt = (f: number, sx = size.w / 2, sy = size.h / 2) => {
    const nz = Math.max(0.2, Math.min(40, z * f)); const k = nz / z;
    const cx = size.w / 2 + pan.x, cy = size.h / 2 + pan.y;
    setPan({ x: sx - (sx - cx) * k - size.w / 2, y: sy - (sy - cy) * k - size.h / 2 }); setZ(nz);
  };
  const aligning = mode === 'align' && !!ov && !serverOv?.locked;
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e: WheelEvent) => {
    e.preventDefault(); if (!map || !box.current) return;
    const d = -e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    if (aligning && ov && e.shiftKey) { setOv({ ...ov, rot: ov.rot + d * 0.02 }); return; }
    if (aligning && ov && e.altKey) { setOv({ ...ov, scale: ov.scale * Math.pow(1.0008, d) }); return; }
    const r = box.current.getBoundingClientRect();
    zoomAt(Math.pow(1.0015, d), e.clientX - r.left, e.clientY - r.top);
  };
  useEffect(() => { const el = box.current; if (!el) return; const h = (e: WheelEvent) => wheel.current(e); el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h); }, []);
  const down = (e: RPE) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, ov: aligning && !e.ctrlKey ? ov! : undefined, moved: false }; };
  const move = (e: RPE) => {
    const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; if (!d.moved) return;
    if (d.ov) { const q = screenDeltaToPx(dx, dy); setOv({ ...d.ov, cx: d.ov.cx + q.x, cy: d.ov.cy + q.y }); }
    else setPan({ x: d.px + dx, y: d.py + dy });
  };
  const up = (e: RPE) => {
    const d = drag.current; drag.current = null;
    if (!d || d.moved || mode !== 'add' || !map || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const p = screenToPx(e.clientX - r.left, e.clientY - r.top);
    if (p.px < 0 || p.py < 0 || p.px > map.width || p.py > map.height) return;
    setDraft({ ...toWorld(p.px, p.py), ...p }); setName(''); setDestId(preDest.current ?? ''); preDest.current = null;
  };
  const pins: Pin[] = map?.locations ?? [];
  const byLoc = useMemo(() => Object.fromEntries(dests.filter((a) => a.location_name).map((a) => [a.location_name.toLowerCase(), a])), [dests]);
  const livePose = live.data?.pose as { x: number; y: number; yaw: number } | null | undefined;
  const lastEdit = m.data?.lastEdit;
  const busyRobot = pending && ['location_add', 'location_delete'].includes(pending.type);
  const unplaced = dests.filter((a) => a.location_name && !pins.some((p) => p.name.toLowerCase() === a.location_name.toLowerCase()));
  const locked = !!serverOv?.locked;
  const showPlan = !!ov && !!serverOv?.url && (!locked || display !== 'temi');
  const planOpacity = !locked ? ov?.opacity ?? 0.5 : display === 'plan' ? 1 : ov?.opacity ?? 0.5;
  const mapOpacity = locked && display === 'plan' ? 0 : 1;
  const saveOverlay = (extra: Record<string, unknown>, msg?: string) => run(() => put(`/api/robots/${robot.id}/overlay`, { ...ov, display, ...extra }), msg).then(m.reload);
  const pickFile = async (f?: File) => {
    if (!f) return;
    const img = await run(() => prepareImage(f)); if (!img) return;
    await run(() => upload(`/api/robots/${robot.id}/overlay/image?w=${img.w}&h=${img.h}`, img.blob, img.type), 'Floor plan uploaded. Align it, then lock.');
    setMode('align'); setPanel(true); m.reload();
  };
  const savePoint = () => {
    const a = dests.find((x) => x.id === destId);
    const n = (a ? a.location_name : name).trim();
    return run(() => post(`/api/robots/${robot.id}/locations`, { name: n, x: draft!.x, y: draft!.y, yaw: 0 }), 'Saving location on the robot').then((r) => { if (r) { setDraft(null); setMode('go'); m.reload(); reloadDests(); } });
  };

  return <div className="map-wrap">
    <div className="map-shell">
      <div ref={box} className="map-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        {!map ? <div className="map-empty">{m.loading ? <Loading /> : <><RefreshCw size={22} /><span>{pending ? 'Waiting for the robot to send its map…' : mapErrorText(m.data?.lastError) ?? 'No map yet. Press refresh to request it from the robot.'}</span></>}</div>
          : <div className="map-layer" style={{ width: map.width, height: map.height, transform: `translate(${size.w / 2 + pan.x}px, ${size.h / 2 + pan.y}px) rotate(${rot}deg) scale(${z}) translate(${-map.width / 2}px, ${-map.height / 2}px)` }}>
            <img className="temi-map" src={map.png} width={map.width} height={map.height} style={{ ...(map.flip_y ? {} : { transform: 'scaleY(-1)' }), opacity: mapOpacity }} alt={`Map of ${robot.name}`} draggable={false} />
            {showPlan && ov && <img className={`plan ${aligning ? 'editing' : ''}`} src={serverOv.url} width={serverOv.img_w} height={serverOv.img_h} draggable={false} alt="Floor plan"
              style={{ left: ov.cx, top: ov.cy, opacity: planOpacity, transform: `translate(-50%, -50%) rotate(${ov.rot}deg) scale(${ov.scale})` }} />}
            {pins.map((p) => { const q = toPx(p.x, p.y); const home = p.name.toLowerCase() === HOME; const dest = byLoc[p.name.toLowerCase()];
              return <button key={p.name} className={`map-pin ${home ? 'home' : ''} ${mode === 'delete' && !home ? 'del' : ''}`} style={{ left: q.px, top: q.py, transform: `rotate(${-rot}deg) scale(${1 / z}) translate(-13px, -13px)` }}
                disabled={mode === 'go' ? false : mode === 'delete' ? home || !!busyRobot : true}
                onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (mode === 'go') setToGo(p.name); else if (mode === 'delete' && !home) setToDelete(p.name); }}>
                <span className="dot" />{home ? <Home size={13} /> : null}<span className="lbl">{dest ? (dest.label?.en || dest.location_name) : p.name}{dest?.requires_staff ? ' · staff' : ''}</span>
              </button>; })}
            {livePose && (() => { const q = toPx(livePose.x, livePose.y);
              return <div className="map-robot-live" style={{ left: q.px, top: q.py, transform: `scale(${1 / z}) rotate(${-livePose.yaw}rad)` }} title={`${robot.name} · live`}>
                <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true"><circle r="14" className="halo" /><path d="M11 0 L-7 -8 L-3 0 L-7 8 Z" /></svg>
              </div>; })()}
            {draft && <div className="map-pin draft" style={{ left: draft.px, top: draft.py, transform: `rotate(${-rot}deg) scale(${1 / z}) translate(-13px, -13px)` }}><span className="dot" /><span className="lbl">New</span></div>}
          </div>}
      </div>
      {panel && map && <div className="overlay-panel" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b><Layers size={16} /> Overlay map</b><button className="icon-btn" onClick={() => { setPanel(false); if (mode === 'align') setMode('go'); }}>×</button></div>
        {!serverOv ? <>
          <p className="subtle">Upload the clinic floor plan and line it up with the temi map.</p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload size={15} />Upload floor plan</button>
        </> : !locked ? <>
          <p className="subtle">Drag the plan to move it. Alt + scroll resizes, Shift + scroll rotates. Ctrl + drag pans the view.</p>
          {ov && <>
            <Field label={`Size ${(ov.scale * 100).toFixed(1)}%`}><div className="row gap8">
              <button className="btn small" onClick={() => setOv({ ...ov, scale: ov.scale / 1.05 })}>−</button>
              <input type="range" min={-4} max={2} step={0.001} value={Math.log10(ov.scale)} onChange={(e) => setOv({ ...ov, scale: Math.pow(10, Number(e.target.value)) })} />
              <button className="btn small" onClick={() => setOv({ ...ov, scale: ov.scale * 1.05 })}>+</button></div></Field>
            <Field label={`Rotation ${ov.rot.toFixed(1)}°`}><input type="range" min={-180} max={180} step={0.1} value={((ov.rot + 540) % 360) - 180} onChange={(e) => setOv({ ...ov, rot: Number(e.target.value) })} /></Field>
            <Field label="Opacity"><input type="range" min={0.15} max={0.95} step={0.05} value={ov.opacity} onChange={(e) => setOv({ ...ov, opacity: Number(e.target.value) })} /></Field>
            <div className="row gap8">
              <button className={`btn ${mode === 'align' ? 'dark' : ''}`} onClick={() => setMode(mode === 'align' ? 'go' : 'align')}>{mode === 'align' ? 'Moving plan' : 'Move plan'}</button>
              <button className="btn" disabled={busy} onClick={() => saveOverlay({ locked: false }, 'Alignment saved')}>Save</button>
              <button className="btn primary" disabled={busy} onClick={() => saveOverlay({ locked: true, display: 'half' }, 'Floor plan locked').then(() => { setMode('go'); setDisplay('half'); })}><Lock size={15} />Lock</button>
            </div>
            <button className="btn small ghost" onClick={() => fileRef.current?.click()}>Replace image</button>
          </>}
        </> : <>
          <p className="subtle">The floor plan is locked to this temi map.</p>
          <Segmented value={display} onChange={(v: Display) => { setDisplay(v); run(() => put(`/api/robots/${robot.id}/overlay`, { display: v })).then(m.reload); }}
            options={[{ value: 'temi', label: 'temi map' }, { value: 'half', label: 'Half and half' }, { value: 'plan', label: 'Floor plan' }]} />
          <div className="row gap8" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={() => run(() => put(`/api/robots/${robot.id}/overlay`, { locked: false }), 'Unlocked').then(() => { m.reload(); setMode('align'); })}><Unlock size={15} />Unlock</button>
            <button className="btn danger ghost" disabled={busy} onClick={() => confirm('Remove the floor plan?') && run(() => del(`/api/robots/${robot.id}/overlay`), 'Removed').then(m.reload)}><Trash2 size={15} />Remove</button>
          </div>
        </>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>}
      <div className="map-tools" role="toolbar" aria-label="Map tools">
        <button title="Rotate left" onClick={() => setRot((r) => r - 90)} disabled={!map}><RotateCcw /></button>
        <button title="Rotate right" onClick={() => setRot((r) => r + 90)} disabled={!map}><RotateCw /></button>
        <button title="Zoom in" onClick={() => zoomAt(1.3)} disabled={!map}><ZoomIn /></button>
        <button title="Zoom out" onClick={() => zoomAt(1 / 1.3)} disabled={!map}><ZoomOut /></button>
        <button title="Fit" onClick={fit} disabled={!map}><Maximize /></button>
        <span className="sep" />
        <button title="Add location" className={mode === 'add' ? 'on' : ''} disabled={!map || !!busyRobot} onClick={() => { setMode(mode === 'add' ? 'go' : 'add'); setDraft(null); }}><MapPinPlus /></button>
        <button title="Delete location" className={mode === 'delete' ? 'on' : ''} disabled={!map || !!busyRobot} onClick={() => { setMode(mode === 'delete' ? 'go' : 'delete'); setDraft(null); }}><Trash2 /></button>
        <span className="sep" />
        <button title="Floor plan" className={panel ? 'on' : ''} disabled={!map} onClick={() => { setPanel(!panel); if (panel && mode === 'align') setMode('go'); }}><Layers /></button>
        <button title="Refresh" disabled={busy || pending?.type === 'map_refresh'} onClick={() => run(() => post(`/api/robots/${robot.id}/map/refresh`), 'Map requested').then(m.reload)}><RefreshCw className={pending?.type === 'map_refresh' ? 'spin' : ''} /></button>
        <button title="Stop" onClick={() => run(() => post(`/api/robots/${robot.id}/commands`, { type: 'stop' }), 'Stop sent')}><Square /></button>
      </div>
    </div>
    <div className="row subtle map-foot">
      <span>{mode === 'add' ? 'Click the floor to add a location. The robot does not move.' : mode === 'delete' ? 'Click a location to delete it. home base is protected.' : mode === 'align' ? 'Drag the floor plan, then press Lock.' : 'Click a location to send the robot. Scroll to zoom, drag to pan.'}</span>
      <span>{livePose ? 'Live position' : live.data?.status === 'offline' ? 'Robot offline' : 'Waiting for a position'}</span>
      <span>{busyRobot ? 'Robot is updating the map…' : lastEdit && !lastEdit.ok ? <span className="crit-text">{editErrorText(lastEdit)}</span> : map ? `Map ${ago(map.updated_at)}` : ''}</span>
    </div>
    {map && unplaced.length > 0 && <div className="unplaced">
      <b>{unplaced.length} approved places are not on the temi map yet.</b>
      <div className="unplaced-list">{unplaced.map((a) => <button key={a.id} className="mini-art" onClick={() => { preDest.current = a.id; setMode('add'); setDraft(null); }}>{a.label?.en || a.location_name}</button>)}</div>
    </div>}
    {draft && <Modal title="Add a location" onClose={() => setDraft(null)} footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button>
      <button className="btn primary" disabled={busy || (!destId && !name.trim())} onClick={savePoint}>Save on the robot</button></>}>
      <Field label="Approved place"><select className="input" value={destId} onChange={(e) => setDestId(e.target.value)}>
        <option value="">Type a new temi name</option>
        {unplaced.map((a) => <option key={a.id} value={a.id}>{a.label?.en || a.location_name} · {a.location_name}</option>)}
      </select></Field>
      {!destId && <Field label="Location name" hint="Must match the name patients are escorted to, for example reception."><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
      <p className="subtle">The point is written into the robot map. The robot does not drive there.</p>
    </Modal>}
    {toDelete && <Modal title={`Delete ${toDelete}?`} onClose={() => setToDelete(null)} footer={<><button className="btn" onClick={() => setToDelete(null)}>Cancel</button>
      <button className="btn danger" disabled={busy} onClick={() => run(() => del(`/api/robots/${robot.id}/locations/${encodeURIComponent(toDelete)}`), 'Deleted on the robot').then(() => { setToDelete(null); m.reload(); })}>Delete</button></>}>
      <p>This removes the location from the temi map.</p>
    </Modal>}
    {toGo && <Modal title={`Send ${robot.name} to ${byLoc[toGo.toLowerCase()]?.label?.en ?? toGo}?`} onClose={() => setToGo(null)} footer={<><button className="btn" onClick={() => setToGo(null)}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => run(() => post(`/api/robots/${robot.id}/goto`, { location: toGo }), 'Robot is on its way').then(() => setToGo(null))}><Navigation size={15} />Go</button></>}>
      <p>Make sure the path is clear. Treatment rooms still need a staff confirmation when a patient asks.</p>
    </Modal>}
  </div>;
}

const KINDS = ['reception', 'waiting', 'consultation', 'treatment'];

export function MapPage({ cid }: { cid: string }) {
  const r = useApi<any>(`/api/robots?clinic=${cid}`, { poll: 15000 });
  const g = useApi<any>(`/api/clinics/${cid}`);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const robots = r.data?.robots ?? [];
  const robot = robots.find((x: any) => x.id === sel) ?? robots[0];
  const dests = g.data?.destinations ?? [];
  const saveDest = () => run(async () => {
    if (edit.id) await patch(`/api/destinations/${edit.id}`, edit);
    else await post(`/api/clinics/${cid}/destinations`, edit);
  }, 'Place saved').then((ok) => { if (ok) { setEdit(null); g.reload(); } });
  return <div>
    <PageHead kicker="Floor" title="Map">
      {robots.length > 1 && <select className="input" value={robot?.id} onChange={(e) => setSel(e.target.value)}>{robots.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <button className="btn" onClick={() => setEdit({ location_name: '', kind: 'waiting', requires_staff: false, sort_order: dests.length + 1, label: emptyLoc(), note: emptyLoc() })}><Plus size={16} />Approved place</button>
    </PageHead>
    {r.loading ? <Loading /> : !robot ? <Empty>Pair a robot first. Its temi map, live position and floor plan appear here.</Empty> : <MapView key={robot.id} robot={robot} dests={dests} reloadDests={g.reload} />}
    <h2>Approved destinations</h2>
    <p className="subtle">Patients can only be escorted to these names. Treatment rooms require a staff member to confirm the room is ready. Notes are the stationary directions.</p>
    <table><thead><tr><th>Place</th><th>temi name</th><th>Kind</th><th>Staff gate</th><th></th></tr></thead><tbody>
      {dests.map((d: any) => <tr key={d.id}><td>{d.label?.en}</td><td>{d.location_name}</td><td>{d.kind}</td><td>{d.requires_staff ? 'Yes' : 'No'}</td>
        <td className="row"><button className="btn small" onClick={() => setEdit(d)}>Edit</button>
          <button className="btn small danger ghost" onClick={() => confirm('Remove this destination?') && run(() => del(`/api/destinations/${d.id}`), 'Removed').then(g.reload)}>Delete</button></td></tr>)}
    </tbody></table>
    {edit && <Modal wide title={edit.id ? 'Edit destination' : 'New destination'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy || !edit.location_name} onClick={saveDest}>Save</button></>}>
      <div className="form-grid">
        <Field label="temi location name" hint="Lower case. This must be the name saved on the robot map."><input className="input" value={edit.location_name} onChange={(e) => setEdit({ ...edit, location_name: e.target.value })} /></Field>
        <Field label="Kind"><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value, requires_staff: e.target.value === 'treatment' ? true : edit.requires_staff })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
      </div>
      <Toggle checked={!!edit.requires_staff} onChange={(v) => setEdit({ ...edit, requires_staff: v })} label="Require staff confirmation before escort (treatment rooms)" />
      <LocEditor label="Label" value={edit.label || emptyLoc()} onChange={(label) => setEdit({ ...edit, label })} />
      <LocEditor label="Stationary directions" value={edit.note || emptyLoc()} onChange={(note) => setEdit({ ...edit, note })} area />
    </Modal>}
  </div>;
}
