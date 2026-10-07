/** Bảng `schedules`. Hình dạng trả ra giữ nguyên như bản file JSON trước đây. */
import { all, get, nowIso, run } from './db.mjs';

const toSchedule = (r) =>
  r && {
    id: r.id,
    name: r.name,
    partner: r.partner,
    app: r.app,
    env: r.env,
    grep: r.grep,
    device: r.device,
    cron: r.cron,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    lastRunAt: r.last_run_at,
    lastRunId: r.last_run_id,
    lastStatus: r.last_status,
    lastFiredMinute: r.last_fired_minute,
  };

export async function listSchedules() {
  return all('SELECT * FROM schedules ORDER BY created_at').map(toSchedule);
}

export async function getSchedule(id) {
  return toSchedule(get('SELECT * FROM schedules WHERE id = ?', [id]));
}

export async function insertSchedule(s, { ignoreDuplicate = false } = {}) {
  run(
    `INSERT INTO schedules (id, name, partner, app, env, grep, device, cron, enabled, created_at,
                            last_run_at, last_run_id, last_status, last_fired_minute)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ${ignoreDuplicate ? 'ON CONFLICT (id) DO NOTHING' : ''}`,
    [
      s.id,
      s.name,
      s.partner,
      s.app,
      s.env,
      s.grep ?? null,
      s.device ?? null,
      s.cron,
      s.enabled !== false,
      s.createdAt ?? nowIso(),
      s.lastRunAt ?? null,
      s.lastRunId ?? null,
      s.lastStatus ?? null,
      s.lastFiredMinute ?? null,
    ],
  );
  return getSchedule(s.id);
}

const COLUMNS = {
  name: 'name',
  partner: 'partner',
  app: 'app',
  env: 'env',
  grep: 'grep',
  device: 'device',
  cron: 'cron',
  enabled: 'enabled',
  lastRunAt: 'last_run_at',
  lastRunId: 'last_run_id',
  lastStatus: 'last_status',
  lastFiredMinute: 'last_fired_minute',
};

export async function updateScheduleRow(id, patch) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(COLUMNS)) {
    if (!(key in patch)) continue;
    params.push(patch[key] ?? null);
    sets.push(`${col} = ?`);
  }
  if (sets.length) run(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return getSchedule(id);
}

export async function deleteScheduleRow(id) {
  return run('DELETE FROM schedules WHERE id = ?', [id]).changes > 0;
}

export async function countSchedules() {
  return get('SELECT count(*) AS n FROM schedules').n;
}
