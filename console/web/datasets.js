/**
 * Màn Test data: mỗi bộ test data là một bảng Tên biến | Giá trị — một bộ = một môi trường/bộ giá trị
 * (Local, Dev…); muốn nhiều bộ thì tạo nhiều test data. Test suite chọn bộ khi gắn test case, giá trị đè Global variables
 * cùng tên. Biến tên như secret (SECRET, TOKEN, PASSWORD…) thì giá trị không gửi về trình duyệt, ô để trống khi lưu = giữ cũ.
 *
 * File `.data` vẫn giữ dạng `columns` + `rows` (runner đọc sẵn) nhưng luôn đúng một dòng.
 */
import { fileIcon } from './icons.js';

let H = null;

export function initDatasets(helpers) {
  H = helpers;
}

const pq = () => `project=${encodeURIComponent(H.state.project ?? '')}`;
const S = () => (H.state.datasets ??= { id: null, draft: null, saved: null, pending: [] });
const snapshot = (d) => JSON.stringify({ name: d.name, columns: d.columns, rows: d.rows });
const pendingFilled = () => (S().pending ?? []).some((p) => p.name.trim() || p.value !== '');
const isDirty = () => Boolean(S().draft) && (snapshot(S().draft) !== S().saved || pendingFilled());
const isSecretName = (name) => /(SECRET|PASSWORD|PASS|TOKEN|APIKEY|API_KEY|PRIVATE)/i.test(name);
const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TRASH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.9c0-.8.6-1.4 1.3-1.4h2.4c.7 0 1.3.6 1.3 1.4v1.6"/><path d="m6.6 6.5.9 13.4c.05.8.7 1.4 1.5 1.4h6c.8 0 1.45-.6 1.5-1.4l.9-13.4"/><path d="M10.4 10.5v7M13.6 10.5v7"/></svg>';

/** Dòng giá trị duy nhất của bộ — tạo nếu bộ chưa có. */
const valuesRow = (d) => {
  if (!d.rows.length) d.rows.push({ id: 'r_values', values: {} });
  return d.rows[0];
};

async function load(id) {
  const s = S();
  const d = await H.api(`/api/datasets/item?${pq()}&id=${encodeURIComponent(id)}`);
  valuesRow(d);
  Object.assign(s, { id, draft: d, saved: snapshot(d), pending: [] });
}

export async function renderDatasets() {
  const { esc } = H;
  const s = S();
  const { datasets } = await H.api(`/api/datasets?${pq()}`);
  if (s.id && !datasets.some((d) => d.id === s.id)) Object.assign(s, { id: null, draft: null, saved: null, pending: [] });
  if (!s.draft && datasets[0]) await load(datasets[0].id);

  const list = datasets
    .map(
      (d) => `
      <button type="button" class="ds-item ${d.id === s.id ? 'is-active' : ''}" data-ds-pick="${esc(d.id)}">
        ${fileIcon('data')}
        <span class="ds-item-text"><span class="ds-item-name">${esc(d.name)}</span>
        <span class="ds-item-meta">${d.columns} ${d.columns === 1 ? 'variable' : 'variables'}</span></span>
      </button>`,
    )
    .join('');

  return `
    <div class="page-head">
      <div><h1 class="title-with-icon">${fileIcon('data')}Test data</h1></div>
      <button class="btn btn-primary" id="ds-new">
        <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New test data
      </button>
    </div>
    <div class="ds-layout">
      <nav class="card ds-list" aria-label="Test data">${list || '<div class="empty"><strong>No test data yet</strong></div>'}</nav>
      ${s.draft ? renderEditor(s.draft) : '<div class="card"><div class="empty"><strong>Create test data</strong> A list of variables and values (e.g. one for Local, one for Dev). A test suite picks one to override global variables.</div></div>'}
    </div>`;
}

function renderEditor(d) {
  const { esc } = H;
  const secret = new Set(d.secretColumns ?? []);
  const row = valuesRow(d);
  const q = S().q ?? '';
  const body = d.columns
    .map((c, ci) => {
      const isSecret = secret.has(c);
      return `
      <tr data-ds-var="${esc(c)}" ${q && !matches(c, d, q) ? 'hidden' : ''}>
        <td class="ds-rownum">${ci + 1}</td>
        <td class="ds-var"><span class="ds-col-name mono">${esc(c)}</span>${isSecret ? '<span class="chip chip-mute">secret</span>' : ''}</td>
        <td class="ds-cell"><input data-ds-col="${esc(c)}" type="${isSecret ? 'password' : 'text'}"
              value="${esc(row.values?.[c] ?? '')}" placeholder="${isSecret && row.filled?.[c] ? '•••••• (keep)' : ''}" aria-label="Value of ${esc(c)}" autocomplete="off" /></td>
        <td class="ds-actions"><button type="button" class="btn btn-sm btn-icon btn-danger" data-ds-col-del="${ci}" title="Remove variable ${esc(c)}" aria-label="Remove variable">${TRASH}</button></td>
      </tr>`;
    })
    .join('');
  // Dòng biến mới: gõ tên + giá trị ngay trong bảng, lưu cùng lúc với nút Save.
  const pending = (S().pending ?? [])
    .map(
      (p, pi) => `
      <tr class="ds-new-var">
        <td class="ds-rownum">+</td>
        <td class="ds-var"><input data-ds-new-name="${pi}" value="${esc(p.name)}" placeholder="VARIABLE_NAME" aria-label="New variable name" autocomplete="off" spellcheck="false" /></td>
        <td class="ds-cell"><input data-ds-new-value="${pi}" type="${isSecretName(p.name) ? 'password' : 'text'}" value="${esc(p.value)}" placeholder="value" aria-label="New variable value" autocomplete="off" /></td>
        <td class="ds-actions"><button type="button" class="btn btn-sm btn-icon btn-danger" data-ds-new-del="${pi}" title="Remove this new variable" aria-label="Remove new variable">${TRASH}</button></td>
      </tr>`,
    )
    .join('');
  const empty =
    !d.columns.length && !pending ? '<tr><td colspan="4" class="empty"><strong>No variables yet</strong> Click “+ Variable” and type a name and its value.</td></tr>' : '';
  return `
    <div class="card ds-editor">
      <div class="card-head">
        <div class="ds-title">
          <input id="ds-name" type="text" value="${esc(d.name)}" aria-label="Test data name" autocomplete="off" />
          <span class="muted mono">${esc(d.id)}.data · ${d.columns.length} ${d.columns.length === 1 ? 'variable' : 'variables'}</span>
        </div>
        <div class="toolbar">
          <button type="button" class="btn" id="ds-add-col" title="Add a row: type the variable name and its value">+ Variable</button>
          <span class="toolbar-sep" aria-hidden="true"></span>
          <button type="button" class="btn btn-danger" id="ds-delete">Delete</button>
          <button type="button" class="btn btn-primary" id="ds-save">Save</button>
        </div>
      </div>
      <div class="filters kw-filters ds-filters">
        <div class="field"><label for="ds-q">Search variables</label>
          <input id="ds-q" type="search" value="${esc(q)}" placeholder="name or value" autocomplete="off" /></div>
        <span class="muted ds-count" id="ds-count">${countText(d, q)}</span>
      </div>
      <div class="table-wrap ds-grid-wrap">
        <table class="ds-grid">
          <thead><tr><th class="ds-rownum">#</th><th class="ds-var">Variable</th><th class="ds-value">Value</th><th class="ds-actions"></th></tr></thead>
          <tbody>${body}${pending}${empty}</tbody>
        </table>
      </div>
    </div>`;
}

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
// Secret không có giá trị ở trình duyệt nên chỉ tìm theo tên.
const matches = (col, d, q) =>
  fold(col).includes(fold(q)) || (!(d.secretColumns ?? []).includes(col) && fold(d.rows[0]?.values?.[col]).includes(fold(q)));
const countText = (d, q) => (q ? `${d.columns.filter((c) => matches(c, d, q)).length} of ${d.columns.length} variables` : '');

export function bindDatasets() {
  const s = S();
  const d = s.draft;

  const confirmLeave = async () =>
    !isDirty() || H.askConfirm({ title: 'Discard changes', message: 'This test data has unsaved changes. Discard them?', okLabel: 'Discard', danger: true });

  H.$$('[data-ds-pick]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.dsPick === s.id || !(await confirmLeave())) return;
      await load(b.dataset.dsPick);
      H.render();
    }),
  );

  H.$('#ds-new')?.addEventListener('click', async () => {
    if (!(await confirmLeave())) return;
    const form = await H.askForm({ title: 'New test data', okLabel: 'Create', fields: [{ name: 'name', label: 'Name', placeholder: 'Dev', required: true }] });
    if (!form) return;
    try {
      const created = await H.api(`/api/datasets/item?${pq()}`, { method: 'PUT', body: { project: H.state.project, dataset: { name: form.name, columns: [], rows: [] } } });
      valuesRow(created);
      Object.assign(s, { id: created.id, draft: created, saved: snapshot(created), pending: [] });
      H.toast(`Test data ${created.name} created`, 'ok');
      H.render();
    } catch (err) {
      H.toast(err.message, 'error');
    }
  });

  if (!d) return;
  const row = valuesRow(d);

  H.$('#ds-name')?.addEventListener('input', (e) => {
    d.name = e.target.value;
  });
  // Lọc bằng ẩn/hiện dòng tại chỗ: vẽ lại cả bảng sẽ làm mất con trỏ trong ô tìm.
  H.$('#ds-q')?.addEventListener('input', (e) => {
    s.q = e.target.value.trim();
    H.$$('tr[data-ds-var]').forEach((tr) => (tr.hidden = Boolean(s.q) && !matches(tr.dataset.dsVar, d, s.q)));
    H.$('#ds-count').textContent = countText(d, s.q);
  });
  H.$$('input[data-ds-col]').forEach((input) =>
    input.addEventListener('input', () => {
      row.values = { ...row.values, [input.dataset.dsCol]: input.value };
    }),
  );

  const addPending = async () => {
    s.pending.push({ name: '', value: '' });
    await H.render();
    H.$(`[data-ds-new-name="${s.pending.length - 1}"]`)?.focus();
  };
  H.$('#ds-add-col')?.addEventListener('click', addPending);
  H.$$('[data-ds-new-name]').forEach((input) =>
    input.addEventListener('input', () => {
      const pi = Number(input.dataset.dsNewName);
      s.pending[pi].name = input.value;
      const value = H.$(`[data-ds-new-value="${pi}"]`);
      if (value) value.type = isSecretName(input.value) ? 'password' : 'text';
    }),
  );
  H.$$('[data-ds-new-value]').forEach((input) =>
    input.addEventListener('input', () => {
      s.pending[Number(input.dataset.dsNewValue)].value = input.value;
    }),
  );
  // Enter ở dòng mới cuối cùng = thêm tiếp một dòng, nhập liền nhiều biến không cần chuột.
  H.$$('[data-ds-new-name], [data-ds-new-value]').forEach((input) =>
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const pi = Number(input.dataset.dsNewName ?? input.dataset.dsNewValue);
      if (pi === s.pending.length - 1) addPending();
    }),
  );
  H.$$('[data-ds-new-del]').forEach((b) =>
    b.addEventListener('click', () => {
      s.pending.splice(Number(b.dataset.dsNewDel), 1);
      H.render();
    }),
  );
  H.$$('[data-ds-col-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const col = d.columns[Number(b.dataset.dsColDel)];
      if (!(await H.askConfirm({ title: 'Remove variable', message: `Remove variable ${col}?`, okLabel: 'Remove', danger: true }))) return;
      d.columns = d.columns.filter((c) => c !== col);
      delete row.values[col];
      H.render();
    }),
  );

  H.$('#ds-save')?.addEventListener('click', async () => {
    const added = s.pending.filter((p) => p.name.trim() || p.value !== '');
    const columns = [...d.columns];
    for (const p of added) {
      const name = p.name.trim();
      if (!COLUMN_RE.test(name)) return H.toast(`Variable name "${name || '(empty)'}": letters, digits and underscores, not starting with a digit`, 'error');
      if (columns.includes(name)) return H.toast(`Variable ${name} already exists`, 'error');
      columns.push(name);
    }
    const values = { ...row.values, ...Object.fromEntries(added.map((p) => [p.name.trim(), p.value])) };
    try {
      const saved = await H.api(`/api/datasets/item?${pq()}`, {
        method: 'PUT',
        body: { project: H.state.project, dataset: { name: d.name, columns, rows: [{ ...row, values }] }, previousId: s.id },
      });
      valuesRow(saved);
      Object.assign(s, { draft: saved, saved: snapshot(saved), pending: [] });
      H.toast('Test data saved', 'ok');
      H.render();
    } catch (err) {
      H.toast(err.message, 'error');
    }
  });

  H.$('#ds-delete')?.addEventListener('click', async () => {
    const ok = await H.askTypedConfirm({
      title: 'Delete test data',
      message: `Delete test data "${d.name}" with ${d.columns.length} ${d.columns.length === 1 ? 'variable' : 'variables'}?\nTest suites that use it will skip those runs.`,
      expected: d.id,
      okLabel: 'Delete test data',
    });
    if (!ok) return;
    try {
      await H.api(`/api/datasets/item?${pq()}&id=${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      Object.assign(s, { id: null, draft: null, saved: null, pending: [] });
      H.toast('Test data deleted', 'ok');
      H.render();
    } catch (err) {
      H.toast(err.message, 'error');
    }
  });
}
