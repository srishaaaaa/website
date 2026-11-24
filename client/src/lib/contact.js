// Contact helpers. Everything is derived from the store settings (Admin → Store settings), so one edit updates the whole site.
export const digits = p => (p || '').replace(/\D/g, '');
export const telLink = p => (p ? `tel:${p.replace(/[^+\d]/g, '')}` : null);
// 10-digit Indian numbers get the 91 country code for WhatsApp.
export const waLink = (phone, text = '') => {
  const d = digits(phone); if (!d) return null;
  return `https://api.whatsapp.com/send?phone=${d.length === 10 ? '91' + d : d}${text ? `&text=${encodeURIComponent(text)}` : ''}`; // not wa.me: its redirect breaks emojis
};
