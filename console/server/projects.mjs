/**
 * Tạo / xoá project từ console. Project = một khối partner trong `e2e/config/partners.json` (nguồn chung của console
 * lẫn Playwright). Tạo mới là project trắng kèm một bộ keyword để có chỗ tạo và chạy test case; URL… cấu hình sau.
 *
 * Xoá KHÔNG xoá hẳn: mọi file/thư mục của project được dời vào `console/data/trash/<mã>-<thời điểm>/` (giữ nguyên
 * đường dẫn tương đối), dữ liệu DB xuất ra `db.json` ở đó rồi mới xoá khỏi DB — xoá nhầm vẫn khôi phục tay được.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { CONSOLE_ROOT, E2E_ROOT } from './store.mjs';
import { all, run, tx } from './db/db.mjs';
import { loadEnvironments } from './registry.mjs';
import { isBusy } from './runner.mjs';
import { exportGlobalVariablesFile } from './globals-store.mjs';
import { listAllCases, readObjects } from './keyword.mjs';
import { listSuites } from './suites.mjs';
import { listDatasets } from './datasets.mjs';

const PARTNERS_FILE = resolve(E2E_ROOT, 'config', 'partners.json');
const TRASH_DIR = resolve(CONSOLE_ROOT, 'data', 'trash');
const CODE_RE = /^[a-z][a-z0-9-]{1,29}$/;

const readConfig = () => JSON.parse(readFileSync(PARTNERS_FILE, 'utf8'));

// Ghi qua file tạm rồi đổi tên: Playwright đang chạy mà đọc trúng file ghi dở là hỏng cả lần chạy.
function writeConfig(config) {
  const tmp = `${PARTNERS_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(tmp, PARTNERS_FILE);
}

export function createProject(input) {
  const code = String(input.code ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!CODE_RE.test(code)) throw new Error('Code must be 2–30 characters: lowercase letters, digits and -, starting with a letter');
  if (!name) throw new Error('Project name is required');

  const config = readConfig();
  const taken = config.partners.find((p) => p.code.toLowerCase() === code || p.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`Project "${taken.name}" (${taken.code}) already exists`);

  const baseUrlKey = `${code.toUpperCase().replace(/-/g, '_')}_URL`;
  const partner = {
    code,
    name,
    bridge: 'none',
    suites: [
      {
        app: 'keyword',
        kind: 'browser',
        label: 'No-code test cases (keyword)',
        baseUrlKey,
        testMatch: ['shared/keyword/runner.spec.ts'],
        mocked: false,
        writes: false,
        ready: true,
        note: `Runs the keyword test cases of the ${name} project (testcases/${code}/**). Created from the console — each test case opens its own page (Open Browser with a full URL, e.g. \${global:web_url}); ${baseUrlKey} in Global variables is optional and only serves relative paths.`,
        category: 'e2e',
      },
    ],
    envKeys: [],
  };
  config.partners.push(partner);
  writeConfig(config);

  for (const dir of ['testcases', 'objects', 'testsuites']) mkdirSync(resolve(E2E_ROOT, dir, code), { recursive: true });
  return partner;
}

function findPartner(code) {
  const partner = readConfig().partners.find((p) => p.code === code);
  if (!partner) throw new Error(`No project "${code}"`);
  return partner;
}

/** Mọi tổ hợp partner × bộ × môi trường có thể có — để tìm thư mục báo cáo / file test data mà không đoán theo tiền tố. */
function runKeysOf(partner) {
  const keys = new Set();
  for (const s of partner.suites) for (const e of loadEnvironments()) keys.add(`${partner.code}-${s.app}-${e.code}`);
  for (const r of all('SELECT DISTINCT run_key FROM runs WHERE partner = ?', [partner.code])) keys.add(r.run_key);
  for (const r of all('SELECT app, env FROM test_data WHERE partner = ?', [partner.code])) keys.add(`${partner.code}-${r.app}-${r.env}`);
  return [...keys];
}

/** Đường dẫn (tính từ e2e) của mọi file/thư mục thuộc project mà console quản lý — chỉ những cái đang tồn tại. */
function projectPaths(partner) {
  const code = partner.code;
  const candidates = [
    `testcases/${code}`,
    `objects/${code}`,
    `objects/${code}.json`,
    `objects/${code}.json.migrated`,
    `testsuites/${code}`,
    `testdata/datasets/${code}`,
    ...runKeysOf(partner).flatMap((k) => [`reports/${k}`, `testdata/${k}.json`]),
  ];
  return [...new Set(candidates)].filter((p) => existsSync(resolve(E2E_ROOT, p)));
}

function sizeOf(abs) {
  const st = statSync(abs);
  if (!st.isDirectory()) return st.size;
  return readdirSync(abs).reduce((n, name) => n + sizeOf(resolve(abs, name)), 0);
}

/** Những gì sẽ mất khi xoá project — màn xác nhận bước 1 đọc từ đây. */
export function projectImpact(code) {
  const partner = findPartner(code);
  const running = runKeysOf(partner).filter((k) => isBusy(k));
  const paths = projectPaths(partner);
  const reportPaths = paths.filter((p) => p.startsWith('reports/'));
  const schedules = all('SELECT enabled FROM schedules WHERE partner = ?', [code]);
  return {
    code,
    name: partner.name,
    testCases: listAllCases(code).length,
    testObjects: Object.keys(readObjects(code).objects).length,
    testSuites: listSuites(code).length,
    datasets: listDatasets(code).length,
    globals: all('SELECT count(*) AS n FROM project_variables WHERE project = ?', [code])[0].n,
    testData: all('SELECT count(*) AS n FROM test_data WHERE partner = ?', [code])[0].n,
    schedules: schedules.length,
    schedulesEnabled: schedules.filter((s) => s.enabled).length,
    runs: all('SELECT count(*) AS n FROM runs WHERE partner = ?', [code])[0].n,
    reportFolders: reportPaths.length,
    reportBytes: reportPaths.reduce((n, p) => n + sizeOf(resolve(E2E_ROOT, p)), 0),
    // Bộ spec viết tay: mã nguồn ở partners/<mã>/ được giữ, nhưng bộ đó biến khỏi console và CLI cùng khối partner.
    specSuites: partner.suites.filter((s) => s.app !== 'keyword').map((s) => s.label),
    specSourceKept: existsSync(resolve(E2E_ROOT, 'partners', code)) ? `e2e/partners/${code}/` : null,
    running,
    paths,
  };
}

function moveInto(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  try {
    renameSync(src, dest);
  } catch {
    // OneDrive / Windows đôi khi giữ khoá thư mục nên rename hỏng — chép rồi xoá.
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

/** Xoá project sau khi người dùng gõ đúng mã. Trả về tóm tắt + nơi đặt thùng rác. */
export async function deleteProject(code, { confirm } = {}) {
  if (!CODE_RE.test(String(code ?? ''))) throw new Error('Invalid project code');
  if (confirm !== code) throw new Error('Confirmation does not match the project code');
  const impact = projectImpact(code);
  if (impact.running.length) throw new Error(`Project is running (${impact.running.join(', ')}) — stop the run first`);
  const config = readConfig();
  const partner = config.partners.find((p) => p.code === code);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const trash = resolve(TRASH_DIR, `${code}-${stamp}`);
  mkdirSync(trash, { recursive: true });

  // 1. Sao lưu cấu hình + DB vào thùng rác TRƯỚC khi đụng vào bất cứ thứ gì.
  writeFileSync(resolve(trash, 'partner.json'), `${JSON.stringify(partner, null, 2)}\n`, 'utf8');
  const runIds = all('SELECT id FROM runs WHERE partner = ?', [code]).map((r) => r.id);
  const inRuns = `SELECT id FROM runs WHERE partner = ?`;
  const dbDump = {
    runs: all('SELECT * FROM runs WHERE partner = ?', [code]),
    run_logs: all(`SELECT * FROM run_logs WHERE run_id IN (${inRuns})`, [code]),
    run_tests: all(`SELECT * FROM run_tests WHERE run_id IN (${inRuns})`, [code]),
    schedules: all('SELECT * FROM schedules WHERE partner = ?', [code]),
    test_data: all('SELECT * FROM test_data WHERE partner = ?', [code]),
    project_variables: all('SELECT * FROM project_variables WHERE project = ?', [code]),
  };
  writeFileSync(resolve(trash, 'db.json'), JSON.stringify(dbDump, null, 1), 'utf8');

  // 2. Gỡ khỏi partners.json trước: từ đây runner, lịch và console không còn thấy project, nên không gì ghi thêm vào nó.
  config.partners = config.partners.filter((p) => p.code !== code);
  writeConfig(config);

  // 3. Dời file/thư mục vào thùng rác (giữ đường dẫn tương đối để khôi phục là chép ngược lại).
  const moved = [];
  for (const rel of impact.paths) {
    moveInto(resolve(E2E_ROOT, rel), resolve(trash, 'e2e', rel));
    moved.push(rel);
  }

  // 4. Xoá DB (run_logs, run_tests theo ON DELETE CASCADE). Tombstone giữ lại vô hại — thư mục báo cáo đã rời reports/.
  tx(() => {
    run('DELETE FROM runs WHERE partner = ?', [code]);
    run('DELETE FROM schedules WHERE partner = ?', [code]);
    run('DELETE FROM test_data WHERE partner = ?', [code]);
    run('DELETE FROM project_variables WHERE project = ?', [code]);
  });
  await exportGlobalVariablesFile();

  writeFileSync(
    resolve(trash, 'README.txt'),
    [
      `Project "${partner.name}" (${code}) deleted from the test console on ${new Date().toISOString()}.`,
      '',
      'Restore by hand:',
      `  1. Add the block in partner.json back into e2e/config/partners.json ("partners" array).`,
      '  2. Copy everything under e2e/ back into e2e/ (same relative paths).',
      '  3. Runs, schedules, test data and global variables are in db.json (tables runs, run_logs, run_tests, schedules,',
      '     test_data, project_variables of console/data/console.db).',
      '',
      `Moved: ${moved.join(', ') || '(nothing)'}`,
    ].join('\n'),
    'utf8',
  );
  return { ...impact, deletedRuns: runIds.length, moved, trash: relative(resolve(CONSOLE_ROOT, '..', '..'), trash).split('\\').join('/') };
}
