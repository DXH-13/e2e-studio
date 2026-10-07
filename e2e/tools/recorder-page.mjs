/**
 * Đoạn script chạy TRONG trang được ghi.
 *
 * Tách riêng khỏi `recorder.mjs` vì hai lý do: (1) đây là phần dễ sai nhất — chọn cách định vị
 * nào cho bền — nên phải kiểm được riêng trên một trang thật; (2) `addInitScript` tuần tự hoá
 * hàm này rồi chạy trong ngữ cảnh trang, nên nó KHÔNG được tham chiếu bất cứ thứ gì bên ngoài
 * chính nó — kể cả hằng số hay hàm tiện ích của module này.
 *
 * Nó không tự quyết gì về kịch bản: chỉ mô tả "người dùng vừa làm gì, trên phần tử nào, định vị
 * ra sao" (đủ bảng thuộc tính + Smart XPath + CSS + Role, theo `shared/keyword/object-model.cjs`) rồi bắn sang
 * `window.__recordStep`. Việc quy một sự kiện về một keyword nằm ở
 * `recorder.mjs`.
 */
export function RECORDER_SCRIPT() {
  if (window.__recorderInstalled) return;
  window.__recorderInstalled = true;

  const nfc = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

  /** Tên màn hình hiện tại — lấy tiêu đề, không có thì lấy đoạn cuối đường dẫn. */
  function screenName() {
    const h1 = document.querySelector('header h1, main h1');
    const fromTitle = nfc(h1?.textContent);
    if (fromTitle) return fromTitle;
    const seg = location.pathname.split('/').filter(Boolean).pop();
    return seg || 'TrangChu';
  }

  /** Nhãn người đọc hiểu của một phần tử. */
  function labelOf(el) {
    const aria = nfc(el.getAttribute('aria-label'));
    if (aria) return aria;
    // Ô nhập / dropdown: chữ bên trong là danh sách option, nhãn <label> mới là tên người dùng nhìn thấy.
    const tied = el.labels && el.labels[0] ? nfc(el.labels[0].innerText || el.labels[0].textContent).slice(0, 60) : '';
    if (tied) return tied;
    const text = nfc(el.innerText || el.textContent).slice(0, 60);
    if (text) return text;
    const ph = nfc(el.getAttribute('placeholder'));
    if (ph) return ph;
    const id = el.id;
    if (id) return id;
    return el.tagName.toLowerCase();
  }

  // Mô hình object dùng chung (shared/keyword/object-model.cjs) — recorder.mjs nạp nó vào trang TRƯỚC script này.
  const M = window.ObjectModel;
  const attrsEngine = M.createAttrsEngine();
  const countAttrs = (rows) => attrsEngine.queryAll(document, M.attributesSelector(rows)).length;
  const countXPath = (xp) => {
    try {
      return document.evaluate(`count(${xp})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue;
    } catch {
      return 0;
    }
  };
  const countCss = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch {
      return 0;
    }
  };
  const lit = M.xpathLiteral;

  // id do framework sinh, chứa số dài / uuid, hoặc ghép từ chữ hiển thị ("btn-Đặt mua") đều đổi theo dữ liệu hay câu chữ.
  function isStableId(id) {
    if (!id) return false;
    if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) || /\d{4,}/.test(id)) return false;
    if (/^(mat-|cdk-|ng-|ember|react-|:r)/.test(id)) return false;
    return !/[^\x21-\x7E]/.test(id);
  }
  const UTILITY_CLASS =
    /^(flex|grid|block|inline|hidden|contents|items-|justify-|content-|self-|place-|gap-|space-|[pm][trblxy]?-|-m|w-|h-|min-|max-|size-|text-|font-|leading-|tracking-|bg-|from-|to-|border|rounded|shadow|ring|outline|opacity-|z-|inset|top-|left-|right-|bottom-|absolute|relative|fixed|sticky|static|overflow|cursor-|select-|pointer-|transition|duration-|ease-|delay-|animate-|whitespace-|break-|truncate|line-clamp|order-|col-|row-|basis-|grow|shrink|object-|aspect-|visible|invisible|sr-only|underline|uppercase|lowercase|capitalize|italic)/;
  const isStableClass = (c) => c && !/[:[\]/!.]/.test(c) && !/^(ng-|mat-|cdk-)/.test(c) && !UTILITY_CLASS.test(c);
  // Chữ có số thường là dữ liệu (giá, số lượng, mã đơn) — định vị theo nó thì dữ liệu đổi là vỡ.
  const looksLikeData = (t) => /\d/.test(t);

  function implicitRole(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'input') {
      if (['checkbox', 'radio'].includes(el.type)) return el.type;
      if (['button', 'submit', 'reset'].includes(el.type)) return 'button';
      if (el.type === 'search') return 'searchbox';
      if (['text', 'email', 'tel', 'url', ''].includes(el.type)) return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'img' && el.getAttribute('alt')) return 'img';
    return null;
  }

  /** Đường CSS ngắn nhất còn duy nhất, tối đa 4 tầng, không dùng class tiện ích. */
  function cssPath(el) {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth++) {
      if (depth > 0 && isStableId(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        const candidate = parts.join(' > ');
        if (countCss(candidate) === 1) return candidate;
        parts.shift();
      }
      let part = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '').split(/\s+/).filter(isStableClass).slice(0, 2);
      if (cls.length) part += `.${cls.map((c) => CSS.escape(c)).join('.')}`;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (countCss(candidate) === 1) return candidate;
      node = parent;
    }
    return parts.join(' > ');
  }

  /** XPath tuyệt đối có chỉ số — phương án cuối, giống xpath:position của Katalon. */
  function positionXPath(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [node];
      parts.unshift(same.length > 1 ? `${tag}[${same.indexOf(node) + 1}]` : tag);
    }
    return `/${parts.join('/')}`;
  }

  /**
   * Mô tả đầy đủ một phần tử theo mô hình Katalon: bảng thuộc tính (dòng nào cần thì tick detect), danh sách
   * Smart XPath, CSS, Role — mỗi locator đều đã kiểm là khớp ĐÚNG MỘT phần tử lúc ghi. `method` là cách bền nhất
   * tìm được; các cách còn lại để engine thử dự phòng khi giao diện đổi.
   */
  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const text = nfc(el.innerText || el.textContent);
    const shortText = text.length <= 40 ? text : '';
    const usableText = shortText && !looksLikeData(shortText) ? shortText : '';
    const attr = (n) => nfc(el.getAttribute(n));
    const testId = attr('data-testid') || attr('data-test') || attr('data-qa');
    const testIdName = el.hasAttribute('data-testid') ? 'data-testid' : el.hasAttribute('data-test') ? 'data-test' : 'data-qa';
    const id = el.id;

    // ── Bảng thuộc tính: thu hết, tick detect theo thứ tự bền → yếu cho tới khi khớp đúng một phần tử.
    const props = [{ name: 'tag', condition: 'equals', value: tag, detect: true }];
    const capture = [
      testId && [testIdName, testId, true],
      id && ['id', id, isStableId(id)],
      attr('name') && ['name', attr('name'), true],
      attr('aria-label') && ['aria-label', attr('aria-label'), !looksLikeData(attr('aria-label'))],
      attr('placeholder') && ['placeholder', attr('placeholder'), true],
      attr('for') && ['for', attr('for'), true],
      attr('type') && ['type', attr('type'), true],
      attr('title') && ['title', attr('title'), true],
      attr('alt') && ['alt', attr('alt'), true],
      attr('role') && ['role', attr('role'), true],
      shortText && ['text', shortText, Boolean(usableText)],
      tag === 'a' && attr('href') && ['href', attr('href'), !looksLikeData(attr('href'))],
      attr('class') && ['class', (el.getAttribute('class') || '').split(/\s+/).filter(isStableClass).join(' '), false],
    ].filter(Boolean);
    let attributesUnique = countAttrs(props) === 1;
    let strongDetected = false;
    for (const [name, value, usable] of capture) {
      if (!value) continue;
      const row = { name, condition: 'equals', value, detect: false };
      props.push(row);
      if (!usable || attributesUnique) continue;
      row.detect = true;
      if (name !== 'text' && name !== 'type' && name !== 'role') strongDetected = true;
      attributesUnique = countAttrs(props.filter((p) => p.detect)) === 1;
    }
    if (!attributesUnique) for (const p of props) p.detect = p.name === 'tag' || (p.detect && p.name !== 'class');

    // ── Smart XPath: mỗi dòng phải khớp đúng một phần tử lúc ghi.
    const xpaths = [];
    const addXPath = (type, value) => {
      if (value && !xpaths.some((x) => x.value === value) && countXPath(value) === 1) xpaths.push({ type, value });
    };
    for (const [name, value] of [
      [testIdName, testId],
      ['id', isStableId(id) ? id : ''],
      ['name', attr('name')],
      ['aria-label', attr('aria-label')],
      ['placeholder', attr('placeholder')],
      ['title', attr('title')],
      ['alt', attr('alt')],
    ]) {
      if (value) addXPath('xpath:attributes', `//${tag}[@${name}=${lit(value)}]`);
    }
    if (usableText && /^(a|button|label|h[1-6]|span|p|li|td|th|option)$/.test(tag)) addXPath('xpath:link', `//${tag}[normalize-space(.)=${lit(usableText)}]`);
    const label = el.labels && el.labels[0] ? nfc(el.labels[0].innerText || el.labels[0].textContent) : '';
    if (label && !looksLikeData(label)) {
      addXPath('xpath:neighbor', `//label[normalize-space(.)=${lit(label)}]/following::${tag}[1]`);
    }
    const anchor = el.parentElement && el.parentElement.closest('[id]');
    if (anchor && isStableId(anchor.id)) {
      const base = `//*[@id=${lit(anchor.id)}]`;
      if (usableText) addXPath('xpath:idRelative', `${base}//${tag}[normalize-space(.)=${lit(usableText)}]`);
      const pool = [...anchor.querySelectorAll(tag)];
      if (pool.length === 1) addXPath('xpath:idRelative', `${base}//${tag}`);
      else if (pool.includes(el)) addXPath('xpath:idRelative', `(${base}//${tag})[${pool.indexOf(el) + 1}]`);
    }
    addXPath('xpath:position', positionXPath(el));

    // ── CSS
    let css = '';
    if (testId && countCss(`[${testIdName}="${CSS.escape(testId)}"]`) === 1) css = `[${testIdName}="${CSS.escape(testId)}"]`;
    else if (isStableId(id) && countCss(`#${CSS.escape(id)}`) === 1) css = `#${CSS.escape(id)}`;
    else {
      for (const n of ['name', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(n);
        const sel = v && `${tag}[${n}="${String(v).replace(/"/g, '\\"')}"]`;
        if (sel && countCss(sel) === 1) {
          css = sel;
          break;
        }
      }
      if (!css) css = cssPath(el);
    }

    // ── Role: vai trò + tên khả dụng (aria-label, không thì chữ hiển thị), ước lượng duy nhất bằng cách đếm phần tử cùng vai trò cùng tên.
    const role = attr('role') || implicitRole(el);
    const roleNameText = attr('aria-label') || usableText;
    let roleLoc = null;
    if (role && roleNameText) {
      const same = [...document.querySelectorAll(`[role="${role}"], ${tag}`)].filter(
        (o) => (o.getAttribute('role') || implicitRole(o)) === role && (nfc(o.getAttribute('aria-label')) || nfc(o.innerText || o.textContent)) === roleNameText,
      );
      if (same.length === 1) roleLoc = { role, name: roleNameText, condition: 'equals' };
    }

    // Chọn phương thức bền nhất: thuộc tính mạnh (testid/id/name/aria/placeholder) → role → chữ → XPath → CSS.
    let method = 'css';
    if (attributesUnique && strongDetected) method = 'attributes';
    else if (roleLoc) method = 'role';
    else if (attributesUnique) method = 'attributes';
    else if (xpaths.some((x) => x.type !== 'xpath:position')) method = 'xpath';
    else if (countCss(css) === 1) method = 'css';
    else if (xpaths.length) method = 'xpath';
    const selectedXPath = Math.max(0, xpaths.findIndex((x) => x.type !== 'xpath:position'));
    return { method, properties: props, xpaths, selectedXPath, css, role: roleLoc };
  }

  /** Phần tử "đáng ghi" gần nhất — bấm vào icon bên trong nút thì phải ghi cái NÚT. */
  function actionable(el) {
    return (
      el.closest('button, a, [role="button"], input, textarea, select, li > button, [aria-label]') || el
    );
  }

  function send(payload) {
    try {
      // Khổ màn hình lúc ghi (kể cả khi bật Device toolbar của DevTools) — test case chạy lại đúng khổ này.
      const viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, mobile: matchMedia('(pointer: coarse)').matches };
      window.__recordStep({ ...payload, screen: screenName(), path: location.pathname, viewport });
    } catch {
      /* trang đóng giữa chừng thì thôi */
    }
  }

  /** Loại phần tử → tiền tố tên test object (btn_, input_, label_…), cùng bảng với catalog.objectTypes. */
  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (tag === 'input') return el.type === 'checkbox' ? 'chk' : el.type === 'radio' ? 'radio' : 'input';
    if (tag === 'textarea') return 'input';
    if (tag === 'select' || role === 'combobox' || role === 'listbox') return 'select';
    if (tag === 'button' || role === 'button') return 'btn';
    if (tag === 'a') return 'link';
    if (tag === 'img' || role === 'img') return 'img';
    if (tag === 'svg' || tag === 'i') return 'icon';
    if (tag === 'li' || tag === 'option' || role === 'option' || role === 'menuitem') return 'item';
    if (tag === 'article' || /\bcard\b/.test(el.className)) return 'card';
    if (tag === 'dialog' || role === 'dialog') return 'dialog';
    if (role === 'tab') return 'tab';
    if (tag === 'iframe') return 'frame';
    if (tag === 'table') return 'table';
    if (/^(h[1-6]|p|span|label|small|strong|em|div)$/.test(tag) && el.children.length === 0) return 'label';
    return 'elm';
  }

  // Công cụ dựng object hàng loạt (không qua ghi thao tác) dùng lại đúng luật chọn locator của recorder.
  window.__describeForObject = (el) => ({ name: labelOf(el), kind: kindOf(el), object: describeElement(el) });

  function report(type, el, value) {
    const target = actionable(el);
    if (!target || target === document.documentElement) return;
    send({ type, value, name: labelOf(target), kind: kindOf(target), object: describeElement(target) });
  }

  // Enter trong ô nhập khiến trình duyệt bắn thêm một click "ảo" (detail = 0) vào nút submit của form. Ghi cả phím
  // lẫn click thì chạy lại gửi form hai lần — nuốt cú click ảo đi ngay sau phím vừa ghi.
  let lastKeyAt = 0;

  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.detail === 0 && Date.now() - lastKeyAt < 500) return;
      report('click', e.target);
    },
    true,
  );

  // Một lần gõ bắn cả `change`, `blur` và (nếu bấm Enter) cả keydown — nhớ giá trị đã báo để không ra ba bước nhập.
  const reportedValue = new WeakMap();
  function reportInput(el) {
    if (reportedValue.get(el) === el.value) return;
    reportedValue.set(el, el.value);
    report('input', el, el.value);
  }

  const isTextField = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

  document.addEventListener(
    'change',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLSelectElement) {
        report('select', el, el.selectedOptions[0]?.label ?? el.value);
        return;
      }
      if (!isTextField(el)) return;
      if (['checkbox', 'radio', 'button', 'submit'].includes(el.type)) return;
      reportInput(el);
    },
    true,
  );

  // Gõ xong rời ô cũng tính là nhập — `change` không bắn khi giá trị do Angular set lại.
  document.addEventListener(
    'blur',
    (e) => {
      const el = e.target;
      if (!isTextField(el)) return;
      if (!el.value) return;
      reportInput(el);
    },
    true,
  );

  // Phím đặc biệt: Enter gửi form, Escape đóng lớp phủ, Tab sang ô sau… Không nghe keydown thì những thao tác này
  // biến mất khỏi kịch bản — chạy lại chỉ thấy điền xong rồi đứng im.
  const SPECIAL_KEYS = new Set([
    'Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F5',
  ]);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!SPECIAL_KEYS.has(e.key)) return;
      const el = e.target instanceof Element ? e.target : null;
      // Enter trên nút/link được trình duyệt đổi thành click — listener click đã ghi rồi, ghi thêm là chạy hai lần.
      if (e.key === 'Enter' && el?.closest('button, a, [role="button"], input[type="submit"], input[type="button"]')) return;
      lastKeyAt = Date.now();
      // Chốt chữ vừa gõ TRƯỚC khi ghi phím: `blur`/`change` bắn sau Enter nên để yên là hai bước đảo thứ tự.
      if (isTextField(el)) reportInput(el);
      // Focus đang ở <body> (bấm Escape đóng lớp phủ chẳng hạn): không có phần tử nào để dựng test object.
      if (!el || el === document.body || el === document.documentElement) send({ type: 'key', value: e.key });
      else report('key', el, e.key);
    },
    true,
  );

  // Điều hướng trong SPA: history API không bắn sự kiện nên phải tự theo dõi.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      send({ type: 'navigate', path: lastPath, name: screenName() });
    }
  }, 300);
}

