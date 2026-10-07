/** Bảng `project_variables`: biến dùng chung cho mọi test case của một project, có giá trị riêng theo môi trường. */
import { all, get, nowIso, run } from './db.mjs';

const parse = (s) => {
  try {
    return JSON.parse(s ?? '{}') ?? {};
  } catch {
    return {};
  }
};

const rowOf = (r) => ({
  project: r.project,
  name: r.name,
  description: r.description ?? '',
  value: r.value ?? '',
  overrides: parse(r.overrides),
  updatedAt: r.updated_at ?? null,
});

const COLS = 'project, name, description, value, overrides, updated_at';

export async function listGlobals(project) {
  return all(`SELECT ${COLS} FROM project_variables WHERE project = ? ORDER BY name`, [project]).map(rowOf);
}

export async function listAllGlobals() {
  return all(`SELECT ${COLS} FROM project_variables ORDER BY project, name`).map(rowOf);
}

export async function getGlobal(project, name) {
  const r = get(`SELECT ${COLS} FROM project_variables WHERE project = ? AND name = ?`, [project, name]);
  return r ? rowOf(r) : null;
}

export async function putGlobal({ project, name, description, value, overrides }) {
  run(
    `INSERT INTO project_variables (project, name, description, value, overrides, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (project, name) DO UPDATE SET description = excluded.description, value = excluded.value,
       overrides = excluded.overrides, updated_at = excluded.updated_at`,
    [project, name, description ?? '', value ?? '', JSON.stringify(overrides ?? {}), nowIso()],
  );
}

export async function renameGlobal(project, from, to) {
  run('UPDATE project_variables SET name = ?, updated_at = ? WHERE project = ? AND name = ?', [to, nowIso(), project, from]);
}

export async function deleteGlobal(project, name) {
  run('DELETE FROM project_variables WHERE project = ? AND name = ?', [project, name]);
}
