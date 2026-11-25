import { billRows, returnRows } from './billSummary';
import { money } from './invoiceFormat';

// WhatsApp messages for bills, advance orders, measurement orders, online orders and returns: a short friendly note with emojis,
// the items, and the complete split-up (bill type, manual / coupon discount, delivery, CGST / SGST with rate and amount, total,
// payment mode, split amounts, cash received and amount returned, deposit and balance with dates), then the invoice link.
const LINE = '━━━━━━━━━━━━━━';
const amt = v => (v < 0 ? `- ${money(-v)}` : money(v));
const when = t => t ? new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

function rowsText(rows) {
  return rows.map(r => {
    const v = r.value == null ? '' : `: ${amt(r.value)}`;
    const note = r.note ? ` (${r.note.toLowerCase().replace(/(cgst|sgst|gst|qr)/g, m => m.toUpperCase())})` : '';
    const label = r.label === r.label.toUpperCase() ? r.label.charAt(0) + r.label.slice(1).toLowerCase().replace(/gst/g, 'GST') : r.label;
    switch (r.kind) {
      case 'total': return `${LINE}\n💰 *${r.label}${v}*\n${LINE}`;
      case 'muted': return r.value == null ? `📋 ${label}${note}` : `${label}${v}`;
      case 'pay': return `💳 ${r.label}${note}${v}`;
      case 'paysub': return `   ↳ ${r.label}${v}`;
      case 'strong': return `✅ *${r.label}${v}*`;
      default: return `${r.label}${note}${v}`;
    }
  }).join('\n');
}

const itemLine = (name, size, color, qty, value) => `• ${name}${size ? ` (${[size, color && color !== 'Default' ? color : ''].filter(Boolean).join(', ')})` : ''} × ${qty} — ${money(value)}`;

// A bill (sale from the API). `sale` is the bill an advance order turned into, when there is one.
export function billMessage(b, { shop, link, sale } = {}) {
  const name = b.customerName?.trim();
  const shopName = shop?.name || 'DHANYA BOUTIQUE';
  const isAdvance = 'deposit' in b && !('paymentMode' in b);
  const items = (b.items || []).map(i => i.variant !== undefined || i.quantity != null
    ? itemLine(i.name, i.variant?.size, i.variant?.color, i.quantity, i.lineTotal)
    : itemLine(i.name, i.size, i.color, i.qty, i.price * i.qty));
  const head = isAdvance
    ? [`Hello${name ? ' ' + name : ''} 👋`, `Your advance order with *${shopName}* is booked 🎉`, '', `🧾 *Order ${b.code}* · ${when(b.createdAt)}`, ...(b.deliveryDate ? [`📅 Expected delivery: ${when(b.deliveryDate)}`] : [])]
    : [`Hello${name ? ' ' + name : ''} 👋`, `Thank you for shopping with *${shopName}*! 🛍️`, '', `🧾 *${b.isGst ? 'Tax invoice' : 'Invoice'} ${b.invoiceNo}* · ${when(b.billDate || b.createdAt)}`];
  const measured = (b.items || []).some(i => i.variant?.measure || i.measure);
  return [
    ...head,
    ...(measured ? ['✂️ Includes stitching with your measurements'] : []),
    '', '🛒 *Items*', ...items, '',
    rowsText(billRows(b, { sale })),
    ...(b.returns?.length ? ['', `↩️ Returns on this bill: ${b.returns.map(r => `${r.returnNo} (${money(r.total)})`).join(', ')}`] : []),
    ...(link ? ['', `🔗 View or download your ${isAdvance ? 'order' : 'invoice'}: ${link}`] : []),
    '', isAdvance ? '🙏 We will let you know when it is ready. Thank you!' : `🙏 Thank you, we hope to see you again soon! – ${shopName}`,
  ].join('\n');
}

// A return invoice (credit note).
export function returnMessage(ret, { shop, link } = {}) {
  const name = ret.customerName?.trim();
  const shopName = shop?.name || 'DHANYA BOUTIQUE';
  return [
    `Hello${name ? ' ' + name : ''} 👋`, `Your return with *${shopName}* has been processed ↩️`, '',
    `🧾 *Return invoice ${ret.returnNo}* · ${when(ret.createdAt)}`, `📄 Against invoice ${ret.invoiceNo}`, ...(ret.reason ? [`📝 Reason: ${ret.reason}`] : []),
    '', '🛒 *Items returned*', ...(ret.returned || []).map(i => itemLine(i.name, i.variant?.size, i.variant?.color, i.qty, i.amount)), '',
    rowsText(returnRows(ret)),
    ...(link ? ['', `🔗 View or download your return invoice: ${link}`] : []),
    '', `🙏 Thank you for shopping with us – ${shopName}`,
  ].join('\n');
}

// Opens WhatsApp for a message that has to be loaded first. The tab is opened straight away (so the browser does not block it)
// and pointed at WhatsApp when the text is ready.
export async function openWhatsApp(phone, makeText) {
  const tab = window.open('', '_blank');
  try {
    const text = await makeText();
    const d = String(phone || '').replace(/\D/g, '').slice(-10);
    const url = `https://api.whatsapp.com/send?phone=${d.length === 10 ? '91' + d : ''}&text=${encodeURIComponent(text)}`;
    if (tab) tab.location.href = url; else window.location.href = url;
  } catch (e) { tab?.close(); throw e }
}

// Shop details for messages sent from list rows (loaded once).
let shopP = null;
export const loadShop = () => (shopP ??= import('./api').then(m => m.api('/admin/pos/shop')).catch(e => { shopP = null; throw e }));
const invoiceLink = token => token ? `${location.origin}/invoice/${token}` : '';
// A bill by its number, ready to send.
export async function billMessageFor(invoiceNo) {
  const { api } = await import('./api');
  const [d, shop] = await Promise.all([api('/admin/pos/sales/' + encodeURIComponent(invoiceNo)), loadShop()]);
  const s = d.sale || d;
  return billMessage(s, { shop, link: invoiceLink(s.shareToken) });
}
// An advance order by its code: once billed, the final invoice; before that, the booking with deposit and balance.
export async function advanceMessageFor(code) {
  const { api } = await import('./api');
  const [a, shop] = await Promise.all([api('/admin/pos/advances/' + encodeURIComponent(code)), loadShop()]);
  if (a.invoiceNo) return billMessageFor(a.invoiceNo);
  return billMessage(a, { shop });
}
