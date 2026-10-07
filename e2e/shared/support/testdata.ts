/**
 * Test data + global variables do console xuất ra `testdata/` — test case keyword đọc lúc chạy
 * bằng `${data:khoá}` / `${global:tên}`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_ROOT } from '@config/registry';

export interface TestDataFile {
  values: Record<string, string>;
  updatedAt?: string;
  note?: string;
}

const partner = () => process.env.E2E_PARTNER ?? '';
const env = () => process.env.E2E_ENV ?? 'local';

export function testDataPath(partnerCode = partner(), appKind = 'keyword', envCode = env()): string {
  return resolve(E2E_ROOT, 'testdata', `${partnerCode}-${appKind}-${envCode}.json`);
}

/** Toàn bộ test data của một bộ (mặc định bộ keyword của project đang chạy). */
export function readAllTestData(sourceApp = 'keyword'): Record<string, string> {
  const path = testDataPath(partner(), sourceApp, env());
  if (!existsSync(path)) return {};
  const file = JSON.parse(readFileSync(path, 'utf8')) as TestDataFile;
  return file.values ?? {};
}

export interface GlobalVariablesFile {
  updatedAt?: string;
  /** Theo mã project: { demo: { tênBiến: { value, overrides } } }. */
  projects: Record<string, Record<string, { value: string; overrides?: Record<string, string> }>>;
}

/** Biến toàn cục của project (console xuất ra `testdata/global-variables.json`). */
export function readGlobalVariables(project = partner()): Record<string, string> {
  const path = resolve(E2E_ROOT, 'testdata', 'global-variables.json');
  if (!existsSync(path)) return {};
  const file = JSON.parse(readFileSync(path, 'utf8')) as GlobalVariablesFile;
  const out: Record<string, string> = {};
  for (const [name, v] of Object.entries(file.projects?.[project] ?? {})) out[name] = v.value ?? '';
  return out;
}
