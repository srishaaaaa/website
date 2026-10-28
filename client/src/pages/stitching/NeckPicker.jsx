import { useEffect, useState } from 'react';

// Small line drawings of each neckline (60 x 44 box), shown on the option cards.
const P = ({ d, extra }) => <svg viewBox="0 0 60 44" width="64" height="48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} />{extra}</svg>;

export const FRONT_NECKS = [
  ['V Neck', <P d="M4 4 30 40 56 4" />],
  ['Round', <P d="M6 6C14 40 46 40 54 6" />],
  ['Square', <P d="M10 6V34H50V6" />],
  ['Boat', <P d="M4 16C20 26 40 26 56 16" />],
  ['Sweetheart', <P d="M6 8C8 34 24 36 30 22 36 36 52 34 54 8" />],
  ['Queen', <P d="M12 4C2 14 8 24 18 26L30 40 42 26C52 24 58 14 48 4" />],
  ['Pentagon', <P d="M10 4V24L30 40 50 24V4" />],
  ['Keyhole', <P d="M12 4C18 30 42 30 48 4" extra={<circle cx="30" cy="38" r="3.5" />} />],
  ['Teardrop', <P d="M14 4C22 20 38 20 46 4" extra={<path d="M30 26C23 33 27 40 30 41 33 40 37 33 30 26Z" />} />],
  ['Collar', <P d="M3 8 20 5 30 22 40 5 57 8 49 30 30 18 11 30Z" />],
  ['Round With Cut', <P d="M10 4C18 32 42 32 50 4" extra={<path d="M30 30V42" />} />],
];

export const BACK_NECKS = [
  ['U Neck', <P d="M8 6C12 38 48 38 52 6" />],
  ['V Neck', <P d="M6 4 30 40 54 4" />],
  ['Deep U', <P d="M12 4V22C12 46 48 46 48 22V4" />],
  ['Square', <P d="M10 6V32H50V6" />],
  ['Boat', <P d="M4 14C20 22 40 22 56 14" />],
  ['Keyhole', <P d="M12 4C18 22 42 22 48 4" extra={<path d="M30 18V36M25 36H35" />} />],
  ['Teardrop + Dori', <P d="M14 4C22 20 38 20 46 4" extra={<path d="M30 24C23 31 27 38 30 39 33 38 37 31 30 24ZM22 40 38 40" />} />],
  ['Low Back (Cut-out)', <P d="M8 4V20C8 44 52 44 52 20V4" />],
  ['High Neck', <P d="M14 4V12C14 20 46 20 46 12V4" />],
  ['Collar', <P d="M4 10 20 6 30 18 40 6 56 10 48 28 30 20 12 28Z" />],
];

const parse = v => {
  const s = String(v || '');
  const f = /Front:\s*([^·]+?)\s*(?:·|$)/.exec(s)?.[1] ?? '', b = /Back:\s*(.+)$/.exec(s)?.[1]?.trim() ?? '';
  return { front: f, back: b, free: !f && !b ? s : '' };
};
export const joinNeck = (front, back) => [front && `Front: ${front}`, back && `Back: ${back}`].filter(Boolean).join(' · ');

export function Sheet({ title, options, value, onCancel, onNext, last }) {
  const known = options.some(([l]) => l === value);
  const [sel, setSel] = useState(value); const [custom, setCustom] = useState(value && !known ? value : '');
  useEffect(() => { const k = e => e.key === 'Escape' && onCancel(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onCancel]);
  const chosen = custom.trim() || sel;
  return (
    <div className="pick-ov" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pick-sheet">
        <div className="pick-head"><h3>{title}</h3><button type="button" aria-label="Close" onClick={onCancel}>✕</button></div>
        <div className="pick-grid">
          {options.map(([label, icon]) => (
            <button key={label} type="button" className={`pick-card ${sel === label && !custom.trim() ? 'on' : ''}`} aria-pressed={sel === label && !custom.trim()} onClick={() => { setSel(sel === label ? '' : label); setCustom('') }}>{icon}<b>{label}</b></button>))}
          <label className={`pick-card custom ${custom.trim() ? 'on' : ''}`}><b>CUSTOM</b><input value={custom} maxLength={60} onChange={e => { setCustom(e.target.value); setSel('') }} placeholder="Type neck style" /></label>
        </div>
        <div className="pick-foot"><button type="button" className="pick-cancel" onClick={onCancel}>Cancel</button><button type="button" className="pick-go" onClick={() => onNext(chosen)}>{last ? 'SKIP / DONE' : 'SKIP / NEXT'}</button></div>
      </div>
    </div>
  );
}

// "Neck design": a Front neck card and a Back neck card. Front opens the front picker and then the back one (Skip / Next);
// Back opens just the back picker. Stored as "Front: … · Back: …".
export function NeckField({ value, onChange }) {
  const cur = parse(value);
  const [step, setStep] = useState(0); const [front, setFront] = useState('');
  const icon = (list, label) => list.find(([l]) => l === label)?.[1];
  const card = (title, val, list, open) => (
    <button type="button" className={`neck-card ${val ? 'set' : ''}`} onClick={open}>
      <span className="neck-k">{title}</span>
      <span className="neck-ic">{val ? icon(list, val) : <svg viewBox="0 0 60 44" width="38" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" aria-hidden="true"><path d="M6 6C14 40 46 40 54 6" /></svg>}</span>
      <b>{val || 'Not chosen'}</b><em>{val ? 'Change' : 'Choose'}</em></button>);
  return (
    <div className="neck-field">
      {cur.free && <p className="muted small" style={{ flex: '1 1 100%', margin: 0 }}>Current: {cur.free}</p>}
      {card('FRONT NECK', cur.front, FRONT_NECKS, () => { setFront(cur.front); setStep(1) })}
      {card('BACK NECK', cur.back, BACK_NECKS, () => { setFront(cur.front); setStep(3) })}
      {value && <button type="button" className="link-u small" onClick={() => onChange('')}>Clear both</button>}
      {step === 1 && <Sheet title="Select Front Neck Type" options={FRONT_NECKS} value={cur.front} onCancel={() => setStep(0)} onNext={f => { setFront(f); setStep(2) }} />}
      {(step === 2 || step === 3) && <Sheet title="Select Back Neck Type" options={BACK_NECKS} value={cur.back} last onCancel={() => setStep(0)} onNext={b => { onChange(joinNeck(step === 2 ? front : cur.front, b)); setStep(0) }} />}
    </div>
  );
}
