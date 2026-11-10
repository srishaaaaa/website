import { Icon } from './AdminShell';
import { downloadCsv } from './StockMovements';

const stamp = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// "Export Excel": downloads the rows shown on the page as a CSV (UTF-8 with BOM, opens in Excel). Disabled when there is nothing to export.
export default function ExportCsv({ name, header, rows, label = 'Export Excel' }) {
  const empty = !rows || !rows.length;
  return (
    <button type="button" className="dpos-btn outline" disabled={empty} onClick={() => downloadCsv(`${name}-${stamp()}.csv`, header, rows)}>
      <Icon n="download" size={15} /> {label}
    </button>
  );
}
