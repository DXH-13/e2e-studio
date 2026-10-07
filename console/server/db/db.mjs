/**
 * Kho dữ liệu của console: SQLite qua `node:sqlite` (có sẵn trong Node ≥ 22.13 / 24, không cài gì).
 *
 * Yêu cầu: **chạy hoàn toàn trên máy, không Docker, nhưng vẫn là DB thật**. SQLite đáp ứng đúng
 * điều đó: một file `data/console.db`, giao dịch, chỉ mục, mở được bằng DBeaver/DB Browser, và
 * console vẫn zero-dependency như thời đầu.
 *
 * Đổi đường dẫn file bằng `CONSOLE_DB` (mặc định `console/data/console.db`).
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from '../store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = process.env.CONSOLE_DB ? resolve(process.env.CONSOLE_DB) : resolve(DATA_DIR, 'console.db');

let db = null;

/** Mở (và tạo nếu chưa có) file DB, áp lược đồ. Gọi một lần lúc khởi động. */
export function migrate() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // WAL: đọc không chặn ghi — vòng poll của giao diện không phải chờ lô nhật ký đang ghi.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(readFileSync(resolve(HERE, 'schema.sql'), 'utf8'));
}

function conn() {
  if (!db) throw new Error('DB chưa mở — gọi migrate() trước');
  return db;
}

/** `node:sqlite` không nhận boolean/undefined/object: quy về số, null, chuỗi JSON. */
function bind(params) {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

export function all(sql, params = []) {
  return conn().prepare(sql).all(...bind(params));
}

export function get(sql, params = []) {
  return conn().prepare(sql).get(...bind(params)) ?? null;
}

/** Trả `{ changes, lastInsertRowid }`. */
export function run(sql, params = []) {
  return conn().prepare(sql).run(...bind(params));
}

export function exec(sql) {
  conn().exec(sql);
}

/** Chạy nhiều câu lệnh trong một giao dịch (đồng bộ). */
export function tx(fn) {
  const c = conn();
  c.exec('BEGIN');
  try {
    const result = fn();
    c.exec('COMMIT');
    return result;
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
}

/** Mốc thời gian ISO (UTC) — dùng thống nhất cho mọi cột *_at. */
export const nowIso = () => new Date().toISOString();

export function describeDatabase() {
  return DB_PATH;
}

export function closeDb() {
  db?.close();
  db = null;
}
