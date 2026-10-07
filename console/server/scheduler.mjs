/**
 * Lập lịch chạy test.
 *
 * Chạy trong chính tiến trình console: kiểm mỗi 20 giây, lịch nào tới giờ thì gọi
 * `startRun`. Nghĩa là **console phải đang bật thì lịch mới chạy** — đánh đổi có ý
 * thức để sửa lịch không phải đụng tới Task Scheduler của Windows. Chạy console trong
 * Docker (`restart: unless-stopped`) là cách để lịch luôn sống.
 *
 * Tick 20 giây (không phải 60) để một phút không bị bỏ lỡ khi máy bận hoặc vừa ngủ dậy;
 * `lastFiredMinute` đảm bảo mỗi phút chỉ bắn một lần.
 */
import { newId } from './store.mjs';
import { describeCron, matches, nextRun, parseCron } from './cron.mjs';
import { isBusy, startRun } from './runner.mjs';
import * as db from './db/schedules.mjs';

const TICK_MS = 20_000;
let timer = null;
let ticking = false;

export const listSchedules = db.listSchedules;
export const getSchedule = db.getSchedule;

/** Bản gửi cho trình duyệt: kèm mô tả tiếng Việt và lần chạy kế tiếp. */
export function decorate(schedule) {
  let description;
  let next = null;
  try {
    parseCron(schedule.cron);
    description = describeCron(schedule.cron);
    next = schedule.enabled ? nextRun(schedule.cron) : null;
  } catch (err) {
    description = `Invalid expression: ${err.message}`;
  }
  return { ...schedule, description, nextRunAt: next ? next.toISOString() : null };
}

export async function createSchedule(input) {
  parseCron(input.cron); // ném lỗi ngay nếu biểu thức sai, đừng để tới lúc tick
  return db.insertSchedule({
    id: newId('sch'),
    name: input.name?.trim() || `${input.partner}/${input.app} · ${input.env}`,
    partner: input.partner,
    app: input.app,
    env: input.env,
    grep: input.grep?.trim() || null,
    // Lịch KHÔNG có tuỳ chọn mở trình duyệt: nó chạy nền, bung cửa sổ lên chỉ tổ phiền.
    device: input.device || null,
    cron: input.cron.trim(),
    enabled: input.enabled !== false,
  });
}

export async function updateSchedule(id, patch) {
  const current = await db.getSchedule(id);
  if (!current) return null;
  if (patch.cron) parseCron(patch.cron);

  const next = { ...patch };
  // Đổi biểu thức thì quên mốc đã bắn, để lịch mới có hiệu lực ngay trong phút này.
  if (patch.cron && patch.cron !== current.cron) next.lastFiredMinute = null;
  delete next.id;
  return db.updateScheduleRow(id, next);
}

export function deleteSchedule(id) {
  return db.deleteScheduleRow(id);
}

/** Nhãn phút hiện tại theo giờ máy — mốc chống bắn trùng. */
const minuteKey = (d) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}T${d.getHours()}:${d.getMinutes()}`;

export async function fireSchedule(schedule, now = new Date()) {
  try {
    const run = await startRun({
      partner: schedule.partner,
      app: schedule.app,
      env: schedule.env,
      grep: schedule.grep,
      device: schedule.device,
      trigger: 'schedule',
      scheduleId: schedule.id,
    });
    await db.updateScheduleRow(schedule.id, {
      lastRunAt: now.toISOString(),
      lastRunId: run.id,
      lastStatus: 'running',
      lastFiredMinute: minuteKey(now),
    });
    return run;
  } catch (err) {
    await db.updateScheduleRow(schedule.id, {
      lastRunAt: now.toISOString(),
      lastStatus: `error: ${err.message}`,
      lastFiredMinute: minuteKey(now),
    });
    return null;
  }
}

async function tick() {
  if (ticking) return; // nhịp trước còn đang chờ DB thì bỏ nhịp này
  ticking = true;
  try {
    const now = new Date();
    const key = minuteKey(now);

    for (const schedule of await db.listSchedules()) {
      if (!schedule.enabled) continue;
      if (schedule.lastFiredMinute === key) continue;

      let parsed;
      try {
        parsed = parseCron(schedule.cron);
      } catch {
        continue; // biểu thức hỏng đã hiện lỗi trên giao diện, không spam log
      }
      if (!matches(parsed, now)) continue;

      // Lần chạy trước còn đang chạy thì bỏ nhịp này, không xếp hàng chồng lên nhau.
      if (isBusy(`${schedule.partner}-${schedule.app}-${schedule.env}`)) {
        await db.updateScheduleRow(schedule.id, {
          lastFiredMinute: key,
          lastStatus: 'skipped — previous run still running',
        });
        continue;
      }

      console.log(`[schedule] ${schedule.name} — due, starting run`);
      await fireSchedule(schedule, now);
    }
  } catch (err) {
    console.error('[schedule] error while checking schedules:', err.message);
  } finally {
    ticking = false;
  }
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Đồng bộ trạng thái lịch theo kết quả lần chạy nó khởi động. */
export async function syncScheduleStatus(run) {
  if (!run?.scheduleId) return;
  await db.updateScheduleRow(run.scheduleId, { lastStatus: run.status });
}
