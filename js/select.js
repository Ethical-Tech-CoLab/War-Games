// select.js
// A themed dropdown that replaces the browser's native (white, un-styleable) <select> popup
// with an on-brand green-on-black list. The native <select> stays in the DOM as the single
// source of truth — value, selectedIndex, and 'change' events all keep working — so existing
// code that reads `.value` or listens for 'change' is untouched; the custom UI just drives it.
//
// Why this exists: browsers do not reliably honor CSS on the native option popup (it renders
// white on light-theme OSes), which breaks the 1983 green-terminal brand. See
// .github/copilot-instructions.md → form controls. `.wg-select` is the standard app dropdown.

/** Enhance a single <select> in place. Idempotent. */
export function enhanceSelect(select) {
  if (!select || select.dataset.wgEnhanced) return;
  select.dataset.wgEnhanced = '1';

  const wrap = document.createElement('div');
  wrap.className = 'wg-select';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wg-select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (select.getAttribute('aria-label')) btn.setAttribute('aria-label', select.getAttribute('aria-label'));
  const valEl = document.createElement('span');
  valEl.className = 'wg-select-value';
  const caret = document.createElement('span');
  caret.className = 'wg-select-caret';
  caret.textContent = '\u25BE'; // ▾
  caret.setAttribute('aria-hidden', 'true');
  btn.append(valEl, caret);

  const list = document.createElement('ul');
  list.className = 'wg-select-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  Array.from(select.options).forEach((o, i) => {
    const li = document.createElement('li');
    li.className = 'wg-select-opt';
    li.setAttribute('role', 'option');
    li.tabIndex = -1;
    li.dataset.index = String(i);
    li.textContent = o.textContent;
    li.addEventListener('click', () => choose(i));
    list.appendChild(li);
  });

  // Insert the custom UI right after the (now hidden) native select.
  select.classList.add('wg-select-native');
  select.after(wrap);
  wrap.append(btn, list);

  const items = () => Array.from(list.children);

  function syncLabel() {
    const o = select.options[select.selectedIndex];
    valEl.textContent = o ? o.textContent : '';
    items().forEach((li, i) => li.setAttribute('aria-selected', String(i === select.selectedIndex)));
  }
  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    const sel = items()[select.selectedIndex] || items()[0];
    sel && sel.focus();
    document.addEventListener('pointerdown', onOutside, true);
  }
  function close() {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
    document.removeEventListener('pointerdown', onOutside, true);
  }
  function choose(i) {
    if (select.selectedIndex !== i) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncLabel();
    close();
    btn.focus();
  }
  function onOutside(e) {
    if (!wrap.contains(e.target)) close();
  }

  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  list.addEventListener('keydown', (e) => {
    const focused = document.activeElement;
    const i = items().indexOf(focused);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      btn.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items()[Math.min(items().length - 1, i + 1)] || items()[0]).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items()[Math.max(0, i - 1)] || items()[0]).focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (i >= 0) choose(i);
    }
  });

  // Keep the custom label in sync if code changes the value programmatically.
  select.addEventListener('change', syncLabel);
  syncLabel();
}

/** Enhance every <select> inside a container (defaults to the whole document). */
export function enhanceSelects(container = document) {
  container.querySelectorAll('select').forEach(enhanceSelect);
}
