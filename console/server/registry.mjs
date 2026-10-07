/**
 * Đọc cấu hình của bộ e2e (`e2e/config/`) cho console dùng.
 *
 * Console KHÔNG có bản sao cấu hình riêng — partner, bộ test, môi trường đều lấy
 * thẳng từ file mà Playwright dùng. Thêm partner ở `config/partners.json` là
 * console thấy ngay, không phải sửa hai nơi.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_ROOT } from './store.mjs';

const readJson = (rel) => JSON.parse(readFileSync(resolve(E2E_ROOT, rel), 'utf8'));

/** Nhóm hiển thị của một bộ: khai `category` thì lấy, không thì suy từ `kind` (browser → e2e, api → api). */
export const suiteCategory = (suite) => suite.category ?? (suite.kind === 'api' ? 'api' : 'e2e');

export function loadPartners() {
  const partners = readJson('config/partners.json').partners;
  for (const p of partners) for (const s of p.suites) s.category = suiteCategory(s);
  return partners;
}

export function loadEnvironments() {
  return readJson('config/environments.json').environments;
}

/** Danh mục khổ màn hình + khổ mặc định theo loại app. */
export function loadDevices() {
  const j = readJson('config/devices.json');
  return { devices: j.devices, defaults: j.defaults };
}

export function findSuite(partnerCode, app) {
  const partner = loadPartners().find((p) => p.code === partnerCode);
  if (!partner) return null;
  const suite = partner.suites.find((s) => s.app === app);
  return suite ? { partner, suite } : null;
}

/** Khoá nào là bí mật — console che giá trị khi trả về trình duyệt. */
export function isSecretKey(key) {
  return /(SECRET|PASSWORD|PASS|TOKEN|APIKEY|API_KEY|PRIVATE)/i.test(key);
}

const envPath = (code) => resolve(E2E_ROOT, 'config/env', `${code}.env`);

/**
 * Đọc file `.env` giữ NGUYÊN thứ tự dòng và chú thích, để lúc ghi lại không
 * xoá mất phần giải thích người khác viết.
 */
export function readEnvFile(code) {
  const path = envPath(code);
  if (!existsSync(path)) return { exists: false, lines: [], values: {} };

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const values = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, eq).trim()] = value;
  }
  return { exists: true, lines, values };
}

/** Bản tóm tắt lần chạy gần nhất của một tổ hợp, do `run-summary.ts` ghi. */
export function readSummary(runKey) {
  const path = resolve(E2E_ROOT, 'reports', runKey, 'summary.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Các thư mục report đang có trên đĩa — dùng để biết tổ hợp nào từng chạy. */
export function listReportDirs() {
  const dir = resolve(E2E_ROOT, 'reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
