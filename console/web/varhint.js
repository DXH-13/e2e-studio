/**
 * Ô cắm `${global:…}` / `${var:…}` trong tham số keyword (bỏ môi trường; test data chỉ gắn qua test suite):
 *   - gõ `${` là hiện danh sách biến để chọn (lọc theo chữ đang gõ, ↑↓ Enter Tab Esc);
 *   - biến trong ô được tô màu khác chữ thường — input không tô được từng đoạn nên vẽ một lớp gương
 *     (`.hl-mirror`) cùng font/padding nằm dưới, còn chữ của input trong suốt, chỉ giữ con trỏ.
 * Bài cũ còn `${data:…}`/`${env:…}` vẫn được tô màu và vẫn chạy (engine đọc được), chỉ không gợi ý nữa.
 */

const PLACEHOLDER_RE = /\$\{(?:global|data|var|env):[^}]*\}/g;
const KINDS = [
  ['global', 'Global variable'],
  ['var', 'Local variable'],
];

let esc = (v) => String(v ?? '');

/** HTML đã escape, biến bọc trong `<span class="hl-var">` — dùng cho cả gương lẫn dòng tóm tắt keyword. */
export function highlightVars(text) {
  const s = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(PLACEHOLDER_RE)) {
    out += esc(s.slice(last, m.index)) + `<span class="hl-var">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** Gom nguồn biến cho một test case: global variables của project + local variable / output variable trong bài. */
export async function loadVarSources({ api, project, draft }) {
  const out = [];
  const g = await api(`/api/globals?project=${encodeURIComponent(project)}`).catch(() => null);
  for (const v of g?.variables ?? []) out.push({ kind: 'global', name: v.name, value: v.secret ? '••••' : v.value ?? '' });
  const seen = new Set();
  for (const v of draft?.variables ?? []) {
    if (v.name && !seen.has(v.name)) {
      seen.add(v.name);
      out.push({ kind: 'var', name: v.name, value: v.value ?? '' });
    }
  }
  for (const step of draft?.steps ?? []) {
    for (const call of step.keywords ?? []) {
      if (call.output && !seen.has(call.output)) {
        seen.add(call.output);
        out.push({ kind: 'var', name: call.output, value: `from ${call.keyword}` });
      }
    }
  }
  return out;
}

/** Cho phép app truyền hàm escape của nó (cùng một cách escape với phần còn lại của giao diện). */
export function initVarHints({ esc: escFn }) {
  esc = escFn;
}

let menu = null;
const closeMenu = () => {
  menu?.remove();
  menu = null;
};

/**
 * Gắn gương tô màu + gợi ý vào một `<input type="text">`. `sources()` trả mảng biến (đã nạp xong hay chưa
 * đều được — chưa có thì menu chỉ hiện bốn loại ô cắm để gõ tiếp).
 */
export function attachVarInput(input, sources) {
  if (!input || input.type !== 'text' || input.dataset.hl) return;
  input.dataset.hl = '1';

  const wrap = document.createElement('div');
  wrap.className = 'hl-wrap';
  input.parentNode.insertBefore(wrap, input);
  const mirror = document.createElement('div');
  mirror.className = 'hl-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  wrap.append(mirror, input);
  input.classList.add('hl-input');

  const paint = () => {
    mirror.innerHTML = highlightVars(input.value) || '';
    mirror.scrollLeft = input.scrollLeft;
  };
  input.addEventListener('scroll', () => (mirror.scrollLeft = input.scrollLeft));
  paint();

  /** Đoạn `${…` chưa đóng ngay trước con trỏ — có thì đang gõ ô cắm. */
  const openToken = () => {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const m = /\$\{([a-z]*)(?::([^}\s]*))?$/.exec(before);
    return m ? { start: m.index, kind: m[1], name: m[2] } : null;
  };

  const items = (tok) => {
    const list = (typeof sources === 'function' ? sources() : sources) ?? [];
    const q = `${tok.kind}${tok.name != null ? `:${tok.name}` : ''}`.toLowerCase();
    return list
      .map((v) => ({ ...v, text: `${v.kind}:${v.name}` }))
      .filter((v) => v.text.toLowerCase().includes(q) || v.text.toLowerCase().startsWith(q))
      .sort((a, b) => a.text.toLowerCase().startsWith(q) === b.text.toLowerCase().startsWith(q) ? 0 : a.text.toLowerCase().startsWith(q) ? -1 : 1)
      .slice(0, 40);
  };

  const accept = (v, tok) => {
    const insert = `\${${v.kind}:${v.name}}`;
    const end = input.selectionStart ?? input.value.length;
    // Nếu ngay sau con trỏ đã có "}" (gõ giữa ô cắm cũ) thì nuốt luôn để không thành "}}".
    const tail = input.value.slice(end).startsWith('}') ? input.value.slice(end + 1) : input.value.slice(end);
    input.value = input.value.slice(0, tok.start) + insert + tail;
    const pos = tok.start + insert.length;
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    closeMenu();
    input.focus();
  };

  const show = () => {
    const tok = openToken();
    if (!tok) return closeMenu();
    const found = items(tok);
    const rows = found.length
      ? found
      : KINDS.filter(([k]) => k.startsWith(tok.kind)).map(([k, label]) => ({ kind: k, name: '', value: label, hint: true }));
    if (!rows.length) return closeMenu();
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'hl-menu';
    menu.setAttribute('role', 'listbox');
    menu.innerHTML = rows
      .map(
        (v, i) => `
        <button type="button" role="option" class="hl-item ${i === 0 ? 'is-active' : ''}" data-i="${i}">
          <span class="hl-item-kind hl-kind-${v.kind}">${v.kind}</span>
          <span class="hl-item-name">${v.hint ? esc(v.value) : esc(v.name)}</span>
          ${v.hint ? '' : `<span class="hl-item-value">${esc(String(v.value).slice(0, 40))}</span>`}
        </button>`,
      )
      .join('');
    menu.addEventListener('mousedown', (e) => e.preventDefault()); // giữ focus ở input
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      if (!btn) return;
      const v = rows[Number(btn.dataset.i)];
      if (v.hint) {
        const t = openToken();
        input.value = input.value.slice(0, t.start) + `\${${v.kind}:` + input.value.slice(input.selectionStart);
        const pos = t.start + v.kind.length + 3;
        input.setSelectionRange(pos, pos);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        show();
      } else accept(v, openToken());
    });
    document.body.append(menu);
    const r = input.getBoundingClientRect();
    const h = menu.offsetHeight;
    const below = r.bottom + 4 + h <= window.innerHeight;
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${below ? r.bottom + 4 : Math.max(4, r.top - h - 4)}px`;
    menu.style.minWidth = `${Math.min(r.width, window.innerWidth - 8)}px`;
    menu._rows = rows;
  };

  const move = (delta) => {
    const all = [...menu.querySelectorAll('.hl-item')];
    const idx = all.findIndex((b) => b.classList.contains('is-active'));
    const next = (idx + delta + all.length) % all.length;
    all.forEach((b, i) => b.classList.toggle('is-active', i === next));
    all[next].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    paint();
    show();
  });
  input.addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      menu.querySelector('.hl-item.is-active')?.click();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu();
    }
  });
  input.addEventListener('click', show);
  input.addEventListener('blur', () => setTimeout(closeMenu, 120));
}
