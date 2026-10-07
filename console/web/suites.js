/**
 * Màn Test suites — theo akaAT Studio 2.10: một suite gom test case đã có; mỗi test case chọn run profile (khổ màn
 * hình) và có thể có nhiều round, mỗi round một bộ giá trị ghi đè biến cục bộ. Concurrent instance = số test chạy
 * cùng lúc. Wizard "Add test case" ba bước: chọn test case → chọn run profile → gắn dữ liệu cho biến.
 *
 * Trình soạn: bảng mỗi test case một dòng (con mắt = có chạy hay bỏ qua, cột "Runs with" liệt kê test data +
 * round), pane phải là cài đặt của test case đang chọn — khổ màn hình, test data, binding, round.
 */
import { fileIcon } from './icons.js';
import { bindRunTarget, browserOf, runTargetButton, toolIcon } from './keyword.js';

let H = null;

export function initSuites(helpers) {
  H = helpers;
}

const pq = () => `project=${encodeURIComponent(H.state.project ?? '')}`;
const S = () => (H.state.suites ??= { draft: null, path: null, saved: null, sel: null, catalog: null });
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const snapshot = (d) => JSON.stringify(d);
const isDirty = () => S().draft && snapshot(S().draft) !== S().saved;

// Nút chỉ-có-icon trong bảng: cùng hình ▶ tô đặc như nút Run ở danh sách test case (btn-ico là cho nút có chữ).
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/></svg>';
const PLUS = '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const TRASH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.9c0-.8.6-1.4 1.3-1.4h2.4c.7 0 1.3.6 1.3 1.4v1.6"/><path d="m6.6 6.5.9 13.4c.05.8.7 1.4 1.5 1.4h6c.8 0 1.45-.6 1.5-1.4l.9-13.4"/><path d="M10.4 10.5v7M13.6 10.5v7"/></svg>';

async function loadCatalog(force = false) {
  const s = S();
  if (!s.catalog || force) s.catalog = (await H.api(`/api/testsuites/cases?${pq()}`)).cases;
  return s.catalog;
}
const caseOf = (path) => S().catalog?.find((c) => c.path === path) ?? null;
const deviceName = (code) => (code ? (H.state.meta.devices.find((d) => d.code === code)?.name ?? code) : 'As recorded');

// ── Test data gắn cho test case (bảng ở màn Test data; mỗi dòng chọn = một round) ─────────────────

async function loadDatasets() {
  S().datasetList = (await H.api(`/api/datasets?${pq()}`)).datasets;
  S().dsCache = {};
}

async function datasetOf(id) {
  const s = S();
  s.dsCache ??= {};
  if (id && !(id in s.dsCache)) s.dsCache[id] = await H.api(`/api/datasets/item?${pq()}&id=${encodeURIComponent(id)}`).catch(() => null);
  return s.dsCache?.[id] ?? null;
}


function datasetOptions(current) {
  const { esc } = H;
  return `<option value="" ${current ? '' : 'selected'}>Don't use test data</option>${(S().datasetList ?? [])
    .map((d) => `<option value="${esc(d.id)}" ${d.id === current ? 'selected' : ''}>${esc(d.name)} (${d.columns} ${d.columns === 1 ? 'variable' : 'variables'})</option>`)
    .join('')}`;
}

/**
 * Bảng gắn biến cục bộ (akaAT: Input Name | Binding Source | Value). Default = cột trùng tên nếu test data có, không thì
 * giá trị mặc định của test case; From data column = một cột của dòng; Value = giá trị cố định.
 */
function bindingTable(vars, data, bindings, scope) {
  const { esc } = H;
  if (!vars.length) return '<p class="field-hint">This test case has no local variables to bind.</p>';
  const columns = data?.columns ?? [];
  const rows = vars
    .map((v) => {
      const b = bindings?.[v.name];
      const source = b && 'column' in b ? 'column' : b && 'value' in b ? 'value' : 'default';
      const sameName = columns.includes(v.name);
      const cell =
        source === 'column'
          ? `<select data-bind-column="${scope}:${esc(v.name)}">${columns.map((c) => `<option value="${esc(c)}" ${c === b.column ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`
          : source === 'value'
            ? `<input type="text" data-bind-value="${scope}:${esc(v.name)}" value="${esc(b.value)}" autocomplete="off" />`
            : `<span class="cell-dim">${sameName ? `column ${esc(v.name)}` : esc(v.value) || '—'}</span>`;
      return `<tr>
        <td class="mono">${esc(v.name)}</td>
        <td><select data-bind-source="${scope}:${esc(v.name)}">
          <option value="default" ${source === 'default' ? 'selected' : ''}>Default</option>
          ${columns.length ? `<option value="column" ${source === 'column' ? 'selected' : ''}>From data column</option>` : ''}
          <option value="value" ${source === 'value' ? 'selected' : ''}>Value</option>
        </select></td>
        <td>${cell}</td>
      </tr>`;
    })
    .join('');
  return `<table class="kw-vars-table wiz-bind-table">
      <thead><tr><th>Input name</th><th style="width:150px">Binding source</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Gắn sự kiện cho bảng binding của một phạm vi; `get()` trả object bindings đang sửa, `repaint()` vẽ lại khi đổi nguồn. */
function wireBindings(scope, get, data, repaint) {
  const key = (el, attr) => el.getAttribute(attr).slice(scope.length + 1);
  H.$$(`[data-bind-source^="${scope}:"]`).forEach((sel) =>
    sel.addEventListener('change', () => {
      const name = key(sel, 'data-bind-source');
      const bindings = get();
      if (sel.value === 'column') bindings[name] = { column: data?.columns.includes(name) ? name : (data?.columns[0] ?? '') };
      else if (sel.value === 'value') bindings[name] = { value: '' };
      else delete bindings[name];
      repaint();
    }),
  );
  H.$$(`[data-bind-column^="${scope}:"]`).forEach((sel) =>
    sel.addEventListener('change', () => {
      get()[key(sel, 'data-bind-column')] = { column: sel.value };
    }),
  );
  H.$$(`[data-bind-value^="${scope}:"]`).forEach((input) =>
    input.addEventListener('input', () => {
      get()[key(input, 'data-bind-value')] = { value: input.value };
    }),
  );
}

// ── Trang ───────────────────────────────────────────────────────────────────

export async function renderSuites() {
  await loadCatalog(!S().draft);
  await loadDatasets();
  const s = S();
  if (s.draft) for (const e of s.draft.testCases ?? []) if (e.testData?.dataset) await datasetOf(e.testData.dataset);
  return s.draft ? renderEditor() : renderList();
}

async function renderList() {
  const { esc } = H;
  const { suites } = await H.api(`/api/testsuites?${pq()}`);
  const rows = suites
    .map(
      (s) => `
      <tr data-suite="${esc(s.path)}">
        <td>
          ${fileIcon('suite')}<button type="button" class="link-name" data-suite-open="${esc(s.path)}">${esc(s.name)}</button>
          ${s.problems.length ? `<span class="chip chip-fail" title="${esc(s.problems.join('\n'))}">${s.problems.length} ${s.problems.length === 1 ? 'issue' : 'issues'}</span>` : ''}
          <div class="combo-sub mono">${esc(s.path)}</div>
        </td>
        <td class="cell-dim">${s.testCases} ${s.testCases === 1 ? 'test case' : 'test cases'} · ${s.tests} ${s.tests === 1 ? 'run' : 'runs'}</td>
        <td class="cell-dim">${s.concurrency}</td>
        <td class="cell-dim">${s.updatedAt ? esc(H.fmtAgo(s.updatedAt)) : '—'}</td>
        <td>
          <div class="row-actions kw-list-actions">
            <button class="btn btn-sm btn-icon kw-play" data-suite-run="${esc(s.path)}" ${s.tests && !s.broken ? '' : 'disabled'} title="Run this test suite" aria-label="Run test suite">${PLAY_ICON}</button>
            <button class="btn btn-sm btn-icon btn-danger" data-suite-del="${esc(s.path)}" data-suite-name="${esc(s.name)}" title="Delete test suite" aria-label="Delete test suite">${TRASH}</button>
          </div>
        </td>
      </tr>`,
    )
    .join('');
  return `
    <div class="page-head">
      <div><h1 class="title-with-icon">${fileIcon('suite')}Test suites</h1></div>
      <button class="btn btn-primary" id="suite-new">${PLUS}New test suite</button>
    </div>
    <div class="card">
      <div class="card-head">
        <div><h2>Test suites</h2><span class="muted">${suites.length} ${suites.length === 1 ? 'suite' : 'suites'}</span></div>
        <div class="toolbar">${headedField()}</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th style="width:220px">Contents</th><th style="width:110px">Concurrent</th><th style="width:130px">Updated</th><th style="width:100px"></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="empty"><strong>No test suites yet</strong> Create one to run several test cases together.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

const headedField = () => `<div class="kw-actions suite-run-target">${runTargetButton()}</div>`;

function renderEditor() {
  const { esc } = H;
  const s = S();
  const d = s.draft;
  const entries = d.testCases ?? [];
  const selEntry = entries.find((e) => e.id === s.sel?.entry) ?? null;
  const runCount = (e) => (e.enabled === false ? 0 : runsOf(e).filter((r) => r.on).length);
  const totalRuns = entries.reduce((n, e) => n + runCount(e), 0);

  const rows = entries
    .map((e, i) => {
      const tc = caseOf(e.path);
      const on = e.enabled !== false;
      const chips = runsOf(e)
        .map((r) => `<span class="suite-run-chip ${r.on ? '' : 'is-off'} ${r.kind === 'data' ? 'is-data' : ''}" ${r.kind === 'round' ? `data-chip-round="${esc(r.id)}"` : ''}>${r.kind === 'data' ? fileIcon('data') : ''}<span class="suite-run-chip-name">${esc(r.label)}</span></span>`)
        .join('');
      return `
        <tr class="suite-row ${s.sel?.entry === e.id ? 'is-selected' : ''} ${on ? '' : 'is-skipped'}" data-sel-entry="${esc(e.id)}">
          <td class="suite-col-run">
            <button type="button" class="btn btn-sm btn-icon kw-eye ${on ? '' : 'is-off'}" data-entry-toggle="${esc(e.id)}"
                    title="${on ? 'Included in this run — click to skip' : 'Skipped — click to include in the run'}" aria-pressed="${on}" aria-label="${on ? 'Skip this test case' : 'Include this test case'}">${toolIcon(on ? 'eye' : 'eyeOff')}</button>
          </td>
          <td class="suite-col-num">${i + 1}</td>
          <td class="suite-col-case">
            <div class="suite-case">
              ${fileIcon('case')}<span class="suite-case-name" title="${esc(tc?.name ?? e.path)}">${esc(tc?.name ?? e.path)}</span>
              ${!tc ? '<span class="chip chip-fail">missing</span>' : tc.runnable ? '' : '<span class="chip chip-manual">manual steps</span>'}
            </div>
            <div class="combo-sub mono suite-case-path">${esc(e.path)}</div>
          </td>
          <td class="suite-col-runs">${on ? `<div class="suite-run-chips">${chips}</div>` : '<span class="chip chip-mute">skipped</span>'}</td>
          <td class="cell-dim suite-col-screen">${esc(deviceName(e.profile))}</td>
          <td class="suite-col-actions"><button class="btn btn-sm btn-icon btn-danger" data-entry-del="${esc(e.id)}" title="Remove from suite" aria-label="Remove from suite">${TRASH}</button></td>
        </tr>`;
    })
    .join('');

  const problems = entries
    .filter((e) => e.enabled !== false)
    .map((e) => (!caseOf(e.path) ? `"${e.path}" no longer exists` : caseOf(e.path).runnable ? null : `"${caseOf(e.path).name}" still has manual steps — it will be skipped`))
    .filter(Boolean);

  return `
    <div class="page-head page-head-crumbs">
      <nav class="crumbs" aria-label="Breadcrumb">
        <button class="crumb" data-suite-back>Test suites</button><span class="crumb-sep" aria-hidden="true">›</span>
        <span class="crumb is-current">${esc(d.name || 'New test suite')}</span>
      </nav>
    </div>
    <div class="card kw-editor">
      <div class="card-head kw-editor-head">
        <div class="kw-editor-title"><h2>${s.path ? 'Edit test suite' : 'New test suite'}</h2></div>
        <div class="kw-actions" role="toolbar" aria-label="Test suite actions">
          <button class="kw-act" id="suite-save" title="Save" aria-label="Save">${toolIcon('save')}</button>
          <button class="kw-act kw-act-run" id="suite-save-run" title="Save, then run this test suite" aria-label="Save and run">${toolIcon('run')}</button>
          ${runTargetButton()}
          <label class="kw-act kw-act-field" title="Concurrent instance — how many tests run at the same time (ignored when Show browser is on)">
            ${toolIcon('parallel')}<input id="suite-concurrency" type="number" min="1" max="8" value="${esc(d.concurrency ?? 1)}" aria-label="Concurrent instance" />
          </label>
          <span class="kw-actions-sep" aria-hidden="true"></span>
          <button class="kw-act" data-suite-back title="Close" aria-label="Close">${toolIcon('close')}</button>
        </div>
      </div>
      <div class="card-body">
        <div class="field"><label for="suite-name">Test suite name</label>
          <input id="suite-name" type="text" value="${esc(d.name ?? '')}" autocomplete="off" /></div>
        ${problems.length ? `<div class="note note-fail"><strong>${problems.length} ${problems.length === 1 ? 'issue' : 'issues'}:</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
        <div class="suite-body">
          <section class="suite-cases">
            <div class="suite-cases-head">
              <div><h3>Test cases</h3><span class="muted">${entries.length} ${entries.length === 1 ? 'test case' : 'test cases'} · ${totalRuns} ${totalRuns === 1 ? 'run' : 'runs'}</span></div>
              <button type="button" class="btn btn-sm" id="suite-add">${PLUS}Add test case</button>
            </div>
            <div class="table-wrap">
              <table class="suite-table">
                <thead><tr>
                  <th class="suite-col-run">Run</th>
                  <th class="suite-col-num">#</th>
                  <th>Test case</th>
                  <th>Runs with</th>
                  <th class="suite-col-screen">Screen size</th>
                  <th class="suite-col-actions"></th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="6" class="empty"><strong>No test cases yet</strong> Click “Add test case”.</td></tr>'}</tbody>
              </table>
            </div>
          </section>
          ${renderProperties(selEntry)}
        </div>
      </div>
    </div>`;
}

/** Các lần chạy của một test case trong suite: test data (nếu gắn) + từng round; không có gì = một lần với giá trị mặc định. */
function runsOf(e) {
  const runs = [];
  if (e.testData?.dataset) {
    const data = S().dsCache?.[e.testData.dataset];
    runs.push({ kind: 'data', label: data ? data.name : `${e.testData.dataset} (missing)`, on: Boolean(data) });
  }
  for (const r of e.rounds ?? []) runs.push({ kind: 'round', id: r.id, label: r.name || 'Round', on: r.enabled !== false });
  if (!runs.length) runs.push({ kind: 'default', label: 'Default values', on: true });
  return runs;
}

function renderProperties(entry) {
  const { esc } = H;
  if (!entry) {
    return `<aside class="suite-props"><div class="suite-props-empty">${fileIcon('case')}<strong>No test case selected</strong><span>Click a test case in the table to set its screen size, test data and rounds.</span></div></aside>`;
  }
  const tc = caseOf(entry.path);
  const vars = tc?.variables ?? [];
  const rounds = entry.rounds ?? [];
  const roundCards = rounds
    .map(
      (r) => `
      <div class="suite-round-card ${r.enabled === false ? 'is-off' : ''}">
        <div class="suite-round-head">
          <button type="button" class="btn btn-sm btn-icon kw-eye ${r.enabled === false ? 'is-off' : ''}" data-round-toggle="${esc(r.id)}"
                  title="${r.enabled === false ? 'Skipped — click to include' : 'Included — click to skip'}" aria-label="${r.enabled === false ? 'Include this round' : 'Skip this round'}">${toolIcon(r.enabled === false ? 'eyeOff' : 'eye')}</button>
          <input type="text" data-round-name="${esc(r.id)}" value="${esc(r.name)}" aria-label="Round name" autocomplete="off" />
          <button type="button" class="btn btn-sm btn-icon btn-danger" data-round-del="${esc(r.id)}" title="Remove round" aria-label="Remove round">${TRASH}</button>
        </div>
        ${
          vars.length
            ? `<table class="kw-vars-table"><tbody>${vars
                .map(
                  (v) => `<tr><td class="mono">${esc(v.name)}</td>
                  <td><input type="text" data-round-value="${esc(r.id)}" data-var="${esc(v.name)}" value="${esc(r.values?.[v.name] ?? '')}" placeholder="${esc(v.value || '(default)')}" autocomplete="off" /></td></tr>`,
                )
                .join('')}</tbody></table>`
            : ''
        }
      </div>`,
    )
    .join('');
  return `
    <aside class="suite-props">
      <div class="suite-props-title">
        <span class="suite-props-kicker">Settings for</span>
        <strong title="${esc(entry.path)}">${fileIcon('case')}${esc(tc?.name ?? entry.path)}</strong>
      </div>
      <div class="field"><label for="suite-profile">Screen size</label>
        <select id="suite-profile">${profileOptions(entry.profile)}</select></div>

      <h4 class="suite-props-sub">Test data</h4>
      <div class="field"><select id="suite-dataset" aria-label="Test data">${datasetOptions(entry.testData?.dataset)}</select></div>
      ${entry.testData?.dataset && vars.length ? `<h4 class="suite-props-sub">Variable binding</h4>${bindingTable(vars, S().dsCache?.[entry.testData.dataset], entry.testData.bindings ?? {}, 'entry')}` : ''}

      <div class="suite-props-sub suite-rounds-head">
        <h4>Rounds</h4>
        <button type="button" class="btn btn-sm" id="suite-round-add">${PLUS}Add round</button>
      </div>
      ${roundCards}
    </aside>`;
}

function profileOptions(current) {
  const { esc } = H;
  const groups = {};
  for (const d of H.state.meta.devices) (groups[d.group] ??= []).push(d);
  return `<option value="" ${current ? '' : 'selected'}>As recorded (test case screen size)</option>${Object.entries(groups)
    .map(
      ([g, list]) =>
        `<optgroup label="${esc(g)}">${list.map((d) => `<option value="${esc(d.code)}" ${d.code === current ? 'selected' : ''}>${esc(d.name)} — ${d.width}×${d.height}</option>`).join('')}</optgroup>`,
    )
    .join('')}`;
}

// ── Sự kiện ─────────────────────────────────────────────────────────────────

export function bindSuites() {
  const s = S();
  bindRunTarget();
  if (!s.draft) return bindList();
  bindEditor();
}

function bindList() {
  H.$('#suite-new')?.addEventListener('click', async () => {
    const form = await H.askForm({ title: 'New test suite', okLabel: 'Create', fields: [{ name: 'name', label: 'Test suite name', value: 'New test suite', required: true }] });
    if (!form) return;
    openDraft({ name: form.name, concurrency: 1, testCases: [] }, null);
  });
  H.$$('[data-suite-open]').forEach((b) => b.addEventListener('click', () => openSuite(b.dataset.suiteOpen)));
  H.$$('[data-suite-run]').forEach((b) => b.addEventListener('click', () => runSuite(b.dataset.suiteRun)));
  H.$$('[data-suite-del]').forEach((b) => b.addEventListener('click', () => removeSuite(b.dataset.suiteDel, b.dataset.suiteName)));
  H.$$('tr[data-suite]').forEach((tr) =>
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const path = tr.dataset.suite;
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Open', onSelect: () => openSuite(path) },
          { label: 'Run', onSelect: () => runSuite(path) },
          { label: 'Delete', danger: true, onSelect: () => removeSuite(path, tr.querySelector('[data-suite-del]')?.dataset.suiteName ?? path) },
        ],
      });
    }),
  );
}

function openDraft(suite, path) {
  const s = S();
  s.draft = JSON.parse(JSON.stringify(suite));
  s.draft.testCases ??= [];
  s.path = path;
  s.saved = path ? snapshot(s.draft) : null;
  s.sel = s.draft.testCases[0] ? { entry: s.draft.testCases[0].id } : null;
  H.render();
}

async function openSuite(path) {
  try {
    const suite = await H.api(`/api/testsuites/item?${pq()}&path=${encodeURIComponent(path)}`);
    delete suite.problems;
    delete suite.path;
    openDraft(suite, path);
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function closeEditor() {
  if (isDirty() && !(await H.askConfirm({ title: 'Discard changes', message: 'This test suite has unsaved changes. Close without saving?', okLabel: 'Discard', danger: true }))) return;
  Object.assign(S(), { draft: null, path: null, saved: null, sel: null });
  H.render();
}

async function save() {
  const s = S();
  try {
    const saved = await H.api(`/api/testsuites/item?${pq()}`, { method: 'PUT', body: { project: H.state.project, suite: s.draft, previousPath: s.path } });
    s.path = saved.path;
    delete saved.problems;
    delete saved.path;
    s.draft = saved;
    s.saved = snapshot(saved);
    H.toast('Test suite saved', 'ok');
    return true;
  } catch (err) {
    H.toast(err.message, 'error');
    return false;
  }
}

async function runSuite(path) {
  try {
    const suite = await H.api(`/api/testsuites/item?${pq()}&path=${encodeURIComponent(path)}`);
    const run = await H.api('/api/runs', {
      method: 'POST',
      body: {
        partner: H.state.project,
        app: 'keyword',
        env: H.state.keyword.env,
        headed: H.state.keyword.headed,
        browser: browserOf(),
        suite: path,
        concurrency: suite.concurrency ?? 1,
      },
    });
    H.openLog(run.id, `${run.partnerName} · Test suite ${suite.name} · ${run.env}`);
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function removeSuite(path, name) {
  if (!(await H.askConfirm({ title: 'Delete test suite', message: `Delete test suite "${name}"?\nThe test cases themselves are kept.`, okLabel: 'Delete', danger: true }))) return;
  try {
    await H.api(`/api/testsuites/item?${pq()}&path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    H.toast('Test suite deleted', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

function bindEditor() {
  const s = S();
  const d = s.draft;
  const entry = (id) => d.testCases.find((e) => e.id === id);

  H.$$('[data-suite-back]').forEach((b) => b.addEventListener('click', closeEditor));
  H.$('#suite-name')?.addEventListener('input', (e) => {
    d.name = e.target.value;
  });
  H.$('#suite-concurrency')?.addEventListener('input', (e) => {
    d.concurrency = Math.min(8, Math.max(1, Number(e.target.value) || 1));
  });
  H.$('#suite-save')?.addEventListener('click', async () => {
    if (await save()) H.render();
  });
  H.$('#suite-save-run')?.addEventListener('click', async () => {
    if (!(await save())) return;
    H.render();
    runSuite(s.path);
  });
  H.$('#suite-add')?.addEventListener('click', () => openAddWizard());

  H.$$('[data-sel-entry]').forEach((tr) =>
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input, button, select')) return;
      s.sel = { entry: tr.dataset.selEntry };
      H.render();
    }),
  );
  H.$$('[data-entry-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const e = entry(b.dataset.entryToggle);
      e.enabled = e.enabled === false ? undefined : false;
      H.render();
    }),
  );
  H.$$('[data-entry-del]').forEach((b) =>
    b.addEventListener('click', () => {
      d.testCases = d.testCases.filter((x) => x.id !== b.dataset.entryDel);
      if (s.sel?.entry === b.dataset.entryDel) s.sel = null;
      H.render();
    }),
  );

  const selEntry = s.sel ? entry(s.sel.entry) : null;
  if (!selEntry) return;
  const round = (id) => selEntry.rounds?.find((r) => r.id === id);

  H.$('#suite-profile')?.addEventListener('change', (e) => {
    if (e.target.value) selEntry.profile = e.target.value;
    else delete selEntry.profile;
    H.render();
  });
  H.$('#suite-dataset')?.addEventListener('change', async (e) => {
    if (!e.target.value) delete selEntry.testData;
    else {
      const data = await datasetOf(e.target.value);
      selEntry.testData = { dataset: e.target.value, rows: (data?.rows ?? []).map((r) => r.id), bindings: {} };
    }
    H.render();
  });
  if (selEntry.testData?.dataset) {
    wireBindings('entry', () => (selEntry.testData.bindings ??= {}), S().dsCache?.[selEntry.testData.dataset], () => H.render());
  }
  H.$('#suite-round-add')?.addEventListener('click', async () => {
    selEntry.rounds ??= [];
    const r = { id: uid('r'), name: `Round ${selEntry.rounds.length + 1}`, values: {} };
    selEntry.rounds.push(r);
    await H.render();
    H.$(`[data-round-name="${CSS.escape(r.id)}"]`)?.select();
  });
  H.$$('[data-round-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = round(b.dataset.roundToggle);
      r.enabled = r.enabled === false ? undefined : false;
      H.render();
    }),
  );
  H.$$('[data-round-del]').forEach((b) =>
    b.addEventListener('click', () => {
      selEntry.rounds = selEntry.rounds.filter((r) => r.id !== b.dataset.roundDel);
      if (!selEntry.rounds.length) delete selEntry.rounds;
      H.render();
    }),
  );
  // Gõ tên/giá trị round không vẽ lại trang (mất con trỏ) — chỉ sửa thẻ tên round trong bảng tại chỗ.
  H.$$('[data-round-name]').forEach((input) =>
    input.addEventListener('input', () => {
      round(input.dataset.roundName).name = input.value;
      const chip = H.$(`[data-chip-round="${CSS.escape(input.dataset.roundName)}"] .suite-run-chip-name`);
      if (chip) chip.textContent = input.value || 'Round';
    }),
  );
  H.$$('[data-round-value]').forEach((input) =>
    input.addEventListener('input', () => {
      const r = round(input.dataset.roundValue);
      if (input.value === '') delete r.values[input.dataset.var];
      else r.values[input.dataset.var] = input.value;
    }),
  );
}

// ── Wizard "Add test case" (akaAT: Select test cases → Select Run Profile → Bind test cases data) ────────

function openAddWizard() {
  const { esc } = H;
  const catalog = S().catalog ?? [];
  const w = { step: 1, q: '', open: {}, picked: [], profile: '', active: null, bind: {} };

  const folderTree = () => {
    const root = { children: new Map(), cases: [] };
    for (const c of catalog) {
      let node = root;
      for (const part of c.folder ? c.folder.split('/') : []) {
        if (!node.children.has(part)) node.children.set(part, { children: new Map(), cases: [] });
        node = node.children.get(part);
      }
      node.cases.push(c);
    }
    return root;
  };
  const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

  const caseRow = (c, depth) => `
    <label class="wiz-case ${c.runnable ? '' : 'is-manual'}" style="padding-left:${10 + depth * 16}px" title="${esc(c.path)}">
      <input type="checkbox" data-wiz-pick="${esc(c.path)}" ${w.picked.includes(c.path) ? 'checked' : ''} />
      ${fileIcon('case')}
      <span class="wiz-case-name">${esc(c.tcIds.length ? `${c.tcIds.join(', ')} | ${c.name}` : c.name)}</span>
      ${c.runnable ? '' : '<span class="chip chip-manual">manual steps</span>'}
    </label>`;

  const treeHtml = (node, prefix, depth) =>
    [...node.children.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'vi'))
      .map(([name, child]) => {
        const path = prefix ? `${prefix}/${name}` : name;
        const isOpen = !!w.open[path];
        return `
          <div class="wiz-folder" data-wiz-folder="${esc(path)}" style="padding-left:${10 + depth * 16}px">
            ${H.treeChevron(isOpen)}${fileIcon('folder')}<strong>${esc(name)}</strong>
          </div>
          ${isOpen ? treeHtml(child, path, depth + 1) : ''}`;
      })
      .join('') + node.cases.map((c) => caseRow(c, depth)).join('');

  const stepBar = () =>
    ['Select test cases', 'Select run profile', 'Bind test cases data']
      .map((label, i) => `<div class="wiz-step ${w.step === i + 1 ? 'is-active' : ''} ${w.step > i + 1 ? 'is-done' : ''}"><span class="wiz-step-no">${w.step > i + 1 ? '✓' : i + 1}</span>${label}</div>`)
      .join('<span class="wiz-step-line" aria-hidden="true"></span>');

  const step1 = () => {
    const q = fold(w.q.trim());
    const list = q
      ? catalog.filter((c) => [c.name, c.path, ...c.tcIds].some((v) => fold(v).includes(q))).map((c) => caseRow(c, 0)).join('') || '<div class="kw-vars-empty">No test case matches</div>'
      : treeHtml(folderTree(), '', 0);
    return `
      <input type="search" id="wiz-q" value="${esc(w.q)}" placeholder="Search test cases" autocomplete="off" />
      <div class="wiz-tree">${list}</div>
      <p class="field-hint">${w.picked.length} selected. Test cases with manual steps can be added but are skipped when the suite runs.</p>`;
  };

  const step2 = () => `
    <div class="field"><label for="wiz-profile">Run profile for the ${w.picked.length} selected ${w.picked.length === 1 ? 'test case' : 'test cases'}</label>
      <select id="wiz-profile">${profileOptions(w.profile)}</select>
      <span class="field-hint">Screen size the browser uses. “As recorded” keeps each test case's own size.</span></div>`;

  const step3 = () => {
    w.active ??= w.picked[0];
    const c = catalog.find((x) => x.path === w.active);
    const b = (w.bind[w.active] ??= { dataset: '', rows: [], bindings: {} });
    const data = b.dataset ? (S().dsCache?.[b.dataset] ?? null) : null;
    // Test data chỉ còn một bộ giá trị: xem trước vài biến thay cho bảng chọn dòng.
    const rowsTable = data
      ? data.columns.length
        ? `<table class="kw-vars-table wiz-rows">
            <thead><tr><th>Variable</th><th>Value</th></tr></thead>
            <tbody>${data.columns
              .slice(0, 5)
              .map(
                (col) => `<tr><td class="mono">${esc(col)}</td>
                <td class="cell-dim mono">${(data.secretColumns ?? []).includes(col) ? '••••' : esc(data.rows[0]?.values?.[col] ?? '')}</td></tr>`,
              )
              .join('')}</tbody>
          </table>
          <p class="field-hint">${data.columns.length > 5 ? `…and ${data.columns.length - 5} more. ` : ''}These values override global variables of the same name for this test case.</p>`
        : '<p class="field-hint">This test data has no variables yet.</p>'
      : '';
    return `
      <div class="wiz-bind">
        <ul class="wiz-bind-list">${w.picked
          .map((p) => {
            const x = catalog.find((y) => y.path === p);
            return `<li><button type="button" class="${p === w.active ? 'is-active' : ''}" data-wiz-active="${esc(p)}">${fileIcon('case')}${esc(x?.name ?? p)}</button></li>`;
          })
          .join('')}</ul>
        <div class="wiz-bind-body">
          <h4>Test data</h4>
          <div class="field"><label for="wiz-data">Test data</label>
            <select id="wiz-data">${datasetOptions(b.dataset)}</select></div>
          ${rowsTable}
          <h4>Test case variable binding</h4>
          ${bindingTable(c?.variables ?? [], data, b.bindings, 'wiz')}
        </div>
      </div>`;
  };

  const html = () => `
    <div class="wiz">
      <div class="wiz-steps">${stepBar()}</div>
      <div class="wiz-content">${w.step === 1 ? step1() : w.step === 2 ? step2() : step3()}</div>
      <div class="modal-foot" style="padding:12px 0 0">
        <button type="button" class="btn" id="wiz-prev" ${w.step === 1 ? 'disabled' : ''}>Previous</button>
        <button type="button" class="btn btn-primary" id="wiz-next" ${w.step === 3 || !w.picked.length ? 'disabled' : ''}>Next</button>
        <button type="button" class="btn btn-primary" id="wiz-finish" ${w.picked.length ? '' : 'disabled'}>Finish</button>
        <button type="button" class="btn btn-ghost" id="wiz-cancel">Cancel</button>
      </div>
    </div>`;

  const paint = () => {
    const body = H.$('.modal-body');
    body.innerHTML = html();
    mount();
  };

  const finish = () => {
    const d = S().draft;
    const added = w.picked.map((path) => {
      const b = w.bind[path];
      const values = Object.fromEntries(Object.entries(b?.bindings ?? {}).filter(([, x]) => 'value' in x).map(([k, x]) => [k, x.value]));
      return {
        id: uid('e'),
        path,
        ...(w.profile ? { profile: w.profile } : {}),
        // Có test data: mỗi dòng chọn là một round. Không có: binding kiểu Value thành một round nhập tay như trước.
        ...(b?.dataset
          ? { testData: { dataset: b.dataset, rows: b.rows, bindings: b.bindings } }
          : Object.keys(values).length
            ? { rounds: [{ id: uid('r'), name: 'Round 1', values }] }
            : {}),
      };
    });
    d.testCases.push(...added);
    S().sel = { entry: added[0].id };
    H.closePanel();
    H.render();
  };

  const mount = () => {
    H.$('#wiz-cancel')?.addEventListener('click', () => H.closePanel());
    H.$('#wiz-prev')?.addEventListener('click', () => {
      w.step -= 1;
      paint();
    });
    H.$('#wiz-next')?.addEventListener('click', () => {
      w.step += 1;
      paint();
    });
    H.$('#wiz-finish')?.addEventListener('click', finish);
    const q = H.$('#wiz-q');
    q?.addEventListener('input', () => {
      w.q = q.value;
      const at = q.selectionStart;
      paint();
      const next = H.$('#wiz-q');
      next.focus();
      next.setSelectionRange(at, at);
    });
    H.$$('[data-wiz-folder]').forEach((el) =>
      el.addEventListener('click', () => {
        w.open[el.dataset.wizFolder] = !w.open[el.dataset.wizFolder];
        paint();
      }),
    );
    H.$$('[data-wiz-pick]').forEach((box) =>
      box.addEventListener('change', () => {
        const p = box.dataset.wizPick;
        w.picked = box.checked ? [...w.picked, p] : w.picked.filter((x) => x !== p);
        H.$('#wiz-next').disabled = w.step === 3 || !w.picked.length;
        H.$('#wiz-finish').disabled = !w.picked.length;
        const hint = H.$('.wiz-content .field-hint');
        if (hint) hint.textContent = `${w.picked.length} selected. Test cases with manual steps can be added but are skipped when the suite runs.`;
      }),
    );
    H.$('#wiz-profile')?.addEventListener('change', (e) => {
      w.profile = e.target.value;
    });
    H.$$('[data-wiz-active]').forEach((b) =>
      b.addEventListener('click', () => {
        w.active = b.dataset.wizActive;
        paint();
      }),
    );
    const bind = () => (w.bind[w.active] ??= { dataset: '', rows: [], bindings: {} });
    H.$('#wiz-data')?.addEventListener('change', async (e) => {
      const b = bind();
      b.dataset = e.target.value;
      b.bindings = {};
      const data = b.dataset ? await datasetOf(b.dataset) : null;
      b.rows = (data?.rows ?? []).map((r) => r.id);
      paint();
    });
    wireBindings('wiz', () => bind().bindings, bind().dataset ? S().dsCache?.[bind().dataset] : null, paint);
  };

  H.showPanel({ title: 'Add test case', html: html(), wide: true, onMount: mount });
}
