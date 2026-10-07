/**
 * Đọc/ghi ba loại file của Test Case không-cần-code.
 *
 * Cố ý KHÔNG dùng thư viện ngoài và không cache: console sửa file trong lúc runner có thể đang
 * chạy, nên mỗi lần hỏi là đọc lại từ đĩa. Console (Node thuần) có bản song sinh
 * `console/server/keyword.mjs` — sửa luật ở đây thì sửa luôn ở đó.
 *
 * **Test case lưu theo CÂY THƯ MỤC** dưới `testcases/<project>/` — project = mã kênh (console mở
 * từng project như akaAT). Bên trong project tổ chức theo nghiệp vụ tuỳ ý
 * ("Đăng nhập / Giỏ hàng / Thanh toán"); trường `partner` trong file luôn = project chứa nó.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { E2E_ROOT } from '@config/registry';
import catalogJson from './catalog.json';
import { normalizeObject } from './object-model.cjs';
import type { Dataset, KeywordCatalog, ObjectRepository, TestCase, TestObject, TestSuite, TreeNode } from './types';

export const CATALOG = catalogJson as unknown as KeywordCatalog;

/** Kho test object của một project: cây thư mục `objects/<project>/**.to`, mỗi object một file. */
export const objectsRoot = (partner: string): string => resolve(E2E_ROOT, 'objects', partner);
export const TO_EXT = '.to';

export const TESTCASES_ROOT = resolve(E2E_ROOT, 'testcases');

/** Khoá object = đường dẫn file tính từ objects/<project>/ bỏ đuôi (`Màn/tên`). Chưa có gì thì trả kho rỗng. */
export function readObjects(partner: string): ObjectRepository {
  const objects: Record<string, TestObject> = {};
  const walk = (dir: string, rel: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      else if (entry.name.endsWith(TO_EXT)) {
        const key = `${rel ? `${rel}/` : ''}${entry.name.slice(0, -TO_EXT.length)}`;
        try {
          objects[key] = normalizeObject(JSON.parse(readFileSync(abs, 'utf8'))) as TestObject;
        } catch {
          /* file hỏng — console báo riêng */
        }
      }
    }
  };
  walk(objectsRoot(partner), '');
  return { objects };
}

export function writeObject(partner: string, key: string, object: TestObject): void {
  const file = resolve(objectsRoot(partner), `${safePath(key)}${TO_EXT}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(object, null, 2)}\n`, 'utf8');
}

export function writeObjects(partner: string, repo: ObjectRepository): void {
  for (const [key, object] of Object.entries(repo.objects)) writeObject(partner, key, object);
}

/**
 * Đuôi file test case: `.tc` trần, đúng lệ Katalon — nhìn tên là biết đây là test case.
 * Ruột vẫn là JSON; trình soạn thảo muốn tô màu thì gắn `*.tc` vào chế độ JSON.
 */
export const TC_EXT = '.tc';
const isTcFile = (name: string): boolean => name.endsWith(TC_EXT);
const idOf = (name: string): string => name.slice(0, -TC_EXT.length);

/**
 * Duyệt cả cây `testcases/`, trả về mọi test case kèm thư mục chứa nó.
 *
 * Bỏ qua file không đọc được thay vì ném: một file JSON gõ hỏng không được phép làm cả bộ test
 * không chạy nổi — console sẽ báo riêng file đó.
 */
/** File cũ còn `setText` (đã gộp vào Send Keys) vẫn chạy được mà không phải sửa tay. */
export function upgradeLegacy(tc: TestCase): TestCase {
  for (const step of tc.steps ?? [])
    for (const call of step.keywords ?? [])
      if (call.keyword === 'setText') {
        call.keyword = 'sendKeys';
        call.args = { keys: call.args?.value ?? '' };
      }
  return tc;
}

export function readAllTestCases(root: string = TESTCASES_ROOT): TestCase[] {
  const out: TestCase[] = [];
  const walk = (dir: string, rel: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'vi'))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      } else if (isTcFile(entry.name)) {
        try {
          const tc = JSON.parse(readFileSync(abs, 'utf8')) as TestCase;
          out.push(upgradeLegacy({ ...tc, id: tc.id || idOf(entry.name), folder: rel }));
        } catch {
          /* file hỏng — console báo riêng, đừng chặn cả lượt chạy */
        }
      }
    }
  };
  walk(root, '');
  return out;
}

/** Test case của một project/kênh: cây `testcases/<partner>/` — runner chỉ chạy phần thuộc kênh đang chọn. */
export function readTestCases(partner: string): TestCase[] {
  return readAllTestCases(resolve(TESTCASES_ROOT, safePath(partner))).filter((tc) => (tc.partner ?? partner) === partner);
}

/** Đường dẫn đầy đủ của một test case: `<folder>/<id>` tính từ `testcases/`. */
export const casePath = (tc: Pick<TestCase, 'folder' | 'id'>): string =>
  tc.folder ? `${tc.folder}/${tc.id}` : tc.id;

/** Chặn `..` và ký tự không hợp lệ — đường dẫn đi thẳng vào hệ thống file. */
export function safePath(path: string): string {
  const parts = String(path ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p === '.' || p === '..' || /[\\:*?"<>|]/.test(p)) {
      throw new Error(`Tên thư mục/test case không hợp lệ: "${p}"`);
    }
  }
  return parts.join('/');
}

export function readTestCase(path: string): TestCase | null {
  const rel = safePath(path);
  const file = resolve(TESTCASES_ROOT, `${rel}${TC_EXT}`);
  if (!existsSync(file)) return null;
  const tc = JSON.parse(readFileSync(file, 'utf8')) as TestCase;
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  return { ...tc, id: rel.slice(rel.lastIndexOf('/') + 1), folder };
}

export function writeTestCase(tc: TestCase): TestCase {
  const rel = safePath(casePath(tc));
  const file = resolve(TESTCASES_ROOT, `${rel}${TC_EXT}`);
  mkdirSync(dirname(file), { recursive: true });
  const body = { ...tc, updatedAt: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return body;
}

export function deleteTestCase(path: string): void {
  const file = resolve(TESTCASES_ROOT, `${safePath(path)}${TC_EXT}`);
  if (existsSync(file)) rmSync(file);
}

/**
 * Cây thư mục để console vẽ.
 *
 * Trả cả thư mục RỖNG: người dùng tạo thư mục trước rồi mới bỏ test case vào là chuyện thường,
 * mà thư mục rỗng biến mất khỏi cây thì họ tưởng tạo hỏng.
 */
export function readTree(): TreeNode[] {
  const build = (dir: string, rel: string): TreeNode[] => {
    if (!existsSync(dir)) return [];
    const nodes: TreeNode[] = [];
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'vi'),
    );
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      nodes.push({ type: 'folder', path, name: entry.name, children: build(join(dir, entry.name), path) });
    }
    for (const entry of entries.filter((e) => e.isFile() && isTcFile(e.name))) {
      const id = idOf(entry.name);
      const path = rel ? `${rel}/${id}` : id;
      try {
        const tc = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as TestCase;
        nodes.push({ type: 'case', path, name: tc.name || id, testCase: { ...tc, id, folder: rel } });
      } catch {
        nodes.push({ type: 'case', path, name: `${id} (file hỏng)` });
      }
    }
    return nodes;
  };
  return build(TESTCASES_ROOT, '');
}

export function createFolder(path: string): void {
  mkdirSync(resolve(TESTCASES_ROOT, safePath(path)), { recursive: true });
}

/** Xoá thư mục — chỉ khi đã rỗng, để không ai lỡ tay cuốn theo cả nhánh test case. */
export function deleteFolder(path: string): void {
  const dir = resolve(TESTCASES_ROOT, safePath(path));
  if (!existsSync(dir)) return;
  if (readdirSync(dir).length > 0) throw new Error('Thư mục còn nội dung — dọn hết rồi mới xoá được');
  rmSync(dir, { recursive: false });
}

/** Test suite lưu `testsuites/<project>/**.suite` — đuôi riêng để không lẫn với file TypeScript `.ts`. */
export const TESTSUITES_ROOT = resolve(E2E_ROOT, 'testsuites');
export const SUITE_EXT = '.suite';

export function readDataset(partner: string, id: string): Dataset | null {
  const file = resolve(E2E_ROOT, 'testdata', 'datasets', safePath(partner), `${safePath(id)}.data`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as Dataset;
}

export function readTestSuite(partner: string, path: string): TestSuite | null {
  const file = resolve(TESTSUITES_ROOT, safePath(partner), `${safePath(path)}${SUITE_EXT}`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as TestSuite;
}
