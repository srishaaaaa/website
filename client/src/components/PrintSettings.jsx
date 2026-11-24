import { useEffect, useState } from 'react';
import { PrintIcon } from './PrintIcon';

const KEY = 'dhanya.print';
export const readPrintPrefs = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.type) return v } catch { /* none saved */ } return { type: 'sheet', paper: 'a4' } };
export const savePrintPrefs = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } };

// "Print settings", asked before every print: thermal roll (58 / 80 mm) or a sheet (A4 / A5). The last choice is remembered on this device.
// sheetOnly: documents that have no thermal layout (return invoices).
export default function PrintSettings({ onPrint, onClose, sheetOnly = false }) {
  const init = readPrintPrefs();
  const start = sheetOnly && init.type === 'thermal' ? { type: 'sheet', paper: 'a4' } : init;
  const [type, setType] = useState(start.type); const [paper, setPaper] = useState(start.paper);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]);
  const pick = t => { setType(t); setPaper(t === 'thermal' ? (['58', '80'].includes(paper) ? paper : '80') : (['a4', 'a5'].includes(paper) ? paper : 'a4')) };
  const sizes = type === 'thermal' ? [['58', '58 mm'], ['80', '80 mm']] : [['a4', 'A4'], ['a5', 'A5']];
  const types = sheetOnly ? [['sheet', 'Sheet (A4/A5)']] : [['thermal', 'Thermal Roll'], ['sheet', 'Sheet (A4/A5)']];
  return (
    <div className="inv-modal" role="dialog" aria-modal="true" aria-label="Print settings" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="inv-ps">
        <div className="inv-ps-head"><b><PrintIcon /> PRINT SETTINGS</b><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="inv-ps-body">
          <p className="inv-ps-l">PRINTER TYPE</p>
          <div className="inv-ps-row" style={types.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>{types.map(([v, l]) => <button key={v} type="button" className={type === v ? 'on' : ''} onClick={() => pick(v)}>{l}</button>)}</div>
          <p className="inv-ps-l">PAPER SIZE</p>
          <div className="inv-ps-row">{sizes.map(([v, l]) => <button key={v} type="button" className={paper === v ? 'on' : ''} onClick={() => setPaper(v)}>{l}</button>)}</div>
        </div>
        <div className="inv-ps-foot"><button type="button" className="inv-ps-cancel" onClick={onClose}>CANCEL</button>
          <button type="button" className="inv-ps-go" autoFocus onClick={() => { savePrintPrefs({ type, paper }); onPrint({ type, paper }) }}><PrintIcon /> PRINT NOW</button></div>
      </div>
    </div>
  );
}
