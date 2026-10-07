/**
 * Mô hình Test Object theo Katalon — MỘT nguồn cho engine (TS), server console (Node) và trình duyệt (hộp sửa object,
 * recorder). Viết dạng UMD vì ba nơi nạp theo ba cách: `require`, `createRequire`, thẻ <script> (window.ObjectModel).
 *
 * Một object có 4 phương thức chọn phần tử (selection method), `method` là cái đang dùng; các phần còn lại vẫn giữ để
 * engine thử dự phòng khi cái đang dùng không khớp (self-healing kiểu Katalon):
 *   - attributes: bảng thuộc tính { name, condition, value, detect } — dòng detect=true mới tham gia định vị;
 *   - xpath:      danh sách XPath có thứ tự + `selectedXPath`;
 *   - css:        một selector;
 *   - role:       vai trò ARIA + tên (không có trong Katalon — là thế mạnh của Playwright nên giữ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ObjectModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const METHODS = ['attributes', 'xpath', 'css', 'role'];
  const METHOD_LABELS = { attributes: 'Attributes', xpath: 'XPath', css: 'CSS', role: 'Role' };
  const CONDITIONS = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'matchesRegex'];
  const CONDITION_LABELS = {
    equals: 'equals',
    notEquals: 'not equal',
    contains: 'contains',
    notContains: 'not contain',
    startsWith: 'starts with',
    endsWith: 'ends with',
    matchesRegex: 'matches regex',
  };
  const PROPERTY_NAMES = [
    'tag', 'id', 'name', 'text', 'aria-label', 'placeholder', 'title', 'type', 'href', 'value', 'for', 'role', 'alt', 'src',
    'class', 'data-testid',
  ];
  const XPATH_TYPES = ['xpath:attributes', 'xpath:idRelative', 'xpath:neighbor', 'xpath:link', 'xpath:position', 'xpath:custom'];
  const ROLES = [
    'button', 'link', 'heading', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'combobox', 'listbox', 'option',
    'tab', 'tabpanel', 'dialog', 'alertdialog', 'alert', 'img', 'menuitem', 'list', 'listitem', 'row', 'cell',
    'navigation', 'region', 'banner', 'spinbutton', 'progressbar', 'status',
  ];
  // Role không có điều kiện phủ định: Playwright chỉ lọc tên theo chuỗi hoặc regex.
  const ROLE_CONDITIONS = ['equals', 'contains', 'startsWith', 'endsWith', 'matchesRegex'];

  /** Chuỗi XPath an toàn cho mọi giá trị, kể cả chứa cả ' lẫn ". */
  function xpathLiteral(s) {
    const v = String(s ?? '');
    if (!v.includes("'")) return `'${v}'`;
    if (!v.includes('"')) return `"${v}"`;
    return `concat(${v.split("'").map((p) => `'${p}'`).join(`, "'", `)})`;
  }

  const clean = (v) => String(v ?? '').trim();

  /** File `.to` kiểu cũ (strategy + locator) → mô hình mới. Object đã có `method` thì chỉ chuẩn hoá mảng. */
  function normalizeObject(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    // Thứ tự trường cố định để file .to đọc được: tên → phương thức → dữ liệu định vị → thông tin phụ.
    const make = (method, parts) => {
      const o = { name: raw.name ?? '', method, properties: [], xpaths: [], selectedXPath: 0, css: '', role: null, ...parts };
      for (const k of ['frame', 'screen', 'kind', 'description', 'createdAt']) if (raw[k] !== undefined) o[k] = raw[k];
      return o;
    };
    if (raw.method) {
      return make(raw.method, {
        properties: Array.isArray(raw.properties) ? raw.properties : [],
        xpaths: Array.isArray(raw.xpaths) ? raw.xpaths : [],
        selectedXPath: Number.isInteger(raw.selectedXPath) ? raw.selectedXPath : 0,
        css: raw.css ?? '',
        role: raw.role ?? null,
      });
    }
    const loc = String(raw.locator ?? '');
    const cond = raw.exact ? 'equals' : 'contains';
    switch (raw.strategy) {
      case 'role':
        return make('role', { role: { role: loc, ...(raw.text ? { name: raw.text, condition: cond } : {}) } });
      case 'text':
        return make('attributes', { properties: [{ name: 'text', condition: cond, value: loc, detect: true }] });
      case 'placeholder':
        return make('attributes', { properties: [{ name: 'placeholder', condition: cond, value: loc, detect: true }] });
      case 'testId':
        return make('attributes', { properties: [{ name: 'data-testid', condition: 'equals', value: loc, detect: true }] });
      case 'label':
        return make('xpath', { xpaths: [{ type: 'xpath:neighbor', value: `//*[@id=//label[normalize-space(.)=${xpathLiteral(loc)}]/@for]` }] });
      default:
        if (/^xpath=/.test(loc) || /^\(?\/\//.test(loc)) return make('xpath', { xpaths: [{ type: 'xpath:custom', value: loc.replace(/^xpath=/, '') }] });
        return make('css', { css: loc });
    }
  }

  const detectRows = (o) => (o.properties || []).filter((p) => p.detect && clean(p.name) && p.value !== undefined && String(p.value) !== '');
  const selectedXPathOf = (o) => {
    const list = (o.xpaths || []).filter((x) => clean(x.value));
    if (!list.length) return null;
    return (o.xpaths[o.selectedXPath] && clean(o.xpaths[o.selectedXPath].value) ? o.xpaths[o.selectedXPath] : list[0]);
  };

  /** Chuỗi selector cho engine `attrs=` (xem createAttrsEngine) — chỉ các dòng detect. */
  const attributesSelector = (rows) => JSON.stringify(rows.map((r) => ({ n: clean(r.name), c: r.condition || 'equals', v: String(r.value) })));

  /**
   * Danh sách locator theo thứ tự thử: phương thức đang chọn trước, rồi XPath còn lại → Attributes → CSS → Role
   * (Katalon: XPath → Attributes → CSS → Image). Mỗi phần tử: { kind, label, value }.
   */
  function candidates(obj) {
    const o = normalizeObject(obj);
    const out = [];
    const add = (kind, label, value) => {
      if (!out.some((c) => c.kind === kind && JSON.stringify(c.value) === JSON.stringify(value))) out.push({ kind, label, value });
    };
    const selX = selectedXPathOf(o);
    const rows = detectRows(o);
    const addMethod = (m) => {
      if (m === 'xpath' && selX) add('xpath', selX.type || 'xpath', selX.value);
      if (m === 'attributes' && rows.length) add('attributes', 'attributes', rows);
      if (m === 'css' && clean(o.css)) add('css', 'css', clean(o.css));
      if (m === 'role' && o.role && clean(o.role.role)) add('role', 'role', o.role);
    };
    addMethod(o.method);
    for (const x of o.xpaths || []) if (clean(x.value)) add('xpath', x.type || 'xpath', x.value);
    for (const m of ['attributes', 'css', 'role']) addMethod(m);
    return out;
  }

  const condSymbol = { equals: '=', notEquals: '≠', contains: '~', notContains: '!~', startsWith: '^=', endsWith: '$=', matchesRegex: '≈' };

  /** Một dòng tóm tắt cho bảng / ô tìm kiếm. */
  function summary(obj) {
    const o = normalizeObject(obj);
    const first = candidates(o)[0];
    if (!first) return '';
    if (first.kind === 'attributes') return first.value.map((r) => `${r.name} ${condSymbol[r.condition] || '='} ${r.value}`).join(' · ');
    if (first.kind === 'role') return `${first.value.role}${first.value.name ? ` "${first.value.name}"` : ''}`;
    return String(first.value);
  }

  /** XPath tương đương của bảng Attributes — chỉ để hiển thị (regex cần XPath 2.0, engine chạy bằng JS). */
  function attributesXPath(rows) {
    const list = rows.filter((r) => r.detect !== false && clean(r.name));
    const tagRow = list.find((r) => r.name === 'tag' && (r.condition || 'equals') === 'equals');
    const expr = (r) => {
      const target = r.name === 'text' ? 'normalize-space(.)' : r.name === 'tag' ? 'local-name()' : `@${r.name}`;
      const lit = xpathLiteral(r.value);
      switch (r.condition) {
        case 'notEquals': return `not(${target} = ${lit})`;
        case 'contains': return `contains(${target}, ${lit})`;
        case 'notContains': return `not(contains(${target}, ${lit}))`;
        case 'startsWith': return `starts-with(${target}, ${lit})`;
        case 'endsWith': return `substring(${target}, string-length(${target}) - string-length(${lit}) + 1) = ${lit}`;
        case 'matchesRegex': return `matches(${target}, ${lit})`;
        default: return `${target} = ${lit}`;
      }
    };
    const preds = list.filter((r) => r !== tagRow).map(expr);
    return `//${tagRow ? tagRow.value : '*'}${preds.length ? `[${preds.join(' and ')}]` : ''}`;
  }

  /** Lỗi của một object (rỗng = hợp lệ). */
  function validateObject(obj) {
    const o = normalizeObject(obj);
    const errors = [];
    if (!METHODS.includes(o.method)) errors.push(`Unknown selection method "${o.method}"`);
    for (const p of o.properties || []) {
      if (!CONDITIONS.includes(p.condition)) errors.push(`Property "${p.name}": unknown condition "${p.condition}"`);
      if (p.condition === 'matchesRegex') {
        try {
          new RegExp(p.value);
        } catch {
          errors.push(`Property "${p.name}": invalid regular expression`);
        }
      }
    }
    if (o.method === 'attributes' && !detectRows(o).length) errors.push('Attributes: tick "Detect object by" on at least one property that has a value');
    if (o.method === 'xpath' && !selectedXPathOf(o)) errors.push('XPath: add at least one XPath');
    if (o.method === 'css' && !clean(o.css)) errors.push('CSS: selector is empty');
    if (o.method === 'role') {
      if (!o.role || !clean(o.role.role)) errors.push('Role: choose a role');
      else if (o.role.name && o.role.condition && !ROLE_CONDITIONS.includes(o.role.condition)) errors.push(`Role: condition "${o.role.condition}" is not supported for the accessible name`);
    }
    return errors;
  }

  /** Dấu nhận dạng từng locator — recorder dùng để nhận ra object đã có trong kho. */
  const signatures = (obj) => candidates(obj).map((c) => `${c.kind}:${JSON.stringify(c.value)}`);

  /**
   * Bộ chọn `attrs=` cho Playwright (selectors.register) và cho recorder (đếm số phần tử khớp ngay trong trang).
   * Phải tự đủ — Playwright tuần tự hoá hàm này sang trình duyệt. So chữ luôn chuẩn hoá NFC + gộp khoảng trắng vì
   * source FE lẫn NFC/NFD (bẫy cố hữu của repo).
   */
  function createAttrsEngine() {
    const norm = (s) => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
    const valueOf = (el, name) => {
      if (name === 'tag') return el.localName;
      if (name === 'text') return norm(el.textContent);
      if (name === 'value' && 'value' in el) return el.value;
      return el.getAttribute(name);
    };
    const test = (actual, condition, expected) => {
      if (actual === null || actual === undefined) return condition === 'notEquals' || condition === 'notContains';
      const a = norm(actual);
      const e = norm(expected);
      switch (condition) {
        case 'notEquals': return a !== e;
        case 'contains': return a.includes(e);
        case 'notContains': return !a.includes(e);
        case 'startsWith': return a.startsWith(e);
        case 'endsWith': return a.endsWith(e);
        case 'matchesRegex':
          try {
            return new RegExp(expected).test(a);
          } catch (err) {
            return false;
          }
        default: return a === e;
      }
    };
    const queryAll = (root, selector) => {
      const rows = JSON.parse(selector);
      const tagRow = rows.find((r) => r.n === 'tag' && r.c === 'equals' && /^[a-z][a-z0-9-]*$/i.test(r.v));
      const pool = Array.from(root.querySelectorAll(tagRow ? tagRow.v : '*'));
      let found = pool.filter((el) => rows.every((r) => test(valueOf(el, r.n), r.c, r.v)));
      // Khớp theo chữ thì cả tổ tiên cũng "chứa" chữ đó — giữ phần tử sâu nhất, giống getByText.
      if (rows.some((r) => r.n === 'text')) found = found.filter((el) => !found.some((other) => other !== el && el.contains(other)));
      return found;
    };
    return { query: (root, selector) => queryAll(root, selector)[0] || null, queryAll };
  }

  return {
    METHODS,
    METHOD_LABELS,
    CONDITIONS,
    CONDITION_LABELS,
    ROLE_CONDITIONS,
    PROPERTY_NAMES,
    XPATH_TYPES,
    ROLES,
    xpathLiteral,
    normalizeObject,
    candidates,
    summary,
    attributesSelector,
    attributesXPath,
    validateObject,
    signatures,
    createAttrsEngine,
  };
});
