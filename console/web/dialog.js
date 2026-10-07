/**
 * Hộp thoại của console — thay cho `alert` / `confirm` / `prompt` của trình duyệt.
 *
 * Vì sao không dùng hộp thoại native: nó vẽ theo hệ điều hành nên lệch hẳn giao diện, không
 * theo chế độ sáng/tối, không hiện được nhiều ô nhập trong một lần (recorder cần ba ô), và
 * `prompt` bị một số trình duyệt chặn hẳn. Ở đây gói cả ba dạng vào hai hàm trả Promise, để chỗ
 * gọi viết được `if (!(await askConfirm(...))) return;` — đúng nhịp như `confirm` cũ.
 *
 * Bàn phím: Enter = nút chính, Escape = huỷ. Mở hộp là khoá cuộn trang và trả tiêu điểm về ô đầu.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Một hộp thoại tại một thời điểm — mở chồng là lỗi thiết kế, không phải tính năng. */
let current = null;

function open({ title, body, okLabel, cancelLabel, danger, onSubmit }) {
  close();
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head"><h2 id="modal-title">${esc(title)}</h2></header>
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">
        <button type="button" class="btn btn-ghost" data-modal-cancel>${esc(cancelLabel ?? 'Cancel')}</button>
        <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-modal-ok>${esc(okLabel ?? 'OK')}</button>
      </footer>
    </form>`;

  const form = root.querySelector('form');
  const finish = (value) => {
    close();
    onSubmit(value);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish(true);
  });
  root.querySelector('[data-modal-cancel]').addEventListener('click', () => finish(null));
  // Bấm ra ngoài hộp = huỷ; bấm trong hộp thì thôi.
  root.addEventListener('mousedown', (e) => {
    if (e.target === root) finish(null);
  });
  const onKey = (e) => {
    if (e.key === 'Escape') finish(null);
  };
  document.addEventListener('keydown', onKey);

  document.body.append(root);
  document.body.classList.add('modal-open');
  current = { root, onKey };

  // Tiêu điểm: ô nhập đầu tiên nếu có, không thì nút chính — để Enter/Escape dùng được ngay.
  const first = root.querySelector('input, select, textarea') ?? root.querySelector('[data-modal-ok]');
  first?.focus();
  if (first instanceof HTMLInputElement) first.select();
  return form;
}

function close() {
  if (!current) return;
  document.removeEventListener('keydown', current.onKey);
  current.root.remove();
  document.body.classList.remove('modal-open');
  current = null;
}

/** Bảng nổi đang mở (một cái tại một thời điểm) — khác hộp thoại hỏi/đáp: ruột là HTML tuỳ ý. */
let panel = null;

export function closePanel() {
  if (!panel) return;
  document.removeEventListener('keydown', panel.onKey);
  panel.root.remove();
  document.body.classList.remove('modal-open');
  panel = null;
}

/**
 * Mở một bảng nổi giữa màn với HTML tuỳ ý (vd form chạy test). `onMount()` được gọi sau khi
 * HTML đã vào DOM để chỗ gọi gắn sự kiện. Đóng bằng nút ✕, Escape, bấm ra ngoài, hoặc `closePanel()`.
 */
export function showPanel({ title, html, wide = false, className = '', onMount }) {
  closePanel();
  close();
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''} ${esc(className)}" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <header class="modal-head modal-head-row">
        <h2 id="panel-title">${esc(title)}</h2>
        <button type="button" class="btn btn-sm btn-icon modal-close" data-panel-close title="Close" aria-label="Close">✕</button>
      </header>
      <div class="modal-body">${html}</div>
    </div>`;
  root.querySelector('[data-panel-close]').addEventListener('click', closePanel);
  root.addEventListener('mousedown', (e) => {
    if (e.target === root) closePanel();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') closePanel();
  };
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  document.body.classList.add('modal-open');
  panel = { root, onKey };
  onMount?.(root);
  root.querySelector('input, select, textarea, button:not([data-panel-close])')?.focus();
  return closePanel;
}

/** Menu chuột phải đang mở (một cái tại một thời điểm). */
let menu = null;

export function closeContextMenu() {
  if (!menu) return;
  document.removeEventListener('mousedown', menu.onOutside, true);
  document.removeEventListener('keydown', menu.onKey);
  window.removeEventListener('scroll', menu.close, true);
  window.removeEventListener('resize', menu.close);
  menu.root.remove();
  menu = null;
}

/**
 * Menu ngữ cảnh tại toạ độ chuột. `items`: `{ label, onSelect, danger?, disabled? }`.
 *
 * Tự nép vào trong khung nhìn khi mở sát mép; đóng khi chọn, bấm ra ngoài, Escape, cuộn hay đổi
 * cỡ cửa sổ. Bàn phím: mũi tên lên/xuống để di chuyển, Enter để chọn.
 */
export function showContextMenu({ x, y, items }) {
  closeContextMenu();
  const root = document.createElement('div');
  root.className = 'ctx-menu';
  root.setAttribute('role', 'menu');
  // Mục có `checked` (true/false) là lựa chọn bật/tắt: chừa cột dấu ✓ bên trái cho mọi mục cùng thẳng hàng.
  const hasChecks = items.some((it) => typeof it.checked === 'boolean');
  root.innerHTML = items
    .map((it, i) => {
      if (it.separator) return '<div class="ctx-sep" role="separator"></div>';
      if (it.heading) return `<div class="ctx-heading" role="presentation">${esc(it.heading)}</div>`;
      const check = hasChecks ? `<span class="ctx-check" aria-hidden="true">${it.checked ? '✓' : ''}</span>` : '';
      const role = typeof it.checked === 'boolean' ? `role="menuitemcheckbox" aria-checked="${it.checked}"` : 'role="menuitem"';
      return `<button type="button" ${role} class="ctx-item${it.danger ? ' is-danger' : ''}" data-ctx="${i}" ${it.disabled ? 'disabled' : ''}><span class="ctx-label">${check}${it.icon ?? ''}${esc(it.label)}</span>${it.shortcut ? `<span class="ctx-kbd">${esc(it.shortcut)}</span>` : ''}</button>`;
    })
    .join('');

  const close = () => closeContextMenu();
  const onOutside = (e) => {
    if (!root.contains(e.target)) close();
  };
  const onKey = (e) => {
    const buttons = [...root.querySelectorAll('.ctx-item:not([disabled])')];
    const idx = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    }
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn || btn.disabled) return;
    const item = items[Number(btn.dataset.ctx)];
    close();
    item.onSelect?.();
  });

  document.body.append(root);
  // Đặt xong mới đo, để menu không tràn ra ngoài mép phải/dưới.
  const { offsetWidth: w, offsetHeight: h } = root;
  root.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  root.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  menu = { root, onOutside, onKey, close };
  root.querySelector('.ctx-item:not([disabled])')?.focus();
}

/**
 * Hỏi có/không. Trả `true` khi bấm nút chính.
 *
 * `danger: true` tô nút chính màu đỏ — dùng cho việc xoá, để mắt kịp dừng trước khi tay bấm.
 */
export function askConfirm({ title, message, okLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const lines = String(message ?? '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `<p>${esc(l)}</p>`)
      .join('');
    open({ title, body: lines, okLabel, danger, onSubmit: (v) => resolve(Boolean(v)) });
  });
}

/**
 * Xác nhận thao tác phá huỷ lớn: nút chính chỉ bấm được khi gõ đúng nguyên văn `expected` (phân biệt hoa thường),
 * để không ai Enter theo quán tính mà cuốn mất cả thư mục.
 */
export function askTypedConfirm({ title, message, expected, okLabel = 'Delete' }) {
  return new Promise((resolve) => {
    const lines = String(message ?? '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `<p>${esc(l)}</p>`)
      .join('');
    const body = `${lines}
      <div class="field typed-confirm">
        <label for="modal-typed"><span>Type the text below to confirm:</span> <code class="typed-confirm-text">${esc(expected)}</code></label>
        <input id="modal-typed" name="typed" type="text" autocomplete="off" spellcheck="false" />
      </div>`;
    const form = open({ title, body, okLabel, danger: true, onSubmit: (v) => resolve(Boolean(v)) });
    const input = form.elements.typed;
    const ok = form.querySelector('[data-modal-ok]');
    const matches = () => input.value === expected;
    ok.disabled = true;
    input.addEventListener('input', () => {
      ok.disabled = !matches();
    });
    form.addEventListener(
      'submit',
      (e) => {
        if (matches()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        input.classList.add('is-invalid');
        input.focus();
      },
      true,
    );
  });
}

/**
 * Hỏi một hay nhiều giá trị. Trả object `{ [name]: value }`, hoặc `null` nếu huỷ.
 *
 * Mỗi field: `{ name, label, value?, placeholder?, hint?, type?: 'text'|'select', options?, required? }`.
 * Field bắt buộc mà bỏ trống thì hộp không đóng, ô đó được đánh dấu — không có chuyện trả về
 * chuỗi rỗng rồi để chỗ gọi tự đoán.
 */
export function askForm({ title, fields, okLabel = 'OK' }) {
  return new Promise((resolve) => {
    const body = fields
      .map((f) => {
        const id = `modal-f-${f.name}`;
        const control =
          f.type === 'select'
            ? `<select id="${id}" name="${esc(f.name)}">${(f.options ?? [])
                .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`)
                .join('')}</select>`
            : `<input id="${id}" name="${esc(f.name)}" type="text" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder ?? '')}" autocomplete="off" />`;
        return `<div class="field field-grow">
          <label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>
          ${control}
          ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}
        </div>`;
      })
      .join('');

    const form = open({
      title,
      body,
      okLabel,
      onSubmit: (v) => {
        if (!v) return resolve(null);
        const out = {};
        for (const f of fields) out[f.name] = String(form.elements[f.name]?.value ?? '').trim();
        resolve(out);
      },
    });

    // Chặn nộp khi thiếu field bắt buộc — làm ở đây chứ không dùng `required` của HTML, vì
    // bong bóng lỗi native lại là một pop-up của trình duyệt nữa.
    form.addEventListener(
      'submit',
      (e) => {
        const missing = fields.filter((f) => f.required && !String(form.elements[f.name]?.value ?? '').trim());
        if (!missing.length) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const el = form.elements[missing[0].name];
        el.classList.add('is-invalid');
        el.focus();
        el.addEventListener('input', () => el.classList.remove('is-invalid'), { once: true });
      },
      true,
    );
  });
}
