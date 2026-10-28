import { useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../lib/api';
import { useApp } from '../context/App';

// A photo you can click: the dot marks the part that must stay visible when the site crops the photo to fit a frame.
export function FocusImage({ src, alt, x, y, onPick, box = 0.75, children }) {
  const [nat, setNat] = useState(null);
  const click = e => { const r = e.currentTarget.getBoundingClientRect(); const c = v => Math.round(Math.min(100, Math.max(0, v))); onPick(c((e.clientX - r.left) / r.width * 100), c((e.clientY - r.top) / r.height * 100)) };
  return (
    <>
      <span className="adm-focus" style={{ '--r': nat ? nat[0] / nat[1] : box, '--b': box }} onClick={click} title="Click the part of the photo that must always stay visible">
        <img src={src} alt={alt} onLoad={e => setNat([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
        {x != null && <i className="adm-dot" style={{ left: `${x}%`, top: `${y}%` }} />}
      </span>
      {children}
    </>
  );
}

// A small drop zone + file picker. Calls onFiles(File[]).
export function Drop({ onFiles, multiple = true, accept = 'image/jpeg,image/png,image/webp', label = 'Drop photos here or click to choose', busy }) {
  const [over, setOver] = useState(false); const input = useRef();
  return (
    <div className={`adm-drop ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]) }}>
      <button type="button" className="btn dark pill" onClick={() => input.current.click()} disabled={busy}>{busy ? 'UPLOADING…' : 'CHOOSE PHOTOS'}</button>
      <span className="muted small">{label}</span>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={e => { onFiles([...e.target.files]); e.target.value = '' }} />
    </div>
  );
}

// The photos of one product, shown inside its Edit window: upload, reorder, remove, alt text, colour, focus point.
export default function ProductPhotos({ product, onChanged }) {
  const { toast, loadCatalog } = useApp();
  const [imgs, setImgs] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const colors = [...new Set((product.variants || []).map(v => v.color).concat(product.colors || []))].filter(c => c && c !== 'Default');
  useEffect(() => { api(`/admin/products/${product.id}/images`).then(setImgs).catch(e => setErr(e.message)) }, [product.id]);
  const changed = rows => { setImgs(rows); loadCatalog?.(); onChanged?.() };
  const add = async files => {
    if (!files.length) return; setBusy(true); setErr();
    try {
      let rows = imgs;
      for (const f of files) { const up = await uploadImage(f); rows = await api(`/admin/products/${product.id}/images`, { method: 'POST', body: { url: up.url, alt: product.name } }) }
      changed(rows); toast(`${files.length} photo${files.length > 1 ? 's' : ''} added.`);
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const move = async (i, d) => {
    const ids = imgs.map(x => x.id), j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { changed(await api(`/admin/products/${product.id}/images/order`, { method: 'PUT', body: { ids } })) } catch (e) { setErr(e.message) }
  };
  const del = async im => { if (!confirm('Remove this photo?')) return; try { changed(await api(`/admin/images/${im.id}`, { method: 'DELETE' })) } catch (e) { setErr(e.message) } };
  const patch = async (im, body, msg) => { try { setImgs(await api(`/admin/images/${im.id}`, { method: 'PATCH', body })); loadCatalog?.(); if (msg) toast(msg) } catch (e) { setErr(e.message) } };
  return (
    <div className="dpos-box pphotos">
      <b>Photos {imgs && <span className="muted small">({imgs.length})</span>}</b>
      <p className="muted small" style={{ margin: '4px 0 10px' }}>3 photos recommended (full view, detail, back), portrait 3:4. The <b>first</b> is the card image; the <b>second</b> shows on hover. Click a photo on the part that must always stay visible.</p>
      {err && <p role="alert" className="dpos-err">{err}</p>}
      <Drop onFiles={add} busy={busy} />
      {!imgs ? <p className="muted small">Loading…</p> : !imgs.length ? <p className="muted small">No photos yet.</p> : (
        <ul className="adm-gal">
          {imgs.map((im, i) => (
            <li key={im.id}>
              <div className="adm-img"><FocusImage src={im.url} alt={im.alt || product.name} x={im.focusX} y={im.focusY} onPick={(x, y) => patch(im, { focusX: x, focusY: y }, 'Saved: the site will keep that part in view.')}><span className="adm-pos">{i + 1}</span></FocusImage></div>
              {im.focusX != null && <button type="button" className="link-u small" onClick={() => patch(im, { focusX: null, focusY: null }, 'Photo focus reset.')}>Reset focus</button>}
              <input aria-label={`Alt text for photo ${i + 1}`} defaultValue={im.alt} onBlur={e => { const v = e.target.value.trim(); if (v !== im.alt) patch(im, { alt: v }) }} placeholder="Describe the photo" />
              {colors.length > 0 && <label className="adm-col"><span className="muted small">Shows for</span>
                <select aria-label={`Colour for photo ${i + 1}`} value={im.color || ''} onChange={e => patch(im, { color: e.target.value || null }, e.target.value ? `That photo now shows for ${e.target.value}.` : 'That photo now shows for every colour.')}><option value="">All colours</option>{colors.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
              <div className="adm-act">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">←</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === imgs.length - 1} aria-label="Move later">→</button>
                <button type="button" onClick={() => del(im)} className="danger">Remove</button>
              </div>
            </li>))}
        </ul>)}
    </div>
  );
}
