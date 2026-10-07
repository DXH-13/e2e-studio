/**
 * Đưa dữ liệu CŨ vào DB (SQLite) — hai nguồn:
 *
 *   1. **File JSON thời trước** (`data/runs.json`, `data/schedules.json`, `data/logs/*.log`,
 *      `e2e/testdata/*.json`) — chỉ nhập khi bảng tương ứng còn TRỐNG, nên chạy lại bao nhiêu
 *      lần cũng không nhân đôi; file cũ giữ nguyên, không xoá.
 *   2. **Thư mục báo cáo trên đĩa** (`e2e/reports/<runKey>/<runId>/summary.json`) — quét mỗi lần
 *      khởi động và định kỳ, để lần chạy bằng dòng lệnh (`npm test` trong terminal) cũng vào
 *      lịch sử như lần chạy từ console. Trước đây chúng chỉ hiện ở Tổng quan mà không lên
 *      biểu đồ; nay là bản ghi đầy đủ, kèm kết quả từng test.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR, E2E_ROOT } from '../store.mjs';
import { findSuite, loadEnvironments, loadPartners } from '../registry.mjs';
import * as runs from './runs.mjs';
import * as schedules from './schedules.mjs';
import * as testdata from './testdata.mjs';

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Tách `demo-keyword-local` thành {partner, app, env} — app có thể chứa dấu gạch. */
export function parseRunKey(runKey) {
  for (const p of loadPartners()) {
    if (!runKey.startsWith(`${p.code}-`)) continue;
    for (const s of p.suites) {
      for (const e of loadEnvironments()) {
        if (runKey === `${p.code}-${s.app}-${e.code}`) return { partner: p.code, app: s.app, env: e.code };
      }
    }
  }
  return null;
}

function runFromSummary(id, runKey, summary, reportDir) {
  const parsed = parseRunKey(runKey) ?? {};
  const partner = summary.partner || parsed.partner;
  const app = summary.app || parsed.app;
  const env = summary.env || parsed.env;
  if (!partner || !app || !env) return null;
  const found = findSuite(partner, app);
  return {
    id,
    runKey,
    partner,
    app,
    env,
    suiteLabel: found?.suite.label ?? null,
    partnerName: found?.partner.name ?? null,
    grep: null,
    device: null,
    headed: false,
    trigger: 'cli',
    scheduleId: null,
    status: summary.totals?.failed ? 'failed' : 'passed',
    startedAt: summary.startedAt ?? summary.finishedAt ?? new Date().toISOString(),
    finishedAt: summary.finishedAt ?? null,
    durationMs: summary.durationMs ?? null,
    exitCode: null,
    totals: summary.totals ?? null,
    reportDir,
    hasSummary: true,
  };
}

/** Nhập file JSON thời cũ vào các bảng còn trống. Trả về số bản ghi đã nhập. */
export async function importLegacyFiles() {
  const report = { runs: 0, logs: 0, schedules: 0, testData: 0 };

  if ((await runs.countRuns()) === 0) {
    for (const r of readJson(resolve(DATA_DIR, 'runs.json'), [])) {
      // Console cũ tắt giữa chừng thì dòng vẫn ghi "running" — giờ không còn tiến trình nào.
      if (r.status === 'running') r.status = 'error';
      await runs.insertRun(r, { ignoreDuplicate: true });
      report.runs += 1;
    }
    const logDir = resolve(DATA_DIR, 'logs');
    const known = await runs.knownRunIds();
    if (existsSync(logDir)) {
      for (const f of readdirSync(logDir)) {
        if (!f.endsWith('.log')) continue;
        const id = f.slice(0, -4);
        if (!known.has(id) || (await runs.hasLog(id))) continue;
        await runs.appendLog(id, [readFileSync(resolve(logDir, f), 'utf8')]);
        report.logs += 1;
      }
    }
  }

  if ((await schedules.countSchedules()) === 0) {
    for (const s of readJson(resolve(DATA_DIR, 'schedules.json'), [])) {
      await schedules.insertSchedule(s, { ignoreDuplicate: true });
      report.schedules += 1;
    }
  }

  if ((await testdata.countTestData()) === 0) {
    const dir = resolve(E2E_ROOT, 'testdata');
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        const raw = readJson(resolve(dir, f), null);
        if (!raw?.partner || !raw.app || !raw.env) continue;
        await testdata.putTestData(raw.partner, raw.app, raw.env, raw.values ?? {}, raw.note ?? '', {
          onlyIfMissing: true,
          updatedAt: raw.updatedAt ?? null,
        });
        report.testData += 1;
      }
    }
  }

  return report;
}

const RUN_DIR = /^(run_[a-z0-9]+|cli-[\dT-]+)$/;
let lastSync = 0;

/**
 * Quét `reports/` và nhập những lần chạy chưa có trong DB (chạy tay bằng CLI), cùng kết quả
 * từng test của bất kỳ lần chạy nào còn thiếu. `minIntervalMs` để gọi từ request mà không
 * quét đĩa liên tục.
 */
export async function syncReports({ minIntervalMs = 0 } = {}) {
  if (Date.now() - lastSync < minIntervalMs) return { runs: 0, tests: 0 };
  lastSync = Date.now();
  const report = { runs: 0, tests: 0 };
  const base = resolve(E2E_ROOT, 'reports');
  if (!existsSync(base)) return report;

  const known = await runs.knownRunIds();
  // Đã xoá trên giao diện thì không nhập lại, dù thư mục báo cáo vẫn còn.
  for (const id of await runs.tombstonedIds()) known.add(id);
  const candidates = [];
  for (const keyDir of readdirSync(base, { withFileTypes: true })) {
    if (!keyDir.isDirectory()) continue;
    const runKey = keyDir.name;
    const keyPath = resolve(base, runKey);
    // Bố cục cũ: cả tổ hợp dùng chung một summary.json ngay dưới runKey.
    if (existsSync(resolve(keyPath, 'summary.json'))) {
      candidates.push({ id: `shared-${runKey}`, runKey, reportDir: `reports/${runKey}` });
    }
    for (const sub of readdirSync(keyPath, { withFileTypes: true })) {
      if (sub.isDirectory() && RUN_DIR.test(sub.name)) {
        candidates.push({ id: sub.name, runKey, reportDir: `reports/${runKey}/${sub.name}` });
      }
    }
  }

  for (const c of candidates) {
    if (known.has(c.id)) continue;
    const file = resolve(E2E_ROOT, c.reportDir, 'summary.json');
    if (!existsSync(file)) continue;
    const summary = readJson(file, null);
    if (!summary?.totals) continue;
    const run = runFromSummary(c.id, c.runKey, summary, c.reportDir);
    if (!run) continue;
    await runs.insertRun(run, { ignoreDuplicate: true });
    await runs.replaceTests(c.id, summary.tests ?? []);
    report.runs += 1;
  }

  // Lần chạy có kết quả nhưng chưa có dòng test nào (nhập từ runs.json cũ) — bổ sung từ đĩa.
  for (const r of await runs.runsMissingTests()) {
    const file = resolve(E2E_ROOT, r.report_dir, 'summary.json');
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const summary = readJson(file, null);
    if (!summary?.tests?.length) continue;
    await runs.replaceTests(r.id, summary.tests);
    report.tests += 1;
  }
  return report;
}
