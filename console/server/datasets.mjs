/**
 * Test data dạng bảng (kiểu file .data của akaAT): mỗi bộ = danh sách cột + các dòng giá trị, dùng chung
 * trong project, không gắn test suite hay môi trường. Test suite chọn bộ + dòng lúc gắn test case; runner đọc chính
 * file này (song sinh `readDataset` ở `e2e/shared/keyword/store.ts`).
 *
 * Lưu `e2e/testdata/datasets/<project>/<id>.data` (JSON). Cột tên như secret thì giá trị không rời server.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { E2E_ROOT } from './store.mjs';
import { isSecretKey } from './registry.mjs';

const EXT = '.data';
const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const root = (project) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(project ?? ''))) throw new Error('Invalid project code');
  return resolve(E2E_ROOT, 'testdata', 'datasets', project);
};
const fileOf = (project, id) => {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(id ?? ''))) throw new Error('Invalid test data id');
  return resolve(root(project), `${id}${EXT}`);
};

const slug = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test-data';

function readRaw(project, id) {
  const file = fileOf(project, id);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function listDatasets(project) {
  const dir = root(project);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(EXT))
    .map((f) => {
      const id = f.slice(0, -EXT.length);
      try {
        const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
        return { id, name: d.name || id, columns: (d.columns ?? []).length, rows: (d.rows ?? []).length, updatedAt: d.updatedAt ?? null };
      } catch {
        return { id, name: `${id} (corrupt file)`, columns: 0, rows: 0, updatedAt: null, broken: true };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Bản cho trình duyệt: ô thuộc cột bí mật trả rỗng kèm cờ có giá trị hay chưa. */
export function readDatasetForClient(project, id) {
  const d = readRaw(project, id);
  if (!d) return null;
  const secret = (d.columns ?? []).filter(isSecretKey);
  return {
    id,
    name: d.name || id,
    columns: d.columns ?? [],
    secretColumns: secret,
    rows: (d.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? '',
      values: Object.fromEntries((d.columns ?? []).map((c) => [c, secret.includes(c) ? '' : (row.values?.[c] ?? '')])),
      filled: Object.fromEntries(secret.map((c) => [c, (row.values?.[c] ?? '') !== ''])),
    })),
    updatedAt: d.updatedAt ?? null,
  };
}

/** Tạo (không có previousId) hoặc lưu đè. Ô bí mật gửi lên rỗng = giữ giá trị cũ của đúng dòng + cột đó. */
export function saveDataset(project, dataset, previousId) {
  const name = String(dataset?.name ?? '').trim();
  if (!name) throw new Error('Test data name is required');
  const id = previousId || slug(name);
  const file = fileOf(project, id);
  if (!previousId && existsSync(file)) throw new Error(`Test data "${name}" already exists`);
  const columns = [];
  for (const c of dataset.columns ?? []) {
    const col = String(c ?? '').trim();
    if (!COLUMN_RE.test(col)) throw new Error(`Column "${col}" is invalid — letters, digits and underscores, not starting with a digit`);
    if (columns.includes(col)) throw new Error(`Column "${col}" is duplicated`);
    columns.push(col);
  }
  const previous = previousId ? readRaw(project, previousId) : null;
  const oldRow = (rowId) => previous?.rows?.find((r) => r.id === rowId);
  // Một bộ test data = một bộ giá trị: chỉ giữ dòng đầu; muốn Local/Dev thì tạo hai test data.
  const sentRows = (dataset.rows ?? []).slice(0, 1);
  if (!sentRows.length && columns.length) sentRows.push({ id: previous?.rows?.[0]?.id ?? 'r_values', values: {} });
  const rows = sentRows.map((row, i) => ({
    id: row.id || `r${Date.now().toString(36)}${i}`,
    ...(String(row.name ?? '').trim() ? { name: String(row.name).trim() } : {}),
    values: Object.fromEntries(
      columns.map((c) => {
        const sent = String(row.values?.[c] ?? '');
        return [c, isSecretKey(c) && sent === '' ? (oldRow(row.id)?.values?.[c] ?? '') : sent];
      }),
    ),
  }));
  const clean = { id, name, columns, rows, updatedAt: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  return readDatasetForClient(project, id);
}

export function deleteDataset(project, id) {
  const file = fileOf(project, id);
  if (existsSync(file)) rmSync(file);
}
