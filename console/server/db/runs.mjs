/**
 * Bảng `runs` + `run_logs` + `run_tests` + `run_tombstones`.
 *
 * Đối tượng trả ra giữ ĐÚNG hình dạng mà giao diện đã dùng từ thời file JSON (`runKey`,
 * `startedAt`, `totals`…) — đổi kho lưu, không đổi hợp đồng với trình duyệt.
 * Hàm để `async` dù SQLite đồng bộ: chỗ gọi đã `await`, và nếu mai đổi kho lần nữa thì không
 * phải sửa lại chữ ký.
 */
import { all, get, nowIso, run, tx } from './db.mjs';

const parseJson = (s, fallback) => {
  if (s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export function toRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    runKey: row.run_key,
    partner: row.partner,
    app: row.app,
    env: row.env,
    suiteLabel: row.suite_label,
    partnerName: row.partner_name,
    grep: row.grep,
    device: row.device,
    headed: !!row.headed,
    trigger: row.trigger,
    scheduleId: row.schedule_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    exitCode: row.exit_code,
    totals: parseJson(row.totals, null),
    reportDir: row.report_dir,
    hasSummary: !!row.has_summary,
  };
}

/** Lịch sử, mới nhất trước. Giới hạn để trang Báo cáo không phải tải hàng nghìn dòng. */
export async function listRuns(limit = 500) {
  return all('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', [limit]).map(toRun);
}

export async function getRun(id) {
  return toRun(get('SELECT * FROM runs WHERE id = ?', [id]));
}

export async function knownRunIds() {
  return new Set(all('SELECT id FROM runs').map((r) => r.id));
}

export async function countRuns() {
  return get('SELECT count(*) AS n FROM runs').n;
}

export async function insertRun(r, { ignoreDuplicate = false } = {}) {
  const conflict = ignoreDuplicate ? 'ON CONFLICT (id) DO NOTHING' : '';
  run(
    `INSERT INTO runs (id, run_key, partner, app, env, suite_label, partner_name, grep, device, headed,
                       trigger, schedule_id, status, started_at, finished_at, duration_ms, exit_code,
                       totals, report_dir, has_summary)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ${conflict}`,
    [
      r.id,
      r.runKey,
      r.partner,
      r.app,
      r.env,
      r.suiteLabel ?? null,
      r.partnerName ?? null,
      r.grep ?? null,
      r.device ?? null,
      !!r.headed,
      r.trigger ?? 'manual',
      r.scheduleId ?? null,
      r.status,
      r.startedAt,
      r.finishedAt ?? null,
      r.durationMs ?? null,
      r.exitCode ?? null,
      r.totals ? JSON.stringify(r.totals) : null,
      r.reportDir ?? null,
      !!r.hasSummary,
    ],
  );
  return (await getRun(r.id)) ?? r;
}

const COLUMNS = {
  status: 'status',
  finishedAt: 'finished_at',
  durationMs: 'duration_ms',
  exitCode: 'exit_code',
  totals: 'totals',
  hasSummary: 'has_summary',
  reportDir: 'report_dir',
};

export async function updateRun(id, patch) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(COLUMNS)) {
    if (!(key in patch)) continue;
    params.push(key === 'totals' ? (patch[key] ? JSON.stringify(patch[key]) : null) : patch[key]);
    sets.push(`${col} = ?`);
  }
  if (sets.length) run(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return getRun(id);
}

export async function deleteRunRow(id) {
  return tx(() => {
    const { changes } = run('DELETE FROM runs WHERE id = ?', [id]);
    run('INSERT INTO run_tombstones (id, deleted_at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING', [id, nowIso()]);
    return changes > 0;
  });
}

export async function tombstonedIds() {
  return new Set(all('SELECT id FROM run_tombstones').map((r) => r.id));
}

/** Lần chạy gần nhất của mỗi tổ hợp — Map runKey → run. */
export async function latestByRunKey() {
  const rows = all(
    `SELECT r.* FROM runs r
     JOIN (SELECT run_key, max(started_at) AS started_at FROM runs GROUP BY run_key) m
       ON m.run_key = r.run_key AND m.started_at = r.started_at`,
  );
  return new Map(rows.map((r) => [r.run_key, toRun(r)]));
}

/** Lần chạy gần nhất CÓ KẾT QUẢ của một tổ hợp. */
export async function latestWithTests(runKey) {
  return toRun(get('SELECT * FROM runs WHERE run_key = ? AND has_summary = 1 ORDER BY started_at DESC LIMIT 1', [runKey]));
}

// ── Nhật ký ────────────────────────────────────────────────────────────────

export async function appendLog(runId, chunks) {
  if (!chunks.length) return;
  tx(() => {
    for (const text of chunks) run('INSERT INTO run_logs (run_id, text) VALUES (?, ?)', [runId, text]);
  });
}

export async function readLog(runId) {
  return all('SELECT text FROM run_logs WHERE run_id = ? ORDER BY seq', [runId])
    .map((r) => r.text)
    .join('');
}

export async function hasLog(runId) {
  return !!get('SELECT 1 AS x FROM run_logs WHERE run_id = ? LIMIT 1', [runId]);
}

// ── Kết quả từng test ──────────────────────────────────────────────────────

const toTest = (r) => ({
  ids: parseJson(r.tc_ids, []),
  title: r.title,
  file: r.file,
  status: r.status,
  durationMs: r.duration_ms,
  error: r.error,
  screenshot: r.screenshot,
  trace: r.trace,
});

/** Thay toàn bộ kết quả test của một lần chạy bằng danh sách `tests` của summary.json. */
export async function replaceTests(runId, tests) {
  tx(() => {
    run('DELETE FROM run_tests WHERE run_id = ?', [runId]);
    for (const t of tests) {
      run(
        `INSERT INTO run_tests (run_id, tc_ids, title, file, status, duration_ms, error, screenshot, trace)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          runId,
          JSON.stringify(t.ids ?? []),
          t.title,
          t.file ?? null,
          t.status,
          t.durationMs ?? null,
          t.error ?? null,
          t.screenshot ?? null,
          t.trace ?? null,
        ],
      );
    }
  });
}

/**
 * Kết quả MỚI NHẤT của từng test trong một tổ hợp, gom qua mọi lần chạy.
 *
 * Không lấy "lần chạy gần nhất" vì lần đó hay là chạy lọc (`--grep`) một hai test — nếu chỉ
 * nhìn nó thì ma trận test case trống trơn dù cả bộ vừa chạy đầy đủ trước đó một giờ. Mỗi test
 * (theo file + tiêu đề) lấy kết quả ở lần chạy gần nhất có nó. `latestAt` là mốc mới nhất.
 */
export async function latestTestsByRunKey(runKey) {
  const rows = all(
    `SELECT t.*, r.finished_at FROM run_tests t
     JOIN runs r ON r.id = t.run_id
     JOIN (
       SELECT t2.file, t2.title, max(r2.started_at) AS started_at
       FROM run_tests t2 JOIN runs r2 ON r2.id = t2.run_id
       WHERE r2.run_key = ?
       GROUP BY t2.file, t2.title
     ) m ON m.file IS t.file AND m.title = t.title AND m.started_at = r.started_at
     WHERE r.run_key = ?
     ORDER BY t.file, t.title`,
    [runKey, runKey],
  );
  let latestAt = null;
  for (const r of rows) if (r.finished_at && (!latestAt || r.finished_at > latestAt)) latestAt = r.finished_at;
  return { latestAt, tests: rows.map(toTest) };
}

/**
 * Kết quả MỚI NHẤT của từng test (theo file + tiêu đề) qua MỌI lần chạy, tuỳ chọn lọc theo project —
 * để danh sách test case `.tc` chấm trạng thái theo mã TC / tên mà không cần chọn tổ hợp.
 */
export async function latestTestsAll(partner = null) {
  const where = partner ? 'WHERE r2.partner = ?' : '';
  const rows = all(
    `SELECT t.*, r.finished_at, r.run_key FROM run_tests t
     JOIN runs r ON r.id = t.run_id
     JOIN (
       SELECT t2.file, t2.title, max(r2.started_at) AS started_at
       FROM run_tests t2 JOIN runs r2 ON r2.id = t2.run_id ${where}
       GROUP BY t2.file, t2.title
     ) m ON m.file IS t.file AND m.title = t.title AND m.started_at = r.started_at
     ${partner ? 'WHERE r.partner = ?' : ''}`,
    partner ? [partner, partner] : [],
  );
  return rows.map((r) => ({ ...toTest(r), runKey: r.run_key, finishedAt: r.finished_at }));
}

export async function testsOfRun(runId) {
  return all('SELECT * FROM run_tests WHERE run_id = ? ORDER BY id', [runId]).map(toTest);
}

/** Lần chạy có kết quả nhưng chưa có dòng test nào — để bổ sung từ summary.json trên đĩa. */
export async function runsMissingTests() {
  return all(
    `SELECT r.id, r.report_dir FROM runs r
     WHERE r.has_summary = 1 AND r.report_dir IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM run_tests t WHERE t.run_id = r.id)`,
  );
}
