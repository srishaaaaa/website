// Shared by the invoice page, the receipt and the POS: money, dates, amount in words and GST lines. All money is integer paise.
export const num2 = p => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = p => '₹' + num2(p);

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
const three = n => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');

// Indian numbering: crore, lakh, thousand. 237700 paise -> "Two Thousand Three Hundred Seventy Seven Rupees Only".
export function inWords(paise) {
  const rupees = Math.floor(paise / 100), ps = paise % 100;
  const parts = [[Math.floor(rupees / 10000000), 'Crore'], [Math.floor(rupees / 100000) % 100, 'Lakh'], [Math.floor(rupees / 1000) % 100, 'Thousand'], [rupees % 1000, '']];
  const words = parts.filter(([n]) => n > 0).map(([n, u]) => (u ? two(n) + ' ' + u : three(n))).join(' ');
  return `${words || 'Zero'} Rupees${ps ? ` and ${two(ps)} Paise` : ''} Only`;
}

// "2026-10-24" -> "24 Oct 2026"
export const longDate = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
export const clock = iso => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

// GST split for a GST invoice: for each rate, half is CGST and half SGST (the shop and the place of supply are in the same state).
export function taxLines(items) {
  const byRate = new Map();
  for (const i of items) if (i.tax > 0 && i.taxRate > 0) byRate.set(i.taxRate, (byRate.get(i.taxRate) ?? 0) + i.tax);
  return [...byRate].sort((a, b) => a[0] - b[0]).flatMap(([rate, tax]) => { const c = Math.floor(tax / 2); return [{ label: `CGST @ ${rate / 2}%`, amount: c }, { label: `SGST @ ${rate / 2}%`, amount: tax - c }] });
}

export const MODE = { cash: 'Cash', upi: 'GPay / UPI', card: 'Card', split: 'Split' };
export const CHANNEL = (s) => s.channel === 'wholesale' ? 'WHOLESALE' : s.source === 'online' ? 'ONLINE' : 'OFFLINE';
export const STATES = ['Andhra Pradesh (37)', 'Arunachal Pradesh (12)', 'Assam (18)', 'Bihar (10)', 'Chhattisgarh (22)', 'Goa (30)', 'Gujarat (24)', 'Haryana (06)', 'Himachal Pradesh (02)', 'Jharkhand (20)', 'Karnataka (29)',
  'Kerala (32)', 'Madhya Pradesh (23)', 'Maharashtra (27)', 'Manipur (14)', 'Meghalaya (17)', 'Mizoram (15)', 'Nagaland (13)', 'Odisha (21)', 'Punjab (03)', 'Rajasthan (08)', 'Sikkim (11)',
  'Tamil Nadu (33)', 'Telangana (36)', 'Tripura (16)', 'Uttar Pradesh (09)', 'Uttarakhand (05)', 'West Bengal (19)', 'Delhi (07)', 'Jammu and Kashmir (01)', 'Ladakh (38)', 'Puducherry (34)',
  'Chandigarh (04)', 'Andaman and Nicobar Islands (35)', 'Dadra and Nagar Haveli and Daman and Diu (26)', 'Lakshadweep (31)'];
