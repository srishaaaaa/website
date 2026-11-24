// Admin dropdowns open instantly. The browser's own select menu fades in slowly on some systems (Windows), so on a mouse
// click inside the admin we show a light menu of the same options straight away. Picking an option sets the real
// <select> and fires its normal change event, so every page keeps working unchanged. Keyboard use and touch screens
// keep the browser's own menu.
let users = 0, off = null;

export function installInstantSelect(root = '.dpos, .inv-modal, .dpos-modal') {
  users++;
  if (!off) off = install(root);
  return () => { if (--users === 0) { off(); off = null } };
}

function install(root) {
  let menu = null, sel = null, idx = -1, items = [];
  const close = () => { menu?.remove(); menu = null; sel = null; items = [] };
  const pick = o => {
    if (!sel || o.disabled) return;
    const s = sel; close();
    if (s.value !== o.value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    s.focus();
  };
  const mark = i => { items.forEach((el, n) => el.classList.toggle('on', n === i)); idx = i; items[i]?.scrollIntoView({ block: 'nearest' }) };

  const open = s => {
    close(); sel = s;
    const r = s.getBoundingClientRect();
    menu = document.createElement('div'); menu.className = 'isel'; menu.setAttribute('role', 'listbox');
    for (const node of s.children) {
      const opts = node.tagName === 'OPTGROUP' ? [...node.children] : [node];
      if (node.tagName === 'OPTGROUP') { const g = document.createElement('div'); g.className = 'isel-g'; g.textContent = node.label; menu.appendChild(g) }
      for (const o of opts) {
        if (o.tagName !== 'OPTION' || o.hidden) continue;
        const el = document.createElement('div'); el.className = 'isel-o' + (o.disabled ? ' off' : '') + (o.value === s.value ? ' cur' : '');
        el.setAttribute('role', 'option'); el.textContent = o.textContent;
        el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); pick(o) });
        el.addEventListener('mousemove', () => mark(items.indexOf(el)));
        el._opt = o; items.push(el); menu.appendChild(el);
      }
    }
    document.body.appendChild(menu);
    const h = menu.offsetHeight, below = innerHeight - r.bottom - 8;
    menu.style.minWidth = r.width + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (below >= Math.min(h, 220) || below > r.top ? r.bottom + 4 : Math.max(8, r.top - 4 - h)) + 'px';
    menu.style.maxHeight = Math.max(160, below >= Math.min(h, 220) || below > r.top ? below : r.top - 12) + 'px';
    mark(Math.max(0, items.findIndex(el => el._opt.value === s.value)));
  };

  const onDown = e => {
    if (menu && menu.contains(e.target)) return;
    const s = e.target.closest?.('select');
    if (menu) { const was = sel; close(); if (s && s === was) { e.preventDefault(); return } }
    if (!s || e.button !== 0 || s.multiple || s.size > 1 || s.disabled || !s.closest(root)) return;
    if (!matchMedia('(pointer: fine)').matches) return;
    e.preventDefault(); s.focus(); open(s);
  };
  const onKey = e => {
    if (!menu) return;
    if (e.key === 'Escape' || e.key === 'Tab') { const s = sel; close(); if (e.key === 'Escape') { e.preventDefault(); s?.focus() } return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); let i = idx; do { i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length } while (items[i]._opt.disabled && i !== idx); mark(i) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items[idx]) pick(items[idx]._opt) }
  };
  const onMove = e => { if (menu && !menu.contains(e.target)) close() };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  addEventListener('scroll', onMove, true); addEventListener('resize', close);
  return () => { close(); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); removeEventListener('scroll', onMove, true); removeEventListener('resize', close) };
}
