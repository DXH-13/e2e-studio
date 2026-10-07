/**
 * Giao diện console — vanilla JS, không build step.
 *
 * Mỗi tab là một hàm `render*` trả về chuỗi HTML rồi gắn sự kiện sau khi vào DOM.
 * Đủ cho một công cụ nội bộ vài màn hình, và tránh dựng toolchain cho thứ chỉ
 * chạy trên máy cá nhân.
 *
 * Phân vai giữa các tab — mỗi việc đúng MỘT chỗ:
 *   Tổng quan  chỉ đọc: chỉ số và xu hướng, không có nút chạy
 *   Test case  danh mục test case và các bước, không có nút chạy
 *   Chạy test  nơi DUY NHẤT khởi động một lần chạy
 *   Lịch chạy  chỉ cấu hình lịch
 *   Báo cáo    lịch sử và kết quả
 *   Môi trường URL và secret
 */

import { chartTable, drawTimeChart } from './charts.js';
import { fileIcon } from './icons.js';

import { bindKeyword, bindKeywords, bindObjects, bindSideTree, initKeyword, isTreeCollapsed, openCase, renderKeyword, renderKeywords, renderObjects, renderObjectsSideTree, renderSideTree, revealObject, treeChevron } from './keyword.js';
import { initSearch } from './search.js';
import { bindGlobals, initGlobals, renderGlobals } from './globals.js';
import { bindSuites, initSuites, renderSuites } from './suites.js';
import { bindDatasets, initDatasets, renderDatasets } from './datasets.js';
import { askConfirm, askForm, askTypedConfirm, closePanel, showContextMenu, showPanel } from './dialog.js';
import { currentLang, initI18n, setLang } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  view: 'overview',
  /** Project đang mở; null = màn chọn project. Mọi màn khác đọc theo đây. */
  project: null,
  /** Tab đang mở ở vùng chính (như trình duyệt): mỗi mục menu một tab, mỗi test case một tab. */
  tabs: [],
  activeTab: null,
  meta: null,
  /** Lựa chọn của tab Chạy test. */
  run: { partner: null, app: null, env: 'local', grep: '', device: null, headed: false },
  /** Màn Test cases (không cần code): project, môi trường chạy, bản nháp đang sửa. */
  keyword: {
    env: 'local',
    /** Chạy test case có mở trình duyệt (--headed) hay không — nhớ trong localStorage. */
    headed: (() => {
      try {
        return localStorage.getItem('kw-headed') === '1';
      } catch {
        return false;
      }
    })(),
    draft: null,
    objects: null,
    /** Thư mục đang chọn trên cây ('' = gốc) và trạng thái mở/đóng từng nhánh. */
    folder: '',
    open: {},
  },
  /** Bộ lọc của tab Báo cáo. */
  runs: { category: '', suite: '', status: '', range: '', from: '', to: '', q: '' },
  statsDays: 14,
};

// ── Tiện ích ────────────────────────────────────────────────────────────────

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

function toast(message, kind = 'info') {
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  $('#toasts').append(node);
  setTimeout(() => node.remove(), kind === 'error' ? 7000 : 3800);
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { hour12: false }) : '—');

function fmtAgo(iso) {
  if (!iso) return 'not run';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} h ago`;
  return `${Math.round(hour / 24)} d ago`;
}

const fmtDuration = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
};

const RUN_STATUS = {
  running: ['chip-info chip-run', 'running'],
  passed: ['chip-ok', 'passed'],
  failed: ['chip-fail', 'failed'],
  error: ['chip-fail', 'error'],
  stopped: ['chip-warn', 'stopped'],
};

function runChip(run) {
  if (!run) return '<span class="chip chip-mute">not run</span>';
  const [cls, label] = RUN_STATUS[run.status] ?? ['chip-mute', run.status];
  return `<span class="chip ${cls}">${label}</span>`;
}

/**
 * Đường dẫn báo cáo của ĐÚNG lần chạy đó.
 *
 * Mỗi lần chạy ghi vào `reports/<runKey>/<runId>` nên báo cáo không còn bị
 * lần sau đè. Lần chạy cũ hơn mốc đó không có `reportDir` — lùi về thư mục chung, ở đó
 * chỉ còn bản mới nhất của tổ hợp.
 */
const reportUrl = (run, file) =>
  `/report/${(run.reportDir ?? `reports/${run.runKey}`).replace(/^reports\//, '')}/${file}`;

function totalsText(run) {
  if (!run?.totals) return '';
  const { passed, failed, skipped, total } = run.totals;
  const bits = [`${passed}/${total} passed`];
  if (failed) bits.push(`${failed} failed`);
  if (skipped) bits.push(`${skipped} skipped`);
  return bits.join(' · ');
}

/** Nhãn ngắn của khổ màn hình, ví dụ "iPhone SE 375×667". */
const deviceLabel = (code) => {
  const d = state.meta.devices.find((x) => x.code === code);
  return d ? `${d.name} ${d.width}×${d.height}` : code;
};

const suiteOf = (partnerCode, app) =>
  state.meta.partners.find((p) => p.code === partnerCode)?.suites.find((s) => s.app === app);

/** Nhóm bộ test hiển thị trên console. Hiện chỉ có nhóm E2E (mở trình duyệt, kiểm giao diện). */
const CATEGORY = {
  e2e: { label: 'UI E2E', chip: 'chip-info', hint: 'opens a browser, checks the real UI' },
};
const CATEGORY_ORDER = ['e2e'];
const categoryOf = (partnerCode, app) => suiteOf(partnerCode, app)?.category ?? 'e2e';
const partnerSuites = (partner) => partner?.suites ?? [];
const categoryChip = (cat) => `<span class="chip ${CATEGORY[cat]?.chip ?? 'chip-mute'}">${esc(CATEGORY[cat]?.label ?? cat)}</span>`;

/** <option> các bộ test của một project, gom theo nhóm bằng <optgroup>. */
function suiteOptions(partner, selectedApp, disableNotReady = false, onlyScope = null) {
  return CATEGORY_ORDER.filter((cat) => !onlyScope || cat === onlyScope).map((cat) => {
    const suites = (partner?.suites ?? []).filter((s) => (s.category ?? 'e2e') === cat);
    if (!suites.length) return '';
    const opts = suites
      .map(
        (s) =>
          `<option value="${s.app}" ${s.app === selectedApp ? 'selected' : ''} ${disableNotReady && !s.ready ? 'disabled' : ''}>${esc(s.label)}${s.ready ? '' : ' (empty skeleton)'}</option>`,
      )
      .join('');
    return `<optgroup label="${esc(CATEGORY[cat].label)}">${opts}</optgroup>`;
  }).join('');
}

// ── Tab: Tổng quan (chỉ đọc) ────────────────────────────────────────────────

async function renderOverview() {
  const stats = await api(`/api/stats?days=${state.statsDays}&project=${state.project}`);
  const t = stats.totals;
  const passRate = t.tests ? Math.round((t.passed / t.tests) * 100) : null;

  const statusRowsOf = (cat) =>
    stats.rows
      .filter((r) => r.lastRun && (r.category ?? categoryOf(r.partner, r.app)) === cat)
      .sort((a, b) => Date.parse(b.lastRun.startedAt) - Date.parse(a.lastRun.startedAt))
      .map(
        (r) => `
        <tr>
          <td><strong>${esc(r.suiteLabel)}</strong><div class="combo-sub">${esc(r.partnerName)}</div></td>
          <td>${runChip(r.lastRun)}</td>
          <td class="cell-dim">${esc(totalsText(r.lastRun) || '—')}</td>
          <td class="cell-dim">${esc(fmtAgo(r.lastRun.startedAt))}</td>
        </tr>`,
      )
      .join('');
  const statusTable = (cat) => {
    const c = t.byCategory?.[cat];
    const rows = statusRowsOf(cat);
    return `
    <div class="card">
      <div class="card-head">
        <h2>${esc(CATEGORY[cat].label)}</h2>
        <span class="muted">${c ? `${c.ready}/${c.total} suites ready` : ''}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Suite</th><th style="width:110px">Result</th><th style="width:180px">Numbers</th><th style="width:150px">Last run</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4" class="empty"><strong>No runs yet</strong>The ${esc(CATEGORY[cat].label)} group has not run yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  };

  return `
    <div class="page-head">
      <div>
        <h1>Overview</h1>
      </div>
      <div class="field">
        <label for="stats-days">Time range</label>
        <select id="stats-days">
          ${[7, 14, 30, 90].map((d) => `<option value="${d}" ${d === state.statsDays ? 'selected' : ''}>Last ${d} days</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${t.suitesReady}<span class="stat-of">/${t.suitesTotal}</span></div>
        <div class="stat-label">suites ready · ${t.partners} projects</div>
      </div>
      <div class="stat">
        <div class="stat-value">${t.catalogCases}</div>
        <div class="stat-label">test cases (.tc files)</div>
      </div>
      <div class="stat">
        <div class="stat-value">${t.tests}</div>
        <div class="stat-label">automated tests run</div>
      </div>
      <div class="stat">
        <div class="stat-value stat-ok">${t.passed}</div>
        <div class="stat-label">passed${passRate === null ? '' : ` · ${passRate}%`}</div>
      </div>
      <div class="stat">
        <div class="stat-value ${t.failed ? 'stat-fail' : 'stat-ok'}">${t.failed}</div>
        <div class="stat-label">open failures</div>
      </div>
      <div class="stat">
        <div class="stat-value">${t.combosRun}<span class="stat-of">/${t.combosTotal}</span></div>
        <div class="stat-label">combinations ever run</div>
      </div>
    </div>

    <div class="chart-grid">
      <section class="card">
        <div class="card-head">
          <h2>Failures over time</h2>
          <span class="muted">failed tests per day</span>
        </div>
        <div class="card-body">
          <div class="chart-host" id="chart-bugs"></div>
          ${chartTable(stats.daily, [
            { key: 'failed', label: 'Failed' },
            { key: 'passed', label: 'Passed' },
            { key: 'tests', label: 'Total tests' },
          ])}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Runs over time</h2>
          <span class="muted">test runs per day</span>
        </div>
        <div class="card-body">
          <div class="chart-host" id="chart-runs"></div>
          ${chartTable(stats.daily, [{ key: 'runs', label: 'Runs' }])}
        </div>
      </section>
    </div>


    ${CATEGORY_ORDER.map(statusTable).join('')}
  `;
}

async function bindOverview() {
  const stats = await api(`/api/stats?days=${state.statsDays}&project=${state.project}`);
  // Người dùng đã sang màn khác trong lúc chờ số liệu → không còn chỗ để vẽ.
  if (!$('#chart-bugs')) return;
  drawTimeChart($('#chart-bugs'), stats.daily, { kind: 'line', valueKey: 'failed', presenceKey: 'runs', label: 'Failed', unit: 'failures' });
  drawTimeChart($('#chart-runs'), stats.daily, { kind: 'bar', valueKey: 'runs', label: 'Runs', unit: 'runs' });

  $('#stats-days')?.addEventListener('change', (event) => {
    state.statsDays = Number(event.target.value);
    render();
  });
}

// ── Khổ màn hình (dùng ở form Lịch chạy) ─────────────────────────────────────

/** Danh sách khổ màn hình, gom theo nhóm (Điện thoại / Máy tính bảng / Máy tính). */
function deviceOptions() {
  const groups = [...new Set(state.meta.devices.map((d) => d.group))];
  return groups
    .map(
      (group) => `
        <optgroup label="${esc(group)}">
          ${state.meta.devices
            .filter((d) => d.group === group)
            .map(
              (d) =>
                `<option value="${esc(d.code)}" ${d.code === state.run.device ? 'selected' : ''}>${esc(d.name)} — ${d.width}×${d.height}</option>`,
            )
            .join('')}
        </optgroup>`,
    )
    .join('');
}


async function startRun(body) {
  try {
    const run = await api('/api/runs', { method: 'POST', body: { ...body, grep: body.grep || undefined } });
    openLog(run.id, `${run.partnerName} · ${run.suiteLabel}`);
    return run;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

// ── Tab: Lịch chạy (chỉ cấu hình) ───────────────────────────────────────────

const CRON_PRESETS = [
  ['0 7 * * *', 'Every day 07:00'],
  ['0 */2 * * *', 'Every 2 hours'],
  ['*/30 * * * *', 'Every 30 minutes'],
  ['0 6 * * 1', 'Every Monday 06:00'],
  ['0 18 * * 1-5', 'Weekdays 18:00'],
];

async function renderSchedules() {
  const schedules = (await api('/api/schedules')).schedules.filter((s) => s.partner === state.project);

  const rows = schedules
    .map((s) => {
      const suite = suiteOf(s.partner, s.app);
      return `
        <tr>
          <td>
            <strong>${esc(s.name)}</strong>
            <div class="combo-sub">${esc(suite?.label ?? `${s.partner}/${s.app}`)}${s.grep ? ` · filter: <code>${esc(s.grep)}</code>` : ''}${s.device ? ` · ${esc(deviceLabel(s.device))}` : ''}</div>
          </td>
          <td>${esc(s.description)}<div class="combo-sub"><code>${esc(s.cron)}</code></div></td>
          <td>${s.enabled ? '<span class="chip chip-ok">enabled</span>' : '<span class="chip chip-mute">disabled</span>'}</td>
          <td class="cell-dim">${s.nextRunAt ? esc(fmtTime(s.nextRunAt)) : '—'}</td>
          <td class="cell-dim">${s.lastRunAt ? `${esc(fmtAgo(s.lastRunAt))}<div class="combo-sub">${esc(s.lastStatus ?? '')}</div>` : 'not run'}</td>
          <td>
            <div class="combo-actions">
              <button class="btn btn-sm" data-sch-toggle="${esc(s.id)}" data-enabled="${s.enabled}">${s.enabled ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-sm btn-danger" data-sch-del="${esc(s.id)}">Delete</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div class="page-head">
      <div>
        <h1 class="title-with-icon">${fileIcon('schedule')}Schedules</h1>
      </div>
      <button class="btn btn-primary" id="sch-new">
        <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New schedule
      </button>
    </div>

    <div class="card">
      <div class="card-head"><h2>Existing (${schedules.length})</h2></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th style="width:230px">When</th><th style="width:100px">Status</th><th style="width:170px">Next run</th><th style="width:150px">Last run</th><th style="width:150px"></th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty"><strong>No schedules yet</strong>Add one with New schedule.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** Form "New schedule": trái = chạy cái gì, phải = chạy khi nào (chọn nhanh là chính, cron tay là mục Custom). */
function scheduleFormHtml() {
  const presets = CRON_PRESETS.map(
    ([expr, label], i) => `
      <label class="sch-when-opt">
        <input type="radio" name="s-when" value="${esc(expr)}" ${i === 0 ? 'checked' : ''} />
        <span>${esc(label)}</span>
      </label>`,
  ).join('');
  return `
    <form id="sch-form" class="sch-form">
      <section class="sch-col">
        <h3 class="sch-col-title">What to run</h3>
        <div class="field">
          <label for="s-app">Suite</label>
          <select id="s-app"></select>
        </div>
        <div class="field">
          <label for="s-grep">Filter tests (optional)</label>
          <input id="s-grep" placeholder="leave empty to run the whole suite" />
        </div>
        <div class="field">
          <label for="s-device">Screen size</label>
          <select id="s-device">${deviceOptions()}</select>
        </div>
        <div class="field">
          <label for="s-name">Schedule name</label>
          <input id="s-name" placeholder="leave empty to name it after the combination" />
        </div>
      </section>
      <section class="sch-col">
        <h3 class="sch-col-title">When</h3>
        <div class="sch-when" role="radiogroup" aria-label="When to run">
          ${presets}
          <label class="sch-when-opt">
            <input type="radio" name="s-when" value="custom" />
            <span>Custom cron</span>
          </label>
        </div>
        <div class="field">
          <label for="s-cron">Cron expression (minute hour day month weekday)</label>
          <input id="s-cron" class="mono" value="${esc(CRON_PRESETS[0][0])}" />
          <div class="field-hint" id="s-cron-hint">…</div>
        </div>
      </section>
      <footer class="sch-foot">
        <button type="button" class="btn" data-sch-cancel>Cancel</button>
        <button class="btn btn-primary" type="submit">Add schedule</button>
      </footer>
    </form>`;
}

function bindScheduleForm(root) {
  const q = (sel) => root.querySelector(sel);
  const appSel = q('#s-app');
  const cronInput = q('#s-cron');
  const hint = q('#s-cron-hint');
  const partner = state.meta.partners.find((p) => p.code === state.project);
  appSel.innerHTML = suiteOptions(partner, null, true);

  const preview = async () => {
    try {
      const data = await api(`/api/cron/preview?cron=${encodeURIComponent(cronInput.value)}`);
      hint.textContent = data.valid ? `${data.description} — next run: ${fmtTime(data.nextRunAt)}` : data.description;
      hint.style.color = data.valid ? '' : 'var(--fail)';
    } catch {
      hint.textContent = '';
    }
  };
  preview();
  root.querySelectorAll('input[name="s-when"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.value === 'custom') return cronInput.focus();
      cronInput.value = r.value;
      preview();
    }),
  );
  // Gõ tay vào ô cron = tự chọn mục Custom (trừ khi gõ ra đúng một mẫu có sẵn).
  cronInput.addEventListener('input', () => {
    const match = root.querySelector(`input[name="s-when"][value="${CSS.escape(cronInput.value.trim())}"]`);
    (match ?? root.querySelector('input[name="s-when"][value="custom"]')).checked = true;
    preview();
  });
  q('[data-sch-cancel]').addEventListener('click', closePanel);

  q('#sch-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/schedules', {
        method: 'POST',
        body: {
          partner: state.project,
          app: appSel.value,
          env: 'local',
          grep: q('#s-grep').value,
          device: q('#s-device').value,
          name: q('#s-name').value,
          cron: cronInput.value,
        },
      });
      closePanel();
      toast('Schedule added', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function bindSchedules() {
  $('#sch-new')?.addEventListener('click', () =>
    showPanel({ title: 'New schedule', html: scheduleFormHtml(), wide: true, className: 'modal-sch', onMount: bindScheduleForm }),
  );

  $$('[data-sch-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/api/schedules/${btn.dataset.schToggle}`, {
        method: 'PATCH',
        body: { enabled: btn.dataset.enabled !== 'true' },
      });
      render();
    }),
  );

  $$('[data-sch-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!(await askConfirm({ title: 'Delete schedule', message: 'Delete this schedule? This cannot be undone.', okLabel: 'Delete', danger: true }))) return;
      await api(`/api/schedules/${btn.dataset.schDel}`, { method: 'DELETE' });
      toast('Schedule deleted', 'ok');
      render();
    }),
  );
}

// ── Tab: Báo cáo ────────────────────────────────────────────────────────────

/**
 * Khoảng thời gian dựng sẵn cho bộ lọc Báo cáo. Ba mốc quen dùng, cộng thêm
 * "tự chọn" cho lúc phải soi đúng một ngày nào đó (ví dụ hôm khách báo lỗi).
 */
const RUN_RANGES = {
  '24h': ['Last 24 hours', 86400000],
  '7d': ['Last 7 days', 7 * 86400000],
  '30d': ['Last 30 days', 30 * 86400000],
};

/** So khớp bỏ qua hoa thường và bỏ qua khác biệt NFC/NFD — tiếng Việt gõ tay hay lệch tổ hợp dấu. */
const norm = (v) => String(v ?? '').normalize('NFC').toLowerCase();

/** Khoá gom theo BỘ test, cố ý bỏ môi trường ra — lọc bộ và lọc thời gian là hai việc khác nhau. */
const suiteKeyOf = (run) => `${run.partner}::${run.app}`;

function filterRuns(runs, forcedCategory = null) {
  const f = state.runs;
  const span = RUN_RANGES[f.range]?.[1] ?? null;
  const since = span ? Date.now() - span : null;
  // input[type=date] cho ra 'YYYY-MM-DD'; hiểu theo giờ máy đang ngồi, và trọn ngày.
  const from = f.range === 'custom' && f.from ? Date.parse(`${f.from}T00:00:00`) : null;
  const to = f.range === 'custom' && f.to ? Date.parse(`${f.to}T23:59:59.999`) : null;
  const q = norm(f.q.trim());

  return runs.filter((run) => {
    const cat = forcedCategory ?? f.category;
    if (cat && categoryOf(run.partner, run.app) !== cat) return false;
    if (f.suite && suiteKeyOf(run) !== f.suite) return false;
    if (f.status && run.status !== f.status) return false;

    const at = Date.parse(run.startedAt);
    if (since != null && !(at >= since)) return false;
    if (from != null && at < from) return false;
    if (to != null && at > to) return false;

    if (q) {
      const hay = norm(
        [run.suiteLabel, run.partnerName, run.partner, run.app, run.env, run.grep, run.device, run.id].join(' '),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const runsFilterActive = () =>
  Boolean(state.runs.category || state.runs.suite || state.runs.status || state.runs.range || state.runs.q.trim());

/** Mục "Reports" (dùng chung, mọi khối). */
/** Mục "Test results" của một khối — cùng bảng, khoá theo khối và có nút "Run…". */
/** Run đang tick để xoá hàng loạt. Không nằm trong state.runs vì khối đó chỉ chứa bộ lọc. */
const selectedRuns = new Set();

function syncRunSelection() {
  $$('[data-run-row]').forEach((tr) => tr.classList.toggle('is-selected', selectedRuns.has(tr.dataset.runRow)));
  const boxes = $$('[data-run-check]');
  boxes.forEach((box) => {
    box.checked = selectedRuns.has(box.dataset.runCheck);
  });
  const bar = $('#bulk-runs');
  if (bar) {
    bar.classList.toggle('has-sel', selectedRuns.size > 0);
    bar.querySelector('[data-bulk-count]').textContent = `${selectedRuns.size} selected`;
  }
  const all = $('#check-all-runs');
  if (all) {
    all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
    all.indeterminate = !all.checked && boxes.some((b) => b.checked);
  }
}

async function renderResults() {
  const { runs } = await api(`/api/runs?partner=${state.project}`);
  const forced = state.runs.category;

  // Danh sách bộ và danh sách kết quả dựng từ chính dữ liệu đang có, để không
  // bày ra lựa chọn mà lọc xong chắc chắn rỗng.
  const suites = [];
  for (const run of runs) {
    if (forced && categoryOf(run.partner, run.app) !== forced) continue;
    const key = suiteKeyOf(run);
    if (!suites.some((s) => s.key === key)) suites.push({ key, label: run.suiteLabel ?? run.app });
  }
  const statuses = Object.keys(RUN_STATUS).filter((s) => runs.some((r) => r.status === s));

  // Lựa chọn cũ mà dữ liệu không còn thì bỏ, kẻo bảng rỗng mà không rõ vì sao.
  if (state.runs.suite && !suites.some((s) => s.key === state.runs.suite)) state.runs.suite = '';
  if (state.runs.status && !statuses.includes(state.runs.status)) state.runs.status = '';

  const filtered = filterRuns(runs);

  const rows = filtered
    .map(
      (run) => `
        <tr data-run-row="${esc(run.id)}" class="${selectedRuns.has(run.id) ? 'is-selected' : ''}">
          <td class="col-check"><input type="checkbox" data-run-check="${esc(run.id)}" ${selectedRuns.has(run.id) ? 'checked' : ''} aria-label="Select" /></td>
          <td>
            ${
              // Lượt chạy theo bộ lọc (thường là một test case) lấy chính bộ lọc làm nhãn chính — tên bộ test giống
              // nhau ở mọi dòng nên không phân biệt được lượt nào với lượt nào; tên bộ xuống dòng phụ.
              run.grep
                ? `<strong data-no-i18n>${esc(run.grep)}</strong> ${categoryChip(categoryOf(run.partner, run.app))}
                   <div class="combo-sub">${esc(run.suiteLabel ?? run.app)} · ${esc(run.partnerName ?? run.partner)}`
                : `<strong>${esc(run.suiteLabel ?? run.app)}</strong> ${categoryChip(categoryOf(run.partner, run.app))}
                   <div class="combo-sub">${esc(run.partnerName ?? run.partner)}`
            }${run.device ? ` · ${esc(deviceLabel(run.device))}` : ''}${run.headed ? ' · headed' : ''}</div>
          </td>
          <td>${runChip(run)}</td>
          <td class="cell-dim">${esc(totalsText(run) || '—')}</td>
          <td class="cell-dim cell-nowrap">${esc(fmtTime(run.startedAt))}<div class="combo-sub">${esc(fmtAgo(run.startedAt))} ·${esc(fmtDuration(run.durationMs))} · ${run.trigger === 'schedule' ? 'schedule' : 'manual'}</div></td>
          <td>
            <div class="row-actions">
              <div class="btn-group">
                <button class="btn btn-sm" data-log="${esc(run.id)}" data-log-status="${esc(run.status)}">Log</button>
                ${run.hasSummary ? `<a class="btn btn-sm" href="${esc(reportUrl(run, 'html/index.html'))}" target="_blank" rel="noopener">Report</a>` : ''}
              </div>
              <span class="row-actions-sep" aria-hidden="true"></span>
              ${
                run.hasSummary
                  ? `<a class="btn btn-sm btn-icon" href="/api/runs/${esc(run.id)}/download" download
                        title="Download the report (.html — screenshots and traces are not included)"
                        aria-label="Download report">${iconSvg('download')}</a>`
                  : ''
              }
              <button class="btn btn-sm btn-icon btn-danger" data-run-del="${esc(run.id)}"
                      data-run-label="${esc(`${run.suiteLabel ?? run.app} · ${fmtTime(run.startedAt)}`)}"
                      title="Delete this run and its report" aria-label="Delete this run">${iconSvg('trash')}</button>
            </div>
          </td>
        </tr>`,
    )
    .join('');

  const emptyCell = runsFilterActive()
    ? '<tr><td colspan="6" class="empty"><strong>No runs match the filter</strong>Loosen the filter, or click “Clear filter”.</td></tr>'
    : `<tr><td colspan="6" class="empty"><strong>No runs yet</strong>Click “Run…” to start one.</td></tr>`;

  // Chỉ một nhóm thì không cần lọc theo nhóm.
  const typeFilter = CATEGORY_ORDER.length < 2 ? '' : `<div class="field">
            <label for="r-category">Type</label>
            <select id="r-category">
              <option value="">All</option>
              ${CATEGORY_ORDER.map((cat) => `<option value="${cat}" ${cat === state.runs.category ? 'selected' : ''}>${esc(CATEGORY[cat].label)} (${runs.filter((r) => categoryOf(r.partner, r.app) === cat).length})</option>`).join('')}
            </select>
          </div>`;
  return `
    <div class="page-head">
      <div>
        <h1 class="title-with-icon">${fileIcon('results')}Test results</h1>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="filters">
          ${typeFilter}
          <div class="field">
            <label for="r-suite">Suite</label>
            <select id="r-suite" ${suites.length ? '' : 'disabled'}>
              <option value="">All</option>
              ${suites
                .map(
                  (s) =>
                    `<option value="${esc(s.key)}" ${s.key === state.runs.suite ? 'selected' : ''}>${esc(s.label)}</option>`,
                )
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="r-status">Result</label>
            <select id="r-status" ${statuses.length ? '' : 'disabled'}>
              <option value="">All</option>
              ${statuses
                .map(
                  (s) =>
                    `<option value="${s}" ${s === state.runs.status ? 'selected' : ''}>${RUN_STATUS[s][1]} (${runs.filter((r) => r.status === s).length})</option>`,
                )
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="r-range">Time</label>
            <select id="r-range">
              <option value="">All</option>
              ${Object.entries(RUN_RANGES)
                .map(([k, v]) => `<option value="${k}" ${k === state.runs.range ? 'selected' : ''}>${v[0]}</option>`)
                .join('')}
              <option value="custom" ${state.runs.range === 'custom' ? 'selected' : ''}>Custom…</option>
            </select>
          </div>
          ${
            state.runs.range === 'custom'
              ? `<div class="field">
                   <label for="r-from">From date</label>
                   <input id="r-from" type="date" value="${esc(state.runs.from)}" />
                 </div>
                 <div class="field">
                   <label for="r-to">To date</label>
                   <input id="r-to" type="date" value="${esc(state.runs.to)}" />
                 </div>`
              : ''
          }
          <div class="field field-grow">
            <label for="r-q">Search in suite, project, environment, screen size</label>
            <input id="r-q" type="search" value="${esc(state.runs.q)}" placeholder="e.g. demo, smoke, iphone" />
          </div>
        </div>
      </div>
      <div class="table-tools" id="bulk-runs">
        <span class="tools-idle muted">${filtered.length}/${runs.length} runs</span>
        <span class="tools-sel">
          <span data-bulk-count></span>
          <button type="button" class="btn btn-sm btn-danger" id="bulk-runs-del">Delete</button>
          <button type="button" class="btn btn-sm btn-ghost" id="bulk-runs-clear">Clear selection</button>
        </span>
        <span class="tools-right">${runsFilterActive() ? '<button class="btn btn-sm btn-ghost" id="r-reset">Clear filter</button>' : ''}</span>
      </div>
      <div class="table-wrap">
        <table class="table-runs">
          <thead>
            <tr><th class="col-check"><input type="checkbox" id="check-all-runs" aria-label="Select all" /></th><th>What ran</th><th style="width:110px">Result</th><th style="width:150px">Numbers</th><th style="width:190px">Started</th><th style="width:210px"></th></tr>
          </thead>
          <tbody>${rows || emptyCell}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bindRuns() {
  $$('[data-run-check]').forEach((box) =>
    box.addEventListener('change', () => {
      if (box.checked) selectedRuns.add(box.dataset.runCheck);
      else selectedRuns.delete(box.dataset.runCheck);
      syncRunSelection();
    }),
  );
  $('#check-all-runs')?.addEventListener('change', (e) => {
    $$('[data-run-check]').forEach((box) => {
      if (e.target.checked) selectedRuns.add(box.dataset.runCheck);
      else selectedRuns.delete(box.dataset.runCheck);
    });
    syncRunSelection();
  });
  $('#bulk-runs-clear')?.addEventListener('click', () => {
    selectedRuns.clear();
    syncRunSelection();
  });
  $('#bulk-runs-del')?.addEventListener('click', async () => {
    const ids = [...selectedRuns];
    if (!ids.length) return;
    const ok = await askConfirm({
      title: 'Delete runs',
      message: `Delete ${ids.length} run${ids.length === 1 ? '' : 's'}?\nTheir logs and reports will be lost too. This cannot be undone.`,
      okLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api('/api/runs/bulk-delete', { method: 'POST', body: { ids } });
      selectedRuns.clear();
      r.failed.forEach((f) => selectedRuns.add(f.id));
      toast(r.failed.length ? `Deleted ${r.deleted.length}, could not delete ${r.failed.length}: ${r.failed[0].error}` : `Deleted ${r.deleted.length} run${r.deleted.length === 1 ? '' : 's'}`, r.failed.length ? 'error' : 'ok');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  syncRunSelection();

  const bind = (sel, key) => {
    const node = $(sel);
    node?.addEventListener('change', () => {
      state.runs[key] = node.value;
      // Bỏ "tự chọn" thì quên luôn hai mốc ngày, để lần sau chọn lại không dính ngày cũ.
      if (key === 'range' && node.value !== 'custom') Object.assign(state.runs, { from: '', to: '' });
      render();
    });
  };
  bind('#r-category', 'category');
  bind('#r-suite', 'suite');
  bind('#r-status', 'status');
  bind('#r-range', 'range');
  bind('#r-from', 'from');
  bind('#r-to', 'to');

  $('#r-reset')?.addEventListener('click', () => {
    Object.assign(state.runs, { category: '', suite: '', status: '', range: '', from: '', to: '', q: '' });
    render();
  });

  $$('[data-run-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      // Nói rõ xoá DÒNG NÀO: bảng toàn dòng na ná nhau, bấm nhầm là mất báo cáo thật.
      const ok = await askConfirm({
        title: 'Delete run',
        message: `${btn.dataset.runLabel}\nIts log and report will be lost too. This cannot be undone.`,
        okLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        const result = await api(`/api/runs/${btn.dataset.runDel}`, { method: 'DELETE' });
        toast(
          result.sharedReportKept
            ? 'Deleted the row and its log. The report of this run lives in a shared folder (older report layout), so it was kept.'
            : 'Run and report deleted',
          'ok',
        );
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    }),
  );

  // Gõ tới đâu lọc tới đó, chờ một nhịp rồi mới vẽ lại — và trả con trỏ về ô tìm
  // kiếm, vì vẽ lại là thay cả DOM.
  const q = $('#r-q');
  if (!q) return;
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.runs.q = q.value;
      render().then(() => {
        const next = $('#r-q');
        next?.focus();
        next?.setSelectionRange(next.value.length, next.value.length);
      });
    }, 220);
  });
}

// ── Tab: Môi trường ─────────────────────────────────────────────────────────

// ── Nhật ký lần chạy ────────────────────────────────────────────────────────

let logStream = null;

/** Các trạng thái kết thúc — thấy một trong số này là lần chạy đã dừng hẳn. */
const RUN_DONE = new Set(['passed', 'failed', 'error', 'stopped']);

/**
 * Nhãn kết thúc riêng cho ngăn nhật ký. RUN_STATUS chỉ nói KẾT QUẢ ("đạt", "có lỗi"),
 * còn ở đây điều người dùng cần biết trước tiên là ĐÃ XONG hay chưa.
 */
const LOG_DONE = {
  passed: ['chip-ok', 'finished · no failures'],
  failed: ['chip-fail', 'finished · with failures'],
  error: ['chip-fail', 'could not run'],
  stopped: ['chip-warn', 'stopped midway'],
};

function setLogChip(cls, text) {
  const chip = $('#log-status');
  chip.className = `chip ${cls}`;
  chip.textContent = text;
}

/** Ngăn nhật ký ở thế đang chạy: nhãn nhấp nháy + nút Dừng. */
function showLogRunning(runId) {
  const stopBtn = $('#log-stop');
  setLogChip('chip-info chip-run', 'running');
  stopBtn.hidden = false;
  stopBtn.onclick = async () => {
    await api(`/api/runs/${runId}/stop`, { method: 'POST' });
    toast('Stop requested', 'ok');
  };
}

/** Ngăn nhật ký ở thế đã xong: bỏ nút Dừng, thay bằng nhãn kết quả. */
function showLogFinished(run) {
  const [cls, label] = LOG_DONE[run.status] ?? ['chip-mute', run.status];
  const bits = [label, totalsText(run), run.durationMs != null ? fmtDuration(run.durationMs) : ''];
  setLogChip(cls, bits.filter(Boolean).join(' · '));
  $('#log-stop').hidden = true;
}

/** Vạch kết ở cuối log, để nhìn vào khối log cũng biết nó đã chạy hết chứ không treo. */
function appendLogFooter(output, run) {
  const [, label] = LOG_DONE[run.status] ?? ['', run.status];
  const bits = [label, totalsText(run), run.durationMs != null ? fmtDuration(run.durationMs) : ''];
  output.textContent += `\n──── ${bits.filter(Boolean).join(' · ')} · ${fmtTime(run.finishedAt)} ────\n`;
  output.scrollTop = output.scrollHeight;
}

/**
 * @param {string} runId
 * @param {string} [title]
 * @param {string} [knownStatus] trạng thái đã biết lúc bấm — có nó thì mở nhật ký của lần
 *   chạy cũ sẽ không loé nút "Dừng" một nhịp rồi mới tắt.
 */
let logSession = 0;

function openLog(runId, title, knownStatus = 'running') {
  const session = ++logSession;
  const box = $('#logbox');
  const output = $('#log-output');

  $('#logbox-title').textContent = title ?? 'Log';
  output.innerHTML = `<div class="skeleton log-skeleton" aria-hidden="true">${[62, 48, 75, 40, 68, 55, 30]
    .map((w) => `<div class="sk sk-line" style="width:${w}%"></div>`)
    .join('')}</div>`;
  box.hidden = false;
  // Log đến trước khi skeleton đủ thời gian thì xếp hàng, hết thời gian mới đổ ra một lượt.
  let queue = [];
  const ready = sleep(SKELETON_MIN_MS).then(() => {
    // Đã mở nhật ký khác trong lúc chờ: bỏ hàng đợi của lần này, không đổ log cũ vào ô của lần mới.
    if (session !== logSession) return;
    const pending = queue;
    queue = null;
    output.querySelector('.log-skeleton')?.remove();
    for (const fn of pending) fn();
  });
  const whenReady = (fn) => (queue ? queue.push(fn) : fn());

  if (RUN_DONE.has(knownStatus)) showLogFinished({ status: knownStatus });
  else showLogRunning(runId);

  logStream?.close();
  logStream = new EventSource(`/api/runs/${runId}/stream`);

  logStream.addEventListener('log', (event) =>
    whenReady(() => {
      const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 60;
      output.append(JSON.parse(event.data).text);
      if (atBottom) output.scrollTop = output.scrollHeight;
    }),
  );

  logStream.addEventListener('done', async (event) => {
    // Đóng stream NGAY: server ngắt kết nối sau `done`, chờ skeleton rồi mới đóng thì trình duyệt báo "mất kết nối".
    const finished = logStream;
    finished?.close();
    if (logStream === finished) logStream = null;
    await ready;
    if (session !== logSession) return;
    const run = JSON.parse(event.data);
    showLogFinished(run);
    appendLogFooter(output, run);
    const [, label] = RUN_STATUS[run.status] ?? ['', run.status];
    toast(
      `${title ?? 'Run'}: ${label}${run.totals ? ` — ${totalsText(run)}` : ''}`,
      run.status === 'passed' ? 'ok' : 'error',
    );
    render();
  });

  logStream.onerror = () => {
    logStream?.close();
    logStream = null;
    output.querySelector('.log-skeleton')?.remove();
    // Đứt kết nối KHÁC với chạy xong: nói rõ để người dùng không tưởng là đã đạt.
    setLogChip('chip-warn', 'log connection lost');
    $('#log-stop').hidden = true;
  };
}

function closeLog() {
  logStream?.close();
  logStream = null;
  $('#logbox').hidden = true;
}

// ── Điều phối ───────────────────────────────────────────────────────────────

/**
 * Màn "Tạo test case" nằm ở file riêng cho khỏi phình app.js, nhưng vẫn cần mấy tiện ích chung.
 * Trao bằng tay thay vì để nó import ngược lại đây — hai file import lẫn nhau là vòng tròn.
 */
initKeyword({
  api, esc, toast, state, render, $, $$, fmtAgo, openLog, askConfirm, askForm, askTypedConfirm, showContextMenu, showPanel, closePanel,
  openTab, openCaseTab, activateTab, closeTab, closeCaseTab, retargetCaseTab, updateActiveCaseTab,
});
initGlobals({ api, esc, toast, state, render, $, $$, askConfirm, showContextMenu, showPanel, closePanel });
initDatasets({ api, esc, toast, state, render, $, $$, askConfirm, askForm, askTypedConfirm });
initSuites({ api, esc, toast, state, render, $, $$, fmtAgo, openLog, askConfirm, askForm, showContextMenu, showPanel, closePanel, treeChevron });

// ── Tab như trình duyệt ──────────────────────────────────────────────────────
// Mỗi mục menu là một tab (mở lại = chuyển tới tab đã có), mỗi test case là một tab riêng giữ bản nháp
// của nó. Danh sách tab nhớ theo project (localStorage); bản nháp chưa lưu chỉ sống trong phiên trang.

const TAB_TITLES = {
  overview: 'Overview', cases: 'Test cases', objects: 'Object Repository', globals: 'Global variables', keywords: 'Keywords',
  testdata: 'Test data', suites: 'Test suites', results: 'Test results', runs: 'Test results', schedules: 'Schedules',
};
let tabSeq = 0;
const newTabId = () => `t${Date.now().toString(36)}${(tabSeq += 1)}`;
const activeTab = () => state.tabs.find((t) => t.id === state.activeTab) ?? null;
const snapshot = (draft) => (draft ? JSON.stringify({ ...draft, __path: undefined, problems: undefined }) : '');
const isDirty = (tab) => tab.kind === 'case' && !!tab.draft && snapshot(tab.draft) !== tab.saved;

function saveTabs() {
  try {
    localStorage.setItem(
      `tabs:${state.project}`,
      JSON.stringify({ active: state.activeTab, tabs: state.tabs.map(({ id, kind, view, casePath, title, pinned }) => ({ id, kind, view, casePath, title, pinned: !!pinned })) }),
    );
  } catch {
    /* không lưu được thì tab chỉ sống trong phiên này */
  }
}

function loadTabs() {
  state.tabs = [];
  state.activeTab = null;
  try {
    const saved = JSON.parse(localStorage.getItem(`tabs:${state.project}`) || 'null');
    if (saved?.tabs?.length) {
      state.tabs = saved.tabs.filter((t) => (t.kind === 'case' ? !!t.casePath : !!VIEWS[t.view]));
      state.activeTab = state.tabs.some((t) => t.id === saved.active) ? saved.active : (state.tabs[0]?.id ?? null);
    }
  } catch {
    /* hỏng thì bắt đầu trống */
  }
}

/** Tab cho một màn — tìm hoặc tạo, KHÔNG vẽ. */
function tabForView(view) {
  const v = view === 'runs' ? 'results' : view;
  let tab = state.tabs.find((t) => t.kind === 'view' && t.view === v);
  if (!tab) {
    tab = { id: newTabId(), kind: 'view', view: v, title: TAB_TITLES[v] ?? v };
    state.tabs.push(tab);
  }
  return tab;
}

/** Tab cho một test case (theo đường dẫn) — tìm hoặc tạo, KHÔNG vẽ. Bản nháp nạp khi tab được mở. */
function tabForCase({ casePath, title, draft }) {
  let tab = casePath ? state.tabs.find((t) => t.kind === 'case' && t.casePath === casePath) : null;
  if (!tab) {
    tab = { id: newTabId(), kind: 'case', view: 'cases', casePath: casePath ?? null, title: title ?? casePath ?? 'Test case', draft: draft ?? null, saved: snapshot(draft) };
    state.tabs.push(tab);
  } else if (draft && !tab.draft) {
    tab.draft = draft;
    tab.saved = snapshot(draft);
  }
  return tab;
}

const hashFor = (tab) => {
  if (!state.project) return 'projects';
  if (!tab) return `p/${state.project}/overview`;
  return tab.kind === 'case' && tab.casePath ? `p/${state.project}/case/${encodeURIComponent(tab.casePath)}` : `p/${state.project}/${tab.view}`;
};

/** Đặt tab làm hiện hành: đồng bộ state.view + bản nháp của màn Test cases, cập nhật hash. */
function selectTab(tab) {
  state.activeTab = tab?.id ?? null;
  state.view = tab?.view ?? 'overview';
  state.keyword.draft = tab?.kind === 'case' ? (tab.draft ?? null) : null;
  const hash = hashFor(tab);
  if (location.hash.slice(1) !== hash) location.hash = hash;
  saveTabs();
}

function activateTab(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  selectTab(tab);
  render();
}

function openTab(view) {
  selectTab(tabForView(view));
  return render();
}

function openCaseTab(spec) {
  selectTab(tabForCase(spec));
  render();
}

async function closeTab(id, { force = false } = {}) {
  const i = state.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const tab = state.tabs[i];
  if (!force && isDirty(tab)) {
    const ok = await askConfirm({ title: 'Close test case', message: `"${tab.title}" has unsaved changes.\nClose and discard them?`, okLabel: 'Discard', danger: true });
    if (!ok) return;
  }
  state.tabs.splice(i, 1);
  if (state.activeTab === id) {
    const next = state.tabs[i] ?? state.tabs[i - 1];
    if (next) activateTab(next.id);
    else openTab('overview');
    return;
  }
  saveTabs();
  renderTabbar();
}

/** Đóng nhiều tab một lượt: hỏi MỘT lần cho mọi bản nháp chưa lưu, rồi chọn lại tab hiện hành nếu nó bị đóng. */
async function closeTabs(ids) {
  const targets = state.tabs.filter((t) => ids.includes(t.id));
  if (!targets.length) return;
  const dirty = targets.filter(isDirty);
  if (dirty.length) {
    const ok = await askConfirm({
      title: 'Close tabs',
      message: `${dirty.length === 1 ? `"${dirty[0].title}" has` : `${dirty.length} test cases have`} unsaved changes.\nClose and discard them?`,
      okLabel: 'Discard',
      danger: true,
    });
    if (!ok) return;
  }
  const activeIdx = state.tabs.findIndex((t) => t.id === state.activeTab);
  state.tabs = state.tabs.filter((t) => !ids.includes(t.id));
  if (!state.tabs.some((t) => t.id === state.activeTab)) {
    const next = state.tabs[Math.min(activeIdx, state.tabs.length - 1)];
    if (next) activateTab(next.id);
    else openTab('overview');
    return;
  }
  saveTabs();
  renderTabbar();
}

/** Ghim = dồn lên đầu dải tab, không bị "Close Others / Close All" quét đi; bỏ ghim = về ngay sau nhóm ghim. */
function togglePinTab(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  state.tabs = state.tabs.filter((t) => t !== tab);
  const lastPinned = state.tabs.reduce((acc, t, i) => (t.pinned ? i : acc), -1);
  state.tabs.splice(lastPinned + 1, 0, tab);
  saveTabs();
  renderTabbar();
}

function tabContextMenu(id, x, y) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  const idx = state.tabs.indexOf(tab);
  const unpinned = (list) => list.filter((t) => !t.pinned).map((t) => t.id);
  const others = unpinned(state.tabs.filter((t) => t !== tab));
  const right = unpinned(state.tabs.slice(idx + 1));
  const saved = unpinned(state.tabs.filter((t) => !isDirty(t)));
  const all = unpinned(state.tabs);
  showContextMenu({
    x,
    y,
    items: [
      { label: 'Close', shortcut: 'Ctrl+F4', onSelect: () => closeTab(id) },
      { label: 'Close Others', disabled: !others.length, onSelect: () => closeTabs(others) },
      { label: 'Close to the Right', disabled: !right.length, onSelect: () => closeTabs(right) },
      { label: 'Close Saved', disabled: !saved.length, onSelect: () => closeTabs(saved) },
      { label: 'Close All', disabled: !all.length, onSelect: () => closeTabs(all) },
      { separator: true },
      { label: tab.pinned ? 'Unpin' : 'Pin', onSelect: () => togglePinTab(id) },
      { separator: true },
      {
        label: 'Copy Path',
        disabled: tab.kind !== 'case' || !tab.casePath,
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(tab.casePath);
            toast('Path copied');
          } catch {
            toast('Cannot access the clipboard', 'error');
          }
        },
      },
    ],
  });
}

function closeCaseTab(casePath) {
  const tab = state.tabs.find((t) => t.kind === 'case' && t.casePath === casePath);
  if (tab) closeTab(tab.id, { force: true });
}

function retargetCaseTab(from, to) {
  const tab = state.tabs.find((t) => t.kind === 'case' && t.casePath === from);
  if (tab) {
    tab.casePath = to;
    saveTabs();
    renderTabbar();
  }
}

/** Sau khi lưu / đổi tên: tab hiện hành nhận đường dẫn, tên và bản nháp mới; mốc "đã lưu" đặt lại. */
function updateActiveCaseTab({ casePath, title, draft, markSaved = false }) {
  const tab = activeTab();
  if (!tab || tab.kind !== 'case') return;
  if (casePath !== undefined) tab.casePath = casePath;
  if (title !== undefined) tab.title = title || 'Test case';
  if (draft !== undefined) {
    tab.draft = draft;
    state.keyword.draft = draft;
  }
  if (markSaved) tab.saved = snapshot(tab.draft);
  if (location.hash.slice(1) !== hashFor(tab)) location.hash = hashFor(tab);
  saveTabs();
  renderTabbar();
}

let tabbarActive = null;

function renderTabbar() {
  const host = $('#tabbar');
  if (!host) return;
  // innerHTML đưa scrollLeft về 0 — mỗi lần gõ đều vẽ lại nên phải giữ vị trí cuộn.
  const scrollLeft = host.scrollLeft;
  host.innerHTML = state.project && state.view !== 'projects'
    ? state.tabs
        .map(
          (t) => `
        <div class="tab ${t.id === state.activeTab ? 'is-active' : ''} ${isDirty(t) ? 'is-dirty' : ''} ${t.pinned ? 'is-pinned' : ''}" data-tab="${t.id}" role="tab"
             aria-selected="${t.id === state.activeTab}" title="${esc(t.kind === 'case' ? (t.casePath ?? t.title) : t.title)}">
          <span class="tab-icon" aria-hidden="true">${t.kind === 'case' ? fileIcon('case') : `<svg viewBox="0 0 24 24">${ICON[t.view] ?? ICON[t.view.replace(/s$/, '')] ?? ICON.cases}</svg>`}</span>
          <span class="tab-title">${esc(t.title)}</span>
          <span class="tab-end"><span class="tab-dot" aria-hidden="true"></span>${
            t.pinned
              ? `<button class="tab-pin" data-tab-unpin="${t.id}" title="Unpin" aria-label="Unpin tab"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H7v-2l3-3z"/></svg></button>`
              : `<button class="tab-close" data-tab-close="${t.id}" title="Close" aria-label="Close tab">×</button>`
          }</span>
        </div>`,
        )
        .join('')
    : '';
  host.scrollLeft = scrollLeft;
  if (state.activeTab !== tabbarActive) {
    tabbarActive = state.activeTab;
    host.querySelector('.tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/** Màn chọn project — toàn trang, không có sidebar. Mỗi project = một project trong config/partners.json. */
// Ô chữ cái đầu của project: màu suy từ mã (cố định theo project, không phải chọn tay).
// Nhân 92 để các mã gần nhau vẫn ra sắc độ cách xa (5 project hiện có cách nhau ≥ 56°).
const hueOf = (code) => ([...String(code)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) * 92) % 360;
const initialsOf = (name) => {
  const words = String(name).trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : String(name).slice(0, 2)).toUpperCase();
};
const modelOf = (code) => state.meta.partners.find((p) => p.code === code)?.model ?? '';

async function renderProjects() {
  const { projects } = await api('/api/projects');
  const cards = projects
    .map(
      (p) => `
      <div class="project-card-wrap">
      <button class="project-card-menu" data-project-menu="${esc(p.code)}" title="Project actions" aria-label="Actions for project ${esc(p.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      <button class="project-card" data-project="${esc(p.code)}">
        <div class="project-card-head">
          <span class="project-avatar" style="--av-h:${hueOf(p.code)}" aria-hidden="true">${esc(initialsOf(p.name))}</span>
          <span class="project-card-title">
            <span class="project-card-name">${esc(p.name)}</span>
            <span class="project-card-code mono">${esc(p.code)}</span>
          </span>
          ${modelOf(p.code) ? `<span class="project-card-model">${esc(modelOf(p.code))}</span>` : ''}
        </div>
        <div class="project-card-stats">
          <span class="project-stat"><strong>${p.cases}</strong><small>test cases</small></span>
          <span class="project-stat"><strong>${p.suites}</strong><small>suites</small></span>
          <span class="project-stat"><strong class="${!p.tests ? '' : p.failed ? 'stat-fail' : 'stat-ok'}">${p.tests ? `${p.passed}/${p.tests}` : '—'}</strong><small>passed</small></span>
        </div>
        <div class="project-rate">
          <span class="project-rate-bar"><span class="${p.failed ? 'is-fail' : 'is-ok'}" style="width:${p.tests ? Math.round((p.passed / p.tests) * 100) : 0}%"></span></span>
          <span class="project-rate-pct">${p.tests ? `${Math.round((p.passed / p.tests) * 100)}%` : ''}</span>
        </div>
        <div class="project-card-foot">
          <span class="project-card-run">${p.lastRun ? `${runChip(p.lastRun)} <span class="muted">${esc(fmtAgo(p.lastRun.startedAt))}</span>` : '<span class="muted">No runs yet</span>'}</span>
          <span class="project-card-open">Open →</span>
        </div>
      </button>
      </div>`,
    )
    .join('');
  return `
    <div class="projects-page">
      <div class="page-head">
        <div><h1>Projects</h1></div>
        <button class="btn btn-primary" id="project-new">
          <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New project
        </button>
      </div>
      <div class="project-grid">${cards || '<div class="card"><div class="empty"><strong>No project yet</strong>Create one with New project.</div></div>'}</div>
    </div>`;
}

const projectCodeFrom = (name) =>
  String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 30);

async function createProjectFlow() {
  let values = { name: '', code: '' };
  // Lỗi từ server (trùng mã, sai định dạng) thì mở lại hộp với giá trị vừa nhập, không bắt gõ lại từ đầu.
  for (;;) {
    const form = await askForm({
      title: 'New project',
      okLabel: 'Create',
      fields: [
        { name: 'name', label: 'Project name', value: values.name, placeholder: 'My web app', required: true },
        { name: 'code', label: 'Code', value: values.code, placeholder: 'derived from the name', hint: 'Lowercase letters, digits and -. Leave blank to derive from the name. Cannot be changed later.' },
      ],
    });
    if (!form) return;
    values = { ...form, code: form.code || projectCodeFrom(form.name) };
    try {
      const { project } = await api('/api/projects', { method: 'POST', body: values });
      state.meta = await api('/api/meta');
      toast(`Project ${project.name} created`, 'ok');
      openProject(project.code);
      return;
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

function bindProjects() {
  $$('[data-project]').forEach((b) => b.addEventListener('click', () => openProject(b.dataset.project)));
  $('#project-new')?.addEventListener('click', createProjectFlow);
  const menuFor = (code, x, y) =>
    showContextMenu({
      x,
      y,
      items: [
        { label: 'Open', onSelect: () => openProject(code) },
        { separator: true },
        { label: 'Delete project…', danger: true, onSelect: () => deleteProjectFlow(code) },
      ],
    });
  $$('[data-project-menu]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = b.getBoundingClientRect();
      menuFor(b.dataset.projectMenu, r.left, r.bottom + 4);
    }),
  );
  $$('[data-project]').forEach((b) =>
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      menuFor(b.dataset.project, e.clientX, e.clientY);
    }),
  );
}

const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/**
 * Xoá project qua 3 bước: (1) xem những gì sẽ mất, (2) tick xác nhận từng hệ quả, (3) gõ đúng mã project.
 * Server kiểm lại mã lần nữa và dời dữ liệu vào thùng rác chứ không xoá hẳn.
 */
async function deleteProjectFlow(code) {
  const partner = state.meta.partners.find((p) => p.code === code);
  const flow = { step: 1, impact: null, error: '', acks: [false, false, false], typed: '', busy: false };
  const ACKS = [
    'I understand the test cases, test objects, test suites and test data of this project will be removed from the console.',
    'I understand the run history, reports and schedules of this project will be deleted, and its schedules will stop.',
    'I understand the data is moved to the trash folder console/data/trash and can only be restored by hand.',
  ];
  const STEPS = ['Review', 'Acknowledge', 'Confirm'];

  const stepper = () => `
    <ol class="del-steps">${STEPS.map(
      (label, i) => `<li class="${i + 1 === flow.step ? 'is-current' : i + 1 < flow.step ? 'is-done' : ''}"><span class="del-step-no">${i + 1}</span>${esc(label)}</li>`,
    ).join('')}</ol>`;

  const reviewBody = () => {
    const im = flow.impact;
    if (flow.error) return `<div class="note note-fail">${esc(flow.error)}</div>`;
    if (!im) {
      return `<div class="skeleton" aria-hidden="true">${'<div class="sk-row"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-line" style="width:12%"></div></div>'.repeat(8)}</div>`;
    }
    const rows = [
      ['Test cases', im.testCases],
      ['Test objects', im.testObjects],
      ['Test suites', im.testSuites],
      ['Test data', im.datasets + im.testData],
      ['Global variables', im.globals],
      ['Schedules', im.schedulesEnabled ? `${im.schedules} (${im.schedulesEnabled} enabled)` : im.schedules],
      ['Run history', im.runs],
      ['Report folders', im.reportFolders ? `${im.reportFolders} · ${fmtBytes(im.reportBytes)}` : 0],
    ];
    return `
      <p>Everything below belongs to this project and will be removed:</p>
      <table class="del-impact"><tbody>${rows
        .map(([label, value]) => `<tr><th>${esc(label)}</th><td class="${value ? 'del-has' : 'muted'}">${esc(String(value))}</td></tr>`)
        .join('')}</tbody></table>
      ${
        im.specSuites.length
          ? `<div class="note note-warn"><strong>Hand-written suites will disappear from the console and the CLI:</strong> ${im.specSuites.map(esc).join(' · ')}.${
              im.specSourceKept ? ` <span>Their source code in</span> <span class="mono">${esc(im.specSourceKept)}</span> <span>is kept.</span>` : ''
            }</div>`
          : ''
      }
      ${im.running.length ? `<div class="note note-fail"><strong>A run of this project is in progress.</strong> Stop it before deleting.</div>` : ''}`;
  };

  const ackBody = () => `
    <p>Tick every statement to continue.</p>
    <div class="del-acks">${ACKS.map(
      (text, i) => `<label class="del-ack"><input type="checkbox" data-del-ack="${i}" ${flow.acks[i] ? 'checked' : ''} /><span>${esc(text)}</span></label>`,
    ).join('')}</div>`;

  const confirmBody = () => `
    <p>This is the last step. Type the project code to delete it.</p>
    <div class="field typed-confirm">
      <label for="del-typed"><span>Type the code to confirm:</span> <code class="typed-confirm-text">${esc(code)}</code></label>
      <input id="del-typed" type="text" autocomplete="off" spellcheck="false" value="${esc(flow.typed)}" />
    </div>
    ${flow.error ? `<div class="note note-fail">${esc(flow.error)}</div>` : ''}`;

  const canNext = () =>
    flow.step === 1 ? Boolean(flow.impact) && !flow.impact.running.length && !flow.error : flow.step === 2 ? flow.acks.every(Boolean) : flow.typed === code;

  const paint = () => {
    const root = $('#del-flow');
    if (!root) return;
    root.innerHTML = `
      ${stepper()}
      <div class="del-body">${flow.step === 1 ? reviewBody() : flow.step === 2 ? ackBody() : confirmBody()}</div>
      <div class="modal-foot del-foot">
        ${flow.step > 1 ? '<button type="button" class="btn btn-ghost" data-del-back>Back</button>' : '<span></span>'}
        <div class="del-foot-right">
          <button type="button" class="btn btn-ghost" data-del-cancel>Cancel</button>
          ${
            flow.step < 3
              ? `<button type="button" class="btn btn-primary" data-del-next ${canNext() ? '' : 'disabled'}>Next</button>`
              : `<button type="button" class="btn btn-danger" data-del-go ${canNext() && !flow.busy ? '' : 'disabled'}>${flow.busy ? 'Deleting…' : 'Delete project'}</button>`
          }
        </div>
      </div>`;
    root.querySelector('[data-del-cancel]').addEventListener('click', closePanel);
    root.querySelector('[data-del-back]')?.addEventListener('click', () => {
      flow.step -= 1;
      flow.error = flow.step === 1 ? flow.error : '';
      paint();
    });
    root.querySelector('[data-del-next]')?.addEventListener('click', () => {
      if (!canNext()) return;
      flow.step += 1;
      paint();
    });
    root.querySelectorAll('[data-del-ack]').forEach((box) =>
      box.addEventListener('change', () => {
        flow.acks[Number(box.dataset.delAck)] = box.checked;
        root.querySelector('[data-del-next]').disabled = !canNext();
      }),
    );
    const typed = root.querySelector('#del-typed');
    if (typed) {
      typed.addEventListener('input', () => {
        flow.typed = typed.value;
        root.querySelector('[data-del-go]').disabled = !canNext() || flow.busy;
      });
      typed.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && canNext()) root.querySelector('[data-del-go]').click();
      });
      typed.focus();
    }
    root.querySelector('[data-del-go]')?.addEventListener('click', async () => {
      if (!canNext() || flow.busy) return;
      flow.busy = true;
      flow.error = '';
      paint();
      try {
        const result = await api(`/api/projects?code=${encodeURIComponent(code)}`, { method: 'DELETE', body: { confirm: flow.typed } });
        closePanel();
        try {
          localStorage.removeItem(`tabs:${code}`);
          if (localStorage.getItem('project') === code) localStorage.removeItem('project');
        } catch {
          /* không đọc được localStorage thì thôi */
        }
        state.meta = await api('/api/meta');
        if (state.project === code) {
          state.project = null;
          state.tabs = [];
          state.activeTab = null;
        }
        toast(`Project ${partner?.name ?? code} deleted — data moved to ${result.trash}`, 'ok');
        openProjects();
      } catch (err) {
        flow.busy = false;
        flow.error = err.message;
        paint();
      }
    });
  };

  showPanel({ title: `Delete project — ${partner?.name ?? code}`, html: '<div id="del-flow" class="del-flow"></div>', className: 'modal-del', onMount: paint });
  try {
    flow.impact = await api(`/api/projects/impact?code=${encodeURIComponent(code)}`);
  } catch (err) {
    flow.error = err.message;
  }
  // Skeleton bước 1 giữ tối thiểu như mọi chỗ tải khác, tránh chớp.
  await sleep(SKELETON_MIN_MS);
  paint();
}

function saveProject() {
  try {
    if (state.project) localStorage.setItem('project', state.project);
    else localStorage.removeItem('project');
  } catch {
    /* không lưu được thì chỉ giữ trong phiên này */
  }
}

function openProject(code) {
  state.project = code;
  saveProject();
  loadTabs();
  selectTab(activeTab() ?? tabForView('overview'));
  render();
}

function openProjects() {
  state.view = 'projects';
  location.hash = 'projects';
  render();
}

const VIEWS = {
  projects: [renderProjects, bindProjects],
  overview: [renderOverview, bindOverview],
  cases: [renderKeyword, bindKeyword],
  objects: [renderObjects, bindObjects],
  globals: [renderGlobals, bindGlobals],
  keywords: [renderKeywords, bindKeywords],
  results: [renderResults, bindRuns],
  testdata: [renderDatasets, bindDatasets],
  suites: [renderSuites, bindSuites],
  schedules: [renderSchedules, bindSchedules],
  runs: [renderResults, bindRuns],
};

/**
 * Menu bên trái, gom theo VÒNG ĐỜI công việc chứ không theo thứ tự màn hình:
 * chuẩn bị (kịch bản, dữ liệu, môi trường) → thực thi (chạy, lịch) → kết quả.
 *
 * Sắp thế này vì một người mới vào đọc từ trên xuống là ra đúng trình tự phải làm;
 * còn hàng tab ngang cũ thì 7 mục nằm bằng vai nhau, không nói lên cái gì trước cái gì.
 */
/*
 * Biểu tượng vẽ bằng SVG nét thay cho ký tự unicode (◎ ☰ ⌗ ⚙ ▶ ◷ ❏): unicode
 * mỗi ký tự lấy từ một font dự phòng khác nhau nên cao thấp và dày mỏng lệch
 * nhau, còn SVG thì cùng khổ 20 và cùng độ dày nét do CSS quy định.
 */
const ICON = {
  overview: '<path d="M3 3h7v8H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 15h7v6H3z"/>',
  cases:
    '<path d="M3 5.5 4.5 7 7 4M3 12.5 4.5 14 7 11M3 19.5 4.5 21 7 18M10 5.5h11M10 12.5h11M10 19.5h11"/>',
  testdata:
    '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  results: '<path d="M4 5h16v14H4z"/><path d="M8 13l2.5 2.5L16 10"/>',
  schedules: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.2 1.9"/>',
  runs: '<path d="M6 21V11M12 21V4M18 21v-6"/><path d="M3 21h18"/>',
  keyword:
    '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="9"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21"/>',
  case: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  objects: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M11 9.5l5.5 2.2-2.3 1 2.1 3.3-1.6 1-2.1-3.3-1.6 2z"/>',
  suites:
    '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="15" width="18" height="5" rx="1.5"/><path d="M7 9v6M17 9v6"/>',
  globals:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9z"/>',
  // Hai cái dưới dùng cho nút CHỈ-CÓ-HÌNH ở bảng Báo cáo, không xuất hiện trên menu.
  download:
    '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 16.5v3A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  trash:
    '<path d="M4 6.5h16"/><path d="M9.5 6.5V4.9c0-.8.6-1.4 1.3-1.4h2.4c.7 0 1.3.6 1.3 1.4v1.6"/><path d="m6.6 6.5.9 13.4c.05.8.7 1.4 1.5 1.4h6c.8 0 1.45-.6 1.5-1.4l.9-13.4"/><path d="M10.4 10.5v7M13.6 10.5v7"/>',
};

/** Hình trong NÚT — luôn kèm `title`/`aria-label` ở nút, nên bản thân hình là trang trí. */
function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
}

const NAV_GROUPS = [
  { title: null, items: [{ view: 'overview', icon: ICON.overview, label: 'Overview' }] },
  {
    title: 'Tests Explorer',
    items: [
      { view: 'globals', icon: ICON.globals, label: 'Global variables' },
      { view: 'objects', icon: ICON.objects, label: 'Object Repository' },
      { view: 'cases', icon: ICON.cases, label: 'Test cases' },
      { view: 'testdata', icon: ICON.testdata, label: 'Test data' },
      { view: 'suites', icon: ICON.suites, label: 'Test suites' },
      { view: 'results', icon: ICON.results, label: 'Test results' },
    ],
  },
  // Danh mục keyword chỉ để tra cứu cách dùng, không phải việc kiểm thử — tách khỏi khối Tests.
  { title: 'Reference', items: [{ view: 'keywords', icon: ICON.keyword, label: 'Keywords' }] },
  {
    title: 'Settings',
    items: [
      { view: 'schedules', icon: ICON.schedules, label: 'Schedules' },
    ],
  },
];

/**
 * Huy hiệu cạnh mục menu — chỉ hiện khi có thứ đáng chú ý, để mắt không quen
 * với việc lúc nào cũng có số rồi bỏ qua luôn.
 */
async function navBadges() {
  const badges = {};
  try {
    const stats = await api(`/api/stats?days=7&project=${state.project}`);
    if (stats.totals.failed) badges.results = { text: String(stats.totals.failed), kind: 'fail' };
    if (stats.totals.combosRun) badges.overview = null;
  } catch {
    /* chưa có số liệu thì thôi, menu vẫn dùng được */
  }
  try {
    const { schedules } = await api('/api/schedules');
    const on = schedules.filter((s) => s.enabled && s.partner === state.project).length;
    if (on) badges.schedules = { text: String(on), kind: 'mute' };
  } catch {
    /* bỏ qua */
  }
  return badges;
}

async function renderNav() {
  applyNav(await buildNav());
}

/** Tên project ở đầu menu, nút đổi project và nội dung menu — gắn một lần, đồng bộ. */
function applyNav({ current, html, skeleton = false }) {
  // Tên project thay cho tên app ở đầu menu; nút đổi project là biểu tượng ở góc dưới trái.
  $('.brand-name').textContent = current ? current.name : 'E2E Studio';
  $('.brand').title = current ? `E2E Studio · project ${current.name}` : 'E2E Studio';
  $('#project-switch').hidden = !current;
  $('#nav').innerHTML = html;
  if (current && !skeleton) bindSideTree();
}

/** Menu trái lúc đang dựng (vào/đổi project) — dáng giống menu thật để lúc thay không xô lệch. */
function navSkeleton() {
  const current = state.meta.partners.find((p) => p.code === state.project) ?? null;
  const item = (w) => `<div class="nav-row sk-nav-row"><div class="sk sk-nav-icon"></div><div class="sk sk-line" style="width:${w}%"></div></div>`;
  const html = `<div class="skeleton" aria-hidden="true">
    <div class="nav-group">${item(55)}</div>
    <div class="nav-group"><div class="sk sk-line sk-nav-title"></div>${item(62)}${item(48)}${item(70)}${item(58)}${item(52)}${item(64)}</div>
    <div class="nav-group"><div class="sk sk-line sk-nav-title"></div>${item(44)}</div>
  </div>`;
  return { current, html, skeleton: true };
}

async function buildNav() {
  const current = state.meta.partners.find((p) => p.code === state.project);
  if (!current || state.view === 'projects') return { current: null, html: '' };
  const [badges, sideTree, objTree] = await Promise.all([navBadges(), renderSideTree(), renderObjectsSideTree()]);
  const html = NAV_GROUPS.map(
    (group) => `
      <div class="nav-group">
        ${group.title ? `<div class="nav-group-title">${esc(group.title)}</div>` : ''}
        ${group.items
          .map((item) => {
            const badge = badges[item.view];
            const active = item.view === state.view || (item.view === 'results' && state.view === 'runs');
            const tree = item.view === 'cases' ? sideTree : item.view === 'objects' ? objTree : '';
            const treeId = item.view === 'cases' ? 'nav-tree' : 'nav-tree-objects';
            const hasTree = item.view === 'cases' || item.view === 'objects';
            const collapsed = hasTree && isTreeCollapsed(item.view);
            // Nút thu gọn/mở cây nằm cạnh mục menu (không lồng trong nút menu vì button không được chứa button).
            const toggle = hasTree
              ? `<button class="nav-tree-toggle" data-tree-toggle="${item.view}" title="${collapsed ? 'Expand tree' : 'Collapse tree'}" aria-label="${collapsed ? 'Expand tree' : 'Collapse tree'}">${treeChevron(!collapsed)}</button>`
              : '';
            return `
              <div class="nav-row">
              <button class="nav-item ${active ? 'is-active' : ''}" data-view="${item.view}" title="${esc(item.label)}">
                <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${item.icon}</svg></span>
                <span class="nav-label">${esc(item.label)}</span>
                ${badge ? `<span class="nav-badge nav-badge-${badge.kind}">${esc(badge.text)}</span>` : ''}
              </button>${toggle}
              </div>${tree ? `<div class="nav-tree" id="${treeId}">${tree}</div>` : ''}`;
          })
          .join('')}
      </div>`,
  ).join('');
  return { current, html };
}

/**
 * Khung xương (skeleton) hiện NGAY khi chuyển màn và ở lại ít nhất SKELETON_MIN_MS (xem render()). Ba dáng: lưới thẻ (Projects), số liệu + biểu đồ (Overview), bảng (còn lại).
 */
function skeletonFor(view, tab) {
  const line = (w) => `<div class="sk sk-line" style="width:${w}%"></div>`;
  const row = () => `<div class="sk-row">${line(46)}${line(14)}${line(12)}${line(10)}</div>`;
  if (tab?.kind === 'case') {
    const group = () => `<div class="sk-row sk-group">${line(18)}${line(8)}</div>${`<div class="sk-row">${line(30)}${line(20)}${line(24)}</div>`.repeat(2)}`;
    return `<div class="skeleton" aria-hidden="true">
      <div class="page-head"><div class="sk sk-line" style="width:40%"></div></div>
      <div class="card sk-card">
        <div class="sk-row">${line(22)}${line(8)}</div>
        <div class="sk sk-input"></div>
        <div class="sk-case-body"><div class="sk-case-steps">${group().repeat(3)}</div><div class="sk-case-vars">${line(50)}${line(80)}${line(70)}</div></div>
      </div>
    </div>`;
  }
  if (view === 'projects') {
    return `<div class="skeleton projects-page" aria-hidden="true">
      <div class="page-head"><div class="sk sk-title"></div></div>
      <div class="project-grid">${'<div class="card sk-card">'.concat(line(45), line(22), '<div class="sk-row">', line(24), line(18), line(26), '</div></div>').repeat(4)}</div>
    </div>`;
  }
  if (view === 'overview') {
    return `<div class="skeleton" aria-hidden="true">
      <div class="page-head"><div class="sk sk-title"></div><div class="sk sk-btn"></div></div>
      <div class="stats">${'<div class="stat"><div class="sk sk-num"></div><div class="sk sk-line" style="width:70%"></div></div>'.repeat(6)}</div>
      <div class="chart-grid">${'<div class="card sk-card"><div class="sk sk-line" style="width:30%"></div><div class="sk sk-chart"></div></div>'.repeat(2)}</div>
    </div>`;
  }
  return `<div class="skeleton" aria-hidden="true">
    <div class="page-head"><div class="sk sk-title"></div><div class="sk sk-btn"></div></div>
    <div class="card sk-card"><div class="sk-row sk-filters">${line(28)}${line(18)}${line(18)}${line(12)}</div>${row().repeat(7)}</div>
  </div>`;
}

let renderSeq = 0;
// Màn đang hiện trên #view. Vẽ lại đúng màn đó (thêm biến, xoá step…) là cập nhật tại chỗ: không skeleton, không
// chạy lại hiệu ứng hiện dần, giữ vị trí cuộn — skeleton chỉ dành cho lúc chuyển sang màn/tab/project khác.
let paintedKey = null;
let paintedProject = null;
// Mọi lần chuyển màn đều hiện skeleton NGAY. Skeleton ở lại ít nhất chừng này: tải nhanh (~150ms) mà gỡ ngay
// thì skeleton thành một cú chớp — đúng thứ trước đó bị chê là nháy.
const SKELETON_MIN_MS = 300;
const viewKey = () => `${state.project}|${state.view}|${state.activeTab ?? ''}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function render() {
  if (state.view !== 'projects' && !state.project) state.view = 'projects';
  if (state.project && state.view !== 'projects' && !activeTab()) selectTab(tabForView(state.view));
  const host = $('#view');
  const seq = ++renderSeq;
  const tab = activeTab();
  const [renderFn, bindFn] = VIEWS[state.view];
  const noProject = state.view === 'projects';
  const layoutChange = document.body.classList.contains('no-project') !== noProject || (!noProject && paintedProject !== state.project);
  const inPlace = !layoutChange && paintedKey === viewKey() && host.childElementCount > 0;

  // Chuyển màn: dựng khung mới ngay trong MỘT lần — bố cục, thanh tab, menu (skeleton nếu đổi project) và skeleton màn.
  let skeletonAt = 0;
  if (!inPlace) {
    if (layoutChange) {
      document.body.classList.toggle('no-project', noProject);
      applyNav(noProject ? { current: null, html: '' } : navSkeleton());
    }
    renderTabbar();
    host.classList.remove('view-enter');
    host.innerHTML = skeletonFor(state.view, tab);
    skeletonAt = performance.now();
  } else {
    renderTabbar();
  }

  // Tab test case mở lại sau khi tải trang: bản nháp chưa có, nạp từ server trước khi vẽ.
  if (tab?.kind === 'case' && !tab.draft && tab.casePath) {
    try {
      const tc = await api(`/api/testcases?path=${encodeURIComponent(tab.casePath)}&project=${encodeURIComponent(state.project)}`);
      if (seq !== renderSeq) return;
      tab.draft = { ...tc, __path: tab.casePath };
      tab.saved = snapshot(tab.draft);
      tab.title = tc.name || tab.title;
      state.keyword.draft = tab.draft;
      renderTabbar();
    } catch (err) {
      toast(`Could not open "${tab.title}": ${err.message}`, 'error');
      closeTab(tab.id, { force: true });
      return;
    }
  }

  // Đổi project: menu dựng song song với màn để cả hai thay skeleton cùng lúc.
  const [html, nav] = await Promise.all([
    renderFn().catch((err) => `<div class="card"><div class="empty"><strong>Could not load data</strong>${esc(err.message)}</div></div>`),
    layoutChange ? buildNav() : null,
  ]);
  if (skeletonAt) {
    const shown = performance.now() - skeletonAt;
    if (shown < SKELETON_MIN_MS) await sleep(SKELETON_MIN_MS - shown);
  }
  // Một lần vẽ mới hơn đã bắt đầu trong lúc chờ — bỏ kết quả cũ, không ghi đè màn mới.
  if (seq !== renderSeq) return;
  const scrolled = [];
  if (inPlace) for (let el = host; el; el = el.parentElement) if (el.scrollTop) scrolled.push([el, el.scrollTop]);
  if (nav) applyNav(nav);
  host.innerHTML = html;
  if (inPlace) {
    for (const [el, top] of scrolled) el.scrollTop = top;
  } else {
    // Nội dung thật thay skeleton bằng hiệu ứng hiện dần thay vì bật lên.
    void host.offsetWidth;
    host.classList.add('view-enter');
  }
  paintedKey = viewKey();
  paintedProject = noProject ? null : state.project;
  // Gắn listener cho màn NGAY sau khi có HTML; renderNav gọi API nên để sau — không thì gõ vào ô vừa vẽ bị nuốt,
  // và bấm nút Log/Run ngay khi thấy nó thì không có gì xảy ra.
  // Nút trên thẻ dùng luôn khổ màn hình và chế độ hiển thị đang chọn ở form bên trên,
  // để hai lối vào không cho ra hai kết quả khác nhau một cách khó hiểu.
  $$('#view [data-run]').forEach((btn) =>
    btn.addEventListener('click', () =>
      startRun({ ...JSON.parse(btn.dataset.run), device: state.run.device, headed: state.run.headed }),
    ),
  );
  $$('#view [data-log]').forEach((btn) =>
    btn.addEventListener('click', () => openLog(btn.dataset.log, undefined, btn.dataset.logStatus)),
  );
  await bindFn?.();
  if (!layoutChange) await renderNav();
}

function boot() {
  initI18n();
  initSearch({ api, esc, toast, state, $, icons: ICON, openCase, revealObject });
  // App desktop: 3 nút cửa sổ tự vẽ trên thanh tiêu đề, gọi về tiến trình chính qua preload.
  if (window.desktop?.windowControl) {
    $("#win-controls").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-win]");
      if (btn) window.desktop.windowControl(btn.dataset.win);
    });
    window.desktop.onWindowState(({ maximized }) => document.documentElement.classList.toggle("is-maximized", maximized));
  }
  $('#nav').addEventListener('click', (event) => {
    const item = event.target.closest('.nav-item');
    if (!item) return;
    const view = item.dataset.view;
    // Bấm lại mục Test cases khi tab danh sách đang mở = về gốc (không còn nút "All" trên cây).
    if (view === 'cases' && activeTab()?.kind === 'view' && state.view === 'cases') state.keyword.folder = '';
    // Đánh dấu mục vừa bấm ngay, không đợi menu vẽ lại sau khi dữ liệu về.
    $$('.nav-item').forEach((el) => el.classList.toggle('is-active', el === item));
    openTab(view);
  });
  $('#tabbar').addEventListener('click', (event) => {
    const close = event.target.closest('[data-tab-close]');
    if (close) {
      closeTab(close.dataset.tabClose);
      return;
    }
    const unpin = event.target.closest('[data-tab-unpin]');
    if (unpin) {
      togglePinTab(unpin.dataset.tabUnpin);
      return;
    }
    const tab = event.target.closest('[data-tab]');
    if (tab && tab.dataset.tab !== state.activeTab) activateTab(tab.dataset.tab);
  });
  // Lăn chuột dọc trên dải tab = cuộn ngang (chuột thường không có bánh xe ngang).
  $('#tabbar').addEventListener(
    'wheel',
    (event) => {
      const bar = event.currentTarget;
      if (bar.scrollWidth <= bar.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      bar.scrollLeft += event.deltaY;
    },
    { passive: false },
  );
  // Chuột giữa = đóng tab, như trình duyệt (tab ghim thì không).
  $('#tabbar').addEventListener('auxclick', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab && event.button === 1 && !state.tabs.find((t) => t.id === tab.dataset.tab)?.pinned) closeTab(tab.dataset.tab);
  });
  // Chuột phải trên tab: menu kiểu VS Code (Close / Close Others / … / Pin / Copy Path).
  $('#tabbar').addEventListener('contextmenu', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    event.preventDefault();
    tabContextMenu(tab.dataset.tab, event.clientX, event.clientY);
  });
  // Dấu chấm "chưa lưu" trên tab cập nhật theo từng lần gõ.
  $('#view').addEventListener('input', () => renderTabbar());
  $('#project-switch').addEventListener('click', openProjects);

  // Giao diện sáng/tối/theo máy: một nút ở chân sidebar, icon theo chế độ đang dùng, bấm mở menu 3 lựa chọn.
  // Việc đổi màu do CSS lo — ở đây chỉ đặt data-theme, còn color-scheme trong
  // styles.css kéo theo cả ô select, lịch của input[type=date] và thanh cuộn.
  const THEME_ICONS = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
    dark: '<path d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4z"/>',
    system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  };
  const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' };
  const themeSvg = (choice) => `<svg viewBox="0 0 24 24" aria-hidden="true">${THEME_ICONS[choice]}</svg>`;
  let theme = 'system';
  const applyTheme = (choice) => {
    theme = choice;
    if (choice === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    const btn = $('#theme-btn');
    btn.innerHTML = themeSvg(choice);
    btn.title = `Theme: ${THEME_LABELS[choice]}`;
    btn.setAttribute('aria-label', `Theme: ${THEME_LABELS[choice]}`);
  };

  try {
    const saved = localStorage.getItem('console-theme');
    applyTheme(saved === 'light' || saved === 'dark' ? saved : 'system');
  } catch {
    applyTheme('system'); // trình duyệt chặn lưu trữ thì cứ theo hệ điều hành
  }

  const setTheme = (choice) => {
    applyTheme(choice);
    try {
      // Báo cáo Playwright đọc khoá "theme" cùng origin: ghi theo giá trị nó hiểu để báo cáo cùng chế độ với console.
      if (choice === 'system') {
        localStorage.removeItem('console-theme');
        localStorage.removeItem('theme');
      } else {
        localStorage.setItem('console-theme', choice);
        localStorage.setItem('theme', `${choice}-mode`);
      }
    } catch {
      /* không lưu được thì lần mở sau quay về theo hệ điều hành */
    }
  };
  const langBtn = $('#lang-btn');
  langBtn.textContent = currentLang() === 'vi' ? 'VI' : 'EN';
  langBtn.addEventListener('click', (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    showContextMenu({
      x: rect.left,
      y: rect.top - 110,
      items: [
        { heading: 'Language' },
        ...[
          ['en', 'English'],
          ['vi', 'Tiếng Việt'],
        ].map(([code, label]) => ({
          label,
          checked: currentLang() === code,
          onSelect: () => {
            if (currentLang() !== code) setLang(code);
          },
        })),
      ],
    });
  });

  $('#theme-btn').addEventListener('click', (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Menu mở lên trên nút (nút nằm sát đáy cửa sổ); showContextMenu tự kéo lại cho khỏi tràn mép.
    showContextMenu({
      x: rect.left,
      y: rect.top - 150,
      items: [
        { heading: 'Theme' },
        ...['light', 'dark', 'system'].map((choice) => ({
          label: THEME_LABELS[choice],
          icon: `<span class="theme-menu-ico">${themeSvg(choice)}</span>`,
          checked: theme === choice,
          onSelect: () => setTheme(choice),
        })),
      ],
    });
  });

  // Kéo vạch ở mép phải để đổi bề rộng menu (200–560px); nhớ cho lần sau, nháy đúp = về mặc định.
  const resizer = $('#sidebar-resizer');
  const setSidebarWidth = (w) => {
    if (w === null) document.documentElement.style.removeProperty('--sidebar-user-w');
    else document.documentElement.style.setProperty('--sidebar-user-w', `${w}px`);
    try {
      if (w === null) localStorage.removeItem('sidebar-w');
      else localStorage.setItem('sidebar-w', String(w));
    } catch {
      /* không lưu được thì chỉ giữ trong phiên này */
    }
  };
  resizer.addEventListener('pointerdown', (event) => {
    if (document.body.classList.contains('nav-collapsed')) return;
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    const onMove = (e) => setSidebarWidth(Math.min(560, Math.max(200, Math.round(e.clientX))));
    const onUp = () => {
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
      resizer.removeEventListener('pointercancel', onUp);
    };
    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
    resizer.addEventListener('pointercancel', onUp);
  });
  resizer.addEventListener('dblclick', () => setSidebarWidth(null));

  // Thu gọn menu — nhớ lựa chọn để lần sau mở lại vẫn như cũ.
  const applyCollapsed = (on) => document.body.classList.toggle('nav-collapsed', on);
  try {
    applyCollapsed(localStorage.getItem('nav-collapsed') === '1');
  } catch {
    /* trình duyệt chặn lưu trữ thì cứ để mở rộng */
  }
  $('#nav-toggle').addEventListener('click', () => {
    const on = !document.body.classList.contains('nav-collapsed');
    applyCollapsed(on);
    try {
      localStorage.setItem('nav-collapsed', on ? '1' : '0');
    } catch {
      /* không lưu được thì thôi */
    }
  });

  // Log dài, kéo chuột bôi đen hay hụt — một nút copy để dán thẳng vào chỗ báo lỗi.
  $('#log-copy')?.addEventListener('click', async () => {
    const out = $('#log-output');
    const text = out?.innerText ?? '';
    if (!text.trim()) return toast('The log is still empty', 'info');
    try {
      await navigator.clipboard.writeText(text);
      toast('Log copied', 'ok');
    } catch {
      // Clipboard API bị chặn (console mở qua http từ máy khác): bôi đen sẵn cả khối để người dùng bấm Ctrl+C.
      const range = document.createRange();
      range.selectNodeContents(out);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Cannot access the clipboard — the log is selected, press Ctrl+C', 'error');
    }
  });
  $$('[data-close-log]').forEach((btn) => btn.addEventListener('click', closeLog));
  $('#logbox').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeLog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#logbox').hidden) closeLog();
    if (event.key === 'F4' && event.ctrlKey && state.activeTab) {
      event.preventDefault();
      closeTab(state.activeTab);
    }
    if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      $('#kw-save')?.click();
    }
  });

  // Đọc lúc mở trang và mỗi khi hash đổi (dán link, bấm Back/Forward) để URL là nguồn sự thật:
  // #p/<project>/<màn> · #projects (màn chọn) · #<màn> (project nhớ từ lần trước).
  const knownProject = (code) => state.meta.partners.some((p) => p.code === code);
  const applyHash = () => {
    const hash = location.hash.slice(1);
    // Hash do chính selectTab đặt → đã ở đúng tab, không vẽ lại.
    if (state.project && state.view !== 'projects' && hash === hashFor(activeTab())) return false;
    const parts = hash.split('/');
    if (parts[0] === 'p' && knownProject(parts[1])) {
      if (state.project !== parts[1]) {
        state.project = parts[1];
        saveProject();
        loadTabs();
      }
      if (parts[2] === 'case' && parts[3]) {
        const casePath = decodeURIComponent(parts.slice(3).join('/'));
        selectTab(tabForCase({ casePath, title: casePath.split('/').pop() }));
        return true;
      }
      selectTab(tabForView(VIEWS[parts[2]] && parts[2] !== 'projects' ? parts[2] : 'overview'));
      return true;
    }
    if (hash === 'projects') {
      state.view = 'projects';
      return true;
    }
    const view = VIEWS[hash] ? hash : VIEWS[parts[1]] ? parts[1] : null;
    if (view && state.project) {
      selectTab(tabForView(view));
      return true;
    }
    return false;
  };
  try {
    const saved = localStorage.getItem('project');
    if (knownProject(saved)) {
      state.project = saved;
      loadTabs();
      if (activeTab()) selectTab(activeTab());
    }
  } catch {
    /* không đọc được thì vào màn chọn project */
  }
  applyHash();
  window.addEventListener('hashchange', () => {
    if (applyHash()) render();
  });
}

api('/api/meta')
  .then((meta) => {
    state.meta = meta;
    boot();
    render();
  })
  .catch((err) => {
    $('#view').innerHTML = `<div class="card"><div class="empty"><strong>Could not connect to the console server</strong>${esc(err.message)}</div></div>`;
  });
