/**
 * Dạng SCRIPT của một test case — cùng dữ liệu với dạng UI, mỗi keyword một dòng, chuyển hai chiều
 * không mất gì (như Manual view / Script view của Katalon).
 *
 *   ## Variables                   ← biến cục bộ của test case: tên = giá trị [// mô tả]
 *     email = "user@example.com"
 *   ## Set up                      ← pha: Set up | Main execution | Tear down
 *   - Open the site                ← test step ("-! tên" = step đang tắt)
 *     openBrowser url="https://…"  ← keyword [object] [arg=value…] [-> biến] [// ghi chú]
 *     !click Home/btn_help         ← "!" đầu dòng = keyword đang tắt
 *   # dòng bắt đầu bằng # là chú thích, không lưu
 *
 * Giá trị có khoảng trắng, dấu " hoặc = thì đặt trong "…" (thoát \" \\ \n). Module thuần, không DOM —
 * console dùng để sửa, server có thể dùng để nhập/xuất.
 */

export const PHASE_HEADINGS = [
  ['setup', 'Set up'],
  ['main', 'Main execution'],
  ['teardown', 'Tear down'],
];

const PHASE_BY_HEADING = new Map([
  ['set up', 'setup'],
  ['setup', 'setup'],
  ['main execution', 'main'],
  ['main', 'main'],
  ['tear down', 'teardown'],
  ['teardown', 'teardown'],
]);

const needsQuote = (v) => v === '' || /[\s"=]|\/\//.test(v) || v.startsWith('->') || v.startsWith('!');
const quote = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const fmt = (v) => (needsQuote(String(v)) ? quote(v) : String(v));

/** Test case → script (chỉ phần step; tên/thư mục sửa ở ô riêng). */
export function toScript(tc) {
  const out = [];
  if (tc.variables?.length) {
    out.push('## Variables');
    for (const v of tc.variables) out.push(`  ${v.name} = ${fmt(v.value ?? '')}`);
    out.push('');
  }
  for (const [phase, heading] of PHASE_HEADINGS) {
    out.push(`## ${heading}`);
    const steps = (tc.steps ?? []).filter((s) => (s.phase ?? 'main') === phase);
    for (const step of steps) {
      out.push(`-${step.disabled ? '!' : ''} ${step.name ?? ''}`.replace(/\s+$/, ''));
      for (const call of step.keywords ?? []) {
        const parts = [`${call.disabled ? '!' : ''}${call.keyword}`];
        if (call.object) parts.push(fmt(call.object));
        for (const [name, value] of Object.entries(call.args ?? {})) {
          if (value === undefined || value === null || value === '') continue;
          parts.push(`${name}=${fmt(value)}`);
        }
        if (call.output) parts.push(`-> ${call.output}`);
        out.push(`  ${parts.join(' ')}`);
      }
    }
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

/** Tách một dòng keyword thành token, tôn trọng "…" và thoát. Trả về { tokens, note }. */
function tokenize(line) {
  const tokens = [];
  let i = 0;
  let cur = '';
  let inQuote = false;
  let has = false;
  let note;
  const push = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < line.length) {
        const n = line[i + 1];
        cur += n === 'n' ? '\n' : n;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuote = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      has = true;
      i += 1;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/' && !has) {
      note = line.slice(i + 2).trim();
      break;
    }
    if (/\s/.test(ch)) {
      push();
      i += 1;
      continue;
    }
    cur += ch;
    has = true;
    i += 1;
  }
  if (inQuote) throw new Error('missing closing "');
  push();
  return { tokens, note };
}

/** Script → { steps, errors }. Có lỗi thì vẫn trả về phần đọc được, để chỉ ra đúng dòng sai. */
export function fromScript(text) {
  const steps = [];
  const variables = [];
  const errors = [];
  let phase = 'main';
  let step = null;
  let inVariables = false;
  const lines = String(text ?? '').split(/\r?\n/);

  lines.forEach((raw, idx) => {
    const no = idx + 1;
    const line = raw.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('##'))) return;

    if (line.startsWith('##')) {
      const key = line.slice(2).trim().toLowerCase();
      if (key === 'variables') {
        inVariables = true;
        step = null;
        return;
      }
      inVariables = false;
      const found = PHASE_BY_HEADING.get(key);
      if (!found) {
        errors.push({ line: no, message: `unknown phase "${line.slice(2).trim()}" — use Set up, Main execution or Tear down` });
        return;
      }
      phase = found;
      step = null;
      return;
    }

    if (inVariables) {
      const eq = line.indexOf('=');
      const name = eq > 0 ? line.slice(0, eq).trim() : '';
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        errors.push({ line: no, message: 'expected "name = value" under ## Variables' });
        return;
      }
      let parsed;
      try {
        parsed = tokenize(line.slice(eq + 1).trim());
      } catch (err) {
        errors.push({ line: no, message: err.message });
        return;
      }
      const v = { name, value: parsed.tokens.join(' ') };
      variables.push(v);
      return;
    }

    if (line.startsWith('-')) {
      const disabled = line.startsWith('-!');
      const name = line.slice(disabled ? 2 : 1).trim();
      step = { name, phase, keywords: [], ...(disabled ? { disabled: true } : {}) };
      steps.push(step);
      return;
    }

    if (!step) {
      errors.push({ line: no, message: 'keyword outside a test step — start a step with "- step name"' });
      return;
    }

    let parsed;
    try {
      parsed = tokenize(line);
    } catch (err) {
      errors.push({ line: no, message: err.message });
      return;
    }
    const { tokens, note } = parsed;
    if (!tokens.length) return;
    let head = tokens[0];
    const disabled = head.startsWith('!');
    if (disabled) head = head.slice(1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(head)) {
      errors.push({ line: no, message: `"${head}" is not a keyword id` });
      return;
    }
    const call = { keyword: head };
    if (disabled) call.disabled = true;
    const args = {};
    let sawArg = false;
    for (let t = 1; t < tokens.length; t += 1) {
      const tok = tokens[t];
      if (tok === '->') {
        const name = tokens[t + 1];
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          errors.push({ line: no, message: '"->" must be followed by an output variable name' });
          return;
        }
        call.output = name;
        t += 1;
        continue;
      }
      if (tok.startsWith('->')) {
        call.output = tok.slice(2);
        continue;
      }
      const eq = tok.indexOf('=');
      if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tok.slice(0, eq))) {
        args[tok.slice(0, eq)] = tok.slice(eq + 1);
        sawArg = true;
        continue;
      }
      if (!call.object && !sawArg) {
        call.object = tok;
        continue;
      }
      errors.push({ line: no, message: `cannot read "${tok}" — expected name=value, -> variable or // note` });
      return;
    }
    if (Object.keys(args).length) call.args = args;
    step.keywords.push(call);
  });

  return { steps, variables, errors };
}
