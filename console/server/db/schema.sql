-- Lược đồ SQLite của console kiểm thử. Idempotent: console chạy lại mỗi lần bật.
-- Thêm cột/bảng mới = thêm câu lệnh IF NOT EXISTS ở cuối.
-- Quy ước: thời điểm = TEXT ISO-8601 (UTC, có 'Z'); boolean = INTEGER 0/1; JSON = TEXT.

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  run_key       TEXT NOT NULL,
  partner       TEXT NOT NULL,
  app           TEXT NOT NULL,
  env           TEXT NOT NULL,
  suite_label   TEXT,
  partner_name  TEXT,
  grep          TEXT,
  device        TEXT,
  headed        INTEGER NOT NULL DEFAULT 0,
  trigger       TEXT NOT NULL DEFAULT 'manual',   -- manual | schedule | cli
  schedule_id   TEXT,
  status        TEXT NOT NULL,                    -- running | passed | failed | stopped | error
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  duration_ms   INTEGER,
  exit_code     INTEGER,
  totals        TEXT,                             -- JSON
  report_dir    TEXT,
  has_summary   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_run_key_started_idx ON runs (run_key, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_started_idx ON runs (started_at DESC);

-- Nhật ký stdout/stderr của lần chạy, ghi theo từng mẩu đúng thứ tự nhận được.
CREATE TABLE IF NOT EXISTS run_logs (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  text    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS run_logs_run_idx ON run_logs (run_id, seq);

-- Kết quả từng test của một lần chạy (bản phẳng của summary.json).
CREATE TABLE IF NOT EXISTS run_tests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  tc_ids      TEXT NOT NULL DEFAULT '[]',          -- JSON mảng mã TC
  title       TEXT NOT NULL,
  file        TEXT,
  status      TEXT NOT NULL,                       -- passed | failed | timedOut | skipped | expected-fail
  duration_ms INTEGER,
  error       TEXT,
  screenshot  TEXT,
  trace       TEXT
);
CREATE INDEX IF NOT EXISTS run_tests_run_idx ON run_tests (run_id);

-- Lần chạy đã xoá khỏi lịch sử nhưng thư mục báo cáo vẫn còn trên đĩa — để lượt quét reports/
-- kế tiếp không nhập lại thành "ma".
CREATE TABLE IF NOT EXISTS run_tombstones (
  id         TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  partner           TEXT NOT NULL,
  app               TEXT NOT NULL,
  env               TEXT NOT NULL,
  grep              TEXT,
  device            TEXT,
  cron              TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  last_run_at       TEXT,
  last_run_id       TEXT,
  last_status       TEXT,
  last_fired_minute TEXT
);

-- Test data do tester nhập: một dòng cho mỗi project × bộ × môi trường.
CREATE TABLE IF NOT EXISTS test_data (
  partner    TEXT NOT NULL,
  app        TEXT NOT NULL,
  env        TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  entries    TEXT NOT NULL DEFAULT '{}',           -- JSON object khoá → giá trị
  updated_at TEXT NOT NULL,
  PRIMARY KEY (partner, app, env)
);

-- Biến toàn cục của một project: đặt một lần, mọi test case trong project dùng lại bằng ${global:tên};
-- ghi đè theo môi trường (≈ "profile" của akaAT).
DROP TABLE IF EXISTS global_variables;
CREATE TABLE IF NOT EXISTS project_variables (
  project     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value       TEXT NOT NULL DEFAULT '',
  overrides   TEXT NOT NULL DEFAULT '{}',          -- JSON object mã môi trường → giá trị
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project, name)
);
