/**
 * Console quản lý test — HTTP server không phụ thuộc thư viện ngoài.
 *
 * Chỉ lắng nghe trên 127.0.0.1: console chạy được test và đọc được file cấu hình
 * có secret, nên nó KHÔNG được mở ra mạng.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, relative, resolve, sep } from 'node:path';
import { E2E_ROOT, CONSOLE_ROOT } from './store.mjs';
import {
  loadDevices,
  loadEnvironments,
  loadPartners,
  findSuite,
  readEnvFile,
} from './registry.mjs';
import {
  deleteRun,
  getRun,
  isBusy,
  latestByRunKey,
  latestTestsByRunKey,
  listRuns,
  readRunLog,
  reportFile,
  startRun,
  stopRun,
  subscribe,
} from './runner.mjs';
import {
  createSchedule,
  decorate,
  deleteSchedule,
  fireSchedule,
  getSchedule,
  listSchedules,
  startScheduler,
  syncScheduleStatus,
  updateSchedule,
} from './scheduler.mjs';
import { describeDatabase, migrate } from './db/db.mjs';
import { importLegacyFiles, syncReports } from './db/import-legacy.mjs';
import { describeCron, nextRun } from './cron.mjs';
import { deleteSuite, listSuites, readSuite, saveSuite, suiteCaseCatalog } from './suites.mjs';
import { createProject, deleteProject, projectImpact } from './projects.mjs';
import { deleteDataset, listDatasets, readDatasetForClient, saveDataset } from './datasets.mjs';
import { readForClient, readTestData, suitesWithTestData, writeTestData } from './testdata-store.mjs';
import { deleteGlobalVariable, globalsAsEnv, listGlobalVariables, saveGlobalVariable } from './globals-store.mjs';
import {
  clearRecording,
  createFolder,
  deleteCase,
  deleteFolder,
  folderContents,
  objectFolderContents,
  deleteObject,
  createObjectFolder,
  deleteObjectFolder,
  fold,
  moveObject,
  readObjectTree,
  renameObjectFolder,
  listAllCases,
  listCasesUnder,
  putObject,
  readCase,
  readCatalog,
  readObjects,
  readTree,
  recorderStatus,
  renameFolder,
  saveCase,
  searchProject,
  OBJECT_MODEL_PATH,
  startRecording,
  stopRecording,
  moveCase,
  validateCase,
} from './keyword.mjs';

const PORT = Number(process.env.PORT ?? 5077);
const HOST = '127.0.0.1';
const WEB_DIR = resolve(CONSOLE_ROOT, 'web');
const REPORTS_DIR = resolve(E2E_ROOT, 'reports');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      // Không có lý do gì để console nhận body lớn — chặn sớm.
      if (size > 1000000) {
        fail(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        done({});
        return;
      }
      try {
        done(JSON.parse(raw));
      } catch {
        fail(new Error('Body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

/** Chặn `..` và đường dẫn tuyệt đối — chỉ cho đọc trong thư mục đã định. */
function safeJoin(root, relative) {
  const cleaned = normalize(relative).replace(/^[\\/]+/, '');
  const target = resolve(root, cleaned);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/**
 * Nhãn bộ test / tên partner hiện theo registry HIỆN TẠI, không theo bản lưu lúc chạy.
 *
 * Dòng `runs` lưu nhãn tại thời điểm chạy để lịch sử vẫn đọc được nếu bộ đó bị gỡ khỏi
 * `partners.json`; nhưng nhãn còn tồn tại thì đổi tên (vd dịch sang tiếng Anh) phải thấy ngay
 * trên mọi dòng cũ, không phải chỉ dòng mới.
 */
function withCurrentLabels(run) {
  if (!run) return run;
  const found = findSuite(run.partner, run.app);
  if (!found) return run;
  return { ...run, suiteLabel: found.suite.label, partnerName: found.partner.name };
}

function serveFile(res, path, options = {}) {
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('File not found');
    return;
  }
  const headers = {
    'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': statSync(path).size,
    'Cache-Control': 'no-store',
  };
  if (options.download) {
    // Tên tải về đặt riêng được: mọi lần chạy đều sinh ra file tên "index.html",
    // tải mấy lần là thư mục Downloads đầy index (1).html, (2).html — không biết cái nào của đâu.
    headers['Content-Disposition'] = `attachment; filename="${options.filename ?? path.split(sep).pop()}"`;
  }
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}

/**
 * Tất cả tổ hợp partner × bộ × môi trường, kèm kết quả lần chạy gần nhất.
 *
 * Lần chạy bằng dòng lệnh cũng có mặt: `syncReports` đã nhập summary.json của chúng vào DB
 * (trigger `cli`), nên không còn phải đọc đĩa ở đây.
 */
async function buildOverview() {
  const partners = loadPartners();
  const environments = loadEnvironments();
  const latest = await latestByRunKey();
  const rows = [];
  // Đọc mỗi file .env một lần thay vì một lần cho mỗi ô của ma trận.
  const envValues = new Map(environments.map((e) => [e.code, readEnvFile(e.code).values]));

  for (const partner of partners) {
    for (const suite of partner.suites) {
      for (const env of environments) {
        const runKey = `${partner.code}-${suite.app}-${env.code}`;
        const run = withCurrentLabels(latest.get(runKey));
        const blocked = env.readOnly && suite.writes;
        // Chưa từng chạy VÀ cũng không chạy được thì không bày ra cho rối.
        if (!run && (!suite.ready || blocked)) continue;
        rows.push({
          runKey,
          partner: partner.code,
          partnerName: partner.name,
          app: suite.app,
          suiteLabel: suite.label,
          category: suite.category,
          env: env.code,
          envName: env.name,
          ready: suite.ready,
          mocked: suite.mocked,
          blocked,
          // false = chưa có URL cho bộ đó ở Global variables của project lẫn file .env dự phòng — bấm Chạy chắc chắn lỗi.
          configured: !!(globalsAsEnv(partner.code)[suite.baseUrlKey] || envValues.get(env.code)?.[suite.baseUrlKey]),
          baseUrlKey: suite.baseUrlKey,
          running: isBusy(runKey),
          lastRun: run,
        });
      }
    }
  }
  return rows;
}

/** `2026-08-28` theo giờ máy — dùng làm khoá gom nhóm theo ngày. */
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Số liệu cho trang Tổng quan.
 *
 * Hai loại con số, đừng lẫn:
 *   - **hiện trạng** (`totals`) — lấy từ lần chạy GẦN NHẤT của mỗi tổ hợp. "Đang có
 *     bao nhiêu lỗi" là câu hỏi về trạng thái bây giờ, không phải tổng cộng dồn.
 *   - **theo thời gian** (`daily`) — cộng dồn theo ngày, cho hai biểu đồ.
 *
 * Lần chạy bằng dòng lệnh nay cũng vào DB (có mốc thời gian từ summary.json) nên lên
 * biểu đồ như lần chạy từ console; `cliOnly` chỉ còn để giao diện ghi chú số tổ hợp mà kết
 * quả mới nhất là do chạy tay.
 */
async function buildStats(days = 14, project = null) {
  const inProject = (r) => !project || r.partner === project;
  const overview = (await buildOverview()).filter(inProject);
  const runs = (await listRuns(5000)).filter(inProject);
  // Danh mục project có trường `code`, không phải `partner` như dòng run/overview.
  const partners = loadPartners().filter((p) => !project || p.code === project);

  const withRun = overview.filter((r) => r.lastRun);
  const totals = {
    suitesReady: partners.reduce((n, p) => n + p.suites.filter((s) => s.ready).length, 0),
    suitesTotal: partners.reduce((n, p) => n + p.suites.length, 0),
    // Tách theo nhóm để trang Tổng quan nói rõ có bao nhiêu bộ E2E giao diện, bao nhiêu bộ API.
    byCategory: Object.fromEntries(
      ['e2e'].map((cat) => {
        const suites = partners.flatMap((p) => p.suites.filter((s) => s.category === cat));
        const rows = withRun.filter((r) => r.category === cat);
        return [cat, {
          ready: suites.filter((s) => s.ready).length,
          total: suites.length,
          tests: rows.reduce((n, r) => n + (r.lastRun.totals?.total ?? 0), 0),
          failed: rows.reduce((n, r) => n + (r.lastRun.totals?.failed ?? 0), 0),
        }];
      }),
    ),
    partners: partners.length,
    environments: loadEnvironments().length,
    combosRun: withRun.length,
    combosTotal: overview.length,
    tests: withRun.reduce((n, r) => n + (r.lastRun.totals?.total ?? 0), 0),
    passed: withRun.reduce((n, r) => n + (r.lastRun.totals?.passed ?? 0), 0),
    failed: withRun.reduce((n, r) => n + (r.lastRun.totals?.failed ?? 0), 0),
    skipped: withRun.reduce((n, r) => n + (r.lastRun.totals?.skipped ?? 0), 0),
    // Test case nghiệp vụ trong danh mục, không trùng lặp giữa các partner dùng chung bộ TC.
    // Hệ thống chỉ có một loại test case: file .tc.
    catalogCases: listAllCases(project).length,
  };

  // Khung ngày liên tục để biểu đồ không nhảy cóc qua ngày không chạy gì.
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(dayKey(d.toISOString()), { date: dayKey(d.toISOString()), runs: 0, failed: 0, passed: 0, tests: 0 });
  }

  for (const run of runs) {
    if (run.status === 'running') continue;
    const key = dayKey(run.startedAt);
    const b = buckets.get(key);
    if (!b) continue; // ngoài cửa sổ đang xem
    b.runs += 1;
    b.failed += run.totals?.failed ?? 0;
    b.passed += run.totals?.passed ?? 0;
    b.tests += run.totals?.total ?? 0;
  }

  return {
    totals,
    daily: [...buckets.values()],
    cliOnly: withRun.filter((r) => r.lastRun.trigger === 'cli').length,
    rows: overview,
  };
}

/** Danh sách test case của một thư mục: lọc theo project / trạng thái / chữ, rồi phân trang. */
async function buildCaseList(query) {
  const project = query.get('project') ?? '';
  const folder = query.get('folder') ?? '';
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const kind = query.get('kind') ?? ''; // '' | automated | manual
  const size = Math.min(200, Math.max(5, Number(query.get('size')) || 25));
  const page = Math.max(1, Number(query.get('page')) || 1);

  const catalog = readCatalog();
  const cache = new Map();
  const objectsByPartner = (code) => {
    if (!cache.has(code)) {
      try {
        cache.set(code, readObjects(code));
      } catch {
        cache.set(code, { objects: {} });
      }
    }
    return cache.get(code);
  };
  // Không chấm trạng thái chạy ở đây — kết quả xem ở Test results.
  // Màn danh sách kiểu Explorer: chỉ test case NẰM TRỰC TIẾP trong thư mục; có từ khoá tìm mới quét cả nhánh.
  let rows = listCasesUnder(project, folder, catalog, objectsByPartner, { recursive: Boolean(q) });
  // automated = MỌI step có keyword (chạy được); partial = mới gắn một phần; manual = chưa có keyword nào.
  const kindOf = (r) => (r.broken || !r.keywords ? 'manual' : r.manualSteps ? 'partial' : 'automated');
  const totals = {
    all: rows.length,
    automated: rows.filter((r) => kindOf(r) === 'automated').length,
    partial: rows.filter((r) => kindOf(r) === 'partial').length,
    manual: rows.filter((r) => kindOf(r) === 'manual').length,
  };
  if (kind) rows = rows.filter((r) => kindOf(r) === kind);
  if (q) {
    rows = rows.filter((r) =>
      [r.name, r.path, ...(r.tcIds ?? [])].some((v) => fold(v).includes(fold(q))),
    );
  }
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  return {
    folder,
    totals,
    total,
    page: current,
    pages,
    size,
    rows: rows.slice((current - 1) * size, current * size),
    // Nút "Run all": mọi bài tự động của CẢ NHÁNH (kể cả thư mục con) — bảng chỉ liệt kê bài nằm trực tiếp trong thư mục,
    // lấy theo bảng thì ở gốc/thư mục chỉ có thư mục con luôn ra 0. Đang tìm thì rows đã quét cả nhánh và lọc sẵn.
    automatedPaths: (q ? rows : listCasesUnder(project, folder, catalog, objectsByPartner, { recursive: true }))
      .filter((r) => kindOf(r) === 'automated')
      .map((r) => r.path),
  };
}

/** Liệt kê đệ quy file trong một thư mục. */
function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Kết quả từng test step / keyword của test case trong lần chạy gần nhất có nó: `{ "si": status, "si-ci": status }`.
 * Khớp test case theo annotation `case` do runner gắn; số thứ tự lấy từ tiêu đề `Step N:` / `N. …` mà runner đặt.
 */
const caseResultsByRun = new Map();
function caseResultsOf(run) {
  if (caseResultsByRun.has(run.id)) return caseResultsByRun.get(run.id);
  const out = new Map();
  try {
    const report = JSON.parse(readFileSync(resolve(E2E_ROOT, run.reportDir, 'results.json'), 'utf8'));
    const walk = (suite) => {
      for (const spec of suite.specs ?? [])
        for (const t of spec.tests ?? []) {
          const result = t.results?.at(-1);
          const path = [...(t.annotations ?? []), ...(result?.annotations ?? [])].find((a) => a.type === 'case')?.description;
          // Test case chạy nhiều dòng data: giữ lượt hỏng để không che lỗi.
          if (!path || !result || (out.has(path) && out.get(path).status !== 'passed')) continue;
          const steps = {};
          for (const s of result.steps ?? []) {
            const si = Number(/^\[[^\]]+\] Step (\d+):/.exec(s.title)?.[1]) - 1;
            if (Number.isNaN(si)) continue;
            steps[si] = s.error ? 'failed' : 'passed';
            for (const c of s.steps ?? []) {
              const ci = Number(/^(\d+)\. /.exec(c.title)?.[1]) - 1;
              if (!Number.isNaN(ci)) steps[`${si}-${ci}`] = c.error ? 'failed' : 'passed';
            }
          }
          out.set(path, { status: result.status === 'passed' ? 'passed' : 'failed', steps });
        }
      (suite.suites ?? []).forEach(walk);
    };
    (report.suites ?? []).forEach(walk);
  } catch {
    // Lần chạy không còn results.json (đã dọn / bị dừng giữa chừng): coi như không có kết quả.
  }
  caseResultsByRun.set(run.id, out);
  return out;
}

async function lastCaseRun(project, casePath) {
  for (const run of await listRuns(200)) {
    if (run.partner !== project || run.app !== 'keyword' || run.status === 'running' || !run.reportDir) continue;
    const hit = caseResultsOf(run).get(casePath);
    if (hit) return { runId: run.id, finishedAt: run.finishedAt, ...hit };
  }
  return null;
}

async function handleApi(req, res, url, method) {
  const path = url.pathname;

  if (path === '/api/meta') {
    json(res, 200, {
      partners: loadPartners(),
      environments: loadEnvironments(),
      ...loadDevices(),
      testDataSuites: suitesWithTestData(loadPartners()),
      e2eRoot: E2E_ROOT,
      database: describeDatabase(),
      // Trong container không có màn hình: giao diện ẩn "mở trình duyệt" và khoá nút ghi thao tác.
    });
    return true;
  }

  // Xoá project: bước 1 của hộp xác nhận đọc ảnh hưởng; DELETE đòi gõ lại đúng mã (kiểm cả ở server, không chỉ giao diện).
  if (path === '/api/projects/impact' && method === 'GET') {
    try {
      json(res, 200, projectImpact(url.searchParams.get('code') ?? ''));
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  if (path === '/api/projects' && method === 'DELETE') {
    const body = await readBody(req);
    try {
      json(res, 200, await deleteProject(url.searchParams.get('code') ?? '', { confirm: body.confirm }));
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  if (path === '/api/projects' && method === 'POST') {
    try {
      json(res, 200, { project: createProject(await readBody(req)) });
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  // Danh sách project cho màn chọn project: số test case, số bộ, kết quả mới nhất.
  if (path === '/api/projects') {
    await syncReports({ minIntervalMs: 10_000 });
    const overview = await buildOverview();
    const runs = await listRuns(2000);
    const projects = loadPartners().map((p) => {
      const rows = overview.filter((r) => r.partner === p.code && r.lastRun);
      const last = runs.filter((r) => r.partner === p.code).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null;
      const sum = (key) => rows.reduce((n, r) => n + (r.lastRun.totals?.[key] ?? 0), 0);
      return {
        code: p.code,
        name: p.name,
        suites: p.suites.length,
        cases: listAllCases(p.code).length,
        tests: sum('total'),
        passed: sum('passed'),
        failed: sum('failed'),
        lastRun: last ? withCurrentLabels(last) : null,
      };
    });
    json(res, 200, { projects });
    return true;
  }

  if (path === '/api/overview') {
    await syncReports({ minIntervalMs: 10_000 });
    json(res, 200, { rows: await buildOverview() });
    return true;
  }

  if (path === '/api/globals') {
    const project = url.searchParams.get('project') ?? '';
    if (method === 'GET') {
      json(res, 200, { variables: await listGlobalVariables(project) });
      return true;
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      try {
        json(res, 200, await saveGlobalVariable(body.project ?? project, body));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
      return true;
    }
    if (method === 'DELETE') {
      await deleteGlobalVariable(project, url.searchParams.get('name') ?? '');
      json(res, 200, { ok: true });
      return true;
    }
  }

  // Kho test data do tester nhập: đọc / ghi / đối chiếu với hệ thống.
  if (path === '/api/testdata') {
    const partner = url.searchParams.get('partner');
    const app = url.searchParams.get('app');
    const envCode = url.searchParams.get('env');
    if (!partner || !app || !envCode) {
      json(res, 400, { error: 'partner, app and env are all required' });
      return true;
    }

    if (method === 'GET') {
      json(res, 200, await readForClient(partner, app, envCode));
      return true;
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      try {
        json(res, 200, await writeTestData(partner, app, envCode, body.entries ?? [], body.note));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
      return true;
    }
  }

  if (path === '/api/stats') {
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 14));
    await syncReports({ minIntervalMs: 10_000 });
    json(res, 200, await buildStats(days, url.searchParams.get('project') || null));
    return true;
  }

  // Danh sách test case .tc của một thư mục, có trạng thái + phân trang.
  // Test data dạng bảng: danh sách, một bộ, lưu (tạo khi không có previousId), xoá.
  if (path.startsWith('/api/datasets')) {
    const project = url.searchParams.get('project') ?? '';
    try {
      if (path === '/api/datasets' && method === 'GET') {
        json(res, 200, { datasets: listDatasets(project) });
        return true;
      }
      if (path === '/api/datasets/item' && method === 'GET') {
        const dataset = readDatasetForClient(project, url.searchParams.get('id') ?? '');
        if (dataset) json(res, 200, dataset);
        else json(res, 404, { error: 'No such test data' });
        return true;
      }
      if (path === '/api/datasets/item' && method === 'PUT') {
        const body = await readBody(req);
        json(res, 200, saveDataset(body.project ?? project, body.dataset ?? {}, body.previousId));
        return true;
      }
      if (path === '/api/datasets/item' && method === 'DELETE') {
        deleteDataset(project, url.searchParams.get('id') ?? '');
        json(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      json(res, 400, { error: err.message });
      return true;
    }
  }

  // Test suite kiểu akaAT: danh sách, một suite, lưu, xoá, và danh mục test case cho wizard Add Test Case.
  if (path.startsWith('/api/testsuites')) {
    const project = url.searchParams.get('project') ?? '';
    try {
      if (path === '/api/testsuites' && method === 'GET') {
        json(res, 200, { suites: listSuites(project) });
        return true;
      }
      if (path === '/api/testsuites/cases' && method === 'GET') {
        json(res, 200, { cases: suiteCaseCatalog(project) });
        return true;
      }
      if (path === '/api/testsuites/item' && method === 'GET') {
        const suite = readSuite(project, url.searchParams.get('path') ?? '');
        if (suite) json(res, 200, suite);
        else json(res, 404, { error: 'No such test suite' });
        return true;
      }
      if (path === '/api/testsuites/item' && method === 'PUT') {
        const body = await readBody(req);
        json(res, 200, saveSuite(body.project ?? project, body.suite ?? {}, body.previousPath));
        return true;
      }
      if (path === '/api/testsuites/item' && method === 'DELETE') {
        deleteSuite(project, url.searchParams.get('path') ?? '');
        json(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      json(res, 400, { error: err.message });
      return true;
    }
  }

  if (path === '/api/testcases/list' && method === 'GET') {
    json(res, 200, await buildCaseList(url.searchParams));
    return true;
  }

  if (path === '/api/runs/bulk-delete' && method === 'POST') {
    const body = await readBody(req);
    const deleted = [];
    const failed = [];
    for (const id of body.ids ?? []) {
      const result = await deleteRun(String(id));
      if (result.deleted) deleted.push(id);
      else failed.push({ id, error: result.reason });
    }
    json(res, 200, { deleted, failed });
    return true;
  }

  if (path === '/api/runs' && method === 'GET') {
    await syncReports({ minIntervalMs: 10_000 });
    const partner = url.searchParams.get('partner');
    json(res, 200, { runs: (await listRuns()).filter((r) => !partner || r.partner === partner).map(withCurrentLabels) });
    return true;
  }

  if (path === '/api/runs' && method === 'POST') {
    const body = await readBody(req);
    if (!body.partner || !body.app || !body.env) {
      json(res, 400, { error: 'partner, app and env are all required' });
      return true;
    }
    try {
      json(res, 201, await startRun({ ...body, trigger: 'manual' }));
    } catch (err) {
      json(res, 409, { error: err.message });
    }
    return true;
  }

  // Id lần chạy CLI có dấu gạch ngang (cli-20260909-034240) — \w+ không khớp nên trước đây không xoá/xem log được.
  const runMatch = path.match(/^\/api\/runs\/([\w-]+)(?:\/(log|stream|stop|download))?$/);
  if (runMatch) {
    const id = runMatch[1];
    const action = runMatch[2];
    const run = await getRun(id);
    if (!run) {
      json(res, 404, { error: 'No such run' });
      return true;
    }

    if (!action && method === 'DELETE') {
      const result = await deleteRun(id);
      if (result.deleted) json(res, 200, result);
      else json(res, 409, { error: result.reason });
      return true;
    }
    if (!action) {
      json(res, 200, run);
      return true;
    }
    if (action === 'download') {
      const file = reportFile(run);
      if (!file) {
        json(res, 404, { error: 'This run no longer has a report file on disk' });
        return true;
      }
      // Tên file mang đủ bộ + môi trường + thời điểm, để gửi đi ai cũng biết là báo cáo nào.
      const stamp = (run.finishedAt ?? run.startedAt ?? '').slice(0, 16).replace(/[:T]/g, '-');
      serveFile(res, file, { download: true, filename: `report-${run.runKey}-${stamp}.html` });
      return true;
    }
    if (action === 'log') {
      json(res, 200, { log: await readRunLog(id) });
      return true;
    }
    if (action === 'stop' && method === 'POST') {
      json(res, 200, { stopped: stopRun(id) });
      return true;
    }
    if (action === 'stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: log\ndata: ${JSON.stringify({ text: await readRunLog(id) })}\n\n`);
      // Lần chạy đã xong trước khi client kịp nối — trả luôn kết quả rồi đóng.
      if (!subscribe(id, res)) {
        res.write(`event: done\ndata: ${JSON.stringify(await getRun(id))}\n\n`);
        res.end();
      }
      return true;
    }
  }

  if (path === '/api/schedules' && method === 'GET') {
    // Trạng thái lịch bám theo kết quả lần chạy mà nó khởi động.
    for (const s of await listSchedules()) {
      if (s.lastRunId) await syncScheduleStatus(await getRun(s.lastRunId));
    }
    json(res, 200, { schedules: (await listSchedules()).map(decorate) });
    return true;
  }

  if (path === '/api/schedules' && method === 'POST') {
    const body = await readBody(req);
    try {
      json(res, 201, decorate(await createSchedule(body)));
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  const schMatch = path.match(/^\/api\/schedules\/(\w+)(?:\/(run))?$/);
  if (schMatch) {
    const id = schMatch[1];
    const action = schMatch[2];
    const schedule = await getSchedule(id);
    if (!schedule) {
      json(res, 404, { error: 'No such schedule' });
      return true;
    }

    if (action === 'run' && method === 'POST') {
      const run = await fireSchedule(schedule);
      if (run) json(res, 201, run);
      else json(res, 409, { error: 'Could not start — check the schedule status' });
      return true;
    }
    if (method === 'PATCH' || method === 'PUT') {
      const body = await readBody(req);
      try {
        json(res, 200, decorate(await updateSchedule(id, body)));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
      return true;
    }
    if (method === 'DELETE') {
      json(res, 200, { deleted: await deleteSchedule(id) });
      return true;
    }
  }

  if (path === '/api/cron/preview') {
    const expr = url.searchParams.get('cron') ?? '';
    try {
      const next = nextRun(expr);
      json(res, 200, {
        valid: true,
        description: describeCron(expr),
        nextRunAt: next ? next.toISOString() : null,
      });
    } catch (err) {
      json(res, 200, { valid: false, description: err.message, nextRunAt: null });
    }
    return true;
  }

  // ── Kịch bản không cần code: keyword · đối tượng · recorder ───────────────
  if (path === '/api/keyword/catalog') {
    json(res, 200, readCatalog());
    return true;
  }

  if (path === '/api/keyword/objects/tree' && method === 'GET') {
    const project = url.searchParams.get('project') ?? '';
    const { folders, files } = readObjectTree(project);
    json(res, 200, { tree: folders, rootFiles: files, total: Object.keys(readObjects(project).objects).length });
    return true;
  }
  if (path === '/api/keyword/objects/move' && method === 'POST') {
    const body = await readBody(req);
    try {
      json(res, 200, moveObject(body.project ?? '', body.key ?? '', body.folder ?? ''));
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }
  if (path === '/api/keyword/objects/folder') {
    try {
      if (method === 'POST') {
        const body = await readBody(req);
        if (body.renameTo) json(res, 200, { ok: true, path: body.renameTo, ...renameObjectFolder(body.project, body.path, body.renameTo) });
        else json(res, 200, { ok: true, path: createObjectFolder(body.project, body.path) });
        return true;
      }
      if (method === 'GET') {
        json(res, 200, objectFolderContents(url.searchParams.get('project') ?? '', url.searchParams.get('path') ?? ''));
        return true;
      }
      if (method === 'DELETE') {
        deleteObjectFolder(url.searchParams.get('project') ?? '', url.searchParams.get('path') ?? '', {
          recursive: url.searchParams.get('recursive') === '1',
        });
        json(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      json(res, 400, { error: err.message });
      return true;
    }
  }

  if (path === '/api/keyword/objects') {
    const partner = url.searchParams.get('project') ?? url.searchParams.get('partner') ?? '';
    if (method === 'GET') {
      json(res, 200, readObjects(partner));
      return true;
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      try {
        const result = putObject(partner, body);
        json(res, 200, { ...result, ...readObjects(partner) });
      } catch (err) {
        json(res, 400, { error: err.message });
      }
      return true;
    }
    if (method === 'DELETE') {
      try {
        deleteObject(partner, url.searchParams.get('key'));
        json(res, 200, readObjects(partner));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
      return true;
    }
  }

  // Cây thư mục test case — trả cả kiểm tra khuôn của từng test case để danh sách hiện lỗi ngay.
  // Cây THƯ MỤC (không có file) kèm số test case mỗi nhánh; file liệt kê ở /api/testcases/list.
  if (path === '/api/testcases/tree' && method === 'GET') {
    const project = url.searchParams.get('project') ?? '';
    const { folders, files } = readTree(project);
    json(res, 200, { tree: folders, rootFiles: files, total: listAllCases(project).length });
    return true;
  }

  // Một test case: đường dẫn trong cây truyền qua ?path= (có dấu tiếng Việt, không nhét vào URL path).
  // Kéo-thả test case sang thư mục khác: { path, folder } → { path (mới), moved }.
  if (path === '/api/testcases/move' && method === 'POST') {
    const body = await readBody(req);
    try {
      json(res, 200, moveCase(body.project ?? '', body.path ?? '', body.folder ?? ''));
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  // Xoá hàng loạt: từng mục một, mục hỏng (vd object còn test case dùng) không chặn các mục còn lại.
  if (path === '/api/testcases/bulk-delete' && method === 'POST') {
    const body = await readBody(req);
    const project = body.project ?? url.searchParams.get('project') ?? '';
    const deleted = [];
    const failed = [];
    for (const p of body.paths ?? []) {
      try {
        deleteCase(project, p);
        deleted.push(p);
      } catch (err) {
        failed.push({ path: p, error: err.message });
      }
    }
    json(res, 200, { deleted, failed });
    return true;
  }

  if (path === '/api/keyword/objects/bulk-delete' && method === 'POST') {
    const body = await readBody(req);
    const project = body.project ?? url.searchParams.get('project') ?? '';
    const deleted = [];
    const failed = [];
    for (const key of body.keys ?? []) {
      try {
        deleteObject(project, key);
        deleted.push(key);
      } catch (err) {
        failed.push({ key, error: err.message });
      }
    }
    json(res, 200, { deleted, failed });
    return true;
  }

  if (path === '/api/search' && method === 'GET') {
    json(res, 200, searchProject(url.searchParams.get('project') ?? '', url.searchParams.get('q') ?? ''));
    return true;
  }

  if (path === '/api/testcases/last-run' && method === 'GET') {
    json(res, 200, await lastCaseRun(url.searchParams.get('project') ?? '', url.searchParams.get('path') ?? ''));
    return true;
  }

  if (path === '/api/testcases') {
    const project = url.searchParams.get('project') ?? '';
    if (method === 'GET') {
      const tc = readCase(project, url.searchParams.get('path') ?? '');
      if (!tc) json(res, 404, { error: 'No such test case' });
      else json(res, 200, { ...tc, problems: validateCase(tc, readCatalog(), readObjects(tc.partner)) });
      return true;
    }
    if (method === 'POST') {
      const body = await readBody(req);
      json(res, 200, saveCase(body.project ?? project, body.testCase ?? body, body.previousPath));
      return true;
    }
    if (method === 'DELETE') {
      deleteCase(project, url.searchParams.get('path') ?? '');
      json(res, 200, { ok: true });
      return true;
    }
  }

  if (path === '/api/testcases/folder') {
    if (method === 'POST') {
      const body = await readBody(req);
      if (body.renameTo) {
        renameFolder(body.project, body.path, body.renameTo);
        json(res, 200, { ok: true, path: body.renameTo });
      } else {
        json(res, 200, { ok: true, path: createFolder(body.project, body.path) });
      }
      return true;
    }
    try {
      if (method === 'GET') {
        json(res, 200, folderContents(url.searchParams.get('project') ?? '', url.searchParams.get('path') ?? ''));
        return true;
      }
      if (method === 'DELETE') {
        deleteFolder(url.searchParams.get('project') ?? '', url.searchParams.get('path') ?? '', {
          recursive: url.searchParams.get('recursive') === '1',
        });
        json(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      json(res, 400, { error: err.message });
      return true;
    }
  }

  if (path === '/api/keyword/record') {
    if (method === 'GET') {
      json(res, 200, recorderStatus());
      return true;
    }
    if (method === 'POST') {
      json(res, 200, startRecording(await readBody(req)));
      return true;
    }
    if (method === 'DELETE') {
      json(res, 200, clearRecording());
      return true;
    }
  }

  if (path === '/api/keyword/record/stop' && method === 'POST') {
    json(res, 200, stopRecording());
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  try {
    if (path.startsWith('/api/')) {
      const handled = await handleApi(req, res, url, method);
      if (!handled) json(res, 404, { error: `No endpoint ${method} ${path}` });
      return;
    }

    // File báo cáo: trang HTML, ảnh chụp lúc lỗi, trace.zip
    // Mô hình test object (UMD) nằm bên bộ e2e — trình duyệt nạp bằng <script> thành window.ObjectModel.
    if (path === '/object-model.js') {
      serveFile(res, OBJECT_MODEL_PATH);
      return;
    }

    if (path.startsWith('/report/')) {
      const target = safeJoin(REPORTS_DIR, decodeURIComponent(path.slice('/report/'.length)));
      serveFile(res, target, { download: url.searchParams.has('download') });
      return;
    }

    const asset = path === '/' ? 'index.html' : path.slice(1);
    const file = safeJoin(WEB_DIR, asset);
    if (file && existsSync(file) && statSync(file).isFile()) {
      serveFile(res, file);
      return;
    }
    serveFile(res, resolve(WEB_DIR, 'index.html'));
  } catch (err) {
    console.error('[console] request handling error:', err);
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
});

/**
 * Cổng bị chiếm gần như luôn là "console đã chạy sẵn ở cửa sổ khác" chứ không
 * phải hỏng gì — nói thẳng điều đó thay vì để Node ném stack trace thô.
 */
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;

  console.log('');
  console.log(`  Port ${PORT} is already in use.`);
  console.log('');
  console.log('  Most likely the console is already running in another window — try opening:');
  console.log(`      http://${HOST}:${PORT}`);
  console.log('');
  console.log('  To run a second instance, change the port:');
  console.log(`      PORT=${PORT + 1} npm start                (Git Bash)`);
  console.log(`      $env:PORT=${PORT + 1}; npm start          (PowerShell)`);
  console.log('');
  console.log('  To stop the running instance (PowerShell):');
  console.log(`      Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} -State Listen).OwningProcess -Force`);
  console.log('');
  process.exit(1);
});

async function main() {
  try {
    migrate();
  } catch (err) {
    console.error(`[console] cannot open the SQLite database at ${describeDatabase()}: ${err.message}`);
    process.exit(1);
  }

  // Dữ liệu thời file JSON + báo cáo chạy tay trên đĩa → DB. Idempotent, chạy mỗi lần bật.
  const imported = await importLegacyFiles();
  const synced = await syncReports();
  const enabled = (await listSchedules()).filter((s) => s.enabled).length;

  server.listen(PORT, HOST, () => {
    startScheduler();
    const importedNote = Object.entries(imported)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    console.log('');
    console.log('  E2E Studio');
    console.log(`  ▸ http://${HOST}:${PORT}`);
    console.log(`    e2e suite  ${E2E_ROOT}`);
    console.log(`    DB         ${describeDatabase()}${importedNote ? ` — imported from legacy files: ${importedNote}` : ''}${synced.runs ? ` — imported ${synced.runs} CLI run(s) from reports/` : ''}`);
    console.log(`    schedules  ${enabled} enabled (they only fire while the console is running)`);
    console.log('');
    console.log('  Ctrl+C to stop.');
    console.log('');
  });
}

main().catch((err) => {
  console.error('[console] failed to start:', err);
  process.exit(1);
});
