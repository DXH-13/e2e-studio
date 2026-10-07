/**
 * Màn Global variables — biến đặt một lần, mọi test case trong project dùng lại bằng `${global:tên}`.
 * Chỉ tên + giá trị, không chia theo môi trường.
 */
import { fileIcon } from './icons.js';

let H = null;

export function initGlobals(helpers) {
  H = helpers;
}

const pq = () => `project=${encodeURIComponent(H.state.project ?? '')}`;
const VIEW = () => (H.state.globalsView ??= { q: '', page: 1, size: 25 });
// Bỏ dấu để "dia chi" khớp "địa chỉ".
const fold = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export async function renderGlobals() {
  const { esc } = H;
  const { variables } = await H.api(`/api/globals?${pq()}`);
  const V = VIEW();
  const q = fold(V.q.trim());
  // Tìm theo tên và giá trị; biến bí mật chỉ tìm theo tên (giá trị không có ở trình duyệt).
  const matched = q ? variables.filter((v) => fold(v.name).includes(q) || (!v.secret && fold(v.value).includes(q))) : variables;
  const pages = Math.max(1, Math.ceil(matched.length / V.size));
  V.page = Math.min(Math.max(1, V.page), pages);
  const pageRows = matched.slice((V.page - 1) * V.size, V.page * V.size);
  const from = matched.length ? (V.page - 1) * V.size + 1 : 0;
  const to = (V.page - 1) * V.size + pageRows.length;

  const rows = pageRows
    .map(
      (v) => `
      <tr data-gv="${esc(v.name)}">
        <td>
          <strong>${esc(v.name)}</strong>
          <div class="combo-sub mono" title="Paste this into any keyword argument">\${global:${esc(v.name)}}</div>
        </td>
        <td class="mono">${v.secret ? (v.hasValue ? '<span class="muted">••••••</span> <span class="chip chip-mute">secret</span>' : '<span class="muted">—</span>') : esc(v.value) || '<span class="muted">—</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-gv-edit="${esc(v.name)}">Edit</button>
            <span class="row-actions-sep" aria-hidden="true"></span>
            <button class="btn btn-sm btn-icon btn-danger" data-gv-del="${esc(v.name)}" title="Delete variable" aria-label="Delete variable">✕</button>
          </div>
        </td>
      </tr>`,
    )
    .join('');

  return `
    <div class="page-head">
      <div><h1 class="title-with-icon">${fileIcon('globals')}Global variables</h1></div>
      <button class="btn btn-primary" id="gv-new">
        <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New variable
      </button>
    </div>
    <div class="card">
      <div class="filters kw-filters">
        <div class="field field-grow">
          <label for="gv-q">Search</label>
          <input id="gv-q" type="search" value="${esc(V.q)}" placeholder="name or value" autocomplete="off" />
        </div>
        <div class="field">
          <label for="gv-size">Per page</label>
          <select id="gv-size">${[10, 25, 50, 100].map((n) => `<option value="${n}" ${n === V.size ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
      </div>
      <div class="table-tools"><span class="muted">Showing ${from}–${to} of ${matched.length}${q ? ` (filtered from ${variables.length})` : ''}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:46%">Name</th><th>Value</th><th style="width:120px"></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="empty"><strong>${q ? 'No variable matches' : 'No global variables yet'}</strong></td></tr>`}</tbody>
        </table>
      </div>
      <div class="card-foot kw-pager">
        <span></span>
        <div class="btn-group">
          <button class="btn btn-sm" id="gv-prev" ${V.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
          <span class="kw-page">Page ${V.page} / ${pages}</span>
          <button class="btn btn-sm" id="gv-next" ${V.page >= pages ? 'disabled' : ''}>Next ›</button>
        </div>
      </div>
    </div>`;
}

export function bindGlobals() {
  const V = VIEW();
  H.$('#gv-new')?.addEventListener('click', () => openForm(null));
  const q = H.$('#gv-q');
  if (q) {
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        V.q = q.value;
        V.page = 1;
        Promise.resolve(H.render()).then(() => {
          const next = H.$('#gv-q');
          next?.focus();
          next?.setSelectionRange(next.value.length, next.value.length);
        });
      }, 200);
    });
  }
  H.$('#gv-size')?.addEventListener('change', (e) => {
    V.size = Number(e.target.value);
    V.page = 1;
    H.render();
  });
  H.$('#gv-prev')?.addEventListener('click', () => {
    V.page -= 1;
    H.render();
  });
  H.$('#gv-next')?.addEventListener('click', () => {
    V.page += 1;
    H.render();
  });
  H.$$('[data-gv-edit]').forEach((b) =>
    b.addEventListener('click', async () => {
      const { variables } = await H.api(`/api/globals?${pq()}`);
      openForm(variables.find((v) => v.name === b.dataset.gvEdit) ?? null);
    }),
  );
  H.$$('[data-gv-del]').forEach((b) => b.addEventListener('click', () => removeVariable(b.dataset.gvDel)));
  H.$$('tr[data-gv]').forEach((tr) =>
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const name = tr.dataset.gv;
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Edit', onSelect: () => H.$(`[data-gv-edit="${CSS.escape(name)}"]`)?.click() },
          { label: 'Copy ${global:…}', onSelect: () => navigator.clipboard?.writeText(`\${global:${name}}`).then(() => H.toast('Copied', 'ok')) },
          { label: 'Delete', danger: true, onSelect: () => removeVariable(name) },
        ],
      });
    }),
  );
}

function openForm(existing) {
  const { esc } = H;
  const v = existing ?? { name: '', value: '', secret: false, hasValue: false };
  const html = `
    <form id="gv-form">
      <div class="field"><label for="gv-name">Name *</label>
        <input id="gv-name" type="text" value="${esc(v.name)}" placeholder="PRODUCT_CODE" autocomplete="off" required /></div>
      <div class="field"><label for="gv-value">Value</label>
        <input id="gv-value" type="${v.secret ? 'password' : 'text'}" value="${esc(v.value)}" autocomplete="off"
               placeholder="${v.secret && v.hasValue ? '•••••• (set — leave empty to keep)' : ''}" />
        <span class="field-hint">Names containing SECRET, PASSWORD, TOKEN, API_KEY… are treated as secrets and never shown again.</span></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="gv-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? 'Save' : 'Create'}</button>
      </div>
    </form>`;
  H.showPanel({
    title: existing ? `Edit variable — ${v.name}` : 'New global variable',
    html,
    onMount: () => {
      H.$('#gv-cancel')?.addEventListener('click', () => H.closePanel());
      H.$('#gv-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await H.api(`/api/globals?${pq()}`, {
            method: 'PUT',
            body: {
              name: H.$('#gv-name').value.trim(),
              value: H.$('#gv-value').value,
              renameFrom: existing?.name ?? null,
            },
          });
          H.closePanel();
          H.toast(existing ? 'Variable saved' : 'Variable created', 'ok');
          H.render();
        } catch (err) {
          H.toast(err.message, 'error');
        }
      });
      H.$('#gv-name')?.focus();
    },
  });
}

async function removeVariable(name) {
  const ok = await H.askConfirm({
    title: 'Delete global variable',
    message: `Delete "${name}"?\nTest cases that still use \${global:${name}} will fail at run time.`,
    okLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await H.api(`/api/globals?${pq()}&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  H.toast('Variable deleted', 'ok');
  H.render();
}
