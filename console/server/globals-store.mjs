/**
 * Biến toàn cục (Global variables) của một project — đặt một lần, mọi test case trong project dùng lại
 * bằng `${global:tên}`.
 *
 * Nguồn sự thật là bảng `global_variables`; bộ test (Playwright) đọc file
 * `e2e/testdata/global-variables.json`, nên mỗi lần lưu và trước mỗi lần chạy console xuất DB ra file.
 * Mỗi biến một giá trị (bỏ khái niệm môi trường): muốn chạy trên máy chủ khác thì test suite chọn một dòng
 * test data có cột cùng tên — giá trị dòng đó ghi đè biến cho round đó. URL + secret hạ tầng cũng nằm ở đây; khi chạy test,
 * console nạp chúng vào biến môi trường của tiến trình con (thắng file config/env/*.env còn giữ làm dự phòng).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_ROOT } from './store.mjs';
import { isSecretKey } from './registry.mjs';
import * as db from './db/globals.mjs';

export const GLOBALS_FILE = resolve(E2E_ROOT, 'testdata', 'global-variables.json');
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const checkProject = (project) => {
  if (!PROJECT_RE.test(String(project ?? ''))) throw new Error('Invalid project code');
  return project;
};

/** Bản cho trình duyệt: giá trị bí mật không bao giờ rời server. */
export async function listGlobalVariables(project) {
  return (await db.listGlobals(checkProject(project))).map((v) => ({
    name: v.name,
    value: isSecretKey(v.name) ? '' : v.value,
    secret: isSecretKey(v.name),
    hasValue: v.value !== '',
    updatedAt: v.updatedAt,
  }));
}

export async function saveGlobalVariable(project, { name, value, renameFrom }) {
  checkProject(project);
  const clean = String(name ?? '').trim();
  if (!NAME_RE.test(clean)) throw new Error('Name must start with a letter or _ and contain only letters, digits and _');
  if (renameFrom && renameFrom !== clean) {
    if (await db.getGlobal(project, clean)) throw new Error(`A variable named "${clean}" already exists`);
    await db.renameGlobal(project, renameFrom, clean);
  }
  const previous = await db.getGlobal(project, clean);
  // Trình duyệt không nhận giá trị bí mật, nên gửi lên rỗng nghĩa là "giữ nguyên" chứ không phải xoá.
  const next = isSecretKey(clean) && String(value ?? '') === '' && previous ? previous.value : String(value ?? '');
  await db.putGlobal({ project, name: clean, description: '', value: next, overrides: {} });
  await exportGlobalVariablesFile();
  return (await listGlobalVariables(project)).find((v) => v.name === clean);
}

export async function deleteGlobalVariable(project, name) {
  await db.deleteGlobal(checkProject(project), name);
  await exportGlobalVariablesFile();
}

/** Một file cho mọi project: { projects: { <mã>: { <tên biến>: { value, overrides } } } } — runner đọc phần của project đang chạy. */
export async function exportGlobalVariablesFile() {
  const projects = {};
  for (const v of await db.listAllGlobals()) {
    projects[v.project] ??= {};
    projects[v.project][v.name] = { value: v.value };
  }
  mkdirSync(resolve(E2E_ROOT, 'testdata'), { recursive: true });
  const tmp = `${GLOBALS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), projects }, null, 2), 'utf8');
  renameSync(tmp, GLOBALS_FILE);
}

/** Biến môi trường cho tiến trình con (chạy test, ghi thao tác) — đọc file vừa xuất; bỏ giá trị rỗng để file .env dự phòng còn tác dụng. */
export function globalsAsEnv(project) {
  if (!existsSync(GLOBALS_FILE)) return {};
  try {
    const vars = JSON.parse(readFileSync(GLOBALS_FILE, 'utf8')).projects?.[project] ?? {};
    return Object.fromEntries(Object.entries(vars).filter(([name, v]) => NAME_RE.test(name) && v.value !== '').map(([name, v]) => [name, v.value]));
  } catch {
    return {};
  }
}
