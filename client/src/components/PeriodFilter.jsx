import { useState } from 'react';

// The "PERIOD: All time / Today / This week / This month / This year  +  FROM / TO" filter used by every admin list with dates.
// A value is { p, from, to }; the effective range is periodRange(value). Dates are IST calendar days (YYYY-MM-DD).
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const istDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));

const PERIODS = [['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']];

function chipRange(p) {
  const t = todayStr(), d = new Date(t + 'T00:00:00Z'), iso = x => x.toISOString().slice(0, 10);
  if (p === 'today') return [t, t];
  if (p === 'week') { const m = new Date(d); m.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return [iso(m), t] }
  if (p === 'month') return [t.slice(0, 8) + '01', t];
  if (p === 'year') return [t.slice(0, 4) + '-01-01', t];
  return ['', ''];
}
export const chipValue = p => { const [from, to] = chipRange(p); return { p, from, to } };
export const periodRange = v => [v.from || '2000-01-01', v.to || todayStr()];
export const inPeriod = (iso, v) => { if (!iso) return false; const d = String(iso).length > 10 ? istDay(iso) : String(iso); const [a, b] = periodRange(v); return d >= a && d <= b };
export const usePeriod = (initial = 'all') => useState(() => chipValue(initial));

export function PeriodFilter({ value, onChange }) {
  return (
    <div className="dpos-pf">
      <div className="dpos-pg" role="radiogroup" aria-label="Period"><span className="lab">Period:</span>
        {PERIODS.map(([p, l]) => <button key={p} role="radio" aria-checked={value.p === p} className={value.p === p ? 'on' : ''} onClick={() => onChange(chipValue(p))}>{l}</button>)}</div>
      <div className="dpos-pg dates"><label><span className="lab">From:</span><input type="date" max={todayStr()} value={value.from} onChange={e => onChange({ ...value, p: 'custom', from: e.target.value })} aria-label="From date" /></label>
        <label><span className="lab">To:</span><input type="date" max={todayStr()} value={value.to} onChange={e => onChange({ ...value, p: 'custom', to: e.target.value })} aria-label="To date" /></label></div>
    </div>
  );
}

// A labelled pill group for any other filter ("STATUS:", "STOCK:", "BILLS:" …), styled like the period filter.
export function Chips({ label, options, value, onChange }) {
  return (
    <div className="dpos-pg" role="radiogroup" aria-label={label}>{label && <span className="lab">{label}:</span>}
      {options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>
  );
}
