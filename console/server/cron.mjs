/**
 * Cron 5 trường, viết tay để console không cần dependency nào.
 *
 *     phút  giờ  ngày-trong-tháng  tháng  thứ
 *      0-59 0-23  1-31             1-12   0-6 (0 = Chủ nhật)
 *
 * Hỗ trợ `*`, số, danh sách `1,15`, khoảng `1-5`, bước `*​/10` và `0-30/5`.
 * KHÔNG hỗ trợ tên tháng/thứ dạng chữ, `?`, `L`, `#` — chưa cần tới.
 *
 * Quy ước giống cron thật: nếu CẢ `ngày` và `thứ` đều khác `*` thì khớp một
 * trong hai là đủ (OR), còn lại là AND.
 */

const RANGES = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'weekday', min: 0, max: 6 },
];

function parseField(raw, { name, min, max }) {
  const values = new Set();
  for (const part of raw.split(',')) {
    const [body, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in the ${name} field: "${part}"`);

    let from;
    let to;
    if (body === '*') {
      from = min;
      to = max;
    } else if (body.includes('-')) {
      const [a, b] = body.split('-').map(Number);
      from = a;
      to = b;
    } else {
      from = Number(body);
      to = Number(body);
    }

    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) {
      throw new Error(`Invalid value in the ${name} field: "${part}" (allowed ${min}-${max})`);
    }
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`A cron expression must have exactly 5 fields (minute hour day month weekday), got ${parts.length}.`);
  }
  return {
    minute: parseField(parts[0], RANGES[0]),
    hour: parseField(parts[1], RANGES[1]),
    day: parseField(parts[2], RANGES[2]),
    month: parseField(parts[3], RANGES[3]),
    weekday: parseField(parts[4], RANGES[4]),
    dayIsWildcard: parts[2] === '*',
    weekdayIsWildcard: parts[4] === '*',
  };
}

export function matches(parsed, date) {
  if (!parsed.minute.has(date.getMinutes())) return false;
  if (!parsed.hour.has(date.getHours())) return false;
  if (!parsed.month.has(date.getMonth() + 1)) return false;

  const dayOk = parsed.day.has(date.getDate());
  const weekdayOk = parsed.weekday.has(date.getDay());

  if (parsed.dayIsWildcard && parsed.weekdayIsWildcard) return true;
  if (parsed.dayIsWildcard) return weekdayOk;
  if (parsed.weekdayIsWildcard) return dayOk;
  return dayOk || weekdayOk;
}

/** Lần chạy kế tiếp, dò từng phút. Dừng sau 366 ngày để biểu thức vô nghiệm không treo. */
export function nextRun(expr, from = new Date()) {
  const parsed = parseCron(expr);
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matches(parsed, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

/** Mô tả bằng tiếng Việt cho các dạng hay dùng; dạng lạ thì trả lại nguyên biểu thức. */
export function describeCron(expr) {
  let parsed;
  try {
    parsed = parseCron(expr);
  } catch (err) {
    return err.message;
  }

  const [minute, hour, day, month, weekday] = String(expr).trim().split(/\s+/);
  const at = () => `${pad([...parsed.hour][0])}:${pad([...parsed.minute][0])}`;
  const oneHour = parsed.hour.size === 1;
  const oneMinute = parsed.minute.size === 1;

  if (day === '*' && month === '*' && weekday === '*') {
    if (minute.startsWith('*/') && hour === '*') return `Every ${minute.slice(2)} minutes`;
    if (hour.startsWith('*/') && oneMinute) return `Every ${hour.slice(2)} hours, at minute ${[...parsed.minute][0]}`;
    if (oneHour && oneMinute) return `Every day at ${at()}`;
  }

  if (weekday !== '*' && day === '*' && month === '*' && oneHour && oneMinute) {
    const names = [...parsed.weekday].map((d) => WEEKDAYS[d]).join(', ');
    return `${names} at ${at()}`;
  }

  if (day !== '*' && weekday === '*' && month === '*' && oneHour && oneMinute) {
    return `Day ${[...parsed.day].join(', ')} of every month at ${at()}`;
  }

  return expr;
}
