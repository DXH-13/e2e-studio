/** Bảng `test_data`: giá trị tester nhập, một dòng cho mỗi project × bộ × môi trường. */
import { all, get, nowIso, run } from './db.mjs';

const parse = (s) => {
  try {
    return JSON.parse(s ?? '{}') ?? {};
  } catch {
    return {};
  }
};

export async function getTestData(partner, app, env) {
  const r = get('SELECT note, entries, updated_at FROM test_data WHERE partner = ? AND app = ? AND env = ?', [
    partner,
    app,
    env,
  ]);
  if (!r) return { values: {}, updatedAt: null, note: '' };
  return { values: parse(r.entries), updatedAt: r.updated_at ?? null, note: r.note ?? '' };
}

export async function putTestData(partner, app, env, values, note, { onlyIfMissing = false, updatedAt = null } = {}) {
  const conflict = onlyIfMissing
    ? 'DO NOTHING'
    : 'DO UPDATE SET entries = excluded.entries, note = excluded.note, updated_at = excluded.updated_at';
  run(
    `INSERT INTO test_data (partner, app, env, note, entries, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (partner, app, env) ${conflict}`,
    [partner, app, env, note ?? '', JSON.stringify(values ?? {}), updatedAt ?? nowIso()],
  );
}

/** Mọi bộ test data của một project trên một môi trường — để xuất ra file trước khi chạy. */
export async function listTestData(partner, env) {
  return all('SELECT app, note, entries, updated_at FROM test_data WHERE partner = ? AND env = ?', [partner, env]).map(
    (r) => ({ app: r.app, note: r.note, values: parse(r.entries), updatedAt: r.updated_at ?? null }),
  );
}

export async function countTestData() {
  return get('SELECT count(*) AS n FROM test_data').n;
}
