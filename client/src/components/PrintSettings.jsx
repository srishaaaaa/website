import { useEffect, useState } from 'react';
import { PrintIcon } from './PrintIcon';

const KEY = 'dhanya.print';
export const PRINT_OPTIONS = [
  { value: 'a4', type: 'sheet', paper: 'a4', label: 'A4 sheet' },
  { value: 'a5', type: 'sheet', paper: 'a5', label: 'A5 sheet' },
  { value: '80', type: 'thermal', paper: '80', label: 'Thermal roll · 80 mm' },
  { value: '58', type: 'thermal', paper: '58', label: 'Thermal roll · 58 mm' },
];
export const readPrintPrefs = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.type) return v } catch { /* none saved */ } return { type: 'sheet', paper: 'a4' } };
export const savePrintPrefs = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } };

// Asked before every print: thermal roll (80 / 58 mm) or a sheet (A4 / A5). The last choice is preselected on this device.
// sheetOnly: documents that have no thermal layout.
export default function PrintSettings({ onPrint, onClose, sheetOnly = false }) {
  const opts = sheetOnly ? PRINT_OPTIONS.filter(o => o.type === 'sheet') : PRINT_OPTIONS;
  const saved = readPrintPrefs().paper;
  const [val, setVal] = useState(opts.some(o => o.value === saved) ? saved : opts[0].value);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]);
  const go = () => { const o = opts.find(x => x.value === val); savePrintPrefs({ type: o.type, paper: o.paper }); onPrint({ type: o.type, paper: o.paper }) };
  return (
    <div className="inv-modal" role="dialog" aria-modal="true" aria-label="Print settings" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="inv-ps">
        <div className="inv-ps-head"><b><PrintIcon /> PRINT</b><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="inv-ps-body">
          <label className="inv-ps-l" htmlFor="inv-ps-sel">PRINT ON</label>
          <select id="inv-ps-sel" className="inv-ps-sel" value={val} onChange={e => setVal(e.target.value)} autoFocus>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="inv-ps-hint">{val === '80' || val === '58' ? 'A narrow receipt for the bill printer.' : 'The full invoice, exactly as shown on screen.'}</p>
        </div>
        <div className="inv-ps-foot"><button type="button" className="inv-ps-cancel" onClick={onClose}>CANCEL</button>
          <button type="button" className="inv-ps-go" onClick={go}><PrintIcon /> PRINT NOW</button></div>
      </div>
    </div>
  );
}
