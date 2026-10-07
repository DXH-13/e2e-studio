/**
 * Chạy test và giữ lịch sử.
 *
 * Console không tự gọi Playwright — nó gọi `e2e/bin/run.mjs`, đúng cái lệnh
 * người dùng gõ tay. Nhờ vậy mọi chốt chặn (môi trường khoá ghi, bộ chưa có spec,
 * thiếu URL) chỉ nằm ở MỘT chỗ, và bấm nút trên console luôn cho kết quả giống
 * hệt chạy bằng dòng lệnh.
 *
 * Lịch sử, nhật ký và kết quả từng test nằm trong PostgreSQL (`db/runs.mjs`). File báo cáo
 * (HTML, ảnh, trace) vẫn ở `e2e/reports/` — chúng là tệp, không phải bản ghi.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_ROOT, newId } from './store.mjs';
import { findSuite } from './registry.mjs';
import * as db from './db/runs.mjs';
import { exportTestDataFiles } from './testdata-store.mjs';
import { exportGlobalVariablesFile, globalsAsEnv } from './globals-store.mjs';

/**
 * Giữ bấy nhiêu thư mục báo cáo gần nhất cho MỖI tổ hợp.
 *
 * Báo cáo của một lần chạy nặng 1–20 MB (trace của Playwright chiếm phần lớn, và chỉ
 * sinh khi có test lỗi). Thư mục này nằm trong OneDrive nên giữ vô hạn là bắt máy đồng
 * bộ hàng GB. Đặt `CONSOLE_KEEP_REPORTS` để đổi; `0` là giữ tất, không dọn gì.
 * Dòng lịch sử + kết quả từng test trong DB KHÔNG bị dọn theo — chỉ mất file HTML/trace.
 */
const KEEP_REPORTS = Number(process.env.CONSOLE_KEEP_REPORTS ?? 10);

/** Lần chạy đang sống: runId → { child, log[], pending[], subscribers } */
const active = new Map();
/**
 * Một tổ hợp partner×bộ×môi trường chỉ chạy một lần tại một thời điểm.
 * Không phải vì thư mục report (mỗi lần chạy đã có thư mục riêng) mà vì chúng đụng
 * cùng dữ liệu: cùng tồn kho, cùng đơn, cùng phiên đăng nhập trên một môi trường.
 */
const busyKeys = new Set();

export const listRuns = db.listRuns;
export const getRun = db.getRun;
export const latestByRunKey = db.latestByRunKey;
export const latestWithTests = db.latestWithTests;
export const latestTestsByRunKey = db.latestTestsByRunKey;
export const latestTestsAll = db.latestTestsAll;
export const testsOfRun = db.testsOfRun;

/**
 * Xoá bớt thư mục báo cáo cũ của một tổ hợp, giữ lại KEEP_REPORTS cái mới nhất.
 *
 * Chỉ đụng thư mục con nằm ngay dưới `reports/<runKey>/` và có tên đúng dạng id lần chạy
 * (`run_…` do console sinh, `cli-…` do chạy tay) — thư mục lạ hay file rời thì không động,
 * để không lỡ tay xoá thứ người khác để đó.
 */
function pruneReports(runKey) {
  if (!Number.isFinite(KEEP_REPORTS) || KEEP_REPORTS <= 0) return;

  const base = resolve(E2E_ROOT, 'reports', runKey);
  if (!existsSync(base)) return;

  try {
    const dirs = readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^(run_[a-z0-9]+|cli-[\dT-]+)$/.test(d.name))
      .map((d) => ({ name: d.name, at: statSync(resolve(base, d.name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);

    for (const old of dirs.slice(KEEP_REPORTS)) {
      rmSync(resolve(base, old.name), { recursive: true, force: true });
    }
  } catch {
    /* dọn dẹp hỏng thì kệ, không được làm hỏng lần chạy vừa xong */
  }
}

export async function readRunLog(id) {
  const live = active.get(id);
  if (live) return live.log.join('');
  return db.readLog(id);
}

export function isBusy(runKey) {
  return busyKeys.has(runKey);
}

function publish(runId, event, data) {
  const live = active.get(runId);
  if (!live) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of live.subscribers) {
    try {
      res.write(payload);
    } catch {
      /* client đã đóng, dọn ở phần onClose */
    }
  }
}

export function subscribe(runId, res) {
  const live = active.get(runId);
  if (!live) return false;
  // Nối vào giữa chừng: phát lại trạng thái các step đã chạy để bảng không thiếu dòng.
  for (const ev of live.steps) res.write(`event: step\ndata: ${JSON.stringify(ev)}\n\n`);
  live.subscribers.add(res);
  res.on('close', () => live.subscribers.delete(res));
  return true;
}

/**
 * Ghi nhật ký vào DB theo lô: Playwright in ra hàng trăm mẩu nhỏ mỗi giây, một câu INSERT cho
 * mỗi mẩu là phí. Gom lại mỗi 300ms, và bảo đảm thứ tự bằng cách chỉ có một lượt ghi tại một
 * thời điểm cho mỗi lần chạy.
 */
async function flushLog(id, live) {
  if (live.flushing) return;
  live.flushing = true;
  try {
    while (live.pending.length) {
      const batch = live.pending.splice(0);
      try {
        await db.appendLog(id, batch);
      } catch (err) {
        console.error(`[console] failed to write log for ${id}:`, err.message);
      }
    }
  } finally {
    live.flushing = false;
  }
}

function queueLog(id, live, text) {
  live.pending.push(text);
  if (live.flushTimer) return;
  live.flushTimer = setTimeout(() => {
    live.flushTimer = null;
    flushLog(id, live);
  }, 300);
}

/** Đọc summary.json của đúng lần chạy này, hoặc null nếu không có / không khớp. */
function readOwnSummary(run) {
  const summaryPath = resolve(E2E_ROOT, run.reportDir, 'summary.json');
  if (!existsSync(summaryPath)) return null;
  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    // Thư mục nay riêng cho lần chạy này, nhưng vẫn đối chiếu cho chắc.
    if (summary.runKey !== run.runKey || Date.parse(summary.finishedAt) < Date.parse(run.startedAt)) return null;
    return summary;
  } catch {
    return null;
  }
}

/**
 * Khởi động một lần chạy. Trả về bản ghi run ngay lập tức (status `running`);
 * kết quả cập nhật dần vào DB khi tiến trình con kết thúc.
 */
export async function startRun({
  partner,
  app,
  env,
  grep,
  force,
  device,
  headed,
  suite,
  concurrency,
  browser,
  folder,
  trigger = 'manual',
  scheduleId = null,
}) {
  const found = findSuite(partner, app);
  if (!found) throw new Error(`No suite "${partner}/${app}".`);

  const runKey = `${partner}-${app}-${env}`;
  if (busyKeys.has(runKey)) {
    throw new Error(`Combination ${runKey} is already running — wait for it to finish; two runs would trample each other's data.`);
  }

  const isBrowser = found.suite.kind === 'browser';
  const wantHeaded = !!headed && isBrowser;

  const id = newId('run');
  const reportDir = `reports/${runKey}/${id}`;
  const args = ['bin/run.mjs', '--partner', partner, '--app', app, '--env', env];
  if (grep) args.push('--grep', grep);
  // Chạy cả một nhánh thư mục test case: runner tự lọc theo đường dẫn, khỏi ghép tên hàng trăm bài vào --grep.
  if (typeof folder === 'string') args.push('--folder', folder);
  if (force) args.push('--force');
  // Khổ màn hình và chế độ mở trình duyệt chỉ có nghĩa với bộ chạy Chromium.
  if (device && isBrowser) args.push('--device', device);
  if (browser && isBrowser && ['chromium', 'msedge', 'firefox'].includes(browser)) args.push('--browser', browser);
  if (wantHeaded) args.push('--headed');
  // Test suite: runner lập danh sách test từ file .suite; Concurrent Instance = số worker (mở trình duyệt thì vẫn 1).
  if (suite) {
    args.push('--suite', suite);
    if (!wantHeaded && Number(concurrency) > 0) args.push('--workers', String(Math.min(8, Number(concurrency))));
  }

  const run = await db.insertRun({
    id,
    runKey,
    partner,
    app,
    env,
    suiteLabel: found.suite.label,
    partnerName: found.partner.name,
    grep: suite ? `Test suite: ${suite}` : typeof folder === 'string' ? `Folder: ${folder || '(all)'}` : grep || null,
    device: isBrowser ? device || null : null,
    headed: wantHeaded,
    trigger,
    scheduleId,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    totals: null,
    reportDir,
    hasSummary: false,
  });

  const live = { child: null, log: [], pending: [], flushTimer: null, flushing: false, subscribers: new Set(), steps: [], carry: '' };
  active.set(id, live);
  busyKeys.add(runKey);

  const onChunk = (buf) => {
    let text = live.carry + buf.toString('utf8');
    live.carry = '';
    // Dòng tiến độ của reporter kw-progress bị cắt giữa hai mẩu: giữ phần dở lại chờ mẩu sau.
    const cut = text.lastIndexOf('@@kw-step');
    if (cut >= 0 && !text.includes('\n', cut)) {
      live.carry = text.slice(cut);
      text = text.slice(0, cut);
    }
    text = text.replace(/@@kw-step (\{[^\n]*\})\r?\n/g, (_, raw) => {
      try {
        const ev = JSON.parse(raw);
        live.steps.push(ev);
        publish(id, 'step', ev);
      } catch {
        // Dòng hỏng thì bỏ — chỉ mất một nhịp tô trạng thái, log vẫn đủ.
      }
      return '';
    });
    if (!text) return;
    live.log.push(text);
    queueLog(id, live, text);
    publish(id, 'log', { text });
  };

  // Bộ test đọc test data + biến toàn cục từ file; xuất bản mới nhất trong DB ra trước khi khởi động.
  try {
    await exportTestDataFiles(partner, env);
    await exportGlobalVariablesFile();
  } catch (err) {
    onChunk(Buffer.from(`[console] Could not export test data to file: ${err.message}\n`));
  }

  const child = spawn(process.execPath, args, {
    cwd: E2E_ROOT,
    // Không cấp màu ANSI: log hiển thị trong trình duyệt, mã màu chỉ thành rác.
    // E2E_RUN_ID: để playwright.config.ts ghi report vào đúng thư mục của lần chạy này.
    // Global variables của project thắng file config/env/*.env (bin/run.mjs ưu tiên process.env).
    // E2E_SKIP_HTML: console chỉ dùng báo cáo Playwright, không dựng trang bao-cao-e2e.html.
    env: { ...process.env, ...globalsAsEnv(partner), FORCE_COLOR: '0', NO_COLOR: '1', CI: '', E2E_RUN_ID: id, E2E_SKIP_HTML: '1' },
  });
  live.child = child;

  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);

  let finished = false;
  const finish = async (exitCode, killed) => {
    if (finished) return;
    finished = true;

    const summary = readOwnSummary(run);
    const totals = summary?.totals ?? null;
    pruneReports(runKey);

    const finishedAt = new Date();
    const patch = {
      status: killed ? 'stopped' : exitCode === 0 ? 'passed' : totals ? 'failed' : 'error',
      exitCode,
      totals,
      hasSummary: !!summary,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - Date.parse(run.startedAt),
    };

    let done = { ...run, ...patch };
    try {
      if (summary?.tests) await db.replaceTests(id, summary.tests);
      clearTimeout(live.flushTimer);
      live.flushTimer = null;
      await flushLog(id, live);
      done = (await db.updateRun(id, patch)) ?? done;
    } catch (err) {
      console.error(`[console] failed to save result for ${id}:`, err.message);
    }

    publish(id, 'done', done);
    for (const res of live.subscribers) {
      try {
        res.end();
      } catch {
        /* đã đóng */
      }
    }
    active.delete(id);
    busyKeys.delete(runKey);
  };

  let killed = false;
  child.on('error', (err) => {
    onChunk(Buffer.from(`\n[console] Could not start the process: ${err.message}\n`));
    finish(-1, false);
  });
  child.on('close', (code) => finish(code, killed));

  live.stop = () => {
    killed = true;
    child.kill('SIGTERM');
  };

  return run;
}

export function stopRun(id) {
  const live = active.get(id);
  if (!live) return false;
  live.stop();
  return true;
}

/** Đường dẫn tuyệt đối tới báo cáo Playwright của một lần chạy, hoặc null nếu không còn. */
export function reportFile(run) {
  if (!run?.reportDir) return null;
  const file = resolve(E2E_ROOT, run.reportDir, 'html', 'index.html');
  return existsSync(file) ? file : null;
}

/**
 * Xoá hẳn một lần chạy: dòng lịch sử (kéo theo nhật ký + kết quả test trong DB) và thư mục
 * báo cáo của nó.
 *
 * Chỉ xoá thư mục RIÊNG của lần chạy (`reports/<runKey>/<runId>`). Lần chạy cũ trước
 * theo bố cục cũ có `reportDir` trỏ thẳng vào thư mục dùng chung của cả tổ hợp — xoá cái đó là
 * cuốn theo báo cáo của mọi lần chạy khác, nên với chúng chỉ bỏ dòng.
 */
export async function deleteRun(id) {
  const run = await db.getRun(id);
  if (!run) return { deleted: false, reason: 'no such run' };
  if (active.has(id)) return { deleted: false, reason: 'run is still running — stop it first' };

  const perRun = run.reportDir && run.reportDir !== `reports/${run.runKey}`;
  let removedReport = false;
  if (perRun) {
    try {
      const dir = resolve(E2E_ROOT, run.reportDir);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        removedReport = true;
      }
    } catch {
      /* xoá report hỏng thì vẫn bỏ dòng, không để lịch sử kẹt lại */
    }
  }

  await db.deleteRunRow(id);
  return { deleted: true, removedReport, sharedReportKept: !perRun };
}
