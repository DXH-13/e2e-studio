/**
 * Ô tìm kiếm chung giữa thanh trên cùng: tìm test case + test object của project đang mở
 * (server `/api/search`, không dấu cũng khớp). Ctrl+P hoặc Ctrl+K nhảy vào ô, ↑↓ chọn, Enter mở, Esc xoá.
 */
let H = null;
const st = { q: '', results: null, active: 0, timer: null, seq: 0 };

export function initSearch(helpers) {
  H = helpers;
  bind();
}

const root = () => H.$('#gsearch');
const input = () => H.$('#gsearch-input');
const box = () => H.$('#gsearch-results');
const flat = () => (st.results ? [...st.results.cases, ...st.results.objects] : []);

function bind() {
  const el = input();
  el.addEventListener('input', () => {
    st.q = el.value;
    schedule();
  });
  el.addEventListener('focus', () => {
    if (st.results) paint();
    else if (st.q.trim()) schedule(0);
  });
  el.addEventListener('keydown', (event) => {
    const items = flat();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      st.active = (st.active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (event.key === 'Enter') {
      const item = items[st.active] ?? items[0];
      if (item) {
        event.preventDefault();
        open(item);
      }
    } else if (event.key === 'Escape') {
      if (st.q) clear();
      else el.blur();
    }
  });
  // mousedown mặc định kéo focus khỏi ô nhập → hộp kết quả đóng trước khi click kịp tới.
  box().addEventListener('mousedown', (event) => event.preventDefault());
  box().addEventListener('click', (event) => {
    const row = event.target.closest('[data-idx]');
    if (row) open(flat()[Number(row.dataset.idx)]);
  });
  document.addEventListener('click', (event) => {
    if (!root().contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key !== 'p' && event.key !== 'k' && event.key !== 'P' && event.key !== 'K') return;
    if (!H.state.project) return;
    event.preventDefault();
    el.focus();
    el.select();
  });
}

function schedule(delay = 120) {
  clearTimeout(st.timer);
  st.timer = setTimeout(run, delay);
}

async function run() {
  const q = st.q.trim();
  if (!q || !H.state.project) {
    st.results = null;
    paint();
    return;
  }
  const seq = ++st.seq;
  try {
    const results = await H.api(`/api/search?project=${encodeURIComponent(H.state.project)}&q=${encodeURIComponent(q)}`);
    if (seq !== st.seq) return;
    st.results = results;
    st.active = 0;
    paint();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

function paint() {
  const { esc } = H;
  const out = box();
  if (!st.results) {
    out.hidden = true;
    out.innerHTML = '';
    return;
  }
  let i = 0;
  const row = (it) => {
    const idx = i++;
    const icon = it.kind === 'case' ? H.icons.case : H.icons.objects;
    const isCase = it.kind === 'case';
    const meta = isCase ? esc(it.id) : `${esc(window.ObjectModel?.METHOD_LABELS[it.method] ?? it.method)} · ${esc(it.summary)}`;
    return `
      <button type="button" class="gs-row ${idx === st.active ? 'is-active' : ''}" data-idx="${idx}" role="option" aria-selected="${idx === st.active}">
        <span class="gs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
        <span class="gs-main">
          <span class="gs-name">${esc(isCase ? it.name || it.id : it.key.split('/').pop())}</span>
          <span class="gs-sub">${esc(isCase ? it.folder || 'Test cases' : it.name || it.folder || 'Object Repository')}</span>
        </span>
        <span class="gs-meta mono">${meta}</span>
      </button>`;
  };
  const groups = [];
  if (st.results.cases.length) groups.push(`<div class="gs-group">Test cases</div>${st.results.cases.map(row).join('')}`);
  if (st.results.objects.length) groups.push(`<div class="gs-group">Object Repository</div>${st.results.objects.map(row).join('')}`);
  out.innerHTML = groups.join('') || `<div class="gs-empty">Nothing matches “${esc(st.q.trim())}”</div>`;
  out.hidden = false;
  out.querySelector('.gs-row.is-active')?.scrollIntoView({ block: 'nearest' });
}

function close() {
  box().hidden = true;
}

function clear() {
  st.q = '';
  st.results = null;
  input().value = '';
  paint();
}

async function open(item) {
  clear();
  input().blur();
  if (item.kind === 'case') await H.openCase(item.path);
  else await H.revealObject(item.key);
}
