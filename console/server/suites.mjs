/**
 * Test suite kiểu akaAT Studio (2.10 Test Suites): gom test case đã có, mỗi test case một run profile và các
 * round ghi đè biến. Lưu `e2e/testsuites/<project>/<id>.suite` (JSON) — runner đọc chính file này qua
 * `--suite`, song sinh với `readTestSuite` ở `e2e/shared/keyword/store.ts`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { E2E_ROOT } from './store.mjs';
import { listAllCases, safePath } from './keyword.mjs';

const SUITE_EXT = '.suite';

const suitesRoot = (project) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(project ?? ''))) throw new Error('Invalid project code');
  return resolve(E2E_ROOT, 'testsuites', project);
};
const suiteFile = (project, path) => {
  const rel = safePath(path);
  if (!rel) throw new Error('Test suite name is empty');
  return resolve(suitesRoot(project), `${rel}${SUITE_EXT}`);
};

/** Tên hiển thị → tên file: bỏ dấu, chữ thường, gạch nối — giống cách đặt id test case. */
function slug(name) {
  return (
    String(name ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'test-suite'
  );
}

const casePathOf = (tc) => (tc.folder ? `${tc.folder}/${tc.id}` : tc.id);
const isRunnable = (tc) => (tc.steps ?? []).length > 0 && tc.steps.every((s) => s.disabled || (s.keywords ?? []).length > 0);

/** Test case của project kèm biến cục bộ — cho wizard Add Test Case và để chấm lỗi suite. */
export function suiteCaseCatalog(project) {
  return listAllCases(project)
    .filter((tc) => (tc.partner ?? project) === project)
    .map((tc) => ({
      path: casePathOf(tc),
      name: tc.name,
      folder: tc.folder ?? '',
      tcIds: tc.tcIds ?? [],
      runnable: isRunnable(tc),
      variables: (tc.variables ?? []).map((v) => ({ name: v.name, value: v.value ?? '' })),
    }));
}

function problemsOf(suite, catalog) {
  const byPath = new Map(catalog.map((c) => [c.path, c]));
  const problems = [];
  for (const entry of suite.testCases ?? []) {
    if (entry.enabled === false) continue;
    const tc = byPath.get(entry.path);
    if (!tc) problems.push(`"${entry.path}" no longer exists`);
    else if (!tc.runnable) problems.push(`"${tc.name}" still has manual steps`);
  }
  return problems;
}

/** Số test sẽ chạy: mỗi test case đang tick × số round đang tick (không có round = 1). */
function plannedCount(suite) {
  return (suite.testCases ?? [])
    .filter((e) => e.enabled !== false)
    .reduce((n, e) => {
      const rows = e.testData?.dataset ? (e.testData.rows ?? []).length : 0;
      const rounds = (e.rounds ?? []).filter((r) => r.enabled !== false).length;
      return n + (rows + rounds || (e.testData?.dataset || e.rounds?.length ? 0 : 1));
    }, 0);
}

export function listSuites(project) {
  const root = suitesRoot(project);
  const catalog = suiteCaseCatalog(project);
  const out = [];
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      else if (entry.name.endsWith(SUITE_EXT)) {
        const path = `${rel ? `${rel}/` : ''}${entry.name.slice(0, -SUITE_EXT.length)}`;
        try {
          const suite = JSON.parse(readFileSync(abs, 'utf8'));
          out.push({
            path,
            name: suite.name || path,
            testCases: (suite.testCases ?? []).length,
            tests: plannedCount(suite),
            concurrency: suite.concurrency ?? 1,
            updatedAt: suite.updatedAt ?? null,
            problems: problemsOf(suite, catalog),
          });
        } catch {
          out.push({ path, name: `${path} (corrupt file)`, testCases: 0, tests: 0, concurrency: 1, updatedAt: null, problems: ['Unreadable JSON file'], broken: true });
        }
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function readSuite(project, path) {
  const file = suiteFile(project, path);
  if (!existsSync(file)) return null;
  const suite = JSON.parse(readFileSync(file, 'utf8'));
  return { ...suite, path: safePath(path), problems: problemsOf(suite, suiteCaseCatalog(project)) };
}

/** Lưu suite. Suite mới (chưa có path) lấy tên file theo tên hiển thị; trùng tên thì từ chối chứ không đè. */
export function saveSuite(project, suite, previousPath) {
  const name = String(suite.name ?? '').trim();
  if (!name) throw new Error('Test suite name is required');
  const path = previousPath ? safePath(previousPath) : slug(name);
  const file = suiteFile(project, path);
  if (!previousPath && existsSync(file)) throw new Error(`A test suite named "${name}" already exists`);
  const concurrency = Math.min(8, Math.max(1, Number(suite.concurrency) || 1));
  const clean = {
    id: path.split('/').pop(),
    name,
    partner: project,
    concurrency,
    testCases: (suite.testCases ?? []).map((e) => ({
      id: e.id,
      path: safePath(e.path),
      ...(e.enabled === false ? { enabled: false } : {}),
      ...(e.profile ? { profile: e.profile } : {}),
      ...(e.testData?.dataset
        ? {
            testData: {
              dataset: String(e.testData.dataset),
              rows: (e.testData.rows ?? []).map(String),
              ...(e.testData.bindings && Object.keys(e.testData.bindings).length ? { bindings: e.testData.bindings } : {}),
            },
          }
        : {}),
      ...(e.rounds?.length
        ? {
            rounds: e.rounds.map((r) => ({
              id: r.id,
              name: String(r.name ?? '').trim() || 'Round',
              ...(r.enabled === false ? { enabled: false } : {}),
              values: Object.fromEntries(Object.entries(r.values ?? {}).filter(([k]) => k)),
            })),
          }
        : {}),
    })),
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  return { ...clean, path, problems: problemsOf(clean, suiteCaseCatalog(project)) };
}

export function deleteSuite(project, path) {
  const file = suiteFile(project, path);
  if (existsSync(file)) rmSync(file);
}
