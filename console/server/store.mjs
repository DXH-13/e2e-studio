/**
 * Đường dẫn gốc của console và vài tiện ích chung.
 *
 * Kho dữ liệu thật nằm ở PostgreSQL (`server/db/`). Thư mục `data/` chỉ còn giữ file tạm của
 * recorder và các file JSON thời cũ — `db/import-legacy.mjs` đọc chúng một lần để đưa vào DB.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONSOLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = resolve(CONSOLE_ROOT, 'data');
/** Gốc bộ e2e — console không tự chạy test, nó gọi `bin/run.mjs` ở đây. */
export const E2E_ROOT = resolve(CONSOLE_ROOT, '..', 'e2e');

mkdirSync(DATA_DIR, { recursive: true });

/** Id ngắn, tăng dần theo thời gian nên sắp xếp theo id cũng là theo thời gian. */
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
