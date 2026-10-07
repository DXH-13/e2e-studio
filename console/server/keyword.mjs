/**
 * Console phía server cho "Tạo test case" — tạo test case tự động không cần code:
 *
 *   1. **Kho keyword / Test Object / Test Case** — đọc ghi thẳng ba loại file JSON mà runner
 *      (`e2e/shared/keyword/`) dùng. Cố ý không có tầng chuyển đổi nào ở giữa: thứ console
 *      lưu xuống chính là thứ runner đọc lên, nên sửa tay file cũng chạy được và ngược lại.
 *      Test case lưu theo **cây thư mục** dưới `testcases/`, không gom theo project.
 *   2. **Recorder** — bật/tắt tiến trình `e2e/tools/recorder.mjs` và đọc dòng sự kiện nó
 *      ghi ra, để màn hình hiện keyword theo thời gian thực trong lúc người dùng đang thao tác.
 *
 * Mô hình: Test Case → Test Step (có tên, gộp nhiều keyword) → Keyword. Giữ song song với
 * `shared/keyword/store.ts` + `engine.ts` — đổi luật ở đó thì đổi luôn ở đây.
 *
 * Console chỉ nghe trên 127.0.0.1 (xem `index.mjs`) nên các API này không lộ ra mạng.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { E2E_ROOT, CONSOLE_ROOT } from './store.mjs';
import { globalsAsEnv } from './globals-store.mjs';

// Mô hình test object dùng chung với engine Playwright — một nguồn, không song sinh.
export const OBJECT_MODEL_PATH = resolve(E2E_ROOT, 'shared/keyword/object-model.cjs');
const objectModel = createRequire(import.meta.url)(OBJECT_MODEL_PATH);

const CATALOG_PATH = resolve(E2E_ROOT, 'shared/keyword/catalog.json');
const TESTCASES_ROOT = resolve(E2E_ROOT, 'testcases');
/** Đuôi file test case — `.tc` trần như Katalon, cùng luật với `shared/keyword/store.ts`. Ruột là JSON. */
const TC_EXT = '.tc';
const isTcFile = (name) => name.endsWith(TC_EXT);
const idOf = (name) => name.slice(0, -TC_EXT.length);
const TMP_DIR = resolve(CONSOLE_ROOT, 'data');

/** Gốc cây test case của một project: testcases/<project>/. */
function projectRoot(project) {
  if (!safeCode(project)) throw new Error('Invalid project code');
  return resolve(TESTCASES_ROOT, project);
}

/** Mã project đi thẳng vào tên file. */
const safeCode = (v) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(v ?? ''));

/** Đường dẫn trong cây: chặn `..` và ký tự hệ thống file không nhận. */
export function safePath(path) {
  const parts = String(path ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p === '.' || p === '..' || /[\\:*?"<>|]/.test(p)) {
      throw new Error(`Invalid folder/test case name: "${p}"`);
    }
  }
  return parts.join('/');
}

export function readCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
}

// ── Test Object — cây thư mục objects/<project>/**.to (giống test case) ──────

const TO_EXT = '.to';
const isToFile = (name) => name.endsWith(TO_EXT);
const objectsRoot = (partner) => {
  if (!safeCode(partner)) throw new Error('Invalid project code');
  return resolve(E2E_ROOT, 'objects', partner);
};
const legacyObjectsPath = (partner) => resolve(E2E_ROOT, 'objects', `${partner}.json`);

function objectFile(partner, key) {
  const rel = safePath(key);
  if (!rel) throw new Error('Test object name is empty');
  return resolve(objectsRoot(partner), `${rel}${TO_EXT}`);
}

function writeObjectFile(partner, key, object) {
  const file = objectFile(partner, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(object, null, 2)}\n`, 'utf8');
}

/** Kho cũ objects/<project>.json (một file gộp) → mỗi object một file .to; chạy một lần khi gặp. */
function migrateLegacyObjects(partner) {
  const legacy = legacyObjectsPath(partner);
  if (!existsSync(legacy) || existsSync(objectsRoot(partner))) return;
  const raw = JSON.parse(readFileSync(legacy, 'utf8'));
  for (const [key, object] of Object.entries(raw.objects ?? {})) writeObjectFile(partner, key, object);
  renameSync(legacy, `${legacy}.migrated`);
}

/** Toàn bộ object của project: { objects: { 'Màn/tên': {...} } } — khoá = đường dẫn file bỏ đuôi. */
export function readObjects(partner) {
  migrateLegacyObjects(partner);
  const objects = {};
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      else if (isToFile(entry.name)) {
        const key = `${rel ? `${rel}/` : ''}${entry.name.slice(0, -TO_EXT.length)}`;
        try {
          objects[key] = objectModel.normalizeObject(JSON.parse(readFileSync(abs, 'utf8')));
        } catch {
          objects[key] = { ...objectModel.normalizeObject({ name: `${key} (corrupt file)` }), broken: true };
        }
      }
    }
  };
  walk(objectsRoot(partner), '');
  return { objects };
}

/** Cây thư mục object cho sidebar: thư mục (đệ quy) + file .to trong từng thư mục. */
export function readObjectTree(partner) {
  migrateLegacyObjects(partner);
  const filesIn = (dir, rel) =>
    readdirSync(dir)
      .filter(isToFile)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((file) => {
        const key = `${rel ? `${rel}/` : ''}${file.slice(0, -TO_EXT.length)}`;
        try {
          const o = objectModel.normalizeObject(JSON.parse(readFileSync(join(dir, file), 'utf8')));
          return { key, name: o.name || key.split('/').pop(), method: o.method, summary: objectModel.summary(o) };
        } catch {
          return { key, name: `${key} (corrupt file)`, method: '', summary: '', broken: true };
        }
      });
  const build = (dir, rel) => {
    if (!existsSync(dir)) return { folders: [], files: [] };
    const folders = [];
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (!entry.isDirectory()) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const sub = build(join(dir, entry.name), path);
      folders.push({ path, name: entry.name, total: sub.files.length + sub.folders.reduce((n, c) => n + c.total, 0), children: sub.folders, files: sub.files });
    }
    return { folders, files: filesIn(dir, rel) };
  };
  return build(objectsRoot(partner), '');
}

/** Mọi keyword call trong một test case, phẳng — để tìm "ai đang dùng đối tượng X". */
const callsOf = (tc) => (tc.steps ?? []).flatMap((st) => st.keywords ?? []);

/** Đổi khoá object trong MỌI test case đang trỏ tới nó — không làm thế thì đổi tên là gãy hàng loạt bài. */
function renameObjectRefs(partner, from, to) {
  let renamed = 0;
  for (const tc of listAllCases(partner)) {
    let touched = false;
    for (const call of callsOf(tc)) {
      if (call.object === from) {
        call.object = to;
        touched = true;
      }
      if (call.args?.destination === from) {
        call.args.destination = to;
        touched = true;
      }
    }
    if (touched) {
      saveCase(partner, tc);
      renamed += 1;
    }
  }
  return renamed;
}

/** Thêm/sửa một object. Đổi khoá (đổi tên hoặc dời thư mục) thì cập nhật luôn test case đang dùng. */
export function putObject(partner, { key, previousKey, object }) {
  const clean = safePath(key);
  if (!clean) throw new Error('Invalid test object name');
  // Tiền tố btn_/input_/label_… (catalog.objectTypes) chỉ là quy ước đặt tên, không bắt buộc.
  const moving = previousKey && previousKey !== clean;
  if (moving && existsSync(objectFile(partner, clean))) throw new Error(`A test object named "${clean}" already exists`);
  const errors = objectModel.validateObject(object);
  if (errors.length) throw new Error(errors.join('; '));
  // normalizeObject chỉ giữ trường của mô hình — trường lạ từ trình duyệt (broken, summary…) không lọt xuống file.
  writeObjectFile(partner, clean, objectModel.normalizeObject(object));
  let renamedCases = 0;
  if (moving) {
    const old = objectFile(partner, previousKey);
    if (existsSync(old)) rmSync(old);
    renamedCases = renameObjectRefs(partner, previousKey, clean);
  }
  return { key: clean, renamedCases };
}

/** Xoá một object — từ chối nếu còn test case dùng, kèm danh sách để người dùng biết sửa ở đâu. */
export function deleteObject(partner, key) {
  const used = listAllCases(partner)
    .filter((tc) => callsOf(tc).some((c) => c.object === key))
    .map((tc) => tc.name);
  if (used.length) {
    throw new Error(`${used.length} test case(s) still use this test object: ${used.join(', ')}`);
  }
  const file = objectFile(partner, key);
  if (existsSync(file)) rmSync(file);
}

/** Dời object sang thư mục khác (kéo-thả trên cây) — chính là đổi khoá, test case đi theo. */
export function moveObject(partner, key, folder) {
  const name = key.split('/').pop();
  const target = safePath(folder) ? `${safePath(folder)}/${name}` : name;
  if (target === key) return { key, moved: false, renamedCases: 0 };
  const object = readObjects(partner).objects[key];
  if (!object) throw new Error('No such test object');
  const r = putObject(partner, { key: target, previousKey: key, object });
  return { key: target, moved: true, renamedCases: r.renamedCases };
}

export function createObjectFolder(partner, path) {
  const rel = safePath(path);
  if (!rel) throw new Error('Folder name is empty');
  mkdirSync(resolve(objectsRoot(partner), rel), { recursive: true });
  return rel;
}

/** Đổi tên/dời thư mục object: mọi khoá bên trong đổi theo, test case đang dùng được cập nhật. */
export function renameObjectFolder(partner, path, newPath) {
  const from = safePath(path);
  const to = safePath(newPath);
  const fromDir = resolve(objectsRoot(partner), from);
  const toDir = resolve(objectsRoot(partner), to);
  if (!existsSync(fromDir)) throw new Error('Folder does not exist');
  if (existsSync(toDir)) throw new Error('A folder with that name already exists at the destination');
  const keys = Object.keys(readObjects(partner).objects).filter((k) => k === from || k.startsWith(`${from}/`));
  mkdirSync(dirname(toDir), { recursive: true });
  renameSync(fromDir, toDir);
  let renamedCases = 0;
  for (const k of keys) renamedCases += renameObjectRefs(partner, k, to + k.slice(from.length));
  return { renamedCases };
}

/** Đếm thư mục con và file (theo đuôi) nằm trong một nhánh. */
function countBranch(dir, isItem) {
  let folders = 0;
  let items = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      folders += 1;
      const sub = countBranch(join(dir, entry.name), isItem);
      folders += sub.folders;
      items += sub.items;
    } else if (isItem(entry.name)) {
      items += 1;
    }
  }
  return { folders, items };
}

function branchDir(root, path) {
  const clean = safePath(path);
  if (!clean) throw new Error('The root folder cannot be deleted');
  return { clean, dir: resolve(root, clean) };
}

/** Nội dung nhánh object trước khi xoá: bao nhiêu thư mục/object, object nào còn test case dùng. */
export function objectFolderContents(partner, path) {
  const { clean, dir } = branchDir(objectsRoot(partner), path);
  if (!existsSync(dir)) return { folders: 0, objects: 0, usedBy: [] };
  const { folders, items } = countBranch(dir, isToFile);
  const keys = new Set(Object.keys(readObjects(partner).objects).filter((k) => k.startsWith(`${clean}/`)));
  const usedBy = listAllCases(partner)
    .map((tc) => ({ testCase: tc.folder ? `${tc.folder}/${tc.name}` : tc.name, objects: [...new Set(callsOf(tc).map((c) => c.object).filter((o) => keys.has(o)))] }))
    .filter((u) => u.objects.length);
  return { folders, objects: items, usedBy };
}

/** Xoá thư mục object. Cả nhánh chỉ khi `recursive` VÀ không object nào trong nhánh còn test case dùng. */
export function deleteObjectFolder(partner, path, { recursive = false } = {}) {
  const { dir } = branchDir(objectsRoot(partner), path);
  if (!existsSync(dir)) return;
  if (!recursive) {
    if (readdirSync(dir).length > 0) throw new Error('Folder is not empty — clear it out before deleting');
    rmdirSync(dir);
    return;
  }
  const { usedBy } = objectFolderContents(partner, path);
  if (usedBy.length) {
    throw new Error(`${usedBy.length} test case(s) still use test objects in this folder: ${usedBy.map((u) => u.testCase).join(', ')}`);
  }
  rmSync(dir, { recursive: true });
}

// ── Test Case — cây thư mục ────────────────────────────────────────────────

const casePath = (tc) => (tc.folder ? `${tc.folder}/${tc.id}` : tc.id);

/** Duyệt cả cây, trả về mọi test case (kèm `folder`). File hỏng thì bỏ qua, không chặn cả danh sách. */
export function listAllCases(project = null) {
  const out = [];
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      else if (isTcFile(entry.name)) {
        try {
          const tc = JSON.parse(readFileSync(abs, 'utf8'));
          out.push({ ...tc, id: tc.id || idOf(entry.name), folder: rel });
        } catch {
          /* console báo riêng ở cây */
        }
      }
    }
  };
  walk(project ? projectRoot(project) : TESTCASES_ROOT, '');
  return out;
}

/**
 * Cây THƯ MỤC để console vẽ — chỉ thư mục, không có file (file `.tc` chỉ liệt kê ở
 * bảng bên phải, có phân trang). Mỗi nút mang `cases` (số file ngay trong nó) và `total` (cả nhánh).
 * Trả cả thư mục RỖNG: người dùng tạo thư mục trước rồi mới bỏ test case vào là chuyện thường, mà
 * thư mục rỗng biến mất khỏi cây thì họ tưởng tạo hỏng.
 */
export function readTree(project) {
  const filesIn = (dir, rel) =>
    readdirSync(dir)
      .filter(isTcFile)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((file) => {
        const id = idOf(file);
        const path = rel ? `${rel}/${id}` : id;
        try {
          const tc = JSON.parse(readFileSync(join(dir, file), 'utf8'));
          const manual = !callsOf(tc).length || (tc.steps ?? []).some((st) => !st.disabled && !(st.keywords ?? []).length);
          return { path, name: tc.name || id, partner: tc.partner ?? null, manual, tags: tc.tags ?? [] };
        } catch {
          return { path, name: `${id} (corrupt file)`, partner: null, manual: true, broken: true, tags: [] };
        }
      });
  const build = (dir, rel) => {
    if (!existsSync(dir)) return { folders: [], files: [] };
    const folders = [];
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const sub = build(join(dir, entry.name), path);
      folders.push({
        type: 'folder',
        path,
        name: entry.name,
        cases: sub.files.length,
        total: sub.files.length + sub.folders.reduce((s, c) => s + c.total, 0),
        children: sub.folders,
        files: sub.files,
      });
    }
    return { folders, files: filesIn(dir, rel) };
  };
  return build(projectRoot(project), '');
}

/**
 * Test case dưới một thư mục (đệ quy), kèm số step/keyword và lỗi khuôn — phần "tĩnh" của danh
 * sách; trạng thái chạy do `index.mjs` chấm thêm từ DB. File hỏng vẫn có dòng để người dùng thấy.
 */
export function listCasesUnder(project, folder, catalog, objectsByPartner, { recursive = true } = {}) {
  const root = safePath(folder ?? '');
  const out = [];
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
        continue;
      }
      if (!isTcFile(entry.name)) continue;
      const id = idOf(entry.name);
      const path = rel ? `${rel}/${id}` : id;
      try {
        const tc = upgradeLegacy({ ...JSON.parse(readFileSync(abs, 'utf8')), id, folder: rel });
        out.push({
          path,
          folder: rel,
          name: tc.name || id,
          partner: tc.partner,
          tcIds: tc.tcIds ?? [],
          tags: tc.tags ?? [],
          steps: (tc.steps ?? []).length,
          keywords: callsOf(tc).length,
          // Step còn thủ công (không keyword, không bị tắt) — bài chỉ chạy được khi số này = 0.
          manualSteps: (tc.steps ?? []).filter((st) => !st.disabled && !(st.keywords ?? []).length).length,
          updatedAt: tc.updatedAt ?? null,
          problems: validateCase(tc, catalog, objectsByPartner(tc.partner)),
        });
      } catch {
        out.push({ path, folder: rel, name: `${id} (corrupt file)`, broken: true, partner: null, tcIds: [], tags: [], steps: 0, keywords: 0, problems: ['Unreadable JSON file'] });
      }
    }
  };
  walk(root ? resolve(projectRoot(project), root) : projectRoot(project), root);
  return out;
}

/** File cũ còn `setText` (đã gộp vào Send Keys): đọc lên là đổi, lưu lại là hết. */
function upgradeLegacy(tc) {
  for (const step of tc.steps ?? [])
    for (const call of step.keywords ?? [])
      if (call.keyword === 'setText') {
        call.keyword = 'sendKeys';
        call.args = { keys: call.args?.value ?? '' };
      }
  return tc;
}

export function readCase(project, path) {
  const rel = safePath(path);
  const file = resolve(projectRoot(project), `${rel}${TC_EXT}`);
  if (!existsSync(file)) return null;
  const tc = upgradeLegacy(JSON.parse(readFileSync(file, 'utf8')));
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  return { ...tc, id: rel.slice(rel.lastIndexOf('/') + 1), folder };
}

/** Sinh mã file từ tên test case — không dấu, chữ thường, gạch nối. */
export function slugOf(name) {
  const base = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `tc-${Date.now().toString(36)}`;
}

/**
 * Lưu test case. `previousPath` khác đường dẫn mới nghĩa là đổi tên file / dời thư mục — xoá
 * file cũ sau khi ghi xong file mới, để không bao giờ rơi vào cảnh mất cả hai.
 */
export function saveCase(project, tc, previousPath) {
  const root = projectRoot(project);
  if (!tc.name?.trim()) throw new Error('Test case must have a name');
  const id = tc.id?.trim() || slugOf(tc.name);
  const folder = safePath(tc.folder ?? '');
  const rel = safePath(folder ? `${folder}/${id}` : id);
  const file = resolve(root, `${rel}${TC_EXT}`);

  if (previousPath && safePath(previousPath) !== rel && existsSync(file)) {
    throw new Error(`Another test case already exists at "${rel}" — change the id or pick a different folder`);
  }

  mkdirSync(dirname(file), { recursive: true });
  // Project của test case = project chứa nó; runner lọc theo trường này.
  const body = { ...tc, partner: project, id, folder, updatedAt: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  if (previousPath && safePath(previousPath) !== rel) {
    const old = resolve(root, `${safePath(previousPath)}${TC_EXT}`);
    if (existsSync(old)) rmSync(old);
  }
  return body;
}

export function deleteCase(project, path) {
  const file = resolve(projectRoot(project), `${safePath(path)}${TC_EXT}`);
  if (existsSync(file)) rmSync(file);
}

/**
 * Dời một test case sang thư mục khác (kéo-thả trên cây). Ghi file ở chỗ mới xong mới xoá chỗ cũ
 * (qua `saveCase` + `previousPath`), trùng tên ở đích thì từ chối chứ không đè.
 */
export function moveCase(project, path, folder) {
  const tc = readCase(project, path);
  if (!tc) throw new Error('No such test case');
  const target = safePath(folder ?? '');
  if (target === tc.folder) return { path: safePath(path), moved: false };
  const saved = saveCase(project, { ...tc, folder: target }, path);
  return { path: target ? `${target}/${saved.id}` : saved.id, moved: true };
}

export function createFolder(project, path) {
  const rel = safePath(path);
  if (!rel) throw new Error('Folder name is empty');
  mkdirSync(resolve(projectRoot(project), rel), { recursive: true });
  return rel;
}

/** Đổi tên / dời thư mục — mọi test case bên trong đi theo, đường dẫn của chúng tự đúng. */
export function renameFolder(project, path, newPath) {
  const from = resolve(projectRoot(project), safePath(path));
  const to = resolve(projectRoot(project), safePath(newPath));
  if (!existsSync(from)) throw new Error('Folder does not exist');
  if (existsSync(to)) throw new Error('A folder with that name already exists at the destination');
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

export function folderContents(project, path) {
  const { dir } = branchDir(projectRoot(project), path);
  if (!existsSync(dir)) return { folders: 0, cases: 0 };
  const { folders, items } = countBranch(dir, isTcFile);
  return { folders, cases: items };
}

/** Xoá thư mục test case. Không `recursive` thì chỉ xoá khi rỗng; có thì xoá cả nhánh (UI đã hỏi xác nhận kèm số lượng). */
export function deleteFolder(project, path, { recursive = false } = {}) {
  const { dir } = branchDir(projectRoot(project), path);
  if (!existsSync(dir)) return;
  if (recursive) {
    rmSync(dir, { recursive: true });
    return;
  }
  if (readdirSync(dir).length > 0) throw new Error('Folder is not empty — clear it out before deleting');
  // rmSync không recursive từ chối thư mục (EISDIR) — rmdirSync mới xoá được thư mục rỗng.
  rmdirSync(dir);
}

/**
 * Kiểm test case bằng đúng luật của runner, nhưng chạy ngay lúc soạn.
 *
 * Người dùng không-cần-code sẽ không đọc log Playwright; báo lỗi ngay dưới bảng là cách duy nhất
 * để họ tự sửa được. Giữ song song với `validate()` trong `shared/keyword/engine.ts`.
 */
export function validateCase(tc, catalog, repo) {
  const byId = new Map(catalog.keywords.map((k) => [k.id, k]));
  const problems = [];
  const seen = new Set();
  (tc.variables ?? []).forEach((v, i) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name ?? '')) problems.push(`Variable ${i + 1}: name "${v.name ?? ''}" is invalid (letters, digits, _)`);
    else if (seen.has(v.name)) problems.push(`Variable ${i + 1}: name "${v.name}" is duplicated`);
    seen.add(v.name);
  });
  if (!Array.isArray(tc.steps) || tc.steps.length === 0) return [...problems, 'Test case has no test steps yet'];
  tc.steps.forEach((step, si) => {
    if (step.disabled) return;
    const stepAt = `Test step ${si + 1}${step.name ? ` «${step.name}»` : ''}`;
    // Step chưa có keyword là BƯỚC THỦ CÔNG (bài nhập từ Excel) — hợp lệ, chỉ là chưa tự động hoá.
    if (!Array.isArray(step.keywords) || step.keywords.length === 0) return;
    step.keywords.forEach((call, ci) => {
      if (call.disabled) return;
      const spec = byId.get(call.keyword);
      const at = `${stepAt} → keyword ${ci + 1}`;
      if (!spec) {
        problems.push(`${at}: no keyword "${call.keyword}"`);
        return;
      }
      if (spec.object === true && !call.object) problems.push(`${at} (${spec.label}): no test object selected`);
      if (call.object && !repo.objects[call.object]) {
        problems.push(`${at} (${spec.label}): test object "${call.object}" not found in the repository`);
      }
      for (const a of spec.args) {
        if (!a.required) continue;
        const v = call.args?.[a.name];
        if (v === undefined || v === '') problems.push(`${at} (${spec.label}): missing "${a.label}"`);
      }
    });
  });
  return problems;
}

// ── Recorder ───────────────────────────────────────────────────────────────

/**
 * Một phiên ghi tại một thời điểm.
 *
 * Cố ý không cho ghi song song: recorder mở một cửa sổ trình duyệt thật và ghi vào cùng một kho
 * đối tượng — hai phiên cùng lúc sẽ tranh nhau file và người dùng cũng không thao tác nổi hai
 * cửa sổ một lúc.
 */
let session = null;

export function recorderStatus() {
  if (!session) return { running: false };
  const events = [];
  if (existsSync(session.eventsFile)) {
    for (const line of readFileSync(session.eventsFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        /* dòng ghi dở lúc đang đọc — vòng sau sẽ có đủ */
      }
    }
  }
  // Gom lại thành test step để console vẽ đúng cây mà recorder sẽ lưu.
  const steps = [];
  for (const ev of events) {
    if (!steps[ev.stepIndex]) steps[ev.stepIndex] = { name: ev.stepName, keywords: [] };
    steps[ev.stepIndex].keywords.push(ev.call);
  }
  return {
    running: session.running,
    partner: session.partner,
    env: session.env,
    name: session.name,
    folder: session.folder,
    id: session.id,
    startedAt: session.startedAt,
    steps: steps.filter(Boolean),
    savedPath: session.savedPath ?? null,
    error: session.error ?? null,
    log: session.log.slice(-40).join('\n'),
  };
}

export function startRecording({ project, env, name, folder, browser }) {
  if (session?.running) throw new Error('Another recording session is in progress — stop it first.');
  if (!safeCode(project)) throw new Error('Invalid project code');
  const partner = project;
  if (!name?.trim()) throw new Error('Name the test case before recording');

  mkdirSync(TMP_DIR, { recursive: true });
  const id = slugOf(name);
  const eventsFile = resolve(TMP_DIR, 'recording.events');
  const controlFile = resolve(TMP_DIR, 'recording.control');
  for (const f of [eventsFile, controlFile]) if (existsSync(f)) rmSync(f);
  writeFileSync(eventsFile, '', 'utf8');

  const safeFolder = safePath(folder ?? 'Recordings') || 'Recordings';
  const args = [
    resolve(E2E_ROOT, 'tools/recorder.mjs'),
    '--partner', partner,
    '--env', env || 'local',
    '--name', name.trim(),
    '--id', id,
    '--folder', `${project}/${safeFolder}`,
    '--events', eventsFile,
    '--control', controlFile,
  ];
  if (['chromium', 'msedge', 'firefox'].includes(browser)) args.push('--browser', browser);

  const child = spawn(process.execPath, args, { cwd: E2E_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...globalsAsEnv(partner) } });

  session = {
    child, partner, env: env || 'local', name: name.trim(), folder: safeFolder, id,
    eventsFile, controlFile, running: true, log: [], savedPath: null, error: null,
    startedAt: new Date().toISOString(),
  };

  const readLines = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.trim()) continue;
      session.log.push(line);
      // Recorder in dòng này khi đã ghi xong file — console dựa vào đó để mở thẳng bản vừa ghi.
      if (line.startsWith('RECORDER_SAVED ')) {
        // Recorder báo đường dẫn tính từ testcases/; console làm việc tính từ thư mục project.
        session.savedPath = line.slice('RECORDER_SAVED '.length).trim().replace(`${project}/`, '');
      }
    }
  };
  child.stdout.on('data', readLines);
  child.stderr.on('data', readLines);
  child.on('exit', (code) => {
    session.running = false;
    if (code !== 0 && !session.savedPath) {
      const marked = session.log.findLast((l) => l.startsWith('RECORDER_ERROR '));
      session.error = marked ? marked.slice('RECORDER_ERROR '.length).trim() : session.log.slice(-6).join('\n') || `Recorder exited with code ${code}`;
    }
  });

  return recorderStatus();
}

/** Dừng bằng file điều khiển chứ không bắn tín hiệu: Windows không kill mềm được tiến trình con. */
export function stopRecording() {
  if (!session) return { running: false };
  if (session.running) writeFileSync(session.controlFile, 'stop', 'utf8');
  return recorderStatus();
}

/** Quên phiên đã xong để lần ghi sau bắt đầu sạch. */
export function clearRecording() {
  if (session?.running) throw new Error('Recording session is still running');
  session = null;
  return { running: false };
}

/** Bỏ dấu tiếng Việt + hạ chữ thường để "dang nhap" khớp "Đăng nhập". */
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/**
 * Tìm test case + test object của một project cho ô tìm kiếm chung. Mọi từ trong câu hỏi đều phải khớp
 * ở một trường nào đó; trường quan trọng (mã, tên) được trọng số cao, khớp đầu chuỗi cao hơn khớp giữa.
 */
export function searchProject(project, query, limit = 12) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return { cases: [], objects: [] };

  const score = (fields) => {
    let total = 0;
    for (const term of terms) {
      let best = 0;
      for (const [text, weight] of fields) {
        const s = fold(text);
        if (!s.includes(term)) continue;
        best = Math.max(best, s === term ? weight * 3 : s.startsWith(term) ? weight * 2 : weight);
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  };
  const top = (rows) => rows.filter(Boolean).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'en')).slice(0, limit);

  const cases = top(
    listAllCases(project).map((tc) => {
      const steps = (tc.steps ?? []).map((s) => s.name).join(' ');
      const s = score([[tc.id, 5], [tc.name, 4], [(tc.tcIds ?? []).join(' '), 4], [tc.folder, 2], [steps, 1]]);
      return s ? { score: s, label: tc.name ?? tc.id, kind: 'case', path: casePath(tc), id: tc.id, name: tc.name ?? '', folder: tc.folder ?? '' } : null;
    }),
  );
  const objects = top(
    Object.entries(readObjects(project).objects ?? {}).map(([key, obj]) => {
      const folder = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
      const s = score([[key.split('/').pop(), 5], [obj.name, 3], [obj.screen, 2], [folder, 2], [objectModel.summary(obj), 1]]);
      return s ? { score: s, label: key, kind: 'object', key, name: obj.name ?? '', folder, method: obj.method ?? '', summary: objectModel.summary(obj) } : null;
    }),
  );
  return { cases, objects };
}
