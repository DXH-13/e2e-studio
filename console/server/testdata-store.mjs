/**
 * Kho test data do TESTER nhập — danh sách cặp khoá–giá trị tự do.
 *
 * Console KHÔNG bắt tester phải biết hệ thống có gì: tester vào portal/DB lấy giá
 * trị thật rồi điền vào đây. **Điền gì cũng được, thêm bao nhiêu khoá cũng được** —
 * việc của console là lưu trữ và kiểm tra, còn dùng để chạy test là việc của bộ test.
 *
 * Mỗi bộ có một danh sách khoá **gợi ý** (`testData` trong `config/partners.json`):
 * đó là những khoá bộ test đang đọc tới, hiện sẵn kèm nhãn và ví dụ. Nhưng đó chỉ là
 * gợi ý — tester thêm khoá riêng thoải mái, và bộ test đọc được ngay bằng
 * `testData('<khoá>')`.
 *
 * Nguồn sự thật là bảng `test_data` trong PostgreSQL. Bộ test (Playwright) vẫn đọc file
 * `e2e/testdata/<partner>-<app>-<env>.json`, nên mỗi lần lưu và trước mỗi lần chạy,
 * console **xuất DB ra file** — chạy tay bằng CLI vẫn thấy đúng giá trị vừa nhập.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_ROOT } from './store.mjs';
import { findSuite, isSecretKey } from './registry.mjs';
import * as db from './db/testdata.mjs';

const DIR = resolve(E2E_ROOT, 'testdata');
const filePath = (partner, app, env) => resolve(DIR, `${partner}-${app}-${env}.json`);

export function readTestData(partner, app, env) {
  return db.getTestData(partner, app, env);
}

function writeFile(partner, app, env, { values, note, updatedAt }) {
  mkdirSync(DIR, { recursive: true });
  const path = filePath(partner, app, env);
  const tmp = `${path}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ partner, app, env, updatedAt: updatedAt ?? new Date().toISOString(), note: note ?? '', values }, null, 2),
    'utf8',
  );
  renameSync(tmp, path);
}

/** Xuất mọi bộ test data của một project trên một môi trường ra file cho bộ test đọc. */
export async function exportTestDataFiles(partner, env) {
  for (const row of await db.listTestData(partner, env)) {
    writeFile(partner, row.app, env, row);
  }
}

/**
 * Bản cho trình duyệt.
 *
 * Trả về MỘT danh sách phẳng: khoá gợi ý của bộ trước (kể cả chưa có giá trị, để
 * tester biết bộ test đang cần gì), rồi tới khoá tester tự thêm.
 */
export async function readForClient(partner, app, env) {
  const found = findSuite(partner, app);
  if (!found) return { error: `No suite "${partner}/${app}".` };

  const schema = found.suite.testData ?? [];
  const { values, updatedAt, note } = await db.getTestData(partner, app, env);

  const entry = (key, meta = {}) => ({
    key,
    value: isSecretKey(key) ? '' : (values[key] ?? ''),
    hasValue: !!values[key],
    secret: isSecretKey(key),
    ...meta,
  });

  const suggested = schema.map((f) =>
    entry(f.key, { label: f.label, hint: f.hint, example: f.example, required: !!f.required, suggested: true }),
  );
  const extra = Object.keys(values)
    .filter((k) => !schema.some((f) => f.key === k))
    .sort()
    .map((k) => entry(k, { suggested: false }));

  return {
    suiteLabel: found.suite.label,
    partnerName: found.partner.name,
    updatedAt,
    note,
    entries: [...suggested, ...extra],
    missingRequired: schema.filter((f) => f.required && !values[f.key]).map((f) => f.key),
  };
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Ghi lại toàn bộ danh sách.
 *
 * Client gửi lên **trạng thái đầy đủ** (mảng `entries`), nên khoá bị bỏ khỏi mảng
 * chính là khoá tester đã xoá. Riêng khoá bí mật gửi lên rỗng thì GIỮ giá trị cũ —
 * trình duyệt không bao giờ nhận được giá trị đó, coi rỗng là xoá thì chỉ mở tab
 * rồi bấm Lưu là mất sạch.
 */
export async function writeTestData(partner, app, env, entries, note) {
  if (!findSuite(partner, app)) throw new Error(`No suite "${partner}/${app}".`);
  if (!Array.isArray(entries)) throw new Error('Invalid test data list.');

  const previous = (await db.getTestData(partner, app, env)).values;
  const next = {};

  for (const item of entries) {
    const key = String(item?.key ?? '').trim();
    if (!key) continue;
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Key name "${key}" is invalid — only letters, digits, underscores, dots and dashes; must not start with a digit.`);
    }
    if (key in next) throw new Error(`Key "${key}" is duplicated — each key may be declared only once.`);

    const value = String(item?.value ?? '');
    next[key] = isSecretKey(key) && value === '' ? (previous[key] ?? '') : value;
  }

  await db.putTestData(partner, app, env, next, note ?? '');
  writeFile(partner, app, env, { values: next, note: note ?? '' });

  return readForClient(partner, app, env);
}

/**
 * Bộ nào có test data — gồm cả bộ chưa khai khoá gợi ý nào.
 *
 * Không lọc theo `testData` nữa: tester có thể muốn khai dữ liệu cho một bộ mà
 * bộ đó chưa khai gợi ý sẵn.
 */
export function suitesWithTestData(partners) {
  const out = [];
  for (const p of partners) {
    for (const s of p.suites) {
      out.push({
        partner: p.code,
        partnerName: p.name,
        app: s.app,
        label: s.label,
        fields: s.testData?.length ?? 0,
      });
    }
  }
  // Bộ đã khai khoá gợi ý lên đầu, để mở tab ra là thấy ngay bộ dùng được —
  // không rơi vào một bộ trống rỗng rồi tưởng hỏng.
  return out.sort((a, b) => (b.fields > 0) - (a.fields > 0));
}
