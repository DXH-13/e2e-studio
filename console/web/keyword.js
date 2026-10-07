/**
 * Màn "Tạo test case" — tạo test case tự động mà KHÔNG viết dòng code nào.
 *
 * Mô hình mượn của Katalon:
 *
 *   Test Case  →  Test Step (có tên, gộp nhiều keyword)  →  Keyword (+ Test Object + tham số)
 *
 * Hai đường tạo:
 *   · **Ghi thao tác** — một Chrome thật mở ra đã đăng nhập sẵn; thao tác như khách hàng; recorder
 *     gom keyword theo màn hình thành test step, mỗi phần tử đụng tới thành một Test Object dùng
 *     lại được. Dừng ghi là có ngay test case chạy được.
 *   · **Soạn bằng keyword** — thêm test step, đặt tên theo Ý ĐỊNH ("Chọn nơi nhận hàng"), rồi lắp
 *     keyword vào. Không có ô nào bắt gõ selector hay cú pháp.
 *
 * Test case lưu theo **cây thư mục** (`e2e/testcases/**`), không gom theo project — project là
 * thuộc tính của test case. Console đọc ghi thẳng file mà runner dùng, nên sửa tay cũng chạy được.
 *
 * Tránh vòng import: app.js nạp file này rồi gọi `initKeyword()` để trao mấy hàm dùng chung.
 */

import { fileIcon } from './icons.js';
import { keywordIcon } from './kw-icons.js';
import { fromScript, toScript } from './tcscript.js';
import { attachVarInput, highlightVars, initVarHints, loadVarSources } from './varhint.js';

let H = null;

/** app.js gọi đúng một lần lúc khởi động. */
export function initKeyword(helpers) {
  H = helpers;
  initVarHints({ esc: helpers.esc });
}

const KEY = () => H.state.keyword;
/** Project đang mở — mọi API test case / test object gọi theo đây. */
const PROJECT = () => H.state.project;
const pq = () => `project=${encodeURIComponent(PROJECT() ?? '')}`;

let catalog = null;
let recordTimer = null;

const kwById = (id) => catalog?.keywords.find((k) => k.id === id);
const encPath = (path) => encodeURIComponent(path);

// ── Trang ───────────────────────────────────────────────────────────────────

export async function renderKeyword() {
  const k = KEY();
  catalog ??= await H.api('/api/keyword/catalog');
  const body = await renderCasesTab();
  return `
    <div class="page-head page-head-crumbs">
      ${renderCrumbs(k)}
      ${
        !k.draft
          ? k.rec?.running
            ? `<button class="btn btn-record is-recording" id="kw-record" title="Stop recording and save the test case">
                 <span class="rec-stop" aria-hidden="true"></span> Stop
               </button>`
            : recorderButtons()
          : ''
      }
    </div>
    ${body}
  `;
}

/** Breadcrumb nhỏ kiểu VS Code thay cho tiêu đề to: Test cases › thư mục › … › tên bài (bấm thư mục để về danh sách). */
function renderCrumbs(k) {
  const { esc } = H;
  const folder = k.draft ? (k.draft.folder ?? '') : k.folder;
  const parts = folder ? folder.split('/') : [];
  // Ở gốc chưa có gì để lần ngược: hiện tiêu đề lớn như các màn khác.
  if (!parts.length && !k.draft) return `<h1 class="title-with-icon">${fileIcon('case')}Test cases</h1>`;
  const crumb = (label, path) => `<button class="crumb" data-crumb="${esc(path)}" title="${esc(path || 'All test cases')}">${esc(label)}</button>`;
  const items = [crumb('Test cases', '')];
  parts.forEach((p, i) => items.push(crumb(p, parts.slice(0, i + 1).join('/'))));
  if (k.draft) items.push(`<span class="crumb is-current" title="${esc(k.draft.name ?? '')}">${esc(k.draft.name || 'New test case')}</span>`);
  return `<nav class="crumbs" aria-label="Breadcrumb">${fileIcon('case')}${items.join('<span class="crumb-sep" aria-hidden="true">›</span>')}</nav>`;
}

export function bindKeyword() {
  H.$$('[data-crumb]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = KEY();
      k.folder = b.dataset.crumb;
      if (k.folder) k.open[k.folder] = true;
      H.openTab('cases');
    }),
  );
  return bindCasesTab();
}

export async function renderObjects() {
  catalog ??= await H.api('/api/keyword/catalog');
  return `<div class="page-head"><div><h1 class="title-with-icon">${fileIcon('object')}Object Repository</h1></div></div>${await renderObjectsTab()}`;
}

export function bindObjects() {
  return bindObjectsTab();
}

export async function renderKeywords() {
  catalog ??= await H.api('/api/keyword/catalog');
  return `<div class="page-head"><div><h1 class="title-with-icon">${fileIcon('keyword')}Keywords</h1></div></div>${renderKeywordsTab()}`;
}

export function bindKeywords() {
  const q = H.$('#kwc-q');
  if (!q) return;
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      KEY().kwQuery = q.value;
      Promise.resolve(H.render()).then(() => {
        const next = H.$('#kwc-q');
        next?.focus();
        next?.setSelectionRange(next.value.length, next.value.length);
      });
    }, 200);
  });
}

// ── Tab: Test case (cây thư mục + trình soạn) ───────────────────────────────

async function renderCasesTab() {
  const { esc } = H;
  const k = KEY();
  k.list ??= { q: '', partner: '', page: 1, size: 25 };
  const [{ tree, rootFiles, total }, rec] = await Promise.all([H.api(`/api/testcases/tree?${pq()}`), H.api('/api/keyword/record')]);
  k.rec = rec;
  k.tree = tree;
  k.rootFiles = rootFiles;
  k.total = total;

  let list = null;
  if (k.draft) {
    // Kho đối tượng phải có TRƯỚC khi vẽ, vì mỗi keyword là một dropdown chọn đối tượng.
    k.objects = await H.api(`/api/keyword/objects?${pq()}`);
  } else {
    const p = new URLSearchParams({
      project: PROJECT(),
      folder: k.folder,
      q: k.list.q,
      page: String(k.list.page),
      size: String(k.list.size),
    });
    list = await H.api(`/api/testcases/list?${p}`);
    k.list.page = list.page;
    k.listData = list;
  }

  return `
    ${renderRecorderPanel(rec)}

    <section class="kw-main">
      ${k.draft ? renderEditor() : renderCaseList(list)}
    </section>
  `;
}

/** Cây test case — vẽ vào menu bên trái (dưới mục Test cases) ở MỌI màn; app.js gọi khi vẽ menu. */
// Thu gọn / mở cây trên sidebar: mở = về mức 1 (thư mục gốc mở, thư mục con đóng). Nhớ trong localStorage.
const treeCollapsedKey = (kind) => `tree-collapsed:${kind}`;
export const treeChevron = (open) =>
  `<svg class="tree-chevron${open ? ' is-open' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5 15.5 12 9 18.5"/></svg>`;

export const isTreeCollapsed = (kind) => {
  try {
    return localStorage.getItem(treeCollapsedKey(kind)) === '1';
  } catch {
    return false;
  }
};
export function toggleSideTree(kind) {
  const collapsed = !isTreeCollapsed(kind);
  try {
    localStorage.setItem(treeCollapsedKey(kind), collapsed ? '1' : '0');
  } catch {
    /* không lưu được thì chỉ có tác dụng trong phiên */
  }
  if (!collapsed) (kind === 'cases' ? KEY() : OBJ()).open = {};
  H.render();
}

export async function renderSideTree() {
  const k = KEY();
  if (!PROJECT() || isTreeCollapsed('cases')) return '';
  try {
    const { tree, rootFiles, total } = await H.api(`/api/testcases/tree?${pq()}`);
    Object.assign(k, { tree, rootFiles, total });
  } catch {
    if (!k.tree) return '';
  }
  if (!k.tree.length && !k.rootFiles?.length) return '<div class="kw-tree-empty">No test cases yet</div>';
  return renderTree(k.tree, k.rootFiles ?? [], 0);
}

/** Vẽ cây đệ quy: thư mục trước, test case của thư mục đó sau. Mở/đóng nhớ theo state.keyword.open; mặc định chỉ mở cấp gốc. */
function renderTree(nodes, files, depth) {
  const { esc } = H;
  const k = KEY();
  const folders = nodes
    .map((n) => {
      const open = k.open[n.path] ?? false;
      const hasChildren = (n.children ?? []).length > 0 || (n.files ?? []).length > 0;
      const toggle = hasChildren
        ? `<button class="kw-tree-toggle" data-kw-toggle="${esc(n.path)}" aria-label="${open ? 'Collapse' : 'Expand'}">${treeChevron(open)}</button>`
        : '';
      return `
          <div class="kw-tree-node ${k.folder === n.path && !k.draft ? 'is-active' : ''}" data-kw-folder="${esc(n.path)}" style="padding-left:${4 + depth * 10}px">
            ${fileIcon('folder')} <span class="kw-tree-name" title="${esc(n.name)}">${esc(n.name)}</span>
            <span class="kw-tree-count" title="${n.cases} here · ${n.total} in this branch">${n.total || ''}</span>
            ${toggle}
          </div>
          ${open ? renderTree(n.children, n.files ?? [], depth + 1) : ''}`;
    })
    .join('');
  const cases = files
    .map(
      (f) => `
          <div class="kw-tree-node kw-tree-case ${k.draft?.__path === f.path ? 'is-active' : ''} ${k.selected?.has(f.path) ? 'is-selected' : ''} ${f.manual ? 'kw-tree-manual' : ''} ${f.broken ? 'kw-tree-bad' : ''}" tabindex="0"
               data-kw-open="${esc(f.path)}" data-kw-case="${esc(f.path)}" data-kw-case-name="${esc(f.name)}" data-kw-manual="${f.manual ? 1 : 0}"
               draggable="true" data-kw-drag="${esc(f.path)}" style="padding-left:${4 + depth * 10}px" title="${esc(f.name)}">
            ${fileIcon('case')} <span class="kw-tree-name">${esc(f.name)}</span>
          </div>`,
    )
    .join('');
  return folders + cases;
}

function findTreeNode(nodes, path) {
  for (const n of nodes ?? []) {
    if (n.path === path) return n;
    const hit = findTreeNode(n.children, path);
    if (hit) return hit;
  }
  return null;
}

/** Mở cây tới tận thư mục (mọi thư mục cha) để sidebar khớp với thư mục đang xem. */
function openAncestors(openMap, path) {
  const parts = path ? path.split('/') : [];
  parts.forEach((_, i) => {
    openMap[parts.slice(0, i + 1).join('/')] = true;
  });
}

/** Thả lên hàng/nút thư mục: nhận đúng loại dữ liệu kéo, gọi handler với đường dẫn thư mục. */
function bindFolderDrop(el, mime, folder, onDrop) {
  el.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes(mime)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('is-drop-target');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('is-drop-target');
    const data = e.dataTransfer.getData(mime);
    if (data) await onDrop(data, folder);
  });
}

/** Mọi đường dẫn thư mục trong cây — gợi ý cho ô "Thư mục" của trình soạn. */


/** Bảng test case của thư mục đang chọn — có lọc, tìm và phân trang (server làm, đây chỉ vẽ). */
function renderCaseList(list) {
  const { esc } = H;
  const k = KEY();
  const L = k.list;
  const t = list.totals;

  // Kiểu Explorer: thư mục con đứng trước, rồi mới tới test case nằm trực tiếp trong thư mục. Đang tìm thì bỏ hàng thư mục.
  const subfolders = L.q ? [] : k.folder ? (findTreeNode(k.tree, k.folder)?.children ?? []) : (k.tree ?? []);
  const folderRows = subfolders
    .map(
      (n) => `
      <tr class="kw-folder-row ${k.selected?.has(DIR_KEY + n.path) ? 'is-selected' : ''}" data-kw-folder-row="${esc(n.path)}" title="Open folder">
        <td class="col-check"><input type="checkbox" data-kw-check="${esc(DIR_KEY + n.path)}" ${k.selected?.has(DIR_KEY + n.path) ? 'checked' : ''} aria-label="Select folder" /></td>
        <td>${fileIcon('folder')} <strong>${esc(n.name)}</strong></td>
        <td class="cell-dim">${n.total} ${n.total === 1 ? 'test case' : 'test cases'}${n.children?.length ? ` · ${n.children.length} ${n.children.length === 1 ? 'folder' : 'folders'}` : ''}</td>
        <td>
          <div class="row-actions kw-list-actions">
            <button class="btn btn-sm btn-icon btn-danger" data-kw-folder-del="${esc(n.path)}" title="Delete folder" aria-label="Delete folder">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const rows = list.rows
    .map((tc) => {
      return `
      <tr class="${k.selected?.has(tc.path) ? 'is-selected' : ''}" draggable="true" data-kw-drag="${esc(tc.path)}" data-kw-case="${esc(tc.path)}" data-kw-case-name="${esc(tc.name)}"
          data-kw-manual="${tc.broken || !tc.keywords || tc.manualSteps ? 1 : 0}" title="Drag onto a folder to move">
        <td class="col-check"><input type="checkbox" data-kw-check="${esc(tc.path)}" ${k.selected?.has(tc.path) ? 'checked' : ''} aria-label="Select" /></td>
        <td>
          ${fileIcon('case')}<button type="button" class="link-name" data-kw-open="${esc(tc.path)}">${esc(tc.name)}</button>
          ${(tc.tags ?? []).includes('recorded') ? '<span class="chip chip-info">recorded</span>' : ''}
          ${
            tc.manualSteps
              ? `<span class="chip chip-manual" title="Steps without keywords — the test case cannot run until they are automated">${tc.manualSteps}/${tc.steps} steps manual</span>`
              : ''
          }
          ${
            tc.problems?.length
              ? `<span class="chip chip-fail" title="${esc(tc.problems.join('\n'))}">${tc.problems.length} ${tc.problems.length === 1 ? 'issue' : 'issues'}</span>`
              : ''
          }
          <div class="combo-sub mono">${esc(tc.path)}${(tc.tcIds ?? []).length ? ` · ${tc.tcIds.map(esc).join(', ')}` : ''}</div>
        </td>
        <td class="cell-dim">${tc.steps ?? 0} ${tc.steps === 1 ? 'step' : 'steps'} · ${tc.keywords ?? 0} ${tc.keywords === 1 ? 'keyword' : 'keywords'}</td>
        <td>
          <div class="row-actions kw-list-actions">
            <button class="btn btn-sm btn-icon kw-play" data-kw-run="${esc(tc.path)}" ${tc.broken || !tc.keywords || tc.manualSteps ? 'disabled' : ''}
                    title="${!tc.keywords ? 'No keywords yet — open it and add keywords first' : tc.manualSteps ? 'Some steps are still manual — automate them first' : 'Run this test case'}" aria-label="Run test case">${PLAY_ICON}</button>
            <button class="btn btn-sm btn-icon btn-danger" data-kw-del="${esc(tc.path)}"
                    data-kw-name="${esc(tc.name)}" title="Delete test case" aria-label="Delete test case">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const from = list.total ? (list.page - 1) * list.size + 1 : 0;
  const to = Math.min(list.total, list.page * list.size);
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  const emptyTitle = list.total === 0 && t.all > 0 ? 'Nothing matches the filters' : 'No test cases in this folder yet';
  const emptyHint = '';

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <h2>Test cases ${k.folder ? `— ${esc(k.folder)}` : ''}</h2>
          <span class="muted">${subfolders.length ? `${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'} · ` : ''}${t.all || !subfolders.length ? `${t.all} ${t.all === 1 ? 'test case' : 'test cases'}${subfolders.length ? ' here' : ''}` : `${(k.folder ? findTreeNode(k.tree, k.folder)?.total : k.total) ?? 0} test cases in subfolders`}</span>
        </div>
        <div class="toolbar">
          ${headedSwitch()}
          <span class="toolbar-sep" aria-hidden="true"></span>
          <button class="btn" id="kw-new">
            <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New
          </button>
          <button class="btn btn-primary" id="kw-run-all" ${list.automatedPaths?.length ? '' : 'disabled'} title="Run every automated test case in this folder and its subfolders">
            <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>Run all (${list.automatedPaths?.length ?? 0})
          </button>
        </div>
      </div>
      <div class="filters kw-filters">
        <div class="field field-grow">
          <label for="kw-q">Search</label>
          <input id="kw-q" type="search" value="${esc(L.q)}" placeholder="name, TC ID, path" />
        </div>
        <div class="field">
          <label for="kw-size">Per page</label>
          <select id="kw-size">${[10, 25, 50, 100].map((n) => opt(n, String(n), L.size)).join('')}</select>
        </div>
      </div>
      ${bulkBar('cases', `Showing ${from}–${to} of ${list.total}`)}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" id="check-all-cases" aria-label="Select all on this page" /></th>
              <th>Test case</th>
              <th style="width:190px">Size</th><th style="width:90px"></th>
            </tr>
          </thead>
          <tbody>${folderRows}${rows || (folderRows ? '' : `<tr><td colspan="4" class="empty"><strong>${emptyTitle}</strong> ${emptyHint}</td></tr>`)}</tbody>
        </table>
      </div>
      <div class="card-foot kw-pager">
        <span></span>
        <div class="btn-group">
          <button class="btn btn-sm" id="kw-prev" ${list.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
          <span class="kw-page">Page ${list.page} / ${list.pages}</span>
          <button class="btn btn-sm" id="kw-next" ${list.page >= list.pages ? 'disabled' : ''}>Next ›</button>
        </div>
      </div>
    </div>
  `;
}


/** Khối ghi thao tác — hiện danh sách theo đúng cây test step → keyword mà recorder sẽ lưu. */
/** Danh sách test step → keyword đã ghi. Tách riêng để vòng poll cập nhật tại chỗ, không vẽ lại cả khối. */
function renderRecorderSteps(rec) {
  const { esc } = H;
  const line = (c) => {
    const spec = kwById(c.keyword);
    const args = Object.values(c.args ?? {}).filter(Boolean).map((v) => `"${esc(v)}"`).join(', ');
    return `${esc(spec?.label ?? c.keyword)}${c.object ? ` <span class="cell-dim">→ ${esc(c.object)}</span>` : ''}${args ? ` <span class="cell-dim">${args}</span>` : ''}`;
  };
  // Step một keyword chưa đặt tên (recorder ghi mỗi thao tác một step): hiện thẳng dòng keyword, không lồng.
  return (rec.steps ?? [])
    .map((st) =>
      st.keywords.length === 1 && !st.name
        ? `<li>${line(st.keywords[0])}</li>`
        : `<li><strong>${esc(st.name)}</strong><ol class="kw-steps-inner">${st.keywords.map((c) => `<li>${line(c)}</li>`).join('')}</ol></li>`,
    )
    .join('');
}

const NO_ACTIONS_YET = '<li class="cell-dim">No actions yet…</li>';

function renderRecorderPanel(rec) {
  const { esc } = H;
  if (!rec.running && !rec.steps?.length && !rec.error) return '';
  const steps = renderRecorderSteps(rec);

  return `
    <div class="card">
      <div class="card-head">
        <h2>${rec.running ? 'Recording' : rec.error ? 'Recording failed' : 'Recording session finished'} — <span class="muted">${esc(rec.name ?? '')}</span></h2>
        <div class="combo-actions">
          ${
            rec.running
              ? `<span class="chip chip-info chip-run">recording</span>`
              : `${rec.savedPath ? '<button class="btn btn-primary" id="kw-rec-open">Open recorded test case</button>' : ''}
                 <button class="btn btn-ghost" id="kw-rec-clear">Close</button>`
          }
        </div>
      </div>
      <div class="card-body">
        ${rec.error ? `<div class="note note-fail">${esc(rec.error)}</div>` : ''}
        ${rec.error && !steps ? '' : `<ol class="kw-steps" id="kw-rec-steps">${steps || NO_ACTIONS_YET}</ol>`}
      </div>
    </div>
  `;
}

function bindCaseContextMenu(el) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const path = el.dataset.kwCase;
    const set = SEL.cases.set();
    if (set.size > 1 && set.has(path)) {
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: `Delete ${set.size} test cases`, danger: true, onSelect: bulkDeleteCases },
          { label: 'Clear selection', onSelect: () => clearSelection('cases') },
        ],
      });
      return;
    }
    H.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', onSelect: () => openCase(path) },
        { label: 'Run', disabled: el.dataset.kwManual === '1', onSelect: () => runCases([path]) },
        { label: 'Delete', danger: true, onSelect: () => deleteCase(path, el.dataset.kwCaseName) },
      ],
    });
  });
}

// Kiểu dữ liệu riêng 'text/kw-case' để thư mục chỉ sáng lên khi thứ đang kéo đúng là test case.
function bindCaseDrag(el) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/kw-case', el.dataset.kwDrag);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('is-dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}

/** Thao tác trên cây = mở (hoặc chuyển tới) tab danh sách Test cases. */
function goToCases() {
  H.openTab('cases');
}

/**
 * Sự kiện của cây trong menu bên trái — cây luôn hiện dù đang ở màn nào, nên gắn sau mỗi lần vẽ menu
 * (app.js gọi), không phụ thuộc màn Test cases.
 */
export function bindSideTree() {
  const k = KEY();
  H.$$('[data-tree-toggle]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSideTree(b.dataset.treeToggle);
    }),
  );
  bindObjectsSideTree();
  // Chuột phải vào chính mục "Test cases" = tạo thư mục ở gốc (cây trống hay không cũng vậy).
  H.$('.nav-item[data-view="cases"]')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    H.showContextMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'New folder', onSelect: () => createFolder('') }] });
  });
  // Tương tự cho "Object Repository": cây đang thu gọn hay kho còn trống vẫn tạo được thư mục / object ở gốc.
  H.$('.nav-item[data-view="objects"]')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    H.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New folder', onSelect: () => createObjFolder('') },
        { label: 'New test object', onSelect: () => openObjectForm(null, '') },
      ],
    });
  });
  const treeHost = H.$('#nav-tree');
  if (!treeHost) return;
  const $$t = (sel) => H.$$(`#nav-tree ${sel}`);

  $$t('[data-kw-toggle]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      k.open[b.dataset.kwToggle] = !(k.open[b.dataset.kwToggle] ?? false);
      H.render();
    }),
  );
  $$t('[data-kw-folder]').forEach((el) =>
    el.addEventListener('click', () => {
      k.folder = el.dataset.kwFolder;
      k.open[el.dataset.kwFolder] = true;
      goToCases();
    }),
  );
  const visibleCases = () => $$t('[data-kw-case]').map((el) => el.dataset.kwCase);
  $$t('[data-kw-open]').forEach((el) =>
    el.addEventListener('click', (e) => {
      selectByClick('cases', el.dataset.kwOpen, e, visibleCases());
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) openCase(el.dataset.kwOpen);
    }),
  );
  treeHost?.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && SEL.cases.set().size) {
      e.preventDefault();
      bulkDeleteCases();
    }
  });
  $$t('[data-kw-case]').forEach(bindCaseContextMenu);
  $$t('[data-kw-drag]').forEach(bindCaseDrag);
  syncSelection('cases');

  // Thả test case lên thư mục = dời sang đó; thả vào nền cây = về gốc.
  $$t('[data-kw-folder]').forEach((el) => {
    el.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('text/kw-case')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('is-drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('is-drop-target');
      const path = e.dataTransfer.getData('text/kw-case');
      if (path) await moveCaseTo(path, el.dataset.kwFolder);
    });
  });
  const onBackground = (e) => !e.target.closest('[data-kw-folder]');
  treeHost.addEventListener('dragover', (e) => {
    if (!onBackground(e) || ![...e.dataTransfer.types].includes('text/kw-case')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    treeHost.classList.add('is-drop-target');
  });
  treeHost.addEventListener('dragleave', () => treeHost.classList.remove('is-drop-target'));
  treeHost.addEventListener('drop', async (e) => {
    treeHost.classList.remove('is-drop-target');
    if (!onBackground(e)) return;
    e.preventDefault();
    const path = e.dataTransfer.getData('text/kw-case');
    if (path) await moveCaseTo(path, '');
  });

  // Tạo / đổi tên / xoá thư mục nằm trong menu chuột phải của từng nút trên cây; chuột phải vào
  // nền cây (kể cả khi cây trống) thì tạo thư mục ở gốc — không bày nút ngoài.
  $$t('[data-kw-folder]').forEach((el) =>
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const path = el.dataset.kwFolder;
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: `New folder in "${path.split('/').pop()}"`, onSelect: () => createFolder(path) },
          { label: 'Rename', onSelect: () => renameFolder(path) },
          { label: 'Delete', danger: true, onSelect: () => deleteFolder(path) },
        ],
      });
    }),
  );
  treeHost.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    H.showContextMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'New folder', onSelect: () => createFolder('') }] });
  });
}

async function bindCasesTab() {
  const k = KEY();

  H.$$('#view [data-kw-open]').forEach((el) => el.addEventListener('click', () => openCase(el.dataset.kwOpen)));
  H.$$('#view [data-kw-case]').forEach(bindCaseContextMenu);
  H.$$('#view [data-kw-drag]').forEach(bindCaseDrag);
  H.$$('#view [data-kw-folder-row]').forEach((tr) => {
    const path = tr.dataset.kwFolderRow;
    const open = () => {
      k.folder = path;
      openAncestors(k.open, path);
      k.list.page = 1;
      H.render();
    };
    tr.addEventListener('click', (e) => {
      if (!e.target.closest('[data-kw-folder-del], .col-check')) open();
    });
    tr.querySelector('[data-kw-folder-del]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFolder(path);
    });
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const set = SEL.cases.set();
      if (set.size > 1 && set.has(DIR_KEY + path)) {
        H.showContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: `Delete ${set.size} selected`, danger: true, onSelect: bulkDeleteCases },
            { label: 'Clear selection', onSelect: () => clearSelection('cases') },
          ],
        });
        return;
      }
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Open', onSelect: open },
          { label: `New folder in "${path.split('/').pop()}"`, onSelect: () => createFolder(path) },
          { label: 'Rename', onSelect: () => renameFolder(path) },
          { label: 'Delete', danger: true, onSelect: () => deleteFolder(path) },
        ],
      });
    });
    bindFolderDrop(tr, 'text/kw-case', path, moveCaseTo);
  });

  if (k.draft) return bindEditor();
  bindBulk('cases', bulkDeleteCases);

  bindHeadedSwitch();

  H.$('#kw-new')?.addEventListener('click', async () => {
    const form = await H.askForm({
      title: 'New test case',
      okLabel: 'Create',
      fields: [{ name: 'name', label: 'Test case name', value: 'New test case', required: true }],
    });
    if (!form) return;
    const draft = {
      id: '',
      folder: k.folder,
      name: form.name,
      partner: PROJECT(),
      dataApp: 'keyword',
      tcIds: [],
      steps: [],
      __path: null,
    };
    H.openCaseTab({ casePath: null, title: form.name, draft });
  });

  H.$$('[data-kw-run]').forEach((b) => b.addEventListener('click', () => runCases([b.dataset.kwRun])));
  // Không tìm kiếm: chạy theo thư mục (cả nhánh). Đang tìm: chạy đúng các bài khớp.
  H.$('#kw-run-all')?.addEventListener('click', () => (k.list.q.trim() ? runCases(k.listData?.automatedPaths ?? []) : runFolder(k.folder)));

  // Lọc / tìm / phân trang — server lọc, giao diện chỉ đổi tham số rồi vẽ lại.
  const L = k.list;
  const onFilter = (sel, key) =>
    H.$(sel)?.addEventListener('change', (e) => {
      L[key] = key === 'size' ? Number(e.target.value) : e.target.value;
      L.page = 1;
      H.render();
    });
  onFilter('#kw-size', 'size');
  H.$('#kw-prev')?.addEventListener('click', () => {
    L.page = Math.max(1, L.page - 1);
    H.render();
  });
  H.$('#kw-next')?.addEventListener('click', () => {
    L.page += 1;
    H.render();
  });
  const q = H.$('#kw-q');
  if (q) {
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        L.q = q.value;
        L.page = 1;
        Promise.resolve(H.render()).then(() => {
          const next = H.$('#kw-q');
          next?.focus();
          next?.setSelectionRange(next.value.length, next.value.length);
        });
      }, 220);
    });
  }

  H.$$('[data-kw-del]').forEach((b) => b.addEventListener('click', () => deleteCase(b.dataset.kwDel, b.dataset.kwName)));

  // Một nút Record/Stop kiểu play–pause: đang ghi thì bấm là dừng.
  H.$('#kw-record')?.addEventListener('click', async (e) => {
    if (!e.currentTarget.classList.contains('is-recording')) return startRecording();
    await H.api('/api/keyword/record/stop', { method: 'POST' });
    H.toast('Stopping recording session…', 'info');
  });
  bindRecorderBrowser();
  H.$('#kw-rec-open')?.addEventListener('click', async () => {
    const rec = await H.api('/api/keyword/record');
    await H.api('/api/keyword/record', { method: 'DELETE' });
    if (rec.savedPath) await openCase(rec.savedPath);
    else H.render();
  });
  H.$('#kw-rec-clear')?.addEventListener('click', async () => {
    await H.api('/api/keyword/record', { method: 'DELETE' });
    H.render();
  });

  watchRecorder();
}

/** Dời test case sang thư mục `folder` ('' = gốc). Bản nháp đang mở trỏ tới nó thì đi theo. */
/** Mở test case trong tab riêng — đã mở rồi thì chỉ chuyển tới tab đó (giữ nguyên bản nháp đang sửa). */
export async function openCase(path) {
  const existing = H.state.tabs.find((t) => t.kind === 'case' && t.casePath === path);
  if (existing) {
    H.activateTab(existing.id);
    return;
  }
  try {
    const tc = await H.api(`/api/testcases?path=${encPath(path)}&${pq()}`);
    H.openCaseTab({ casePath: path, title: tc.name || path, draft: { ...tc, __path: path } });
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function deleteCase(path, name) {
  const k = KEY();
  const ok = await H.askConfirm({
    title: 'Delete test case',
    message: `Delete test case "${name}"?\nThis cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await H.api(`/api/testcases?path=${encPath(path)}&${pq()}`, { method: 'DELETE' });
  H.toast('Test case deleted', 'ok');
  if (H.state.tabs.some((t) => t.kind === 'case' && t.casePath === path)) H.closeCaseTab(path);
  else H.render();
  void k;
}

async function moveCaseTo(path, folder) {
  const k = KEY();
  const currentFolder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (currentFolder === folder) return;
  try {
    const r = await H.api('/api/testcases/move', { method: 'POST', body: { project: PROJECT(), path, folder } });
    const tab = H.state.tabs.find((t) => t.kind === 'case' && t.casePath === path);
    if (tab?.draft) {
      tab.draft.__path = r.path;
      tab.draft.folder = folder;
    }
    H.retargetCaseTab(path, r.path);
    k.open[folder] = true;
    H.toast(`Moved to ${folder || 'root'}`, 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

// ── Thao tác thư mục (gọi từ menu chuột phải) ──────────────────────────────

async function createFolder(parent) {
  const k = KEY();
  const form = await H.askForm({
    title: 'New folder',
    okLabel: 'Create',
    fields: [{ name: 'name', label: parent ? `Folder name (inside "${parent}")` : 'Folder name', required: true }],
  });
  if (!form) return;
  try {
    const r = await H.api('/api/testcases/folder', {
      method: 'POST',
      body: { project: PROJECT(), path: parent ? `${parent}/${form.name}` : form.name },
    });
    k.folder = r.path;
    H.openTab('cases');
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function renameFolder(path) {
  const k = KEY();
  const current = path.split('/').pop();
  const form = await H.askForm({
    title: 'Rename folder',
    okLabel: 'Rename',
    fields: [{ name: 'name', label: 'New name', value: current, required: true }],
  });
  if (!form || form.name === current) return;
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const renameTo = parent ? `${parent}/${form.name}` : form.name;
  try {
    await H.api('/api/testcases/folder', { method: 'POST', body: { project: PROJECT(), path, renameTo } });
    // Đang đứng trong thư mục (hoặc thư mục con của nó) thì đi theo tên mới.
    if (k.folder === path || k.folder.startsWith(`${path}/`)) k.folder = renameTo + k.folder.slice(path.length);
    H.toast('Folder renamed', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

/** Câu mô tả những gì sẽ mất khi xoá cả nhánh — rỗng thì nói rõ là rỗng. */
function branchLoss(folders, items, noun) {
  const parts = [folders && plural(folders, 'subfolder'), items && plural(items, noun)].filter(Boolean);
  return parts.length ? `together with ${parts.join(' and ')}` : '(empty)';
}

/** Xoá cả nhánh test case trên server rồi dọn trạng thái console: thư mục đang mở, tab của test case trong nhánh, lựa chọn. */
async function removeCaseFolder(path) {
  const k = KEY();
  await H.api(`/api/testcases/folder?path=${encPath(path)}&recursive=1&${pq()}`, { method: 'DELETE' });
  const inside = (p) => p === path || p.startsWith(`${path}/`);
  if (inside(k.folder)) k.folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  for (const t of [...H.state.tabs]) if (t.kind === 'case' && t.casePath && inside(t.casePath)) H.closeCaseTab(t.casePath);
  const set = SEL.cases.set();
  for (const key of [...set]) if (inside(key.startsWith(DIR_KEY) ? key.slice(DIR_KEY.length) : key)) set.delete(key);
}

async function deleteFolder(path) {
  let contents;
  try {
    contents = await H.api(`/api/testcases/folder?path=${encPath(path)}&${pq()}`);
  } catch (err) {
    H.toast(err.message, 'error');
    return;
  }
  const hasItems = contents.folders > 0 || contents.cases > 0;
  const message = `Delete folder "${path}" ${branchLoss(contents.folders, contents.cases, 'test case')}?`;
  const ok = hasItems
    ? await H.askTypedConfirm({
        title: 'Delete folder',
        message: `${message}\nThis cannot be undone.`,
        expected: path.split('/').pop(),
        okLabel: `Delete ${plural(contents.cases, 'test case')}`,
      })
    : await H.askConfirm({ title: 'Delete folder', message, okLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await removeCaseFolder(path);
    H.toast('Folder deleted', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

/**
 * Trong lúc ghi thì hỏi lại server mỗi giây để danh sách chạy theo tay người dùng.
 *
 * Polling chứ không SSE: phiên ghi kéo dài vài phút, một request nhỏ mỗi giây rẻ hơn nhiều
 * so với công sức nuôi thêm một project sự kiện chỉ để phục vụ đúng màn này.
 */
function watchRecorder() {
  clearInterval(recordTimer);
  recordTimer = setInterval(async () => {
    if (H.state.view !== 'cases' || KEY().draft) {
      clearInterval(recordTimer);
      return;
    }
    try {
      const rec = await H.api('/api/keyword/record');
      const shown = H.$$('.kw-steps-inner li').length;
      const total = (rec.steps ?? []).reduce((n, st) => n + st.keywords.length, 0);
      const wasRunning = Boolean(H.$('#kw-record.is-recording'));
      if (wasRunning !== rec.running) {
        H.render();
        return;
      }
      // Chỉ thay danh sách step tại chỗ: vẽ lại cả khối là nạp lại khung noVNC, cắt ngang thao tác
      // đang ghi của người dùng.
      if (total !== shown) {
        const list = H.$('#kw-rec-steps');
        if (list) list.innerHTML = renderRecorderSteps(rec) || NO_ACTIONS_YET;
        else H.render();
      }
    } catch {
      clearInterval(recordTimer);
    }
  }, 1000);
}

// Chrome/Edge nhận biết điều hướng qua DevTools; Firefox recorder đoán theo thời gian nên hiếm khi ghi nhầm navigateToUrl.
const RECORD_BROWSERS = ['chromium', 'msedge', 'firefox'];
const recordBrowser = () => {
  const k = KEY();
  if (k.recBrowser === undefined) {
    try {
      k.recBrowser = localStorage.getItem('kw-rec-browser') || 'chromium';
    } catch {
      k.recBrowser = 'chromium';
    }
  }
  return RECORD_BROWSERS.includes(k.recBrowser) ? k.recBrowser : 'chromium';
};
const browserName = (code) => BROWSERS.find(([c]) => c === code)?.[1] ?? code;

/** Cụm [● Web recorder][logo ▾]: nút chính ghi bằng trình duyệt đang chọn, nút phụ đổi trình duyệt. */
function recorderButtons() {
  const name = browserName(recordBrowser());
  return `
    <span class="rec-group" role="group" aria-label="Web recorder">
      <button class="btn btn-record" id="kw-record" title="Opens ${name} and records your actions into a test case">
        <span class="rec-dot" aria-hidden="true"></span> Web recorder
      </button>
      <button class="btn btn-record rec-browser" id="kw-rec-browser" aria-haspopup="menu" title="Records in ${name} — click to change" aria-label="Recording browser: ${name}">
        ${browserLogo(recordBrowser())}${toolIcon('chevron')}
      </button>
    </span>`;
}

function bindRecorderBrowser() {
  H.$('#kw-rec-browser')?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const current = recordBrowser();
    H.showContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: [
        { heading: 'Record in' },
        ...RECORD_BROWSERS.map((code) => ({
          label: browserName(code),
          icon: browserLogo(code),
          checked: code === current,
          onSelect: () => {
            KEY().recBrowser = code;
            remember('kw-rec-browser', code);
            H.render();
          },
        })),
      ],
    });
  });
}

/** Bấm Web recorder là mở trình duyệt trống ngay, không hỏi gì; tên đặt sẵn, sửa lại trong trình soạn sau. */
async function startRecording() {
  const k = KEY();
  const now = new Date();
  const name = `Recorded test case ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const browser = recordBrowser();
  try {
    await H.api('/api/keyword/record', {
      method: 'POST',
      body: { project: PROJECT(), env: k.env, name, folder: k.folder || 'Recordings', browser },
    });
    H.toast(`${browserName(browser)} opened — type the URL to start recording`, 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

/**
 * Rào ký tự đặc biệt trước khi đưa tên test case vào `--grep`.
 *
 * `--grep` của Playwright là BIỂU THỨC CHÍNH QUY, mà tên do người dùng tự đặt — có dấu ngoặc hay
 * dấu hỏi là lọc trượt sang bài khác, hoặc không khớp bài nào.
 */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);

/**
 * Chạy một hoặc nhiều test case qua đúng đường chạy test sẵn có — có luôn báo cáo, nhật ký và
 * đối chiếu bộ TC như mọi bộ khác. Nhiều test case khác project thì mỗi project một lượt chạy.
 */
// ── Chọn nhiều để xoá hàng loạt — bảng lẫn cây trên sidebar, kiểu VS Code ──────────
// Thư mục chọn chung bộ với test case/object, phân biệt bằng tiền tố (đường dẫn thật không bao giờ bắt đầu bằng "dir:").
const DIR_KEY = 'dir:';
const splitSelection = (set) => {
  const folders = [...set].filter((k) => k.startsWith(DIR_KEY)).map((k) => k.slice(DIR_KEY.length));
  const items = [...set].filter((k) => !k.startsWith(DIR_KEY));
  const underFolder = (p) => folders.some((f) => p.startsWith(`${f}/`));
  // Thư mục nằm trong thư mục khác cũng được chọn thì chỉ cần xoá thư mục cha.
  return { folders: folders.filter((f) => !underFolder(f)), items: items.filter((p) => !underFolder(p)) };
};
const BULK_PHRASE = 'permanently delete';

const SEL = {
  cases: {
    set: () => (KEY().selected ??= new Set()),
    anchor: null,
    nodeSel: '[data-kw-case], [data-kw-folder-row]',
    keyOf: (el) => el.dataset.kwCase ?? `${DIR_KEY}${el.dataset.kwFolderRow}`,
    checkSel: '[data-kw-check]',
  },
  objects: {
    set: () => (OBJ().selected ??= new Set()),
    anchor: null,
    nodeSel: '[data-obj-key], [data-obj-row], [data-obj-folder-row]',
    keyOf: (el) => el.dataset.objKey ?? el.dataset.objRow ?? `${DIR_KEY}${el.dataset.objFolderRow}`,
    checkSel: '[data-obj-check]',
  },
};

/** Đồng bộ trạng thái chọn lên DOM đang có: dòng bảng + nút cây + ô tick + thanh "N selected". */
function syncSelection(kind) {
  const c = SEL[kind];
  const set = c.set();
  H.$$(c.nodeSel).forEach((el) => el.classList.toggle('is-selected', set.has(c.keyOf(el))));
  const boxes = H.$$(c.checkSel);
  boxes.forEach((box) => {
    box.checked = set.has(box.dataset.kwCheck ?? box.dataset.objCheck);
  });
  const bar = H.$(`#bulk-${kind}`);
  if (bar) {
    bar.classList.toggle('has-sel', set.size > 0);
    bar.querySelector('[data-bulk-count]').textContent = `${set.size} selected`;
  }
  const all = H.$(`#check-all-${kind}`);
  if (all) {
    all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
    all.indeterminate = !all.checked && boxes.some((b) => b.checked);
  }
}

/** Click kiểu VS Code: thường = chọn đúng một; Ctrl/⌘ = thêm/bớt; Shift = dải từ mốc trước theo thứ tự đang hiện. */
function selectByClick(kind, key, event, visibleKeys) {
  const c = SEL[kind];
  const set = c.set();
  if (event.shiftKey && c.anchor != null && visibleKeys.includes(c.anchor)) {
    const [a, b] = [visibleKeys.indexOf(c.anchor), visibleKeys.indexOf(key)].sort((x, y) => x - y);
    if (!event.ctrlKey && !event.metaKey) set.clear();
    visibleKeys.slice(a, b + 1).forEach((k) => set.add(k));
  } else if (event.ctrlKey || event.metaKey) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    c.anchor = key;
  } else {
    set.clear();
    set.add(key);
    c.anchor = key;
  }
  syncSelection(kind);
}

function clearSelection(kind) {
  SEL[kind].set().clear();
  syncSelection(kind);
}

/* Dải công cụ cố định giữa bộ lọc và bảng: lúc thường hiện tóm tắt, chọn dòng thì đổi thành đếm + xoá — bảng không bị đẩy. */
const bulkBar = (kind, idle = '', tools = '') => `
      <div class="table-tools" id="bulk-${kind}">
        <span class="tools-idle muted">${idle}</span>
        <span class="tools-sel">
          <span data-bulk-count></span>
          <button type="button" class="btn btn-sm btn-danger" data-bulk-del="${kind}">Delete</button>
          <button type="button" class="btn btn-sm btn-ghost" data-bulk-clear="${kind}">Clear selection</button>
        </span>
        <span class="tools-right">${tools}</span>
      </div>`;

/** Ô tick + thanh xoá hàng loạt của một bảng (gọi sau khi vẽ bảng). */
function bindBulk(kind, onDelete) {
  const c = SEL[kind];
  H.$$(c.checkSel).forEach((box) =>
    box.addEventListener('change', () => {
      const key = box.dataset.kwCheck ?? box.dataset.objCheck;
      if (box.checked) c.set().add(key);
      else c.set().delete(key);
      c.anchor = key;
      syncSelection(kind);
    }),
  );
  H.$(`#check-all-${kind}`)?.addEventListener('change', (e) => {
    H.$$(c.checkSel).forEach((box) => {
      const key = box.dataset.kwCheck ?? box.dataset.objCheck;
      if (e.target.checked) c.set().add(key);
      else c.set().delete(key);
    });
    syncSelection(kind);
  });
  H.$(`[data-bulk-del="${kind}"]`)?.addEventListener('click', onDelete);
  H.$(`[data-bulk-clear="${kind}"]`)?.addEventListener('click', () => clearSelection(kind));
  syncSelection(kind);
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "2 folders (12 test cases inside) and 3 test cases" — đếm cả nội dung thư mục để người dùng biết thật sự mất bao nhiêu. */
function bulkSummary(folders, insideCount, items, noun) {
  const parts = [];
  if (folders.length) parts.push(`${plural(folders.length, 'folder')}${insideCount ? ` (${plural(insideCount, noun)} inside)` : ''}`);
  if (items.length) parts.push(plural(items.length, noun));
  return parts.join(' and ');
}

async function bulkDeleteCases() {
  const set = SEL.cases.set();
  const { folders, items: paths } = splitSelection(set);
  if (!folders.length && !paths.length) return;
  let inside = 0;
  try {
    for (const f of folders) inside += (await H.api(`/api/testcases/folder?path=${encPath(f)}&${pq()}`)).cases;
  } catch (err) {
    H.toast(err.message, 'error');
    return;
  }
  const ok = await H.askTypedConfirm({
    title: 'Delete selected',
    message: `Delete ${bulkSummary(folders, inside, paths, 'test case')}?\nThis cannot be undone.`,
    expected: BULK_PHRASE,
    okLabel: `Delete ${plural(inside + paths.length, 'test case')}`,
  });
  if (!ok) return;
  const failed = [];
  let deletedFolders = 0;
  for (const f of folders) {
    try {
      await removeCaseFolder(f);
      deletedFolders += 1;
    } catch (err) {
      failed.push(`${f}: ${err.message}`);
    }
  }
  let deleted = 0;
  if (paths.length) {
    try {
      const r = await H.api(`/api/testcases/bulk-delete?${pq()}`, { method: 'POST', body: { project: PROJECT(), paths } });
      deleted = r.deleted.length;
      for (const p of r.deleted) if (H.state.tabs.some((t) => t.kind === 'case' && t.casePath === p)) H.closeCaseTab(p);
      r.failed.forEach((f) => failed.push(`${f.path}: ${f.error}`));
    } catch (err) {
      failed.push(err.message);
    }
  }
  set.clear();
  const done = [deletedFolders && plural(deletedFolders, 'folder'), deleted && plural(deleted, 'test case')].filter(Boolean).join(' and ');
  H.toast(failed.length ? `Could not delete ${failed.length}: ${failed[0]}` : `Deleted ${done}`, failed.length ? 'error' : 'ok');
  H.render();
}

async function bulkDeleteObjects() {
  const set = SEL.objects.set();
  const { folders, items: keys } = splitSelection(set);
  if (!folders.length && !keys.length) return;
  let inside = 0;
  const blocked = [];
  try {
    for (const f of folders) {
      const c = await H.api(`/api/keyword/objects/folder?${pq()}&path=${encodeURIComponent(f)}`);
      inside += c.objects;
      if (c.usedBy.length) blocked.push({ path: f, usedBy: c.usedBy });
    }
  } catch (err) {
    H.toast(err.message, 'error');
    return;
  }
  if (blocked.length) {
    await showObjectFoldersInUse(blocked);
    return;
  }
  const ok = await H.askTypedConfirm({
    title: 'Delete selected',
    message: `Delete ${bulkSummary(folders, inside, keys, 'test object')}?\nTest objects still used by a test case are kept.\nThis cannot be undone.`,
    expected: BULK_PHRASE,
    okLabel: `Delete ${plural(inside + keys.length, 'test object')}`,
  });
  if (!ok) return;
  const failed = [];
  for (const f of folders) {
    try {
      await removeObjectFolder(f);
    } catch (err) {
      failed.push(`${f}: ${err.message}`);
    }
  }
  let kept = [];
  let deleted = 0;
  if (keys.length) {
    try {
      const r = await H.api(`/api/keyword/objects/bulk-delete?${pq()}`, { method: 'POST', body: { project: PROJECT(), keys } });
      deleted = r.deleted.length;
      kept = r.failed.map((f) => f.key);
    } catch (err) {
      failed.push(err.message);
    }
  }
  set.clear();
  kept.forEach((k) => set.add(k));
  if (failed.length) H.toast(`Could not delete ${failed.length}: ${failed[0]}`, 'error');
  else if (kept.length) H.toast(`Deleted ${deleted}, kept ${kept.length} still in use (left selected)`, 'error');
  else H.toast(`Deleted ${[folders.length && plural(folders.length, 'folder'), deleted && plural(deleted, 'test object')].filter(Boolean).join(' and ')}`, 'ok');
  H.render();
}

/** Công tắc "Show browser" (chạy --headed) — dùng chung cho bảng test case và trình soạn, nhớ trong localStorage. */
function headedSwitch() {
  return `
    <label class="switch" title="Turn on to watch the browser perform each step (runs one test at a time)">
      <input type="checkbox" id="kw-headed" ${KEY().headed ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-knob"></span></span>
      <span class="switch-text">Show browser</span>
    </label>`;
}

const remember = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* không lưu được thì chỉ có tác dụng trong phiên */
  }
};

function bindHeadedSwitch() {
  H.$('#kw-headed')?.addEventListener('change', (e) => {
    KEY().headed = e.target.checked;
    remember('kw-headed', e.target.checked ? '1' : '0');
  });
  bindRunTarget();
}

/** Gắn sự kiện cho cụm [trình duyệt ▾][👁 Show browser]; vẽ lại cả cụm sau mỗi lần đổi. */
export function bindRunTarget() {
  const k = KEY();
  const repaint = () => {
    const fresh = H.$('#kw-run-group');
    if (!fresh) return;
    fresh.outerHTML = runTargetButton();
    bindRunTarget();
  };
  H.$('#kw-run-target')?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const current = browserOf();
    H.showContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: [
        { heading: 'Run in' },
        ...BROWSERS.map(([code, label]) => ({
          label,
          icon: browserLogo(code),
          checked: code === current,
          onSelect: () => {
            k.browser = code;
            remember('kw-browser', code);
            repaint();
          },
        })),
      ],
    });
  });
  H.$('#kw-run-headed')?.addEventListener('click', () => {
    k.headed = !k.headed;
    remember('kw-headed', k.headed ? '1' : '0');
    repaint();
    H.$('#kw-run-headed')?.focus();
  });
}

export function runTargetButton() {
  const k = KEY();
  const label = BROWSERS.find(([code]) => code === browserOf())?.[1] ?? 'Chrome';
  const headedTitle = k.headed ? 'Browser window is shown while running — click to run in the background' : 'Runs in the background — click to show the browser window';
  return `
      <span class="kw-run-group" id="kw-run-group" role="group" aria-label="Run target">
        <button class="kw-act kw-act-target" id="kw-run-target" aria-haspopup="menu" title="Runs in ${label} — click to change" aria-label="Browser: ${label}">
          ${browserLogo(browserOf())}<span class="kw-act-label">${BROWSERS.map(([, name]) => `<span class="${name === label ? 'is-current' : ''}">${name}</span>`).join('')}</span>${toolIcon('chevron')}
        </button>
        <button class="kw-act kw-act-headed ${k.headed ? 'is-on' : ''}" id="kw-run-headed" aria-pressed="${!!k.headed}" title="${headedTitle}">
          ${toolIcon(k.headed ? 'eye' : 'eyeOff')}<span>Show browser</span>
        </button>
      </span>`;
}

// Trình duyệt chạy test: chromium = nhân của Chrome (máy chưa cài Chrome thật), msedge = Edge cài trên máy.
const BROWSERS = [
  ['chromium', 'Chrome'],
  ['msedge', 'Edge'],
  ['firefox', 'Firefox'],
];
// Màu đặc, không gradient: cùng một id gradient lặp ở nút lẫn menu sẽ trỏ nhầm khi phần tử đầu bị ẩn.
const BROWSER_LOGOS = {
  chromium:
    '<path fill="#EA4335" d="M12 12 2.47 6.5a11 11 0 0 1 19.06 0z"/><path fill="#FBBC04" d="M12 12l9.53-5.5A11 11 0 0 1 12 23z"/><path fill="#34A853" d="M12 12v11A11 11 0 0 1 2.47 6.5z"/><circle cx="12" cy="12" r="5.2" fill="#fff"/><circle cx="12" cy="12" r="4.1" fill="#1A73E8"/>',
  msedge:
    '<path fill="#0C88E0" d="M21.86 17.86q.14 0 .25.12.1.13.1.25t-.11.33l-.32.46-.43.53-.44.5q-.21.25-.38.42l-.22.23q-.58.53-1.34 1.04-.76.51-1.6.91-.86.4-1.74.64t-1.67.24q-.9 0-1.69-.28-.8-.28-1.48-.78-.68-.5-1.22-1.17-.53-.66-.92-1.44-.38-.77-.58-1.6-.2-.83-.2-1.67 0-1 .32-1.96.33-.97.87-1.8.14.95.55 1.77.41.82 1.02 1.5.6.68 1.38 1.21.78.54 1.64.9.86.36 1.77.56.92.2 1.8.2 1.12 0 2.18-.24 1.06-.23 2.06-.72l.2-.1.2-.05z"/><path fill="#0A5AAB" d="M6.36 16.59q0 1.1.27 2.15.27 1.06.78 2.03.51.96 1.24 1.77.74.82 1.66 1.4-1.47-.2-2.8-.74-1.33-.55-2.48-1.37-1.15-.83-2.08-1.9-.92-1.07-1.58-2.33T.36 14.94Q0 13.54 0 12.06q0-.81.32-1.49.31-.68.83-1.23.53-.55 1.2-.96.66-.4 1.35-.66.74-.27 1.5-.39.78-.12 1.55-.12.7 0 1.42.1.72.12 1.4.35.68.23 1.32.57.63.35 1.16.83-.35 0-.7.07-.33.07-.65.23v-.02q-.63.28-1.2.74-.57.46-1.05 1.04-.48.58-.87 1.26-.38.67-.65 1.39-.27.71-.42 1.44-.15.72-.15 1.38z"/><path fill="#3BC56E" d="M11.96.06q1.7 0 3.33.39 1.63.38 3.07 1.15 1.43.77 2.62 1.93 1.18 1.16 1.98 2.7.49.94.76 1.96.28 1 .28 2.08 0 .89-.23 1.7-.24.8-.69 1.48-.45.68-1.1 1.22-.64.53-1.45.88-.54.24-1.11.36-.58.13-1.16.13-.42 0-.97-.03-.54-.03-1.1-.12-.55-.1-1.05-.28-.5-.19-.84-.5-.12-.09-.23-.24-.1-.16-.1-.33 0-.15.16-.35.16-.2.35-.5.2-.28.36-.68.16-.4.16-.95 0-1.06-.4-1.96-.4-.91-1.06-1.64-.66-.74-1.52-1.28-.86-.55-1.79-.89-.84-.3-1.72-.44-.87-.14-1.76-.14-1.55 0-3.06.45T.94 7.55q.71-1.74 1.81-3.13 1.1-1.38 2.53-2.36Q6.7 1.07 8.37.58q1.66-.52 3.59-.52z"/>',
  firefox:
    '<circle cx="12" cy="12" r="11" fill="#FF7139"/><circle cx="13.4" cy="10.6" r="7.4" fill="#7542E5"/><path fill="#FF7139" d="M3.2 8.6C4.4 4.8 8 2.3 12 2.5c-1.9.9-3 2.4-3.2 4 1.6-.9 3.6-1 5.2-.1-2.4.2-4.4 1.8-5 4-.6 2.4.4 4.8 2.5 6.1-4.3-.2-7.8-3.6-8.3-7.9z"/><path fill="#FFA436" d="M4.3 3.6c1-.9 2.2-1.5 3.3-1.8-.7 1.3-.7 2.8.1 4.2-1.4-.4-2.6-1.2-3.4-2.4z"/>',
};
const browserLogo = (code) => `<svg class="brand-logo" viewBox="0 0 24 24" aria-hidden="true">${BROWSER_LOGOS[code] ?? BROWSER_LOGOS.chromium}</svg>`;
export const browserOf = () => {
  const k = KEY();
  if (k.browser === undefined) {
    try {
      k.browser = localStorage.getItem('kw-browser') || 'chromium';
    } catch {
      k.browser = 'chromium';
    }
  }
  return BROWSERS.some(([code]) => code === k.browser) ? k.browser : 'chromium';
};

const ICONS = {
  save: '<path d="M5 3.5h11.2L20 7.3V20a.5.5 0 0 1-.5.5h-14A.5.5 0 0 1 5 20z"/><path d="M8.5 3.5v5h7v-5M8 20.5v-6.5h8v6.5"/>',
  run: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  browser: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18"/><circle cx="6.2" cy="6.8" r=".6"/><circle cx="8.4" cy="6.8" r=".6"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.6 6.8C4 8.5 2 12 2 12s3.5 6 10 6c1.6 0 3-.3 4.3-.9M10 5.2C10.6 5.1 11.3 5 12 5c6.5 0 10 7 10 7s-.9 1.7-2.6 3.4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
  parallel: '<path d="M4 7h12M4 12h16M4 17h9"/><path d="M17 4l3 3-3 3"/>',
};
export const toolIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** Hàng nút trình soạn: cùng khổ, cùng kiểu icon — Save · Run · chạy ở đâu (trình duyệt + hiện cửa sổ) · Close. */
/**
 * Khổ màn hình chạy bài, lưu vào `device` của test case. Mục đầu = tự động: bài ghi chạy khổ lúc ghi, bài tạo tay chạy khổ
 * mặc định của project. Chọn máy cụ thể thì thắng cả khổ lúc ghi; lịch / suite chỉ định khổ vẫn ghi đè tất cả.
 */
function screenControl(tc) {
  const { esc } = H;
  const meta = H.state.meta;
  const partner = meta.partners.find((p) => p.code === PROJECT());
  const fallback = meta.devices.find((d) => d.code === meta.defaults.keyword);
  const groups = [...new Set(meta.devices.map((d) => d.group))];
  // Tên khổ desktop đã kèm số đo ("Desktop 1440×900") — chỉ thêm số đo khi tên chưa có.
  const label = (d) => (d.name.includes(`${d.width}×${d.height}`) ? d.name : `${d.name} — ${d.width}×${d.height}`);
  return `
    <label class="kw-screen" title="Screen size this test case runs at">
      <span>Screen</span>
      <select id="kw-device">
        <option value="" ${tc.device ? '' : 'selected'}>${tc.viewport ? `Recorded · ${tc.viewport.width}×${tc.viewport.height}` : `Default · ${esc(fallback ? label(fallback) : 'suite default')}`}</option>
        ${groups
          .map(
            (g) => `<optgroup label="${esc(g)}">${meta.devices
              .filter((d) => d.group === g)
              .map((d) => `<option value="${esc(d.code)}" ${tc.device === d.code ? 'selected' : ''}>${esc(label(d))}</option>`)
              .join('')}</optgroup>`,
          )
          .join('')}
      </select>
    </label>`;
}

function editorActions() {
  return `
    <div class="kw-actions" role="toolbar" aria-label="Test case actions">
      <button class="kw-act" id="kw-save" title="Save" aria-label="Save">${toolIcon('save')}</button>
      <button class="kw-act kw-act-run" id="kw-save-run" title="Save, then run this test case" aria-label="Save and run">${toolIcon('run')}</button>
      ${runTargetButton()}
      <span class="kw-actions-sep" aria-hidden="true"></span>
      <button class="kw-act" id="kw-cancel" title="Close" aria-label="Close">${toolIcon('close')}</button>
    </div>`;
}

async function runFolder(folder) {
  const k = KEY();
  try {
    const run = await H.api('/api/runs', {
      method: 'POST',
      body: { partner: PROJECT(), app: 'keyword', env: k.env, headed: k.headed, browser: browserOf(), folder },
    });
    H.openLog(run.id, `${run.partnerName} · ${folder || 'All test cases'} · ${run.env}`);
    watchRun(run.id, []);
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function runCases(paths) {
  const k = KEY();
  try {
    const cases = await Promise.all(paths.map((p) => H.api(`/api/testcases?path=${encPath(p)}&${pq()}`)));
    const run = await H.api('/api/runs', {
      method: 'POST',
      body: {
        partner: PROJECT(),
        app: 'keyword',
        env: k.env,
        headed: k.headed,
        browser: browserOf(),
        // Runner đặt tên test = tên test case (kèm mã TC ở đầu) — lọc bằng tên là chạy đúng bài.
        grep: cases.map((tc) => escapeRegex(tc.name)).join('|'),
      },
    });
    // Không mở ngăn log: nó che bảng step đang tô trạng thái trực tiếp — log xem ở Test results.
    H.toast(`Running ${cases.length === 1 ? cases[0].name : `${cases.length} test cases`}…`, 'ok');
    watchRun(run.id, paths, { notify: true });
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

// ── Trình soạn: Test case → Test step → Keyword ─────────────────────────────

const EYE_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.6 6.8C4 8.5 2 12 2 12s3.5 6 10 6c1.6 0 3-.3 4.3-.9M10 5.2C10.6 5.1 11.3 5 12 5c6.5 0 10 7 10 7s-.9 1.7-2.6 3.4"/></svg>';
const eyeButton = (attr, disabled) =>
  `<button class="btn btn-sm btn-icon kw-eye ${disabled ? 'is-off' : ''}" ${attr} title="${disabled ? 'Disabled — click to enable' : 'Enabled — click to disable'}" aria-label="${disabled ? 'Enable' : 'Disable'}">${disabled ? EYE_OFF : EYE_ON}</button>`;
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.9c0-.8.6-1.4 1.3-1.4h2.4c.7 0 1.3.6 1.3 1.4v1.6"/><path d="m6.6 6.5.9 13.4c.05.8.7 1.4 1.5 1.4h6c.8 0 1.45-.6 1.5-1.4l.9-13.4"/><path d="M10.4 10.5v7M13.6 10.5v7"/></svg>';
const CLONE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>';
const MOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.5 4h-7L12 2zm0 20l-3.5-4h7L12 22zM2 12l4-3.5v7L2 12zm20 0l-4 3.5v-7L22 12zM11 6.5h2v11h-2zM6.5 11h11v2h-11z"/></svg>';
const handle = (attr) => `<span class="kw-handle" draggable="true" ${attr} title="Drag to reorder" aria-label="Drag to reorder">${MOVE_ICON}</span>`;

/** Một dòng tóm tắt keyword: nhãn → test object · các tham số theo thứ tự, cách nhau dấu phẩy. */
function callSummary(call) {
  const spec = kwById(call.keyword);
  const args = (spec?.args ?? [])
    .map((a) => call.args?.[a.name])
    .filter((v) => v !== undefined && v !== null && String(v) !== '')
    .map(String);
  return { label: spec?.label ?? call.keyword, object: call.object, args, output: call.output };
}

const PHASES = [
  ['setup', 'Set up'],
  ['main', 'Main execution'],
  ['teardown', 'Tear down'],
];
const phaseOf = (step) => step.phase ?? 'main';
/** Giữ thứ tự Set up → Main → Tear down trong mảng `steps` (sort ổn định, không đảo trong cùng pha). */
const normalizePhases = (tc) => {
  const rank = { setup: 0, main: 1, teardown: 2 };
  // Chỉ thay object khi step còn thiếu `phase`: trạng thái gập/mở nhớ theo chính object step, sao chép lại mỗi lần vẽ
  // là mở bung hết sau mỗi phím gõ.
  tc.steps = PHASES.flatMap(([id]) => tc.steps.filter((st) => phaseOf(st) === id)).map((st) => (st.phase ? st : { ...st, phase: phaseOf(st) }));
  return rank;
};

const editorMode = () => {
  try {
    return localStorage.getItem('kw-editor-mode') === 'script' ? 'script' : 'ui';
  } catch {
    return 'ui';
  }
};
const setEditorMode = (mode) => {
  try {
    localStorage.setItem('kw-editor-mode', mode);
  } catch {
    /* không lưu được thì lần sau về UI */
  }
};

function renderEditor() {
  const { esc } = H;
  const k = KEY();
  const tc = k.draft;
  normalizePhases(tc);
  const mode = editorMode();

  const phaseSections = renderStepTable(tc, k);

  return `
    <div class="card">
      <div class="card-head">
        <div class="kw-editor-title">
          <h2>${tc.__path ? 'Edit test case' : 'New test case'}</h2>
          <div class="btn-group kw-mode" role="tablist" aria-label="Editor mode">
            <button class="btn ${mode === 'ui' ? 'is-active' : ''}" data-kw-mode="ui" role="tab" aria-selected="${mode === 'ui'}">UI</button>
            <button class="btn ${mode === 'script' ? 'is-active' : ''}" data-kw-mode="script" role="tab" aria-selected="${mode === 'script'}"
                    title="One keyword per line: keyword Object arg=&quot;value&quot; -> variable">Script</button>
          </div>
          ${screenControl(tc)}
        </div>
        ${editorActions()}
      </div>
      <div class="card-body">
        <div class="filters">
          <div class="field field-grow">
            <label for="kw-name">Test case name</label>
            <input id="kw-name" type="text" value="${esc(tc.name ?? '')}" />
          </div>
        </div>


        <!-- Pane Variables cùng hàng với bảng step (không cùng hàng với ô tên) để hai khung thẳng mép trên. -->
        <div class="kw-editor-body ${mode === 'script' ? 'is-script' : ''}">
          <div class="kw-editor-main">
          ${
            mode === 'script'
              ? `<div class="kw-script">
                   <textarea id="kw-script" spellcheck="false" wrap="off">${esc(toScript(tc))}</textarea>
                   <div id="kw-script-errors"></div>
                 </div>`
              : phaseSections
          }
          </div>
          ${mode === 'script' ? '' : renderVariables(tc)}
        </div>
      </div>
    </div>
  `;
}

/** Biến cục bộ của test case: bảng Name · Value, sửa tại chỗ; đọc bằng ${var:tên}. */
function renderVariables(tc) {
  const { esc } = H;
  const rows = (tc.variables ?? [])
    .map(
      (v, i) => `
        <tr class="kw-var-row">
          <td><input type="text" class="kw-var-name" data-var-name="${i}" value="${esc(v.name ?? '')}" placeholder="name" spellcheck="false" autocomplete="off" aria-label="Variable name" /></td>
          <td class="kw-var-value-cell">
            <input type="text" data-var-value="${i}" value="${esc(v.value ?? '')}" placeholder="value" autocomplete="off" aria-label="Variable value" />
            <button class="btn btn-sm btn-icon btn-danger kw-var-del" data-var-del="${i}" title="Remove variable" aria-label="Remove variable">${TRASH_ICON}</button>
          </td>
        </tr>`,
    )
    .join('');
  return `
    <aside class="kw-vars-pane" aria-label="Test case variables">
      <header class="kw-vars-head">
        <h3>Variables</h3>
        <button class="btn btn-sm btn-ghost" data-var-add title="Add a variable local to this test case">+ Add</button>
      </header>
      ${
        rows
          ? `<table class="kw-vars-table">
               <thead><tr><th>Name</th><th>Value</th></tr></thead>
               <tbody>${rows}</tbody>
             </table>`
          : '<div class="kw-vars-empty">No variables yet</div>'
      }
    </aside>`;
}

/**
 * Số dòng trong bảng — editor và khung lỗi dùng chung ba khoá: `si-s` (dòng test step), `si-ci` (keyword bên trong),
 * `si-m` (step thủ công chưa có keyword).
 *
 * Test step đánh số 1, 2, 3 và **đếm lại từ 1 ở từng pha** — dòng nhóm phía trên đã nói rõ đang ở pha nào;
 * keyword bên trong lấy số của step làm tiền tố: 1.1, 1.2…
 */
function stepNumbers(tc) {
  const no = new Map();
  const counters = { setup: 0, main: 0, teardown: 0 };
  tc.steps.forEach((step, si) => {
    const n = (counters[phaseOf(step)] += 1);
    if (!step.keywords?.length) return no.set(`${si}-m`, String(n));
    if (step.keywords.length === 1) return no.set(`${si}-0`, String(n));
    no.set(`${si}-s`, String(n));
    step.keywords.forEach((_c, ci) => no.set(`${si}-${ci}`, `${n}.${ci + 1}`));
  });
  return no;
}

/**
 * Bảng step kiểu akaAT (theo wiki 2.6.1): MỘT bảng, ba dòng nhóm Set Up / Main Execution / Tear Down
 * gập được, cột Step · Test object · Data input · Output.
 *
 * Bảng là CÂY HAI TẦNG đúng như file .tc: mỗi **test step** là một dòng mang số (1, 2, 3… đếm lại ở từng
 * pha) và **tên sửa tại chỗ**, gập/mở để hiện các **keyword** bên trong (1.1, 1.2…). Gộp nhiều keyword vào một step =
 * kéo dòng keyword thả lên dòng step, hoặc "+ Keyword" ngay trên dòng step. Step chỉ có một keyword hiện thành một dòng.
 */
function renderStepTable(tc, k) {
  k.collapsed ??= new Set();
  // Nhớ theo chính object step (normalizePhases giữ nguyên object) — chỉ số si đổi mỗi khi xoá/chuyển pha.
  k.stepsClosed ??= new Set();
  const numbers = stepNumbers(tc);
  const groups = PHASES.map(([id, label]) => {
    const collapsed = k.collapsed.has(id);
    let n = 0;
    const rows = tc.steps.flatMap((step, si) => {
      if (phaseOf(step) !== id) return [];
      n += 1;
      if (!step.keywords?.length) return [renderManualRow(numbers.get(`${si}-m`), si, step, collapsed)];
      if (step.keywords.length === 1) return [renderStepRow(numbers.get(`${si}-0`), si, 0, step.keywords[0], step, collapsed, true)];
      const closed = k.stepsClosed.has(step);
      return [
        renderStepHeadRow(numbers.get(`${si}-s`), si, step, closed, collapsed),
        ...step.keywords.map((call, ci) => renderStepRow(numbers.get(`${si}-${ci}`), si, ci, call, step, collapsed || closed)),
      ];
    });
    return `
      <tr class="kw-group kw-grp ${collapsed ? 'is-collapsed' : ''}" data-kw-group="${id}" data-kw-drop-phase="${id}">
        <td class="kw-cell-handle"></td>
        <td colspan="4"><span class="kw-grp-chev" aria-hidden="true"></span><strong>${label}</strong><span class="kw-grp-count">${n} ${n === 1 ? 'step' : 'steps'}</span></td>
        <td class="kw-cell-actions"><button type="button" class="btn btn-sm btn-ghost kw-grp-add" data-step-add="${id}" title="Add a step to ${label}">+ Add step</button></td>
      </tr>
      ${rows.join('') || `<tr class="kw-grp-empty ${collapsed ? 'is-folded' : ''}"><td></td><td colspan="5">No steps yet</td></tr>`}`;
  });
  return `
    <div class="table-wrap kw-tbl-wrap">
      <table class="kw-tbl">
        <thead>
          <tr>
            <th class="kw-cell-handle"></th>
            <th style="width:30%">Step</th>
            <th style="width:16%">Test object</th>
            <th>Data input</th>
            <th style="width:10%">Output</th>
            <th class="kw-cell-actions"></th>
          </tr>
        </thead>
        <tbody>${groups.join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Dòng của một TEST STEP: số thứ tự · tên sửa tại chỗ · số keyword bên trong · thao tác cho cả step.
 *
 * Tên do recorder đặt theo màn hình ("Trên màn Đặt mua"); người dùng sửa thành ý định thật ("Nhập thông tin người
 * nhận") — tên này đi thẳng vào báo cáo Playwright (`[Main execution] Step 2: <tên>`) nên phải sửa được ngay trong bảng.
 */
/** Bề ngang ô tên bám theo chữ bên trong: phần trống còn lại của dòng phải bấm được để gập/mở. */
const nameSize = (name) => Math.max(10, Math.min(48, (String(name ?? '').length || 18) + 2));

function renderStepHeadRow(no, si, step, closed, folded) {
  const { esc } = H;
  const count = step.keywords.length;
  return `
    <tr class="kw-row kw-step-head ${closed ? 'is-closed' : ''} ${folded ? 'is-folded' : ''} ${step.disabled ? 'combo-off' : ''}"
        data-step-head="${si}" data-kw-drop-step="${si}" title="Click to fold this test step — drag a keyword onto it to move the keyword into this step">
      <td class="kw-cell-handle"><span class="kw-step-chev" aria-hidden="true"></span></td>
      <td class="kw-cell-step" colspan="3">
        <div class="kw-step-title">
          <span class="kw-run-ico" data-run-ico="${si}"></span><span class="kw-row-no">${no}</span>
          <input type="text" class="kw-step-name" data-step-name="${si}" value="${esc(step.name ?? '')}" size="${nameSize(step.name)}"
                 placeholder="Untitled test step" spellcheck="false" autocomplete="off"
                 aria-label="Test step name" title="Name of this test step — it shows up in the run report" />
          <span class="kw-step-count">${count} ${count === 1 ? 'keyword' : 'keywords'}</span>
        </div>
      </td>
      <td class="kw-cell-actions" colspan="2">
        <span class="kw-drop-hint" aria-hidden="true">⊕ Add to step</span>
        <div class="row-actions kw-row-actions">
          <button class="btn btn-sm btn-ghost kw-step-addkw" data-step-addkw="${si}" title="Add a keyword to this test step">+ Keyword</button>
          ${eyeButton(`data-step-toggle="${si}"`, step.disabled)}
          <button class="btn btn-sm btn-icon" data-step-clone="${si}" title="Clone test step" aria-label="Clone test step">${CLONE_ICON}</button>
          <button class="btn btn-sm btn-icon btn-danger" data-step-del="${si}" title="Delete test step" aria-label="Delete test step">${TRASH_ICON}</button>
        </div>
      </td>
    </tr>`;
}

/** Step nhập từ Excel chưa gắn keyword: vẫn là một dòng để người dùng thấy và bấm vào chọn keyword cho nó. */
function renderManualRow(no, si, step, folded) {
  const { esc } = H;
  return `
    <tr class="kw-row kw-row-manual ${folded ? 'is-folded' : ''} ${step.disabled ? 'combo-off' : ''}" data-manual-step="${si}" title="Manual step — click to pick the keyword that performs it">
      <td class="kw-cell-handle"></td>
      <td class="kw-cell-step" colspan="4"><span class="kw-run-ico"></span><span class="kw-row-no">${no}</span><span class="kw-manual-name">${esc(step.name || '(unnamed step)')}</span><span class="chip chip-manual">manual · pick a keyword</span></td>
      <td class="kw-cell-actions">
        <div class="row-actions kw-row-actions">
          ${eyeButton(`data-step-toggle="${si}"`, step.disabled)}
          <button class="btn btn-sm btn-icon" data-step-clone="${si}" title="Clone step" aria-label="Clone step">${CLONE_ICON}</button>
          <button class="btn btn-sm btn-icon btn-danger" data-step-del="${si}" title="Delete step" aria-label="Delete step">${TRASH_ICON}</button>
        </div>
      </td>
    </tr>`;
}

function renderStepRow(no, si, ci, call, step, folded, single = false) {
  const { esc } = H;
  const spec = kwById(call.keyword);
  const ref = `${si}-${ci}`;
  // Step một keyword không có dòng cha: ô tên trên dòng này là tên step.
  const name = single ? step.name : call.name;
  const nameAttr = single ? `data-step-name="${si}"` : `data-call-name="${ref}"`;
  const args = (spec?.args ?? [])
    .map((a) => [a.name, call.args?.[a.name]])
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '');
  return `
    <tr class="kw-row ${single ? '' : 'kw-row-child'} ${folded ? 'is-folded' : ''} ${call.disabled || step.disabled ? 'combo-off' : ''}" data-kw-drop-call="${ref}" data-call-edit="${ref}" ${single ? 'data-single' : ''} title="Click to edit this keyword">
      <td class="kw-cell-handle">${handle(`data-drag-call="${ref}"`)}</td>
      <td class="kw-cell-step"><div class="kw-step-title"><span class="kw-run-ico" data-run-ico="${single ? si : ref}"></span><span class="kw-row-no">${no}</span>${keywordIcon(spec)}<input type="text" class="kw-step-name kw-call-name" ${nameAttr} value="${esc(name ?? '')}" size="${nameSize(name || spec?.label || call.keyword)}"
             placeholder="${esc(spec?.label ?? call.keyword)}" spellcheck="false" autocomplete="off" data-no-i18n
             aria-label="Step name" title="Name of this step — empty = keyword name" /></div></td>
      <td>${call.object ? `<span class="kw-obj">${esc(call.object)}</span>` : ''}</td>
      <td class="kw-cell-input" title="${esc(args.map(([name, v]) => `${name} = ${v}`).join(', '))}">${args.map(([name, v]) => `<span class="kw-arg"><span class="kw-arg-name">${esc(name)}</span> = ${highlightVars(v)}</span>`).join('')}</td>
      <td>${call.output ? `<span class="kw-output" title="Read later as \${var:${esc(call.output)}}">${esc(call.output)}</span>` : ''}</td>
      <td class="kw-cell-actions">
        ${single ? '<span class="kw-drop-hint" aria-hidden="true">⊕ Merge into step</span>' : ''}
        <div class="row-actions kw-row-actions">
          ${single ? eyeButton(`data-step-toggle="${si}"`, step.disabled) : eyeButton(`data-call-toggle="${ref}"`, call.disabled)}
          <button class="btn btn-sm btn-icon" ${single ? `data-step-clone="${si}"` : `data-call-clone="${ref}"`} title="Clone step" aria-label="Clone step">${CLONE_ICON}</button>
          <button class="btn btn-sm btn-icon btn-danger" ${single ? `data-step-del="${si}"` : `data-call-del="${ref}"`} title="Delete step" aria-label="Delete step">${TRASH_ICON}</button>
        </div>
      </td>
    </tr>`;
}

function renderArgInput(ref, arg, value) {
  const { esc } = H;
  const id = `kw-arg-${ref}-${arg.name}`;
  if (arg.type === 'select') {
    return `<div class="field">
      <label for="${id}">${esc(arg.label)}</label>
      <select id="${id}" data-call-arg="${ref}" data-arg-name="${esc(arg.name)}">
        ${arg.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
    </div>`;
  }
  return `<div class="field">
    <label for="${id}">${esc(arg.label)}${arg.required ? ' *' : ''}</label>
    <input id="${id}" type="${arg.type === 'number' ? 'number' : 'text'}"
           data-call-arg="${ref}" data-arg-name="${esc(arg.name)}"
           value="${esc(value)}" placeholder="${esc(arg.placeholder ?? '')}" />
  </div>`;
}

/**
 * Bảng nổi sửa MỘT keyword: chọn keyword → (test object) → tham số → ghi chú. Sửa trên bản sao,
 * bấm Save mới ghi vào bản nháp; Cancel với keyword vừa thêm thì bỏ luôn dòng đó.
 */
function openCallEditor(si, ci, { isNew = false, keepStep = false } = {}) {
  const { esc } = H;
  const k = KEY();
  const step = k.draft.steps[si];
  const repo = k.objects ?? { objects: {} };
  const draft = JSON.parse(JSON.stringify(step.keywords[ci]));
  delete draft.note;
  let pickerOpened = false;
  // Nguồn gợi ý ${…}: nạp một lần khi mở form; ô tham số dùng ngay cả khi chưa nạp xong.
  let varSources = k.varSources ?? [];
  loadVarSources({ api: H.api, project: PROJECT(), dataApp: k.draft.dataApp ?? 'keyword', env: k.env, draft: k.draft }).then((list) => {
    varSources = list;
    k.varSources = list;
  });

  const html = () => {
    const spec = kwById(draft.keyword);
    const needsObject = spec?.object === true || spec?.object === 'optional';
    return `
      <div class="field">
        <label>Keyword</label>
        <div class="obj-picker kw-picker" data-kw-picker></div>
        <span class="field-hint">${esc(spec?.summary ?? '')}${spec?.detail ? ` ${esc(spec.detail)}` : ''}</span>
      </div>
      ${
        needsObject
          ? `<div class="field">
               <label for="kwp-object">Test object${spec.object === true ? ' *' : ''}</label>
               <div class="obj-picker" data-obj-picker data-optional="${spec.object === true ? '0' : '1'}"></div>
             </div>`
          : ''
      }
      ${(spec?.args ?? []).map((a) => renderArgInput('p', a, draft.args?.[a.name] ?? '')).join('')}
      ${
        spec?.returns
          ? `<div class="field">
               <label for="kwp-output">Output variable</label>
               <input id="kwp-output" type="text" value="${esc(draft.output ?? '')}" placeholder="maDon" autocomplete="off" />
               <span class="field-hint">Later keywords read it as \${var:name}</span>
             </div>`
          : ''
      }
      <div class="modal-foot" style="padding:12px 0 0">
        <button type="button" class="btn btn-ghost" id="kwp-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="kwp-save">Save keyword</button>
      </div>`;
  };

  const mount = () => {
    mountKeywordPicker(H.$('[data-kw-picker]'), {
      value: draft.keyword,
      // Step mới: mở sẵn danh sách để gõ tìm luôn — chỉ lần vẽ đầu, không mở lại sau khi đã chọn.
      autoOpen: isNew && !pickerOpened,
      onChange: (id) => {
        if (id === draft.keyword) return;
        draft.keyword = id;
        draft.args = {};
        draft.object = undefined;
        if (!kwById(draft.keyword)?.returns) draft.output = undefined;
        open(); // keyword khác = bộ tham số khác → vẽ lại bảng
      },
    });
    pickerOpened = true;
    const pickerHost = H.$('[data-obj-picker]');
    if (pickerHost) {
      mountObjectPicker(pickerHost, {
        value: draft.object,
        optional: pickerHost.dataset.optional === '1',
        objects: repo.objects,
        onChange: (key) => {
          draft.object = key || undefined;
        },
      });
    }
    H.$$('[data-call-arg="p"]').forEach((input) => {
      input.addEventListener('input', () => {
        draft.args ??= {};
        draft.args[input.dataset.argName] = input.value;
      });
      attachVarInput(input, () => varSources);
    });
    H.$('#kwp-output')?.addEventListener('input', (e) => {
      draft.output = e.target.value.trim() || undefined;
    });
    H.$('#kwp-save')?.addEventListener('click', () => {
      if (draft.args) for (const [name, v] of Object.entries(draft.args)) if (v === '') delete draft.args[name];
      step.keywords[ci] = draft;
      // Step mới (một keyword) lấy tên theo keyword để báo cáo có chữ; bài ghi từ recorder giữ tên màn hình.
      if (!step.name) step.name = kwById(draft.keyword)?.label ?? draft.keyword;
      H.closePanel();
      H.render();
    });
    H.$('#kwp-cancel')?.addEventListener('click', () => {
      if (isNew) {
        step.keywords.splice(ci, 1);
        if (!step.keywords.length && !keepStep) k.draft.steps.splice(si, 1);
      }
      H.closePanel();
      H.render();
    });
  };
  const open = () => H.showPanel({ title: isNew ? 'New step' : `Edit step${step.name ? ` — ${step.name}` : ''}`, html: html(), className: 'modal-kw', onMount: mount });
  open();
}

function bindEditor() {
  const k = KEY();
  const tc = k.draft;
  const rerender = () => H.render();
  const at = (ref) => {
    const [si, ci] = ref.split('-').map(Number);
    return { step: tc.steps[si], si, ci, call: tc.steps[si].keywords[ci] };
  };

  const bindText = (sel, set) => H.$(sel)?.addEventListener('input', (e) => set(e.target.value));
  bindText('#kw-name', (v) => {
    tc.name = v;
    H.updateActiveCaseTab({ title: v });
  });

  // Biến cục bộ: sửa tại chỗ, không vẽ lại từng phím; thêm/xoá thì vẽ lại.
  k.varSources ??= [];
  loadVarSources({ api: H.api, project: PROJECT(), dataApp: tc.dataApp ?? 'keyword', env: k.env, draft: tc }).then((list) => {
    k.varSources = list;
  });
  // Thêm/xoá biến chỉ vẽ lại pane Variables — vẽ lại cả màn làm bảng step và menu nháy theo.
  const repaintVars = () => {
    const pane = H.$('.kw-vars-pane');
    if (!pane) return rerender();
    pane.outerHTML = renderVariables(tc);
    bindVars();
    H.updateActiveCaseTab({});
  };
  const bindVar = (attr, key) =>
    H.$$(`[${attr}]`).forEach((input) =>
      input.addEventListener('input', () => {
        const v = tc.variables[Number(input.getAttribute(attr))];
        v[key] = key === 'name' ? input.value.trim() : input.value;
        H.updateActiveCaseTab({});
      }),
    );
  const bindVars = () => {
    H.$('[data-var-add]')?.addEventListener('click', () => {
      (tc.variables ??= []).push({ name: '', value: '' });
      repaintVars();
      H.$$('[data-var-name]').at(-1)?.focus();
    });
    H.$$('[data-var-del]').forEach((b) =>
      b.addEventListener('click', () => {
        tc.variables.splice(Number(b.dataset.varDel), 1);
        if (!tc.variables.length) delete tc.variables;
        repaintVars();
      }),
    );
    bindVar('data-var-name', 'name');
    bindVar('data-var-value', 'value');
    H.$$('[data-var-value]').forEach((input) => attachVarInput(input, () => k.varSources));
  };
  bindVars();

  // Script view: gõ tới đâu đọc lại tới đó — đọc được thì thay luôn steps của bản nháp, lỗi thì chỉ ra dòng.
  k.scriptErrors = [];
  const scriptBox = H.$('#kw-script');
  const showScriptErrors = () => {
    const host = H.$('#kw-script-errors');
    if (!host) return;
    host.innerHTML = k.scriptErrors.length
      ? `<div class="note note-fail"><strong>${k.scriptErrors.length} ${k.scriptErrors.length === 1 ? 'line' : 'lines'} cannot be read:</strong>
           <ul>${k.scriptErrors.map((e) => `<li>Line ${e.line}: ${H.esc(e.message)}</li>`).join('')}</ul></div>`
      : '';
  };
  const applyScript = () => {
    const { steps, variables, errors } = fromScript(scriptBox.value);
    k.scriptErrors = errors;
    if (!errors.length) {
      tc.steps = steps;
      if (variables.length) tc.variables = variables;
      else delete tc.variables;
    }
    showScriptErrors();
  };
  scriptBox?.addEventListener('input', applyScript);
  scriptBox?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = scriptBox;
    scriptBox.value = `${value.slice(0, a)}  ${value.slice(b)}`;
    scriptBox.selectionStart = scriptBox.selectionEnd = a + 2;
    applyScript();
  });
  H.$('#kw-device')?.addEventListener('change', (e) => {
    if (e.target.value) tc.device = e.target.value;
    else delete tc.device;
    H.updateActiveCaseTab({});
  });
  H.$$('[data-kw-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.kwMode === editorMode()) return;
      if (editorMode() === 'script' && k.scriptErrors.length) {
        H.toast('Fix the script lines first', 'error');
        return;
      }
      setEditorMode(b.dataset.kwMode);
      rerender();
    }),
  );

  // Bỏ step rỗng ngay khi keyword cuối của nó bị xoá/dời đi — step không keyword làm cả bài thành "manual".
  const dropEmptyStep = (step) => {
    if (step.keywords?.length) return;
    const i = tc.steps.indexOf(step);
    if (i >= 0) tc.steps.splice(i, 1);
  };

  // Gập/mở chỉ bật-tắt class ngay trên DOM: gọi H.render() cho một cú gập là vẽ lại cả trang — màn hình nháy một cái,
  // mất luôn vị trí cuộn và ô đang gõ dở.
  const stepOf = (tr) => (tr.dataset.callEdit ? tc.steps[Number(tr.dataset.callEdit.split('-')[0])] : null);
  const foldRow = (tr, phaseCollapsed) => {
    const step = stepOf(tr);
    tr.classList.toggle('is-folded', phaseCollapsed || (step ? k.stepsClosed.has(step) : false));
  };

  // Nhóm pha: bấm dòng nhóm = gập/mở; "+ Add step" = step mới (một keyword) mở ngay form để chọn keyword.
  H.$$('[data-kw-group]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = row.dataset.kwGroup;
      const collapsed = !k.collapsed.has(id);
      if (collapsed) k.collapsed.add(id);
      else k.collapsed.delete(id);
      row.classList.toggle('is-collapsed', collapsed);
      // Mở lại pha thì dòng keyword của step đang gập vẫn phải ẩn — foldRow tính lại theo cả hai mức.
      for (let n = row.nextElementSibling; n && !n.classList.contains('kw-grp'); n = n.nextElementSibling) foldRow(n, collapsed);
    }),
  );
  H.$$('[data-step-add]').forEach((b) =>
    b.addEventListener('click', () => {
      const phase = b.dataset.stepAdd;
      k.collapsed.delete(phase);
      tc.steps.push({ name: '', phase, keywords: [{ keyword: 'click' }] });
      normalizePhases(tc);
      const si = tc.steps.map((st, i) => [st, i]).filter(([st]) => phaseOf(st) === phase).at(-1)[1];
      openCallEditor(si, 0, { isNew: true });
    }),
  );

  // Step thủ công (Excel): bấm dòng = chọn keyword cho nó (giữ tên step); mắt/thùng rác tác động lên cả step.
  H.$$('[data-manual-step]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const si = Number(row.dataset.manualStep);
      (tc.steps[si].keywords ??= []).push({ keyword: 'click' });
      openCallEditor(si, 0, { isNew: true, keepStep: true });
    }),
  );
  // Tên test step: sửa tại chỗ như ô tên test case — vẽ lại mỗi phím thì con trỏ nhảy về đầu ô.
  H.$$('[data-step-name]').forEach((input) =>
    input.addEventListener('input', () => {
      tc.steps[Number(input.dataset.stepName)].name = input.value;
      input.size = nameSize(input.value);
      H.updateActiveCaseTab({});
    }),
  );
  H.$$('[data-call-name]').forEach((input) =>
    input.addEventListener('input', () => {
      at(input.dataset.callName).call.name = input.value;
      input.size = nameSize(input.value || input.placeholder);
      H.updateActiveCaseTab({});
    }),
  );
  // Bấm dòng step = gập/mở (trừ khi đang bấm vào ô tên hay nút thao tác).
  H.$$('[data-step-head]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('button, input, .kw-handle')) return;
      const step = tc.steps[Number(row.dataset.stepHead)];
      const closed = !k.stepsClosed.has(step);
      if (closed) k.stepsClosed.add(step);
      else k.stepsClosed.delete(step);
      row.classList.toggle('is-closed', closed);
      for (let n = row.nextElementSibling; n?.classList.contains('kw-row-child'); n = n.nextElementSibling) n.classList.toggle('is-folded', closed);
    }),
  );
  const addKeyword = (si) => {
    const step = tc.steps[si];
    k.stepsClosed.delete(step);
    step.keywords.push({ keyword: 'click' });
    openCallEditor(si, step.keywords.length - 1, { isNew: true, keepStep: true });
  };
  H.$$('[data-step-addkw]').forEach((b) => b.addEventListener('click', () => addKeyword(Number(b.dataset.stepAddkw))));
  H.$$('[data-step-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const st = tc.steps[Number(b.dataset.stepToggle)];
      st.disabled = !st.disabled;
      rerender();
    }),
  );
  H.$$('[data-step-del]').forEach((b) =>
    b.addEventListener('click', () => {
      tc.steps.splice(Number(b.dataset.stepDel), 1);
      rerender();
    }),
  );

  // Dòng step: bấm = sửa trong bảng nổi; mắt = bật/tắt; thùng rác = xoá.
  H.$$('[data-call-edit]').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR' && e.target.closest('button, input, .kw-handle')) return;
      const { si, ci } = at(el.dataset.callEdit);
      openCallEditor(si, ci);
    }),
  );
  H.$$('[data-call-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const { call } = at(b.dataset.callToggle);
      call.disabled = !call.disabled;
      rerender();
    }),
  );
  H.$$('[data-call-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const { step, ci } = at(b.dataset.callDel);
      step.keywords.splice(ci, 1);
      dropEmptyStep(step);
      rerender();
    }),
  );

  // Clone: bản sao nằm ngay dưới bản gốc; "Clone to <pha>" đặt bản sao ở cuối pha đó (một test step mới cùng tên).
  const lastIndexOfPhase = (phase) => tc.steps.findLastIndex((st) => phaseOf(st) === phase);
  const cloneCall = (ref, phase) => {
    const { step, si, ci, call } = at(ref);
    const copy = structuredClone(call);
    if (!phase || phase === phaseOf(step)) {
      step.keywords.splice(ci + 1, 0, copy);
      k.flashRow = `[data-call-edit="${si}-${ci + 1}"]`;
    } else {
      tc.steps.push({ name: step.name ?? '', phase, keywords: [copy] });
      normalizePhases(tc);
      k.collapsed.delete(phase);
      k.flashRow = `[data-call-edit="${lastIndexOfPhase(phase)}-0"]`;
    }
    rerender();
  };
  const cloneManualStep = (si, phase) => {
    const copy = structuredClone(tc.steps[si]);
    if (!phase || phase === phaseOf(copy)) {
      tc.steps.splice(si + 1, 0, copy);
      k.flashRow = `[data-manual-step="${si + 1}"]`;
    } else {
      tc.steps.push({ ...copy, phase });
      normalizePhases(tc);
      k.collapsed.delete(phase);
      k.flashRow = `[data-manual-step="${lastIndexOfPhase(phase)}"]`;
    }
    rerender();
  };
  H.$$('[data-call-clone]').forEach((b) => b.addEventListener('click', () => cloneCall(b.dataset.callClone)));
  H.$$('[data-step-clone]').forEach((b) => b.addEventListener('click', () => cloneManualStep(Number(b.dataset.stepClone))));

  // Dòng nháy sau khi gộp/dời: step nhiều keyword nháy ở dòng cha, step một keyword nháy chính dòng đó.
  const flashStep = (step) => {
    const si = tc.steps.indexOf(step);
    k.flashRow = step.keywords.length > 1 ? `[data-step-head="${si}"]` : `[data-call-edit="${si}-0"]`;
  };
  const neighbour = (step, dir) => {
    const n = tc.steps[tc.steps.indexOf(step) + dir];
    return n && phaseOf(n) === phaseOf(step) && n.keywords?.length ? n : null;
  };
  // Step một keyword bị gộp mất dòng của mình: tên step chuyển xuống thành tên dòng keyword, không mất chữ người dùng đặt.
  const keepNameOnMerge = (from) => {
    const [only] = from.keywords;
    if (from.keywords.length === 1 && from.name && !only.name) only.name = from.name;
  };
  const mergeSteps = (upper, lower) => {
    keepNameOnMerge(lower);
    upper.keywords.push(...lower.keywords);
    tc.steps.splice(tc.steps.indexOf(lower), 1);
    k.stepsClosed.delete(upper);
    flashStep(upper);
    rerender();
  };
  const mergeItems = (step) => {
    const up = neighbour(step, -1);
    const down = neighbour(step, 1);
    return [
      up && { label: 'Merge with step above', onSelect: () => mergeSteps(up, step) },
      down && { label: 'Merge with step below', onSelect: () => mergeSteps(step, down) },
    ].filter(Boolean);
  };

  const rowMenu = (e, { phase, edit, clone, toggle, disabled, remove, extra = [] }) => {
    e.preventDefault();
    H.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Edit', onSelect: edit },
        ...extra,
        { separator: true },
        { label: 'Clone', onSelect: () => clone() },
        ...PHASES.filter(([id]) => id !== phase).map(([id, label]) => ({ label: `Clone to ${label}`, onSelect: () => clone(id) })),
        { separator: true },
        { label: disabled ? 'Enable' : 'Disable', onSelect: toggle },
        { label: 'Delete', danger: true, onSelect: remove },
      ],
    });
  };
  H.$$('[data-call-edit]').forEach((row) => {
    if (row.tagName !== 'TR') return;
    row.addEventListener('contextmenu', (e) => {
      const ref = row.dataset.callEdit;
      const { step, si, ci, call } = at(ref);
      // Step một keyword chỉ có dòng này: menu thao tác trên cả step.
      if (step.keywords.length === 1) {
        return rowMenu(e, {
          phase: phaseOf(step),
          edit: () => openCallEditor(si, ci),
          extra: [{ label: 'Add keyword', onSelect: () => addKeyword(si) }, ...mergeItems(step)],
          clone: (phase) => cloneManualStep(si, phase),
          disabled: step.disabled,
          toggle: () => {
            step.disabled = !step.disabled;
            rerender();
          },
          remove: () => {
            tc.steps.splice(si, 1);
            rerender();
          },
        });
      }
      rowMenu(e, {
        phase: phaseOf(step),
        edit: () => openCallEditor(si, ci),
        clone: (phase) => cloneCall(ref, phase),
        disabled: call.disabled,
        toggle: () => {
          call.disabled = !call.disabled;
          rerender();
        },
        remove: () => {
          step.keywords.splice(ci, 1);
          dropEmptyStep(step);
          rerender();
        },
      });
    });
  });
  H.$$('[data-step-head]').forEach((row) =>
    row.addEventListener('contextmenu', (e) => {
      const si = Number(row.dataset.stepHead);
      const step = tc.steps[si];
      const closed = k.stepsClosed.has(step);
      e.preventDefault();
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Rename', onSelect: () => row.querySelector('.kw-step-name')?.select() },
          { label: closed ? 'Expand' : 'Collapse', onSelect: () => row.click() },
          { label: 'Add keyword', onSelect: () => addKeyword(si) },
          ...mergeItems(step),
          { separator: true },
          { label: 'Clone', onSelect: () => cloneManualStep(si) },
          ...PHASES.filter(([id]) => id !== phaseOf(step)).map(([id, label]) => ({ label: `Clone to ${label}`, onSelect: () => cloneManualStep(si, id) })),
          { separator: true },
          { label: step.disabled ? 'Enable' : 'Disable', onSelect: () => { step.disabled = !step.disabled; rerender(); } },
          { label: 'Delete', danger: true, onSelect: () => { tc.steps.splice(si, 1); rerender(); } },
        ],
      });
    }),
  );
  H.$$('[data-manual-step]').forEach((row) =>
    row.addEventListener('contextmenu', (e) => {
      const si = Number(row.dataset.manualStep);
      const step = tc.steps[si];
      rowMenu(e, {
        phase: phaseOf(step),
        edit: () => row.click(),
        clone: (phase) => cloneManualStep(si, phase),
        disabled: step.disabled,
        toggle: () => {
          step.disabled = !step.disabled;
          rerender();
        },
        remove: () => {
          tc.steps.splice(si, 1);
          rerender();
        },
      });
    }),
  );
  if (k.flashRow) {
    const row = H.$(k.flashRow);
    delete k.flashRow;
    row?.classList.add('kw-row-flash');
    row?.scrollIntoView({ block: 'nearest' });
    setTimeout(() => row?.classList.remove('kw-row-flash'), 1200);
  }

  // ── Kéo-thả: dòng step (dòng cha / step một keyword) chia 3 vùng — ¼ trên, ¼ dưới = chèn thành step riêng, giữa = gộp vào
  // step. Dòng keyword con chia đôi = đổi chỗ trong step. Thả lên dòng pha = step riêng ở cuối pha. ──
  const DROP = ['kw-drop-before', 'kw-drop-after', 'kw-drop-merge'];
  const clearDrop = () => H.$$(DROP.map((c) => `.${c}`).join(', ')).forEach((el) => el.classList.remove(...DROP));
  const showDrop = (row, zone) => {
    if (row.classList.contains(`kw-drop-${zone}`)) return;
    clearDrop();
    row.classList.add(`kw-drop-${zone}`);
  };
  const isCallDrag = (e) => [...e.dataTransfer.types].includes('text/kw-call');
  let dragRow = null;
  const zoneOf = (e, row) => {
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (row.matches('.kw-row-child')) return y < 0.5 ? 'before' : 'after';
    // Dòng cha đang mở: ngay dưới nó là keyword con, nên nửa dưới chỉ có nghĩa là gộp.
    if (row.dataset.stepHead && !row.classList.contains('is-closed')) return y < 0.25 ? 'before' : 'merge';
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'merge';
  };
  const stepOfRow = (row) => tc.steps[Number(row.dataset.stepHead ?? row.dataset.kwDropCall.split('-')[0])];

  H.$$('[data-drag-call]').forEach((h) => {
    h.addEventListener('dragstart', (e) => {
      const tr = h.closest('tr');
      const name = tr?.querySelector('.kw-call-name');
      e.dataTransfer.setData('text/kw-call', h.dataset.dragCall);
      e.dataTransfer.effectAllowed = 'move';
      const ghost = document.createElement('div');
      ghost.className = 'kw-drag-ghost';
      ghost.textContent = `⠿ ${name?.value || name?.placeholder || ''}`;
      document.body.append(ghost);
      e.dataTransfer.setDragImage(ghost, 14, 14);
      setTimeout(() => ghost.remove());
      tr?.classList.add('is-dragging');
      dragRow = tr;
    });
    h.addEventListener('dragend', () => {
      dragRow = null;
      H.$$('tr.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
      clearDrop();
    });
  });
  const moveCall = (fromRef, toStep, toCi) => {
    const { step: fromStep, ci: fromCi } = at(fromRef);
    if (fromStep !== toStep) keepNameOnMerge(fromStep);
    const [c] = fromStep.keywords.splice(fromCi, 1);
    let idx = toCi;
    if (toStep === fromStep && fromCi < idx) idx -= 1;
    toStep.keywords.splice(idx, 0, c);
    dropEmptyStep(fromStep);
    k.stepsClosed.delete(toStep);
    flashStep(toStep);
    rerender();
  };
  // Keyword được kéo ra thành step riêng: step một keyword thì dời nguyên step (giữ tên, trạng thái tắt/bật).
  const detachAsStep = (fromRef, phase) => {
    const { step: from, ci } = at(fromRef);
    if (from.keywords.length === 1) {
      tc.steps.splice(tc.steps.indexOf(from), 1);
      return Object.assign(from, { phase });
    }
    const [c] = from.keywords.splice(ci, 1);
    const name = c.name ?? '';
    delete c.name;
    return { name, phase, keywords: [c] };
  };
  // Gỡ vạch khi con trỏ ra khỏi mọi vùng thả — không dùng dragleave của từng dòng: đi qua ranh giới giữa các ô, Chrome
  // bắn dragleave không kèm relatedTarget, vạch tắt rồi bật lại liên tục.
  H.$('.kw-editor-body')?.addEventListener('dragover', (e) => {
    if (!e.target.closest('[data-kw-drop-call], [data-kw-drop-step], [data-kw-drop-phase]')) clearDrop();
  });
  H.$$('[data-kw-drop-call], [data-kw-drop-step]').forEach((row) => {
    row.addEventListener('dragover', (e) => {
      if (!isCallDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row === dragRow) return clearDrop();
      showDrop(row, zoneOf(e, row));
    });
    row.addEventListener('drop', (e) => {
      const raw = e.dataTransfer.getData('text/kw-call');
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      const zone = zoneOf(e, row);
      const target = stepOfRow(row);
      if (row.matches('.kw-row-child')) {
        const { ci } = at(row.dataset.kwDropCall);
        return moveCall(raw, target, ci + (zone === 'after' ? 1 : 0));
      }
      const from = at(raw).step;
      if (from === target && from.keywords.length === 1) return clearDrop();
      if (zone === 'merge') return moveCall(raw, target, target.keywords.length);
      const moved = detachAsStep(raw, phaseOf(target));
      tc.steps.splice(tc.steps.indexOf(target) + (zone === 'after' ? 1 : 0), 0, moved);
      flashStep(moved);
      rerender();
    });
  });
  H.$$('[data-kw-drop-phase]').forEach((row) => {
    row.addEventListener('dragover', (e) => {
      if (!isCallDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      showDrop(row, 'after');
    });
    row.addEventListener('drop', (e) => {
      const raw = e.dataTransfer.getData('text/kw-call');
      if (!raw) return;
      e.preventDefault();
      const phase = row.dataset.kwDropPhase;
      const moved = detachAsStep(raw, phase);
      tc.steps.push(moved);
      normalizePhases(tc);
      k.collapsed.delete(phase);
      flashStep(moved);
      rerender();
    });
  });

  H.$('#kw-cancel')?.addEventListener('click', () => H.closeTab(H.state.activeTab));

  const save = async () => {
    if (k.scriptErrors?.length) throw new Error('The script has lines that cannot be read — fix them first');
    const { __path, problems, ...body } = tc;
    const saved = await H.api('/api/testcases', { method: 'POST', body: { project: PROJECT(), testCase: body, previousPath: __path } });
    const path = saved.folder ? `${saved.folder}/${saved.id}` : saved.id;
    k.folder = saved.folder ?? '';
    H.updateActiveCaseTab({ casePath: path, title: saved.name, draft: { ...saved, __path: path }, markSaved: true });
    H.toast('Test case saved', 'ok');
    return { saved, path };
  };

  H.$('#kw-save')?.addEventListener('click', async () => {
    try {
      await save();
      rerender();
    } catch (err) {
      H.toast(err.message, 'error');
    }
  });
  H.$('#kw-save-run')?.addEventListener('click', async () => {
    try {
      const { path } = await save();
      await runCases([path]);
    } catch (err) {
      H.toast(err.message, 'error');
    }
  });
  bindHeadedSwitch();

  showProblems();
  if (tc.__path) paintLastRun(tc.__path);
  // Gõ tới đâu soi lại tới đó: các listener ở trên đã cập nhật bản nháp, chỉ cần chấm lại.
  H.$('.kw-main')?.addEventListener('input', () => showProblems());
}

/**
 * Soi lỗi ngay lúc soạn — cùng luật với runner, để không phải chạy mới biết sai.
 *
 * Lỗi của TỪNG step đánh dấu ngay trên dòng: viền vàng = còn thiếu (chưa chọn object, thiếu tham số, step
 * thủ công — thường là đang soạn dở), viền đỏ = hỏng thật (object không còn, keyword lạ); rê chuột xem lý do.
 */
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const RUN_ICON = { running: SPINNER[0], passed: '✓', failed: '✗' };
// Spinner đổi ký tự bằng JS, không dùng CSS animation: app desktop (Electron) vẽ hỏng phần tử đang animate.
let spinTimer = null;
function spin() {
  if (spinTimer) return;
  let frame = 0;
  spinTimer = setInterval(() => {
    const els = H.$$('.kw-run-ico.is-running');
    if (!els.length) {
      clearInterval(spinTimer);
      spinTimer = null;
      return;
    }
    frame = (frame + 1) % SPINNER.length;
    els.forEach((el) => (el.textContent = SPINNER[frame]));
  }, 100);
}
const RUN_LABEL = { running: 'Running', passed: 'Passed', failed: 'Failed' };

function paintSteps(steps, when) {
  H.$$('[data-run-ico]').forEach((el) => {
    const status = steps[el.dataset.runIco];
    el.className = `kw-run-ico ${status ? `is-${status}` : ''}`;
    el.textContent = RUN_ICON[status] ?? '';
    el.title = status ? `${RUN_LABEL[status]} ${when}` : '';
  });
  if (Object.values(steps).includes('running')) spin();
}

// Trạng thái từng step của lần chạy đang diễn ra, theo đường dẫn test case — có thì thắng kết quả lần chạy trước.
const liveSteps = new Map();
let runWatch = null;

/** Nghe sự kiện `step` (reporter kw-progress) của lần chạy vừa bấm để tô icon ngay lúc chạy. */
function watchRun(runId, paths, { notify = false } = {}) {
  runWatch?.close();
  liveSteps.clear();
  for (const p of paths) liveSteps.set(p, {});
  repaintOpenCase();
  const source = new EventSource(`/api/runs/${runId}/stream`);
  runWatch = source;
  source.addEventListener('step', (e) => {
    const ev = JSON.parse(e.data);
    if (!liveSteps.has(ev.case)) liveSteps.set(ev.case, {});
    liveSteps.get(ev.case)[ev.key] = ev.status;
    if (KEY().draft?.__path === ev.case) paintSteps(liveSteps.get(ev.case), 'in this run');
  });
  const stop = () => {
    source.close();
    if (runWatch !== source) return;
    runWatch = null;
    liveSteps.clear();
    repaintOpenCase();
  };
  source.addEventListener('done', (e) => {
    stop();
    if (!notify) return;
    const run = JSON.parse(e.data);
    const t = run.totals;
    H.toast(`Run ${run.status}${t ? ` — ${t.passed}/${t.total} passed` : ''}`, run.status === 'passed' ? 'ok' : 'error');
    H.render();
  });
  source.onerror = stop;
}

function repaintOpenCase() {
  const path = KEY().draft?.__path;
  if (path) paintLastRun(path);
}

/** Icon ✓/✗ đầu mỗi dòng step theo lần chạy gần nhất có test case này; sửa bài sau lần chạy thì số thứ tự có thể lệch. */
async function paintLastRun(casePath) {
  if (liveSteps.has(casePath)) return paintSteps(liveSteps.get(casePath), 'in this run');
  let run;
  try {
    run = await H.api(`/api/testcases/last-run?path=${encPath(casePath)}&${pq()}`);
  } catch {
    return;
  }
  if (!run || KEY().draft?.__path !== casePath || liveSteps.has(casePath)) return;
  paintSteps(run.steps, `in the last run (${H.fmtAgo(run.finishedAt)})`);
}

function showProblems() {
  const tc = KEY().draft;
  const repo = KEY().objects ?? { objects: {} };

  const rows = new Map();
  const mark = (selector, level, message) => {
    const row = rows.get(selector) ?? { level: 'incomplete', messages: [] };
    if (level === 'broken') row.level = 'broken';
    row.messages.push(message);
    rows.set(selector, row);
  };
  tc.steps.forEach((step, si) => {
    if (step.disabled) return;
    if (!step.keywords?.length) {
      mark(`[data-manual-step="${si}"]`, 'incomplete', 'Manual step — pick the keyword that performs it');
      return;
    }
    // Lỗi của keyword đánh lên CẢ dòng test step: step đang gập thì dòng con không hiện, không đánh là lỗi biến mất.
    const markCall = (ci, level, message) => {
      mark(`[data-call-edit="${si}-${ci}"]`, level, message);
      mark(`[data-step-head="${si}"]`, level, message);
    };
    step.keywords.forEach((call, ci) => {
      if (call.disabled) return;
      const spec = kwById(call.keyword);
      if (!spec) return markCall(ci, 'broken', `Unknown keyword "${call.keyword}"`);
      if (spec.object === true && !call.object) markCall(ci, 'incomplete', 'No test object selected');
      if (call.object && !repo.objects[call.object]) markCall(ci, 'broken', `Test object "${call.object}" no longer exists`);
      for (const arg of spec.args) {
        if (arg.required && !call.args?.[arg.name]) markCall(ci, 'incomplete', `Missing "${arg.label}"`);
      }
    });
  });
  H.$$('.kw-row.is-incomplete, .kw-row.is-broken').forEach((tr) => {
    tr.classList.remove('is-incomplete', 'is-broken');
    if (tr.dataset.titleDefault) tr.title = tr.dataset.titleDefault;
  });
  for (const [selector, { level, messages }] of rows) {
    const tr = H.$(`.kw-row${selector}`);
    if (!tr) continue;
    tr.dataset.titleDefault ??= tr.title;
    tr.classList.add(level === 'broken' ? 'is-broken' : 'is-incomplete');
    tr.title = `${messages.join('\n')}\n— ${tr.dataset.titleDefault}`;
  }

}

// ── Tab: Test object ────────────────────────────────────────────────────────

// ── Test object: cây thư mục objects/<project>/**.to (giống test case) ─────────────────────

const OBJ = () => {
  const k = KEY();
  k.obj ??= { folder: '', open: {}, q: '', tree: null, rootFiles: [], total: 0 };
  return k.obj;
};
const objFolderOf = (key) => (key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
const objNameOf = (key) => key.split('/').pop();
// Bỏ dấu để "dang nhap" khớp "Đăng nhập" (cùng cách với searchProject ở server).
const foldText = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * Ô chọn test object cho keyword: bấm mở dropdown; ô tìm trống thì là cây thư mục như sidebar (mở sẵn các nhánh
 * sidebar đang mở + nhánh chứa object đang chọn), gõ chữ thì thành danh sách phẳng các object khớp.
 */
const OBJ_PICKER_ROOT = ' root';

/**
 * Cây thư mục dựng từ chính danh sách khoá object — cùng nguồn với khung kiểm lỗi của test case. Trước đây ô chọn dùng cây
 * cache riêng (OBJ().tree, chỉ làm mới khi vẽ màn Kho đối tượng hoặc cây menu đang mở), cache cũ là chọn ra khoá không còn
 * tồn tại → "test object … no longer exists".
 */
function treeFromKeys(keys) {
  const root = { children: new Map(), files: [] };
  for (const key of [...keys].sort((a, b) => a.localeCompare(b, 'en'))) {
    const parts = key.split('/');
    parts.pop();
    let node = root;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!node.children.has(part)) node.children.set(part, { path, name: part, children: new Map(), files: [] });
      node = node.children.get(part);
    }
    node.files.push({ key });
  }
  const finish = (n) => {
    const children = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')).map(finish);
    return { path: n.path, name: n.name, children, files: n.files, total: n.files.length + children.reduce((sum, c) => sum + c.total, 0) };
  };
  const top = finish(root);
  return { tree: top.children, rootFiles: top.files };
}

function mountObjectPicker(host, { value, optional, objects, onChange }) {
  const ROOT = OBJ_PICKER_ROOT;
  const { esc } = H;
  const o = OBJ();
  let selected = value ?? '';
  const { tree, rootFiles } = treeFromKeys(Object.keys(objects));
  const open = { ...o.open, [ROOT]: true };
  const expandTo = (key) => {
    const parts = objFolderOf(key).split('/').filter(Boolean);
    parts.forEach((_, i) => (open[parts.slice(0, i + 1).join('/')] = true));
  };
  if (selected) expandTo(selected);

  host.innerHTML = `
    <button type="button" class="obj-picker-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
    <div class="obj-picker-pop" hidden>
      <input type="search" class="obj-picker-search" placeholder="Search test objects" autocomplete="off" spellcheck="false" />
      <div class="obj-picker-list" role="listbox"></div>
    </div>`;
  const trigger = host.querySelector('.obj-picker-trigger');
  const pop = host.querySelector('.obj-picker-pop');
  const search = host.querySelector('.obj-picker-search');
  const list = host.querySelector('.obj-picker-list');

  const paintTrigger = () => {
    trigger.innerHTML = selected
      ? `<span class="obj-picker-key">${esc(selected)}</span>${treeChevron(!pop.hidden)}`
      : `<span class="obj-picker-placeholder">${optional ? '(not used)' : 'Select test object'}</span>${treeChevron(!pop.hidden)}`;
    trigger.setAttribute('aria-expanded', String(!pop.hidden));
  };

  const objectRow = (key, depth, withPath) => `
    <div class="obj-picker-item ${key === selected ? 'is-selected' : ''}" role="option" aria-selected="${key === selected}" data-pick="${esc(key)}" style="padding-left:${(withPath ? 10 : 28) + depth * 14}px" title="${esc(key)}">
      ${fileIcon('object')}
      <span class="obj-picker-key">${esc(withPath ? key : objNameOf(key))}</span>
    </div>`;

  const treeRows = (nodes, files, depth) =>
    nodes
      .map((n) => {
        const isOpen = !!open[n.path];
        return `
          <div class="obj-picker-folder" data-pick-folder="${esc(n.path)}" style="padding-left:${8 + depth * 14}px">
            ${treeChevron(isOpen)}${fileIcon('folder')}<span class="obj-picker-key">${esc(n.name)}</span>
            <span class="kw-tree-count">${n.total || ''}</span>
          </div>
          ${isOpen ? treeRows(n.children ?? [], n.files ?? [], depth + 1) : ''}`;
      })
      .join('') + files.map((f) => objectRow(f.key, depth, false)).join('');

  const paintList = () => {
    const q = foldText(search.value.trim());
    const clear = optional ? `<div class="obj-picker-item obj-picker-clear ${selected ? '' : 'is-selected'}" data-pick="">(not used)</div>` : '';
    if (q) {
      const hits = Object.keys(objects)
        .sort()
        .filter((key) => [key, window.ObjectModel.summary(objects[key])].some((v) => foldText(v).includes(q)));
      list.innerHTML = hits.length ? hits.map((key) => objectRow(key, 0, true)).join('') : '<div class="obj-picker-empty">No test object matches</div>';
      return;
    }
    const total = Object.keys(objects).length;
    const rootRow = `
      <div class="obj-picker-folder obj-picker-root" data-pick-folder="${ROOT}" style="padding-left:8px">
        ${treeChevron(!!open[ROOT])}<span class="obj-picker-key">Object Repository</span>
        <span class="kw-tree-count">${total || ''}</span>
      </div>`;
    const body = tree.length || rootFiles.length ? treeRows(tree, rootFiles, 1) : '<div class="obj-picker-empty">No test objects yet</div>';
    list.innerHTML = clear + rootRow + (open[ROOT] ? body : '');
  };

  // Dropdown nổi (absolute) đè lên hộp thoại; dưới không đủ chỗ thì lật lên trên trigger.
  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    host.classList.toggle('is-up', below < pop.offsetHeight + 12 && rect.top > below);
  };

  const setOpen = (next) => {
    pop.hidden = !next;
    paintTrigger();
    if (!next) return;
    search.value = '';
    paintList();
    place();
    search.focus();
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  };

  const pick = (key) => {
    selected = key;
    onChange(key);
    setOpen(false);
    trigger.focus();
  };

  trigger.addEventListener('click', () => setOpen(pop.hidden));
  search.addEventListener('input', paintList);
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const folder = e.target.closest('[data-pick-folder]');
    if (folder) {
      open[folder.dataset.pickFolder] = !open[folder.dataset.pickFolder];
      paintList();
      return;
    }
    const item = e.target.closest('[data-pick]');
    if (item) pick(item.dataset.pick);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      e.stopPropagation();
      setOpen(false);
      trigger.focus();
    } else if (e.key === 'Enter' && e.target === search) {
      e.preventDefault();
      const first = list.querySelector('[data-pick]:not(.obj-picker-clear)');
      if (first) pick(first.dataset.pick);
    }
  });
  const onOutside = (e) => {
    if (!host.isConnected) return document.removeEventListener('mousedown', onOutside, true);
    if (!pop.hidden && !host.contains(e.target)) setOpen(false);
  };
  document.addEventListener('mousedown', onOutside, true);
  paintTrigger();
}

/** Khung mô tả keyword trong ô chọn: việc nó làm, test object, tham số, giá trị trả về. */
function keywordDetail(kw) {
  const { esc } = H;
  if (!kw) return '<div class="kwd-empty">Hover or use ↑/↓ on a keyword to read what it does.</div>';
  const group = catalog.groups.find((g) => g.id === kw.group)?.label ?? kw.group;
  const objectText = kw.object === true ? 'Required' : kw.object === 'optional' ? 'Optional' : 'Not used';
  const args = kw.args.length
    ? `<ul class="kwd-args">${kw.args
        .map(
          (a) =>
            `<li><span class="kwd-arg">${esc(a.label)}${a.required ? ' <span class="kwd-req" title="Required">*</span>' : ''}</span> <span class="mono kwd-arg-name">${esc(a.name)}</span>${
              a.options ? `<div class="kwd-arg-hint">One of: ${a.options.map((o) => esc(o.label)).join(' · ')}</div>` : ''
            }${a.hint ? `<div class="kwd-arg-hint">${esc(a.hint)}</div>` : ''}</li>`,
        )
        .join('')}</ul>`
    : '<div class="kwd-none">No parameters</div>';
  return `
    <div class="kwd-head">${keywordIcon(kw, { size: 'lg' })}<div><div class="kwd-title" data-no-i18n>${esc(kw.label)}</div><div class="kwd-meta"><span class="mono">${esc(kw.id)}</span> · ${esc(group)}</div></div></div>
    <p class="kwd-summary">${esc(kw.summary ?? '')}</p>
    ${kw.detail ? `<p class="kwd-detail">${esc(kw.detail)}</p>` : ''}
    <dl class="kwd-facts">
      <dt>Test object</dt><dd>${objectText}</dd>
      ${kw.returns ? '<dt>Output</dt><dd>Returns a value — set Output variable, read it later as <span class="mono">${var:name}</span></dd>' : ''}
    </dl>
    <div class="kwd-sub">Parameters</div>
    ${args}`;
}

/** Ô chọn keyword có tìm kiếm: gõ để lọc theo tên, mã hoặc mô tả (không phân biệt dấu); ↑/↓ + Enter chọn; khung phải mô tả keyword đang trỏ. */
function mountKeywordPicker(host, { value, autoOpen, onChange }) {
  const { esc } = H;
  let selected = value ?? '';
  let active = -1;
  host.innerHTML = `
    <button type="button" class="obj-picker-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
    <div class="obj-picker-pop kw-picker-pop" hidden>
      <div class="kw-picker-main">
        <input type="search" class="obj-picker-search" placeholder="Search keywords" autocomplete="off" spellcheck="false" />
        <div class="obj-picker-list" role="listbox"></div>
      </div>
      <aside class="kw-picker-detail" aria-live="polite"></aside>
    </div>`;
  const trigger = host.querySelector('.obj-picker-trigger');
  const pop = host.querySelector('.obj-picker-pop');
  const search = host.querySelector('.obj-picker-search');
  const list = host.querySelector('.obj-picker-list');
  const detail = host.querySelector('.kw-picker-detail');
  let shown = null;
  const showDetail = (id) => {
    if (id === shown) return;
    shown = id;
    detail.innerHTML = keywordDetail(kwById(id));
  };

  const paintTrigger = () => {
    const spec = kwById(selected);
    trigger.innerHTML = spec
      ? `${keywordIcon(spec)}<span class="kw-picker-label" data-no-i18n>${esc(spec.label)}</span>${treeChevron(!pop.hidden)}`
      : `<span class="obj-picker-placeholder">Select keyword</span>${treeChevron(!pop.hidden)}`;
    trigger.setAttribute('aria-expanded', String(!pop.hidden));
  };

  const items = () => [...list.querySelectorAll('[data-pick]')];
  const setActive = (i) => {
    const all = items();
    if (!all.length) return;
    active = (i + all.length) % all.length;
    all.forEach((el, n) => el.classList.toggle('is-active', n === active));
    all[active].scrollIntoView({ block: 'nearest' });
    showDetail(all[active].dataset.pick);
  };

  const paintList = () => {
    const q = foldText(search.value.trim());
    const row = (kw) => `
            <div class="obj-picker-item kw-picker-item ${kw.id === selected ? 'is-selected' : ''}" role="option" aria-selected="${kw.id === selected}" data-pick="${esc(kw.id)}">
              ${keywordIcon(kw)}<span class="kw-picker-label" data-no-i18n>${esc(kw.label)}</span>
            </div>`;
    const section = (title, kws) => (kws.length ? `<div class="kw-picker-group">${esc(title)}</div>${kws.map(row).join('')}` : '');
    let html;
    if (!q) {
      html = catalog.groups.map((g) => section(g.label, catalog.keywords.filter((kw) => kw.group === g.id))).join('');
    } else {
      // Khớp tên xếp trước (tên bắt đầu bằng từ khoá lên đầu); chỉ khớp mô tả thì dồn xuống nhóm riêng.
      const inName = (kw) => [kw.label, kw.id].some((v) => foldText(v).includes(q));
      const byName = catalog.keywords
        .filter(inName)
        .sort((a, b) => Number(!foldText(a.label).startsWith(q)) - Number(!foldText(b.label).startsWith(q)));
      const byText = catalog.keywords.filter((kw) => !inName(kw) && foldText(kw.summary).includes(q));
      html = section('Keywords', byName) + section('Mentioned in description', byText);
    }
    list.innerHTML = html || '<div class="obj-picker-empty">No keyword matches</div>';
    active = -1;
    if (q) setActive(0);
    else showDetail(selected || items()[0]?.dataset.pick);
  };

  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    host.classList.toggle('is-up', below < pop.offsetHeight + 12 && rect.top > below);
  };

  const setOpen = (next) => {
    pop.hidden = !next;
    paintTrigger();
    if (!next) return;
    search.value = '';
    paintList();
    place();
    search.focus();
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  };

  const pick = (id) => {
    selected = id;
    setOpen(false);
    trigger.focus();
    onChange(id);
  };

  trigger.addEventListener('click', () => setOpen(pop.hidden));
  search.addEventListener('input', paintList);
  list.addEventListener('mousedown', (e) => e.preventDefault());
  detail.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-pick]');
    if (item) pick(item.dataset.pick);
  });
  list.addEventListener('mouseover', (e) => {
    const item = e.target.closest('[data-pick]');
    if (item) showDetail(item.dataset.pick);
  });
  host.addEventListener('keydown', (e) => {
    if (pop.hidden) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      trigger.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active < 0 && e.key === 'ArrowUp' ? -1 : active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter' && e.target === search) {
      e.preventDefault();
      const target = items()[active < 0 ? 0 : active];
      if (target) pick(target.dataset.pick);
    }
  });
  const onOutside = (e) => {
    if (!host.isConnected) return document.removeEventListener('mousedown', onOutside, true);
    if (!pop.hidden && !host.contains(e.target)) setOpen(false);
  };
  document.addEventListener('mousedown', onOutside, true);
  paintTrigger();
  if (autoOpen) {
    setOpen(true);
    // showPanel dời focus sang nút đầu tiên SAU onMount — trả lại ô tìm để gõ là lọc được ngay.
    requestAnimationFrame(() => {
      if (!pop.hidden) search.focus();
    });
  }
}

async function renderObjectsTab() {
  const { esc } = H;
  const k = KEY();
  const o = OBJ();
  const [repo, treeRes] = await Promise.all([H.api(`/api/keyword/objects?${pq()}`), H.api(`/api/keyword/objects/tree?${pq()}`)]);
  k.objects = repo;
  Object.assign(o, { tree: treeRes.tree, rootFiles: treeRes.rootFiles, total: treeRes.total });
  const q = o.q.trim().toLowerCase();
  // Không tìm: chỉ object nằm trực tiếp trong thư mục (thư mục con hiện thành hàng riêng); có từ khoá: quét cả nhánh.
  const entries = Object.entries(repo.objects)
    .filter(([key]) => (q ? !o.folder || key.startsWith(`${o.folder}/`) : objFolderOf(key) === o.folder))
    .filter(([key, obj]) => !q || [key, window.ObjectModel.summary(obj)].some((v) => foldText(v).includes(foldText(q))));
  const rows = entries
    .map(
      ([key, obj]) => `
      <tr class="${o.selected?.has(key) ? 'is-selected' : ''}" draggable="true" data-obj-drag="${esc(key)}" data-obj-row="${esc(key)}" title="Drag onto a folder in the tree to move">
        <td class="col-check"><input type="checkbox" data-obj-check="${esc(key)}" ${o.selected?.has(key) ? 'checked' : ''} aria-label="Select" /></td>
        <td>${fileIcon('object')}<code title="${esc(key)}">${esc(objNameOf(key))}</code></td>
        <td class="cell-dim">${esc(window.ObjectModel.METHOD_LABELS[obj.method] ?? '')}</td>
        <td class="cell-dim mono">${esc(window.ObjectModel.summary(obj))}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-obj-edit="${esc(key)}">Edit</button>
            <span class="row-actions-sep" aria-hidden="true"></span>
            <button class="btn btn-sm btn-icon btn-danger" data-obj-del="${esc(key)}" title="Delete test object" aria-label="Delete test object">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>`,
    )
    .join('');
  const subfolders = q ? [] : o.folder ? (findTreeNode(o.tree, o.folder)?.children ?? []) : (o.tree ?? []);
  const folderRows = subfolders
    .map(
      (n) => `
      <tr class="kw-folder-row ${o.selected?.has(DIR_KEY + n.path) ? 'is-selected' : ''}" data-obj-folder-row="${esc(n.path)}" title="Open folder">
        <td class="col-check"><input type="checkbox" data-obj-check="${esc(DIR_KEY + n.path)}" ${o.selected?.has(DIR_KEY + n.path) ? 'checked' : ''} aria-label="Select folder" /></td>
        <td>${fileIcon('folder')} <strong>${esc(n.name)}</strong></td>
        <td class="cell-dim" colspan="2">${n.total} ${n.total === 1 ? 'test object' : 'test objects'}${n.children?.length ? ` · ${n.children.length} ${n.children.length === 1 ? 'folder' : 'folders'}` : ''}</td>
        <td>
          <div class="row-actions kw-list-actions">
            <button class="btn btn-sm btn-icon btn-danger" data-obj-folder-del="${esc(n.path)}" title="Delete folder" aria-label="Delete folder">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>`,
    )
    .join('');
  const parts = o.folder ? o.folder.split('/') : [];
  const crumbs = [
    parts.length ? `<button type="button" class="crumb" data-obj-crumb="">Object Repository</button>` : `<span class="crumb is-current">Object Repository</span>`,
    ...parts.map((p, i) =>
      i === parts.length - 1
        ? `<span class="crumb is-current">${esc(p)}</span>`
        : `<button type="button" class="crumb" data-obj-crumb="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`,
    ),
  ].join('<span class="crumb-sep">›</span>');

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="crumbs">${crumbs}</div>
        </div>
        <button class="btn btn-primary" id="kw-obj-new">
          <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add test object
        </button>
      </div>
      <div class="filters kw-filters">
        <div class="field field-grow">
          <label for="obj-q">Search</label>
          <input id="obj-q" type="search" value="${esc(o.q)}" placeholder="name, locator" />
        </div>
      </div>
      ${bulkBar('objects', `${entries.length} ${entries.length === 1 ? 'test object' : 'test objects'}${subfolders.length ? ` · ${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}` : ''}`)}
      <div class="table-wrap">
        <table>
          <thead><tr><th class="col-check"><input type="checkbox" id="check-all-objects" aria-label="Select all" /></th><th>Name</th><th style="width:130px">Selection method</th><th>Locator</th><th style="width:150px"></th></tr></thead>
          <tbody>${folderRows}${rows || (folderRows ? '' : `<tr><td colspan="5" class="empty"><strong>${o.q ? 'No test object matches' : 'No test objects in this folder'}</strong></td></tr>`)}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** Cây thư mục object cho sidebar (vẽ khi đang ở màn Test objects). */
export async function renderObjectsSideTree() {
  const o = OBJ();
  if (!PROJECT() || isTreeCollapsed('objects')) return '';
  try {
    const { tree, rootFiles, total } = await H.api(`/api/keyword/objects/tree?${pq()}`);
    Object.assign(o, { tree, rootFiles, total });
  } catch {
    if (!o.tree) return '';
  }
  if (!o.tree.length && !o.rootFiles?.length) return '<div class="kw-tree-empty">No test objects yet</div>';
  return renderObjTree(o.tree, o.rootFiles ?? [], 0);
}

function renderObjTree(nodes, files, depth) {
  const { esc } = H;
  const o = OBJ();
  const folders = nodes
    .map((n) => {
      const open = o.open[n.path] ?? false;
      const hasChildren = (n.children ?? []).length > 0 || (n.files ?? []).length > 0;
      const toggle = hasChildren
        ? `<button class="kw-tree-toggle" data-obj-toggle="${esc(n.path)}" aria-label="${open ? 'Collapse' : 'Expand'}">${treeChevron(open)}</button>`
        : '';
      return `
          <div class="kw-tree-node ${o.folder === n.path ? 'is-active' : ''}" data-obj-folder="${esc(n.path)}" style="padding-left:${4 + depth * 10}px">
            ${fileIcon('folder')} <span class="kw-tree-name" title="${esc(n.name)}">${esc(n.name)}</span>
            <span class="kw-tree-count" title="${n.total} in this branch">${n.total || ''}</span>
            ${toggle}
          </div>
          ${open ? renderObjTree(n.children ?? [], n.files ?? [], depth + 1) : ''}`;
    })
    .join('');
  const items = files
    .map(
      (f) => `
          <div class="kw-tree-node kw-tree-case ${f.broken ? 'kw-tree-bad' : ''} ${o.selected?.has(f.key) ? 'is-selected' : ''}" tabindex="0" data-obj-key="${esc(f.key)}" data-obj-name="${esc(f.name)}"
               draggable="true" data-obj-drag="${esc(f.key)}" style="padding-left:${4 + depth * 10}px" title="${esc(f.key)}${f.summary ? ` · ${esc(f.summary)}` : ''}">
            ${fileIcon('object')} <span class="kw-tree-name">${esc(objNameOf(f.key))}</span>
          </div>`,
    )
    .join('');
  return folders + items;
}

function bindObjectDrag(el) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/kw-object', el.dataset.objDrag);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('is-dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}

function bindObjectRowMenu(el, key, name) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const set = SEL.objects.set();
    if (set.size > 1 && set.has(key)) {
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: `Delete ${set.size} test objects`, danger: true, onSelect: bulkDeleteObjects },
          { label: 'Clear selection', onSelect: () => clearSelection('objects') },
        ],
      });
      return;
    }
    H.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Edit', onSelect: () => openObjectForm(key) },
        { label: 'Delete', danger: true, onSelect: () => removeObject(key, name) },
      ],
    });
  });
}

/** Sự kiện của cây object trong sidebar — gọi từ bindSideTree sau mỗi lần vẽ menu. */
export function bindObjectsSideTree() {
  const o = OBJ();
  const host = H.$('#nav-tree-objects');
  if (!host) return;
  const $$t = (sel) => H.$$(`#nav-tree-objects ${sel}`);
  $$t('[data-obj-toggle]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      o.open[b.dataset.objToggle] = !(o.open[b.dataset.objToggle] ?? false);
      H.render();
    }),
  );
  $$t('[data-obj-folder]').forEach((el) =>
    el.addEventListener('click', () => {
      o.folder = el.dataset.objFolder;
      o.open[el.dataset.objFolder] = true;
      H.openTab('objects');
    }),
  );
  const visibleObjects = () => $$t('[data-obj-key]').map((el) => el.dataset.objKey);
  $$t('[data-obj-key]').forEach((el) => {
    el.addEventListener('click', (e) => {
      selectByClick('objects', el.dataset.objKey, e, visibleObjects());
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) openObjectForm(el.dataset.objKey);
    });
    bindObjectRowMenu(el, el.dataset.objKey, el.dataset.objName);
  });
  host?.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && SEL.objects.set().size) {
      e.preventDefault();
      bulkDeleteObjects();
    }
  });
  syncSelection('objects');
  $$t('[data-obj-drag]').forEach(bindObjectDrag);
  $$t('[data-obj-folder]').forEach((el) => {
    el.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('text/kw-object')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('is-drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('is-drop-target');
      const key = e.dataTransfer.getData('text/kw-object');
      if (key) await moveObjectTo(key, el.dataset.objFolder);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const path = el.dataset.objFolder;
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: `New folder in "${path.split('/').pop()}"`, onSelect: () => createObjFolder(path) },
          { label: 'New test object here', onSelect: () => openObjectForm(null, path) },
          { label: 'Rename', onSelect: () => renameObjFolder(path) },
          { label: 'Delete', danger: true, onSelect: () => deleteObjFolder(path) },
        ],
      });
    });
  });
  const onBackground = (e) => !e.target.closest('[data-obj-folder]');
  host.addEventListener('dragover', (e) => {
    if (!onBackground(e) || ![...e.dataTransfer.types].includes('text/kw-object')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    host.classList.add('is-drop-target');
  });
  host.addEventListener('dragleave', () => host.classList.remove('is-drop-target'));
  host.addEventListener('drop', async (e) => {
    host.classList.remove('is-drop-target');
    if (!onBackground(e)) return;
    e.preventDefault();
    const key = e.dataTransfer.getData('text/kw-object');
    if (key) await moveObjectTo(key, '');
  });
  host.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    H.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New folder', onSelect: () => createObjFolder('') },
        { label: 'New test object', onSelect: () => openObjectForm(null, '') },
      ],
    });
  });
}

function bindObjectsTab() {
  const o = OBJ();
  H.$('#kw-obj-new')?.addEventListener('click', () => openObjectForm(null, o.folder));
  H.$$('#view [data-obj-edit]').forEach((b) => b.addEventListener('click', () => openObjectForm(b.dataset.objEdit)));
  H.$$('#view [data-obj-del]').forEach((b) => b.addEventListener('click', () => removeObject(b.dataset.objDel, b.dataset.objDel)));
  H.$$('#view [data-obj-drag]').forEach(bindObjectDrag);
  H.$$('#view [data-obj-row]').forEach((tr) => bindObjectRowMenu(tr, tr.dataset.objRow, tr.dataset.objRow));
  const goFolder = (path) => {
    o.folder = path;
    openAncestors(o.open, path);
    H.render();
  };
  H.$$('#view [data-obj-folder-row]').forEach((tr) => {
    const path = tr.dataset.objFolderRow;
    tr.addEventListener('click', (e) => {
      if (!e.target.closest('[data-obj-folder-del], .col-check')) goFolder(path);
    });
    tr.querySelector('[data-obj-folder-del]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteObjFolder(path);
    });
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const set = SEL.objects.set();
      if (set.size > 1 && set.has(DIR_KEY + path)) {
        H.showContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: `Delete ${set.size} selected`, danger: true, onSelect: bulkDeleteObjects },
            { label: 'Clear selection', onSelect: () => clearSelection('objects') },
          ],
        });
        return;
      }
      H.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Open', onSelect: () => goFolder(path) },
          { label: `New folder in "${path.split('/').pop()}"`, onSelect: () => createObjFolder(path) },
          { label: 'New test object here', onSelect: () => openObjectForm(null, path) },
          { label: 'Rename', onSelect: () => renameObjFolder(path) },
          { label: 'Delete', danger: true, onSelect: () => deleteObjFolder(path) },
        ],
      });
    });
    bindFolderDrop(tr, 'text/kw-object', path, moveObjectTo);
  });
  H.$$('#view [data-obj-crumb]').forEach((b) => b.addEventListener('click', () => goFolder(b.dataset.objCrumb)));
  bindBulk('objects', bulkDeleteObjects);
  const q = H.$('#obj-q');
  if (q) {
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        o.q = q.value;
        Promise.resolve(H.render()).then(() => {
          const next = H.$('#obj-q');
          next?.focus();
          next?.setSelectionRange(next.value.length, next.value.length);
        });
      }, 220);
    });
  }
}

/**
 * Hộp sửa/thêm test object kiểu Katalon: Selection method (Attributes · XPath · CSS · Role), bảng thuộc tính có cột
 * "Detect object by?" và điều kiện khớp, danh sách XPath chọn một làm mặc định, parent iframe, và "Kiểm tra trên trang"
 * (đếm số phần tử mỗi locator khớp + ảnh tô sáng). Mô hình và luật kiểm ở shared/keyword/object-model.cjs
 * (window.ObjectModel) — dùng chung với engine nên hộp này không tự đặt luật riêng.
 */
async function openObjectForm(key, folder) {
  const { esc } = H;
  const M = window.ObjectModel;
  const k = KEY();
  const o = OBJ();
  if (!k.objects) k.objects = await H.api(`/api/keyword/objects?${pq()}`);
  if (key && !k.objects.objects[key]) {
    H.toast('No such test object', 'error');
    return;
  }
  const draft = M.normalizeObject(
    structuredClone(key ? k.objects.objects[key] : { name: '', method: 'attributes', properties: [{ name: 'tag', condition: 'equals', value: '', detect: true }] }),
  );
  if (draft.method === 'role' && !draft.role) draft.role = { role: 'button', condition: 'equals' };
  // Thư mục = thư mục đang mở (hoặc của object đang sửa), không sửa trong hộp; tiền tố btn_/input_/label_… chỉ là
  // quy ước đặt tên cho dễ đọc, không bắt buộc nên tên nhập nguyên cả chuỗi.
  const dir = key ? objFolderOf(key) : (folder ?? o.folder ?? '');
  const options = (list, current, labels = {}) =>
    list.map((v) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(labels[v] ?? v)}</option>`).join('');
  const trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.9c0-.8.6-1.4 1.3-1.4h2.4c.7 0 1.3.6 1.3 1.4v1.6"/><path d="m6.6 6.5.9 13.4c.05.8.7 1.4 1.5 1.4h6c.8 0 1.45-.6 1.5-1.4l.9-13.4"/></svg>';

  const attributesPane = () => `
    <table class="of-table">
      <thead><tr><th class="of-col-detect" title="Detect object by?">Detect</th><th class="of-col-name">Property</th><th class="of-col-cond">Match condition</th><th>Value</th><th class="of-col-del"></th></tr></thead>
      <tbody>${draft.properties
        .map(
          (p, i) => `<tr>
          <td class="of-col-detect"><input type="checkbox" data-prop-detect="${i}" ${p.detect ? 'checked' : ''} aria-label="Detect object by ${esc(p.name)}" /></td>
          <td><input type="text" list="of-prop-names" data-prop-name="${i}" value="${esc(p.name)}" autocomplete="off" aria-label="Property name" /></td>
          <td><select data-prop-cond="${i}" aria-label="Match condition">${options(M.CONDITIONS, p.condition, M.CONDITION_LABELS)}</select></td>
          <td><input type="text" data-prop-value="${i}" value="${esc(p.value)}" autocomplete="off" aria-label="Value" /></td>
          <td class="of-col-del"><button type="button" class="btn btn-sm btn-icon btn-danger" data-prop-del="${i}" title="Remove property" aria-label="Remove property">${trash}</button></td>
        </tr>`,
        )
        .join('')}</tbody>
    </table>
    <datalist id="of-prop-names">${M.PROPERTY_NAMES.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div class="of-row-actions"><button type="button" class="btn btn-sm" id="of-prop-add">+ Add property</button></div>
    <div class="field-hint">Only ticked rows locate the element. Equivalent XPath: <code class="mono" id="of-attr-xpath"></code></div>`;

  const xpathPane = () => `
    <table class="of-table">
      <thead><tr><th class="of-col-detect" title="Selected locator">Use</th><th class="of-col-type">Type</th><th>XPath</th><th class="of-col-del"></th></tr></thead>
      <tbody>${
        draft.xpaths.length
          ? draft.xpaths
              .map(
                (x, i) => `<tr>
          <td class="of-col-detect"><input type="radio" name="of-xpath-sel" data-xpath-sel="${i}" ${i === draft.selectedXPath ? 'checked' : ''} aria-label="Use this XPath" /></td>
          <td><select data-xpath-type="${i}" aria-label="XPath type">${options(M.XPATH_TYPES, x.type)}</select></td>
          <td><input type="text" class="mono" data-xpath-value="${i}" value="${esc(x.value)}" autocomplete="off" spellcheck="false" aria-label="XPath" /></td>
          <td class="of-col-del"><button type="button" class="btn btn-sm btn-icon btn-danger" data-xpath-del="${i}" title="Remove XPath" aria-label="Remove XPath">${trash}</button></td>
        </tr>`,
              )
              .join('')
          : '<tr><td colspan="4" class="empty">No XPath yet</td></tr>'
      }</tbody>
    </table>
    <div class="of-row-actions"><button type="button" class="btn btn-sm" id="of-xpath-add">+ Add XPath</button></div>
    <div class="field-hint">The ticked XPath is used first; if it matches nothing at run time the others are tried in order.</div>`;

  const cssPane = () => `
    <div class="field"><label for="of-css">CSS selector</label>
      <input id="of-css" type="text" class="mono" value="${esc(draft.css)}" placeholder="#search-input" autocomplete="off" spellcheck="false" /></div>`;

  const rolePane = () => {
    const r = draft.role ?? { role: 'button', condition: 'equals' };
    return `
    <div class="of-grid">
      <div class="field"><label for="of-role">Role</label>
        <select id="of-role">${options(M.ROLES.includes(r.role) ? M.ROLES : [r.role, ...M.ROLES], r.role)}</select></div>
      <div class="field"><label for="of-role-cond">Match condition</label>
        <select id="of-role-cond">${options(M.ROLE_CONDITIONS, r.condition ?? 'equals', M.CONDITION_LABELS)}</select></div>
    </div>
    <div class="field"><label for="of-role-name">Accessible name</label>
      <input id="of-role-name" type="text" value="${esc(r.name ?? '')}" placeholder="Đặt mua" autocomplete="off" /></div>`;
  };

  const panes = { attributes: attributesPane, xpath: xpathPane, css: cssPane, role: rolePane };

  const html = `
    <form id="of-form" class="of-form" novalidate>
      <div class="field"><label for="of-key">Test object name *</label>
        <input id="of-key" type="text" value="${esc(key ? objNameOf(key) : '')}" placeholder="btn_dat_mua" autocomplete="off" required />
        <span class="field-hint mono" id="of-preview"></span></div>
      <div class="field"><span class="of-label">Selection method</span>
        <div class="btn-group kw-mode" role="tablist" aria-label="Selection method">
          ${M.METHODS.map((m) => `<button type="button" class="btn ${m === draft.method ? 'is-active' : ''}" data-of-method="${m}" role="tab" aria-selected="${m === draft.method}">${esc(M.METHOD_LABELS[m])}</button>`).join('')}
        </div></div>
      <div id="of-pane"></div>
      <details class="of-advanced" ${draft.frame ? 'open' : ''}><summary>Parent iframe</summary>
        <div class="field"><label for="of-frame">CSS selector of the iframe containing this element (leave blank for the main page)</label>
          <input id="of-frame" type="text" class="mono" value="${esc(draft.frame ?? '')}" placeholder="iframe#payment" autocomplete="off" /></div>
      </details>
      <div id="of-errors"></div>
      <div class="modal-foot" style="padding:12px 0 0">
        <button type="submit" class="btn btn-primary">${key ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost" id="of-cancel">Cancel</button>
      </div>
    </form>`;

  H.showPanel({
    title: key ? `Edit test object — ${key}` : 'New test object',
    html,
    wide: true,
    className: 'modal-obj',
    onMount: () => {
      const $ = H.$;
      const composeKey = () => {
        const name = $('#of-key').value.trim().replace(/\//g, '_');
        return name ? (dir ? `${dir}/${name}` : name) : '';
      };
      const preview = () => ($('#of-preview').textContent = composeKey() || ' ');
      const showErrors = (errors) =>
        ($('#of-errors').innerHTML = errors.length ? `<div class="note note-fail"><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '');
      const syncAttrXPath = () => {
        const el = $('#of-attr-xpath');
        if (el) el.textContent = M.attributesXPath(draft.properties.filter((p) => p.detect));
      };
      const renderPane = () => {
        $('#of-pane').innerHTML = panes[draft.method]();
        H.$$('[data-of-method]').forEach((b) => {
          const on = b.dataset.ofMethod === draft.method;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        syncAttrXPath();
        bindPane();
      };

      const bindPane = () => {
        const on = (sel, ev, fn) => H.$$(sel).forEach((el) => el.addEventListener(ev, fn));
        on('[data-prop-detect]', 'change', (e) => {
          draft.properties[e.target.dataset.propDetect].detect = e.target.checked;
          syncAttrXPath();
        });
        on('[data-prop-name]', 'input', (e) => {
          draft.properties[e.target.dataset.propName].name = e.target.value.trim();
          syncAttrXPath();
        });
        on('[data-prop-cond]', 'change', (e) => {
          draft.properties[e.target.dataset.propCond].condition = e.target.value;
          syncAttrXPath();
        });
        on('[data-prop-value]', 'input', (e) => {
          draft.properties[e.target.dataset.propValue].value = e.target.value;
          syncAttrXPath();
        });
        on('[data-prop-del]', 'click', (e) => {
          draft.properties.splice(Number(e.currentTarget.dataset.propDel), 1);
          renderPane();
        });
        $('#of-prop-add')?.addEventListener('click', () => {
          draft.properties.push({ name: '', condition: 'equals', value: '', detect: true });
          renderPane();
          H.$$('[data-prop-name]').at(-1)?.focus();
        });
        on('[data-xpath-sel]', 'change', (e) => (draft.selectedXPath = Number(e.target.dataset.xpathSel)));
        on('[data-xpath-type]', 'change', (e) => (draft.xpaths[e.target.dataset.xpathType].type = e.target.value));
        on('[data-xpath-value]', 'input', (e) => (draft.xpaths[e.target.dataset.xpathValue].value = e.target.value.trim()));
        on('[data-xpath-del]', 'click', (e) => {
          const i = Number(e.currentTarget.dataset.xpathDel);
          draft.xpaths.splice(i, 1);
          if (draft.selectedXPath >= draft.xpaths.length || draft.selectedXPath === i) draft.selectedXPath = 0;
          else if (draft.selectedXPath > i) draft.selectedXPath -= 1;
          renderPane();
        });
        $('#of-xpath-add')?.addEventListener('click', () => {
          draft.xpaths.push({ type: 'xpath:custom', value: '' });
          if (draft.xpaths.length === 1) draft.selectedXPath = 0;
          renderPane();
          H.$$('[data-xpath-value]').at(-1)?.focus();
        });
        $('#of-css')?.addEventListener('input', (e) => (draft.css = e.target.value.trim()));
        const role = () => (draft.role ??= { role: 'button', condition: 'equals' });
        $('#of-role')?.addEventListener('change', (e) => (role().role = e.target.value));
        $('#of-role-cond')?.addEventListener('change', (e) => (role().condition = e.target.value));
        $('#of-role-name')?.addEventListener('input', (e) => (role().name = e.target.value));
      };

      const collect = () => {
        const frame = $('#of-frame').value.trim();
        const object = {
          ...draft,
          name: draft.name,
          properties: draft.properties.filter((p) => p.name || p.value),
          xpaths: draft.xpaths.filter((x) => x.value),
          ...(frame ? { frame } : { frame: undefined }),
        };
        if (object.role && !object.role.name) delete object.role.condition;
        delete object.verify;
        if (object.selectedXPath >= object.xpaths.length) object.selectedXPath = 0;
        return object;
      };

      H.$$('[data-of-method]').forEach((b) =>
        b.addEventListener('click', () => {
          draft.method = b.dataset.ofMethod;
          if (draft.method === 'role' && !draft.role) draft.role = { role: 'button', condition: 'equals' };
          if (draft.method === 'attributes' && !draft.properties.length) draft.properties.push({ name: 'tag', condition: 'equals', value: '', detect: true });
          renderPane();
          showErrors([]);
        }),
      );
      $('#of-cancel').addEventListener('click', () => H.closePanel());
      $('#of-key').addEventListener('input', preview);

      $('#of-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newKey = composeKey();
        if (!newKey) {
          showErrors(['Test object name is required']);
          $('#of-key').focus();
          return;
        }
        const object = collect();
        const errors = M.validateObject(object);
        showErrors(errors);
        if (errors.length) return;
        try {
          const result = await H.api(`/api/keyword/objects?${pq()}`, { method: 'PUT', body: { key: newKey, previousKey: key, object } });
          if (key && result.key && result.key !== key) retargetObjectRefs((k) => (k === key ? result.key : null));
          H.closePanel();
          H.toast(result.renamedCases ? `Saved, and updated the new name in ${result.renamedCases} ${result.renamedCases === 1 ? 'test case' : 'test cases'}` : 'Test object saved', 'ok');
          if (dir) o.open[dir] = true;
          H.render();
        } catch (err) {
          showErrors([err.message]);
        }
      });

      preview();
      renderPane();
      $(key ? '[data-of-method].is-active' : '#of-key')?.focus();
    },
  });
}

async function removeObject(key, name) {
  const ok = await H.askConfirm({ title: 'Delete test object', message: `Delete test object "${name || key}"?`, okLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await H.api(`/api/keyword/objects?${pq()}&key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    H.toast('Test object deleted', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

/**
 * Đổi tên / dời object hay thư mục: server đã sửa khoá trong FILE test case, nhưng tab test case đang mở còn bản nháp cũ —
 * không sửa theo thì editor báo "test object … no longer exists" và bấm Lưu là ghi đè mất phần server vừa sửa.
 * `mapKey(khoá cũ)` trả khoá mới, hoặc null nếu không đổi. Sửa cả bản đã-lưu để tab không bị đánh dấu "chưa lưu" oan.
 */
function retargetObjectRefs(mapKey) {
  const apply = (tc) => {
    let changed = 0;
    for (const step of tc?.steps ?? []) {
      for (const call of step.keywords ?? []) {
        const next = call.object && mapKey(call.object);
        if (next && next !== call.object) {
          call.object = next;
          changed += 1;
        }
        const dest = call.args?.destination && mapKey(call.args.destination);
        if (dest && dest !== call.args.destination) {
          call.args.destination = dest;
          changed += 1;
        }
      }
    }
    return changed;
  };
  for (const tab of H.state.tabs) {
    if (tab.kind !== 'case' || !tab.draft || !apply(tab.draft) || !tab.saved) continue;
    const saved = JSON.parse(tab.saved);
    apply(saved);
    tab.saved = JSON.stringify(saved);
  }
}

async function moveObjectTo(key, folder) {
  if (objFolderOf(key) === folder) return;
  try {
    const r = await H.api('/api/keyword/objects/move', { method: 'POST', body: { project: PROJECT(), key, folder } });
    if (r.key) retargetObjectRefs((k) => (k === key ? r.key : null));
    OBJ().open[folder] = true;
    H.toast(r.renamedCases ? `Moved to ${folder || 'root'} — updated ${r.renamedCases} test case(s)` : `Moved to ${folder || 'root'}`, 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function createObjFolder(parent) {
  const form = await H.askForm({
    title: 'New folder',
    okLabel: 'Create',
    fields: [{ name: 'name', label: parent ? `Folder name (inside "${parent}")` : 'Folder name', required: true }],
  });
  if (!form) return;
  try {
    const r = await H.api('/api/keyword/objects/folder', { method: 'POST', body: { project: PROJECT(), path: parent ? `${parent}/${form.name}` : form.name } });
    OBJ().folder = r.path;
    if (parent) OBJ().open[parent] = true;
    H.openTab('objects');
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

async function renameObjFolder(path) {
  const current = path.split('/').pop();
  const form = await H.askForm({ title: 'Rename folder', okLabel: 'Rename', fields: [{ name: 'name', label: 'New name', value: current, required: true }] });
  if (!form || form.name === current) return;
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const renameTo = parent ? `${parent}/${form.name}` : form.name;
  try {
    const r = await H.api('/api/keyword/objects/folder', { method: 'POST', body: { project: PROJECT(), path, renameTo } });
    retargetObjectRefs((k) => (k.startsWith(`${path}/`) ? renameTo + k.slice(path.length) : null));
    const o = OBJ();
    if (o.folder === path || o.folder.startsWith(`${path}/`)) o.folder = renameTo + o.folder.slice(path.length);
    H.toast(r.renamedCases ? `Folder renamed — updated ${r.renamedCases} test case(s)` : 'Folder renamed', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

/** Thư mục object còn test case dùng thì không xoá được — liệt kê để người dùng trỏ test case sang object khác trước. */
async function showObjectFoldersInUse(blocked) {
  const lines = blocked.flatMap(({ path, usedBy }) => {
    const shown = usedBy.slice(0, 10).map((u) => `• ${u.testCase} → ${u.objects.map(objNameOf).join(', ')}`);
    const more = usedBy.length > shown.length ? [`… and ${usedBy.length - shown.length} more`] : [];
    return [`"${path}" has test objects still used by ${plural(usedBy.length, 'test case')}:`, ...shown, ...more];
  });
  await H.askConfirm({
    title: 'Cannot delete folder',
    message: [...lines, 'Point those test cases to other test objects first.'].join('\n'),
    okLabel: 'OK',
  });
}

async function removeObjectFolder(path) {
  const o = OBJ();
  await H.api(`/api/keyword/objects/folder?${pq()}&path=${encodeURIComponent(path)}&recursive=1`, { method: 'DELETE' });
  const inside = (p) => p === path || p.startsWith(`${path}/`);
  if (inside(o.folder)) o.folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const set = SEL.objects.set();
  for (const key of [...set]) if (inside(key.startsWith(DIR_KEY) ? key.slice(DIR_KEY.length) : key)) set.delete(key);
}

async function deleteObjFolder(path) {
  let contents;
  try {
    contents = await H.api(`/api/keyword/objects/folder?${pq()}&path=${encodeURIComponent(path)}`);
  } catch (err) {
    H.toast(err.message, 'error');
    return;
  }
  if (contents.usedBy.length) {
    await showObjectFoldersInUse([{ path, usedBy: contents.usedBy }]);
    return;
  }
  const hasItems = contents.folders > 0 || contents.objects > 0;
  const message = `Delete folder "${path}" ${branchLoss(contents.folders, contents.objects, 'test object')}?`;
  const ok = hasItems
    ? await H.askTypedConfirm({
        title: 'Delete folder',
        message: `${message}\nThis cannot be undone.`,
        expected: path.split('/').pop(),
        okLabel: `Delete ${plural(contents.objects, 'test object')}`,
      })
    : await H.askConfirm({ title: 'Delete folder', message, okLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await removeObjectFolder(path);
    H.toast('Folder deleted', 'ok');
    H.render();
  } catch (err) {
    H.toast(err.message, 'error');
  }
}

// ── Tab: Keyword (tra cứu) ──────────────────────────────────────────────────

function renderKeywordsTab() {
  const { esc } = H;
  const query = (KEY().kwQuery ?? '').trim().toLowerCase();
  const matches = (k) =>
    !query ||
    [k.label, k.id, k.summary, k.detail ?? '', ...k.args.map((a) => a.label)].some((v) => String(v).toLowerCase().includes(query));
  const shown = catalog.keywords.filter(matches);
  const blocks = catalog.groups
    .filter((g) => shown.some((k) => k.group === g.id))
    .map((g) => {
      const rows = shown
        .filter((k) => k.group === g.id)
        .map(
          (k) => `
          <tr>
            <td><div class="kwc-name">${keywordIcon(k)}<div><strong data-no-i18n>${esc(k.label)}</strong><div class="combo-sub mono">${esc(k.id)}</div></div></div></td>
            <td>${esc(k.object === true ? 'required' : k.object === 'optional' ? 'optional' : '—')}</td>
            <td class="cell-dim">${k.args.map((a) => `${esc(a.label)}${a.required ? ' *' : ''}`).join(', ') || '—'}</td>
            <td>${esc(k.summary)}${k.detail ? `<div class="combo-sub">${esc(k.detail)}</div>` : ''}</td>
          </tr>`,
        )
        .join('');
      return `<tr class="kw-group"><td colspan="4"><strong>${esc(g.label)}</strong></td></tr>${rows}`;
    })
    .join('');

  return `
    <div class="card">
      <div class="card-head">
        <div class="filters">
          <div class="field field-grow">
            <label for="kwc-q">Search</label>
            <input id="kwc-q" type="search" value="${esc(KEY().kwQuery ?? '')}" placeholder="name, id, argument, description" />
          </div>
        </div>
        <span class="muted">${shown.length}/${catalog.keywords.length} keywords</span>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width:220px">Keyword</th><th style="width:100px">Test object</th><th style="width:220px">Arguments</th><th>What it does</th></tr></thead>
            <tbody>${blocks || '<tr><td colspan="4" class="empty"><strong>No keyword matches</strong></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/** Từ ô tìm kiếm chung: mở tab Test objects đúng thư mục rồi mở hộp sửa test object. */
export async function revealObject(key) {
  const o = OBJ();
  o.folder = objFolderOf(key);
  o.q = '';
  const parts = o.folder ? o.folder.split('/') : [];
  parts.forEach((_, i) => {
    o.open[parts.slice(0, i + 1).join('/')] = true;
  });
  await H.openTab('objects');
  await openObjectForm(key);
}
