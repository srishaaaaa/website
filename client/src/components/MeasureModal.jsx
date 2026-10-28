import { useState } from 'react';
import Modal from './Modal';
import { BACK_NECKS, FRONT_NECKS, Sheet } from '../pages/stitching/NeckPicker';

// Measurements for a stitching service line in Billing: neck types, sleeve, due date, sizes in cm and remarks.
export const SLEEVE_TYPES = ['Sleeveless', 'Short', '3/4', 'Full', 'Puff', 'Bell'];
export const SLEEVE_LENGTHS = ['Short', 'Elbow', '3/4', 'Full'];
export const CM_FIELDS = [['front_neck', 'Front neck'], ['back_neck', 'Back neck'], ['shoulder', 'Shoulder'], ['sleeve_length', 'Sleeve length'], ['arm_hole_curve', 'Arm hole curve'], ['shoulder_to_waist', 'Shoulder to waist'],
  ['chest', 'Chest'], ['waist', 'Waist'], ['blouse_length', 'Blouse length'], ['side_cut', 'Side cut'], ['front_cut', 'Front cut'], ['back_cut', 'Back cut']];

// One line of text for the bill / invoice, e.g. "Front: V Neck · Back: U Neck · Sleeve: Puff, Elbow · Chest 86 cm".
export const measureSummary = m => {
  if (!m) return '';
  const parts = [m.frontNeck && `Front neck: ${m.frontNeck}`, m.backNeck && `Back neck: ${m.backNeck}`, (m.sleeveType || m.sleeveLength) && `Sleeve: ${[m.sleeveType, m.sleeveLength].filter(Boolean).join(', ')}`,
    ...CM_FIELDS.filter(([k]) => m.cm?.[k]).map(([k, l]) => `${l} ${m.cm[k]} cm`), m.dueDate && `Due ${m.dueDate.split('-').reverse().join('-')}`, ...(m.remarks || [])];
  return parts.filter(Boolean).join(' · ');
};

function Chips({ options, value, onChange, label }) {
  return (
    <div className="msr-chips" role="group" aria-label={label}>
      {options.map(o => <button key={o} type="button" className={value === o ? 'on' : ''} aria-pressed={value === o} onClick={() => onChange(value === o ? '' : o)}>{o}</button>)}
    </div>
  );
}

export default function MeasureModal({ value, onSave, onClose }) {
  const [m, setM] = useState(() => ({ frontNeck: '', backNeck: '', sleeveType: '', sleeveLength: '', dueDate: '', ...value, cm: { ...(value?.cm || {}) }, remarks: [...(value?.remarks || [])] }));
  const [sheet, setSheet] = useState(null);
  const [remark, setRemark] = useState(null);
  const set = p => setM(x => ({ ...x, ...p }));
  const icon = (list, v) => list.find(([l]) => l === v)?.[1];
  const addRemark = () => { if (!remark?.trim()) return; set({ remarks: [...m.remarks, remark.trim()] }); setRemark(null) };

  const neck = (label, key, list, step) => (
    <div className="msr-f"><span className="msr-l">{label}</span>
      <button type="button" className="msr-neck" onClick={() => setSheet(step)}>
        {m[key] ? <>{icon(list, m[key])}<b>{m[key]}</b></> : <span className="muted">Select {label.toLowerCase()}</span>}
        <span aria-hidden="true">✎</span>
      </button>
    </div>
  );

  const save = () => {
    const cm = Object.fromEntries(Object.entries(m.cm).map(([k, v]) => [k, parseFloat(v)]).filter(([, v]) => v > 0));
    const out = {
      ...(m.frontNeck ? { frontNeck: m.frontNeck } : {}), ...(m.backNeck ? { backNeck: m.backNeck } : {}),
      ...(m.sleeveType ? { sleeveType: m.sleeveType } : {}), ...(m.sleeveLength ? { sleeveLength: m.sleeveLength } : {}),
      ...(m.dueDate ? { dueDate: m.dueDate } : {}), cm, remarks: m.remarks.map(r => r.trim()).filter(Boolean),
    };
    const empty = !Object.keys(cm).length && !out.remarks.length && Object.keys(out).length === 2;
    onSave(empty ? null : out); onClose();
  };

  return (
    <Modal title="Measurements" sub="For this stitching service. Sizes in cm." wide onClose={onClose}
      footer={<><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="dpos-btn" onClick={save}>Save measurements</button></>}>
      <div className="msr">
        <div className="msr-two">{neck('Front neck type', 'frontNeck', FRONT_NECKS, 'front')}{neck('Back neck type', 'backNeck', BACK_NECKS, 'back')}</div>
        <div className="msr-f"><span className="msr-l">Sleeve type</span><Chips label="Sleeve type" options={SLEEVE_TYPES} value={m.sleeveType} onChange={v => set({ sleeveType: v })} /></div>
        <div className="msr-f"><span className="msr-l">Sleeve length</span><Chips label="Sleeve length" options={SLEEVE_LENGTHS} value={m.sleeveLength} onChange={v => set({ sleeveLength: v })} /></div>
        <label className="msr-f"><span className="msr-l">Due date (optional)</span><input type="date" value={m.dueDate} onChange={e => set({ dueDate: e.target.value })} /></label>

        <h4 className="msr-h">Measurements (cm)</h4>
        <div className="msr-two">
          {CM_FIELDS.map(([k, l]) => (
            <label key={k} className="msr-f"><span className="msr-l">{l}</span>
              <span className="msr-cm"><input inputMode="decimal" placeholder="0" value={m.cm[k] ?? ''} onChange={e => set({ cm: { ...m.cm, [k]: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) } })} /><em>cm</em></span>
            </label>))}
        </div>

        <div className="msr-rh"><h4 className="msr-h">Remarks</h4><button type="button" className="dpos-btn ghost sm" onClick={() => setRemark('')}>+ Add remark</button></div>
        {!m.remarks.length && remark === null && <p className="muted small" style={{ margin: 0 }}>No remarks added.</p>}
        {m.remarks.length > 0 && (
          <ul className="msr-rem">
            {m.remarks.map((r, i) => <li key={i}><span>{r}</span><button type="button" aria-label="Remove remark" onClick={() => set({ remarks: m.remarks.filter((_, j) => j !== i) })}>✕</button></li>)}
          </ul>)}
        {remark !== null && (
          <div className="msr-add">
            <input autoFocus value={remark} maxLength={200} placeholder="e.g. Hooks at the back, cotton lining" onChange={e => setRemark(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRemark() } }} />
            <button type="button" className="dpos-btn sm" disabled={!remark.trim()} onClick={addRemark}>Add</button>
            <button type="button" className="dpos-btn ghost sm" onClick={() => setRemark(null)}>Cancel</button>
          </div>)}
      </div>
      {sheet === 'front' && <Sheet title="Select Front Neck Type" options={FRONT_NECKS} value={m.frontNeck} onCancel={() => setSheet(null)} onNext={v => { set({ frontNeck: v }); setSheet(m.backNeck ? null : 'back') }} />}
      {sheet === 'back' && <Sheet title="Select Back Neck Type" options={BACK_NECKS} value={m.backNeck} last onCancel={() => setSheet(null)} onNext={v => { set({ backNeck: v }); setSheet(null) }} />}
    </Modal>
  );
}
