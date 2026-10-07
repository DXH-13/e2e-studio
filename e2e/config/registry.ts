/**
 * Cầu nối giữa dữ liệu đăng ký (JSON) và phía Playwright (TypeScript).
 *
 * Vì sao dữ liệu nằm ở `.json` chứ không phải `.ts`: console (`console/`)
 * chạy Node ESM còn bộ test chạy CommonJS — cho hai bên cùng đọc một file JSON
 * là cách duy nhất không vướng chuyện `require` ↔ `import`. Muốn thêm project
 * hay môi trường thì sửa `config/partners.json` / `config/environments.json`,
 * KHÔNG sửa file này.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import partnersJson from './partners.json';
import environmentsJson from './environments.json';
import devicesJson from './devices.json';

export const E2E_ROOT = resolve(__dirname, '..');

export type AppKind = 'keyword';

/** Một trường test data mà tester phải tự điền cho bộ này. */
export interface TestDataField {
  key: string;
  label: string;
  hint?: string;
  example?: string;
  required?: boolean;
}

export interface SuiteDef {
  app: AppKind;
  kind: 'browser';
  category?: 'e2e';
  label: string;
  /** Tên biến URL trong `config/env/<env>.env`. */
  baseUrlKey: string;
  /** Đường dẫn spec, tính từ gốc `e2e/`. */
  testMatch: string[];
  /** true = chặn network và trả fixture, không đụng BE thật. */
  mocked: boolean;
  /** true = có tạo/sửa dữ liệu → bị chặn ở môi trường `readOnly`. */
  writes: boolean;
  /** false = khung rỗng, chưa có spec nào. */
  ready: boolean;
  note?: string;
  /** Các trường dữ liệu test do tester nhập — xem shared/support/testdata.ts. */
  testData?: TestDataField[];
}

/** Một project (tên khoá `partners` trong file cấu hình giữ nguyên để console và runner đọc chung). */
export interface PartnerDef {
  code: string;
  name: string;
  bridge?: 'none';
  suites: SuiteDef[];
}

export interface EnvDef {
  code: string;
  name: string;
  readOnly: boolean;
  description: string;
}

export interface DeviceDef {
  code: string;
  name: string;
  group: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  note?: string;
}

export const PARTNERS = partnersJson.partners as PartnerDef[];
export const ENVIRONMENTS = environmentsJson.environments as EnvDef[];
export const DEVICES = devicesJson.devices as DeviceDef[];

/** Khổ màn hình để chạy. Không truyền thì lấy khổ mặc định của bộ (devices.json → defaults). */
export function resolveDevice(app: string, code?: string | null): DeviceDef {
  const wanted = code || defaultDeviceCode(app);
  const device = DEVICES.find((d) => d.code === wanted);
  if (!device) {
    throw new Error(`Không có khổ màn hình "${wanted}". Hiện có: ${DEVICES.map((d) => d.code).join(', ')}`);
  }
  return device;
}

/** Khổ mặc định khi test case không ghi khổ lúc ghi, không chọn khổ riêng và lần chạy không có --device. */
export function defaultDeviceCode(app: string): string {
  const defaults = devicesJson.defaults as Record<string, string>;
  return defaults[app] ?? defaults.keyword;
}

export function getPartner(code: string): PartnerDef {
  const p = PARTNERS.find((x) => x.code === code);
  if (!p) throw new Error(`Không có project "${code}". Hiện có: ${PARTNERS.map((x) => x.code).join(', ')}`);
  return p;
}

export function getSuite(partnerCode: string, app: string): SuiteDef {
  const p = getPartner(partnerCode);
  const s = p.suites.find((x) => x.app === app);
  if (!s) {
    throw new Error(`Project "${partnerCode}" không có bộ "${app}". Hiện có: ${p.suites.map((x) => x.app).join(', ')}`);
  }
  return s;
}

export function getEnvironment(code: string): EnvDef {
  const e = ENVIRONMENTS.find((x) => x.code === code);
  if (!e) throw new Error(`Không có môi trường "${code}". Hiện có: ${ENVIRONMENTS.map((x) => x.code).join(', ')}`);
  return e;
}

/** Đọc `config/env/<code>.env`. Thiếu file thì trả object rỗng, không ném lỗi. */
export function readEnvFile(code: string): Record<string, string> {
  const path = resolve(E2E_ROOT, 'config/env', `${code}.env`);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Nạp cấu hình môi trường vào `process.env` để bộ test đọc được.
 * Biến đã có sẵn trong `process.env` được GIỮ NGUYÊN — lệnh chạy luôn thắng file.
 */
export function applyEnvConfig(code: string): Record<string, string> {
  const fromFile = readEnvFile(code);
  for (const [key, value] of Object.entries(fromFile)) {
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
  }
  return fromFile;
}

/** URL gốc của một bộ test — ném lỗi có hướng dẫn thay vì để test chạy vào `undefined`. */
export function resolveBaseUrl(envCode: string, key: string): string {
  const url = optionalBaseUrl(envCode, key);
  if (!url) {
    throw new Error(
      [
        `Thiếu ${key}.`,
        `Khai ở Global variables của project trên console (hoặc config/env/${envCode}.env), hoặc truyền tạm: ${key}=... npm test -- ...`,
      ].join('\n'),
    );
  }
  return url;
}

/** Như resolveBaseUrl nhưng thiếu thì trả undefined — bộ keyword: test case tự mở trang bằng URL đầy đủ. */
export function optionalBaseUrl(envCode: string, key: string): string | undefined {
  applyEnvConfig(envCode);
  const url = process.env[key];
  return url ? url.replace(/\/+$/, '') : undefined;
}
