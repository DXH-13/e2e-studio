/**
 * Bộ máy chạy kịch bản keyword.
 *
 * Nhận vào một `TestCase` (chỉ gồm tên keyword + tên đối tượng + tham số) và thi hành từng bước
 * trên một `Page` thật. Không sinh code trung gian: kịch bản là dữ liệu, runner đọc dữ liệu mà
 * chạy — nhờ vậy người sửa kịch bản trên console không cần build lại gì.
 *
 * Bộ keyword theo akaAT Studio — bộ WEB (mục 5.1 tài liệu akaAT) + nhóm Core, cộng vài keyword bổ trợ (verifyText,
 * selectOption, delay…).
 * Keyword có `returns` trả về một chuỗi; runner ghi vào biến `call.output` (akaAT gọi là cột Output).
 *
 * Ba luật của file này:
 *   1. **Mọi keyword đều tự đợi.** Người viết kịch bản không-cần-code không có nghĩa vụ hiểu
 *      bất đồng bộ; bước nào cũng phải tự chờ tới khi thao tác được.
 *   2. **Lỗi phải nói được người dùng làm sai ở đâu.** Thiếu đối tượng, sai tên biến, thiếu
 *      test data — báo thẳng tên bước và tên khoá, không để rơi ra một stack trace Playwright.
 *   3. **So chữ tiếng Việt luôn chuẩn hoá NFC hai vế** (bẫy cố hữu của repo này).
 */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { expect, selectors, type Dialog, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { attributesSelector, candidates, createAttrsEngine, type LocatorCandidate } from './object-model.cjs';
import { CATALOG, readObjects } from './store';
import type { KeywordCall, KeywordSpec, ObjectProperty, ObjectRepository, RoleLocator, TestCase, TestObject, TestStep } from './types';

const nfc = (v: unknown): string => String(v ?? '').normalize('NFC');
const KEYWORDS = new Map<string, KeywordSpec>(CATALOG.keywords.map((k) => [k.id, k]));

/** Ngữ cảnh một lần chạy: biến do kịch bản đặt + nguồn dữ liệu để thay `${...}`. */
export interface RunContext {
  page: Page;
  objects: ObjectRepository;
  /** Test data của bộ — `${data:khoá}`. */
  data: Record<string, string>;
  /** Biến kịch bản tự đặt — `${var:tên}`. */
  vars: Record<string, string>;
  /** Biến toàn cục đặt ở console (mục Global variables) — `${global:tên}`. */
  globals: Record<string, string>;
  /** Iframe đang là ngữ cảnh (Switch To Frame); undefined = trang chính. */
  frame?: FrameLocator;
  /** Hộp thoại alert/confirm/prompt đang mở, chờ keyword Accept/Dismiss. */
  pendingDialog?: Dialog;
  /** Đính ảnh chụp vào báo cáo. */
  attach: (name: string, body: Buffer) => Promise<void>;
  /** Locator đang chọn không khớp, keyword chạy được nhờ locator dự phòng — runner ghi vào báo cáo. */
  onHeal?: (info: { object: string; broken: string; used: string }) => void;
}

/** Vị trí một keyword trong test case — để lỗi nói được "step nào, keyword thứ mấy". */
export interface CallAt {
  stepIndex: number;
  stepName: string;
  callIndex: number;
}

export class KeywordError extends Error {
  constructor(call: KeywordCall, at: CallAt, message: string) {
    super(
      `Test step ${at.stepIndex + 1} «${at.stepName}» → keyword ${at.callIndex + 1} ` +
        `(${call.keyword}${call.object ? ` · ${call.object}` : ''}): ${message}`,
    );
    this.name = 'KeywordError';
  }
}

/**
 * Thay các ô cắm `${data:...}` / `${var:...}` / `${global:...}` / `${env:...}` trong tham số.
 *
 * Thiếu khoá thì DỪNG kèm tên khoá, không thay bằng chuỗi rỗng: một `${data:productCode}` gõ sai
 * mà lặng lẽ thành rỗng sẽ đi tiếp và đỏ ở một bước chẳng liên quan, rất khó lần.
 */
export function resolveValue(raw: unknown, ctx: RunContext): string {
  return String(raw ?? '').replace(/\$\{(data|var|global|env):([^}]+)\}/g, (_all, kind: string, key: string) => {
    const name = key.trim();
    const found =
      kind === 'data'
        ? ctx.data[name]
        : kind === 'var'
          ? ctx.vars[name]
          : kind === 'global'
            ? ctx.globals[name]
            : process.env[name];
    if (found === undefined || found === '') {
      const where =
        kind === 'data'
          ? 'Dữ liệu test của bộ (tab "Dữ liệu test" trên console)'
          : kind === 'var'
            ? 'biến do kịch bản đặt (Output variable của một keyword trước đó)'
            : kind === 'global'
              ? 'Global variables trên console (chưa tạo, hoặc trống)'
              : `file config/env/<môi-trường>.env`;
      throw new Error(`không có ${kind === 'env' ? 'biến môi trường' : 'khoá'} "${name}" trong ${where}`);
    }
    return found;
  });
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((head, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [head, ...rest]));
}

/** Mọi cách viết một ký tự có dấu: dựng sẵn, tách hết, hoặc nửa dựng nửa tách với dấu theo thứ tự bất kỳ. */
function spellings(char: string): string[] {
  const [base, ...marks] = [...char.normalize('NFD')];
  const found = new Set([char]);
  for (const order of permutations(marks)) {
    for (let k = 0; k <= order.length; k++) {
      const head = (base + order.slice(0, k).join('')).normalize('NFC');
      if ([...head].length === 1) found.add(head + order.slice(k).join(''));
    }
  }
  return [...found];
}

// Source FE lẫn NFC, NFD và cả dạng nửa vời ("ê" + U+0323), getByText không tự chuẩn hoá.
export function anyUnicodeForm(text: string, exact: boolean): string | RegExp {
  const composed = nfc(text);
  if (composed === composed.normalize('NFD')) return composed;
  const body = [...composed]
    .map((c) => {
      if (/\s/.test(c)) return '\\s+';
      const forms = spellings(c);
      return forms.length === 1 ? escapeRegex(c) : `(?:${forms.map(escapeRegex).join('|')})`;
    })
    .join('');
  return exact ? new RegExp(`^\\s*${body}\\s*$`) : new RegExp(body, 'i');
}

/**
 * Bộ chọn `attrs=` (phương thức Attributes) — đăng ký một lần mỗi worker, TRƯỚC khi mở trang.
 * Playwright ném lỗi nếu đăng ký trùng tên nên giữ lời hứa ở cấp module.
 */
let attrsEngineReady: Promise<void> | null = null;
export function registerSelectorEngines(): Promise<void> {
  attrsEngineReady ??= selectors.register('attrs', createAttrsEngine).catch((err: Error) => {
    if (!/already registered/i.test(err.message)) throw err;
  });
  return attrsEngineReady;
}

function roleName(role: RoleLocator): { name?: string | RegExp; exact?: boolean } {
  if (!role.name) return {};
  switch (role.condition) {
    case 'equals':
      return { name: anyUnicodeForm(role.name, true), exact: true };
    case 'startsWith':
      return { name: new RegExp(`^\\s*${escapeRegex(nfc(role.name))}`) };
    case 'endsWith':
      return { name: new RegExp(`${escapeRegex(nfc(role.name))}\\s*$`) };
    case 'matchesRegex':
      return { name: new RegExp(role.name) };
    default:
      return { name: anyUnicodeForm(role.name, false), exact: false };
  }
}

function candidateLocator(scope: Page | FrameLocator, c: LocatorCandidate): Locator {
  switch (c.kind) {
    case 'xpath':
      return scope.locator(`xpath=${String(c.value).replace(/^xpath=/, '')}`);
    case 'attributes':
      return scope.locator(`attrs=${attributesSelector(c.value as ObjectProperty[])}`);
    case 'role': {
      const role = c.value as RoleLocator;
      return scope.getByRole(role.role as Parameters<Page['getByRole']>[0], roleName(role));
    }
    default:
      return scope.locator(String(c.value));
  }
}

const scopeOf = (base: Page | FrameLocator, obj: TestObject): Page | FrameLocator => (obj.frame ? base.frameLocator(obj.frame) : base);

/** Mọi locator của object theo thứ tự thử — cái đầu là phương thức đang chọn. */
export function locatorCandidates(scope: Page | FrameLocator, obj: TestObject): { label: string; locator: Locator }[] {
  const s = scopeOf(scope, obj);
  return candidates(obj).map((c) => ({ label: c.kind === 'xpath' ? c.label : c.kind, locator: candidateLocator(s, c) }));
}

/** Locator của phương thức đang chọn (không thử dự phòng). */
export function toLocator(scope: Page | FrameLocator, obj: TestObject): Locator {
  const first = locatorCandidates(scope, obj)[0];
  if (!first) throw new Error(`đối tượng "${obj.name}" chưa có cách định vị nào`);
  return first.locator;
}

// Như Katalon: keyword kiểm tra/chờ sự có mặt không được "chữa" — locator hỏng phải làm bài đỏ chứ không đạt nhờ dự phòng.
const NO_SELF_HEALING = /^(verifyElement(Not)?(Present|Visible)|waitForElement)/;
const HEAL_GRACE_MS = 1500;
const HEAL_WAIT_MS = 8000;

/**
 * Self-healing: locator đang chọn không khớp gì trong HEAL_GRACE_MS mà một locator khác của object khớp thì dùng
 * locator đó cho keyword này và báo qua `ctx.onHeal`. Hết HEAL_WAIT_MS vẫn không có gì khớp thì trả locator đang chọn
 * để keyword tự báo lỗi như bình thường.
 */
async function resolveTarget(ctx: RunContext, obj: TestObject, keyword: string, objectKey: string): Promise<Locator> {
  const list = locatorCandidates(ctx.frame ?? ctx.page, obj);
  if (!list.length) throw new Error(`đối tượng "${objectKey}" chưa có cách định vị nào`);
  if (list.length === 1 || NO_SELF_HEALING.test(keyword)) return list[0].locator;
  const start = Date.now();
  for (;;) {
    if ((await list[0].locator.count()) > 0) return list[0].locator;
    const elapsed = Date.now() - start;
    if (elapsed >= HEAL_GRACE_MS) {
      for (const c of list.slice(1)) {
        if ((await c.locator.count()) > 0) {
          ctx.onHeal?.({ object: objectKey, broken: list[0].label, used: c.label });
          return c.locator;
        }
      }
    }
    if (elapsed >= HEAL_WAIT_MS) return list[0].locator;
    await ctx.page.waitForTimeout(250);
  }
}

/** Text hiện tại của cả trang, đã chuẩn hoá NFC — dùng cho mọi phép so chữ. */
async function pageText(page: Page): Promise<string> {
  // Ngay sau một cú bấm gây chuyển trang, body có thể chưa có hoặc ngữ cảnh vừa bị huỷ: trả rỗng để expect.poll thử lại.
  try {
    return nfc(await page.evaluate(() => document.body?.innerText ?? ''));
  } catch {
    return '';
  }
}

const secs = (v: string, fallback = 10): number => (Number(v) > 0 ? Number(v) * 1000 : fallback * 1000);
const bool = (v: string, fallback: boolean): boolean => (v === '' ? fallback : v === 'true');
const norm = (v: string, trim: string, ignoreCase: string): string => {
  let s = nfc(v);
  if (bool(trim, true)) s = s.trim();
  if (bool(ignoreCase, false)) s = s.toLowerCase();
  return s;
};

/** Tệp cho Upload File: đường dẫn tương đối tính từ đây. */
const FILES_DIR = resolve(__dirname, '../../testdata/files');

/** Ngày giờ theo giờ Việt Nam, không theo múi giờ máy chạy. Token: yyyy yy MM dd HH mm ss. */
function formatDate(date: Date, pattern: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const tokens: Record<string, string> = {
    yyyy: parts.year,
    yy: parts.year.slice(-2),
    MM: parts.month,
    dd: parts.day,
    HH: parts.hour,
    mm: parts.minute,
    ss: parts.second,
  };
  return pattern.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => tokens[t]);
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
const selectEl = (target: () => Locator): Locator => target().first();

/** `<option>` không phải checkbox nên không dùng toBeChecked được — đọc thẳng `option.selected`. */
async function expectOption(sel: Locator, by: 'index' | 'label' | 'value', key: string, selected: boolean): Promise<void> {
  await expect
    .poll(
      () =>
        sel.locator('option').evaluateAll(
          (opts, [b, k]) => {
            const list = opts as HTMLOptionElement[];
            const o = b === 'index' ? list[Number(k)] : list.find((x) => (b === 'label' ? x.label === k || x.text === k : x.value === k));
            return o ? o.selected : null;
          },
          [by, key] as [string, string],
        ),
      { message: `option ${by} "${key}" lẽ ra phải ${selected ? 'được chọn' : 'không được chọn'}` },
    )
    .toBe(selected);
}

type Handler = (ctx: RunContext, call: KeywordCall, arg: (name: string) => string, target: () => Locator) => Promise<string | void>;

const HANDLERS: Record<string, Handler> = {
  // ── Web · Browser ────────────────────────────────────────────────────────
  async openBrowser(ctx, _call, arg) {
    await ctx.page.goto(arg('url'), { waitUntil: 'domcontentloaded' });
  },
  async navigateToUrl(ctx, _call, arg) {
    await ctx.page.goto(arg('url'), { waitUntil: 'domcontentloaded' });
  },
  async refresh(ctx) {
    await ctx.page.reload({ waitUntil: 'domcontentloaded' });
  },
  async back(ctx) {
    await ctx.page.goBack({ waitUntil: 'domcontentloaded' });
  },
  async forward(ctx) {
    await ctx.page.goForward({ waitUntil: 'domcontentloaded' });
  },

  async deleteAllCookies(ctx) {
    await ctx.page.context().clearCookies();
  },
  async clearBrowserSession(ctx, _call, arg) {
    // Trang lỗi / about:blank không có storage — bỏ qua, cookie vẫn xoá.
    await ctx.page
      .evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      })
      .catch(() => {});
    await ctx.page.context().clearCookies();
    ctx.frame = undefined;
    const url = arg('url');
    if (url) await ctx.page.goto(url, { waitUntil: 'domcontentloaded' });
    else await ctx.page.reload({ waitUntil: 'domcontentloaded' });
  },

  // ── Web · Window ─────────────────────────────────────────────────────────
  async openNewTab(ctx, _call, arg) {
    const page = await ctx.page.context().newPage();
    await page.goto(arg('url'), { waitUntil: 'domcontentloaded' });
    ctx.page = page;
    ctx.frame = undefined;
  },
  async closeCurrentWindow(ctx) {
    const context = ctx.page.context();
    await ctx.page.close();
    const rest = context.pages();
    if (!rest.length) throw new Error('đã đóng tab cuối cùng — không còn cửa sổ nào để làm việc tiếp');
    ctx.page = rest[0];
    ctx.frame = undefined;
  },
  async getCurrentWindowTitle(ctx) {
    return ctx.page.title();
  },
  async getCurrentWindowUrl(ctx) {
    return ctx.page.url();
  },
  async getWindowCount(ctx) {
    return String(ctx.page.context().pages().length);
  },
  async switchToWindowByTitle(ctx, _call, arg) {
    const wanted = nfc(arg('title'));
    for (const page of ctx.page.context().pages()) {
      if (nfc(await page.title()).includes(wanted)) {
        ctx.page = page;
        ctx.frame = undefined;
        await page.bringToFront();
        return;
      }
    }
    throw new Error(`không có tab nào có tiêu đề chứa "${arg('title')}"`);
  },
  async switchToWindowByUrl(ctx, _call, arg) {
    const page = ctx.page.context().pages().find((p) => p.url().includes(arg('url')));
    if (!page) throw new Error(`không có tab nào có URL chứa "${arg('url')}"`);
    ctx.page = page;
    ctx.frame = undefined;
    await page.bringToFront();
  },

  // ── Web · Element ────────────────────────────────────────────────────────
  async click(_ctx, _call, _arg, target) {
    await target().first().click();
  },
  async clickAndDownload(ctx, _call, arg, target) {
    const [download] = await Promise.all([ctx.page.waitForEvent('download', { timeout: secs(arg('timeout'), 30) }), target().first().click()]);
    const failure = await download.failure();
    if (failure) throw new Error(`tải tệp lỗi: ${failure}`);
    const file = await download.path();
    if (!statSync(file).size) throw new Error(`tệp tải về "${download.suggestedFilename()}" rỗng`);
    return nfc(download.suggestedFilename());
  },
  async doubleClick(_ctx, _call, _arg, target) {
    await target().first().dblclick();
  },
  async rightClick(_ctx, _call, _arg, target) {
    await target().first().click({ button: 'right' });
  },
  async clickWithJavascript(_ctx, _call, _arg, target) {
    await target().first().evaluate((el) => (el as HTMLElement).click());
  },
  async mouseOver(_ctx, _call, _arg, target) {
    await target().first().hover();
  },
  // Ô nhập thì THAY giá trị (Set Text cũ gộp vào đây); phần tử khác thì gõ từng phím.
  async sendKeys(_ctx, _call, arg, target) {
    const el = target().first();
    const kind = await el.evaluate((n) => {
      const h = n as HTMLElement;
      if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || h.isContentEditable) return { editable: true, tag: '', focusable: true, inner: 0 };
      const role = h.getAttribute('role') ?? '';
      return {
        editable: false,
        tag: n.localName,
        focusable: h.tabIndex >= 0 || /textbox|searchbox|combobox|spinbutton|slider/.test(role),
        inner: n.querySelectorAll('input, textarea, [contenteditable="true"]').length,
      };
    });
    if (kind.editable) {
      await el.fill('');
      await el.fill(arg('keys'));
    } else if (kind.focusable) {
      await el.pressSequentially(arg('keys'));
    } else {
      // Như Katalon: gõ vào phần tử không nhận bàn phím (vd div bọc ngoài ô nhập) thì phím rơi vào khoảng không — trước đây
      // bước vẫn "đạt" dù ô nhập trống. Báo đỏ để người viết sửa locator.
      throw new Error(
        `test object trỏ vào <${kind.tag}>, không phải ô nhập — phím gõ vào đó bị mất.` +
          (kind.inner ? ` Bên trong có ${kind.inner} ô nhập: sửa locator để trỏ thẳng vào ô cần gõ.` : ''),
      );
    }
  },
  async sendSpecialKeyboardCharacter(ctx, call, arg, target) {
    if (call.object) await target().first().press(arg('key'));
    else await ctx.page.keyboard.press(arg('key'));
  },
  async dragAndDropByOffset(ctx, _call, arg, target) {
    const el = target().first();
    const box = await el.boundingBox();
    if (!box) throw new Error('đối tượng không có kích thước trên màn hình để kéo');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await ctx.page.mouse.move(x, y);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(x + Number(arg('xOffset')), y + Number(arg('yOffset')), { steps: 8 });
    await ctx.page.mouse.up();
  },
  async dragAndDropToElement(ctx, _call, arg, target) {
    const dest = ctx.objects.objects[arg('destination')];
    if (!dest) throw new Error(`không có đối tượng đích "${arg('destination')}" trong kho`);
    await target().first().dragTo(toLocator(ctx.frame ?? ctx.page, dest).first());
  },
  async scrollToElement(_ctx, _call, _arg, target) {
    await target().first().scrollIntoViewIfNeeded();
  },
  async clickIfPresent(_ctx, _call, arg, target) {
    const timeout = Number(arg('timeoutMs')) || 3000;
    const el = target().first();
    // `isVisible` không chờ; bọc trong waitFor có bắt lỗi để "không có" là bỏ qua chứ không đỏ.
    try {
      await el.waitFor({ state: 'visible', timeout });
    } catch {
      return;
    }
    await el.click();
  },
  async scrollToBottom(ctx, call, _arg, target) {
    const area = call.object ? target().first() : ctx.page.locator('main').first();
    await area.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await ctx.page.waitForTimeout(400);
  },

  // ── Web · Text & form ────────────────────────────────────────────────────
  async clearText(_ctx, _call, _arg, target) {
    await target().first().fill('');
  },
  async submit(_ctx, _call, _arg, target) {
    await target()
      .first()
      .evaluate((el) => {
        const form = el instanceof HTMLFormElement ? el : (el as HTMLElement).closest('form');
        if (!form) throw new Error('phần tử không nằm trong form nào');
        form.requestSubmit();
      });
  },
  async setAttribute(_ctx, _call, arg, target) {
    await target()
      .first()
      .evaluate((el, [name, value]) => el.setAttribute(name, value), [arg('attributeName'), arg('attributeValue')]);
  },
  async setCssAttribute(_ctx, _call, arg, target) {
    await target()
      .first()
      .evaluate((el, [name, value]) => (el as HTMLElement).style.setProperty(name, value), [arg('attributeName'), arg('attributeValue')]);
  },

  async uploadFile(ctx, _call, arg, target) {
    const files = arg('filePath')
      .split(';')
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => (isAbsolute(f) ? f : resolve(FILES_DIR, f)));
    const missing = files.filter((f) => !existsSync(f));
    if (missing.length) throw new Error(`không có tệp ${missing.join(', ')} — đặt tệp vào e2e/testdata/files/ hoặc ghi đường dẫn đầy đủ`);
    const el = target().first();
    const kind = await el.evaluate((n) =>
      n instanceof HTMLInputElement && n.type === 'file' ? 'input' : n.querySelector('input[type="file"]') ? 'inner' : 'picker',
    );
    if (kind === 'input') await el.setInputFiles(files);
    else if (kind === 'inner') await el.locator('input[type="file"]').first().setInputFiles(files);
    else {
      const [chooser] = await Promise.all([ctx.page.waitForEvent('filechooser', { timeout: 10_000 }), el.click()]);
      await chooser.setFiles(files);
    }
  },

  // ── Web · Data retrieval ─────────────────────────────────────────────────
  async getText(_ctx, _call, _arg, target) {
    const el = target().first();
    await expect(el).toBeVisible();
    return nfc(await el.innerText()).trim();
  },
  async getTextFromMultipleElements(_ctx, _call, _arg, target) {
    return JSON.stringify((await target().allInnerTexts()).map((t) => nfc(t).trim()));
  },
  async getAttributeValue(_ctx, _call, arg, target) {
    return (await target().first().getAttribute(arg('attributeName'))) ?? '';
  },
  async getCssAttributeValue(_ctx, _call, arg, target) {
    return target()
      .first()
      .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), arg('attributeName'));
  },

  // ── Web · Select ─────────────────────────────────────────────────────────
  async selectOptionByIndex(_ctx, _call, arg, target) {
    await selectEl(target).selectOption({ index: Number(arg('index')) });
  },
  async selectOptionByLabel(_ctx, _call, arg, target) {
    await selectEl(target).selectOption({ label: arg('label') });
  },
  async selectOptionByValue(_ctx, _call, arg, target) {
    await selectEl(target).selectOption({ value: arg('value') });
  },
  async selectAllOptions(_ctx, _call, _arg, target) {
    const el = selectEl(target);
    const values = await el.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    await el.selectOption(values);
  },
  async deselectOptionByIndex(_ctx, _call, arg, target) {
    await selectEl(target).evaluate((el, i) => {
      (el as HTMLSelectElement).options[i].selected = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, Number(arg('index')));
  },
  async deselectOptionByLabel(_ctx, _call, arg, target) {
    await selectEl(target).evaluate((el, label) => {
      for (const o of (el as HTMLSelectElement).options) if (o.label === label) o.selected = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, arg('label'));
  },
  async deselectOptionByValue(_ctx, _call, arg, target) {
    await selectEl(target).evaluate((el, value) => {
      for (const o of (el as HTMLSelectElement).options) if (o.value === value) o.selected = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, arg('value'));
  },
  async deselectAllOptions(_ctx, _call, _arg, target) {
    await selectEl(target).selectOption([]);
  },
  async getNumberOfOption(_ctx, _call, _arg, target) {
    return String(await selectEl(target).locator('option').count());
  },
  async getNumberOfSelectedOption(_ctx, _call, _arg, target) {
    return String(await selectEl(target).locator('option:checked').count());
  },
  async selectOption(_ctx, _call, arg, target) {
    const wanted = nfc(arg('label')).toLowerCase().trim();
    const all = target();
    await expect(all.first()).toBeVisible();
    const texts = await all.allInnerTexts();
    const index = texts.findIndex((t) => nfc(t).toLowerCase().includes(wanted));
    if (index < 0) {
      throw new Error(
        `không thấy mục "${arg('label')}" trong danh sách. Đang có: ${texts.map((t) => t.trim()).join(' | ') || '(trống)'}`,
      );
    }
    await all.nth(index).click();
  },

  // ── Web · Alert ──────────────────────────────────────────────────────────
  async acceptAlert(ctx) {
    const d = await requireDialog(ctx, 5);
    await d.accept();
    ctx.pendingDialog = undefined;
  },
  async dismissAlert(ctx) {
    const d = await requireDialog(ctx, 5);
    await d.dismiss();
    ctx.pendingDialog = undefined;
  },
  async getAlertText(ctx) {
    return (await requireDialog(ctx, 5)).message();
  },
  async setTextOnAlert(ctx, _call, arg) {
    const d = await requireDialog(ctx, 5);
    await d.accept(arg('text'));
    ctx.pendingDialog = undefined;
  },
  async waitForAlert(ctx, _call, arg) {
    await requireDialog(ctx, Number(arg('timeout')) || 10);
  },
  async verifyAlertPresent(ctx, _call, arg) {
    await requireDialog(ctx, Number(arg('timeout')) || 5);
  },
  async verifyAlertNotPresent(ctx, _call, arg) {
    await ctx.page.waitForTimeout(secs(arg('timeout'), 1));
    if (ctx.pendingDialog) throw new Error(`đang có hộp thoại mở: "${ctx.pendingDialog.message()}"`);
  },

  // ── Web · Frame ──────────────────────────────────────────────────────────
  async switchToFrame(ctx, _call, _arg, target) {
    ctx.frame = target().first().contentFrame();
  },
  async switchToFrameByNameOrId(ctx, _call, arg) {
    const key = arg('nameOrId');
    ctx.frame = ctx.page.frameLocator(`iframe[name="${key}"], iframe#${key}`);
  },
  async switchToDefaultContent(ctx) {
    ctx.frame = undefined;
  },

  // ── Web · Verify element ─────────────────────────────────────────────────
  async verifyElementPresent(_ctx, _call, arg, target) {
    await target().first().waitFor({ state: 'attached', timeout: secs(arg('timeout')) });
  },
  async verifyElementNotPresent(_ctx, _call, arg, target) {
    await expect(target()).toHaveCount(0, { timeout: secs(arg('timeout')) });
  },
  async verifyElementVisible(_ctx, _call, arg, target) {
    await expect(target().first()).toBeVisible({ timeout: secs(arg('timeout')) });
  },
  async verifyElementNotVisible(_ctx, _call, arg, target) {
    await expect(target().first()).toBeHidden({ timeout: secs(arg('timeout')) });
  },
  async verifyElementEnable(_ctx, _call, _arg, target) {
    await expect(target().first()).toBeEnabled();
  },
  async verifyElementDisable(_ctx, _call, _arg, target) {
    await expect(target().first()).toBeDisabled();
  },
  async verifyElementClickable(_ctx, _call, _arg, target) {
    await expect(target().first()).toBeVisible();
    await expect(target().first()).toBeEnabled();
  },
  async verifyElementHasAttribute(_ctx, _call, arg, target) {
    await expect(target().first()).toHaveAttribute(arg('attributeName'));
  },
  async verifyElementNotHasAttribute(_ctx, _call, arg, target) {
    await expect(target().first()).not.toHaveAttribute(arg('attributeName'));
  },
  async verifyElementAttributeValue(_ctx, _call, arg, target) {
    await expect(target().first()).toHaveAttribute(arg('attributeName'), arg('expectedValue'));
  },
  async verifyElementAttributeValueByRegex(_ctx, _call, arg, target) {
    await expect(target().first()).toHaveAttribute(arg('attributeName'), new RegExp(arg('regex')));
  },
  async verifyElementAttributeValueDifferent(_ctx, _call, arg, target) {
    await expect(target().first()).not.toHaveAttribute(arg('attributeName'), arg('valueToAvoid'));
  },
  async verifyElementText(_ctx, _call, arg, target) {
    await expect
      .poll(async () => norm(await target().first().innerText(), arg('trimText'), arg('ignoreCase')), {
        message: `chữ của đối tượng khác "${arg('expectedText')}"`,
      })
      .toBe(norm(arg('expectedText'), arg('trimText'), arg('ignoreCase')));
  },
  async verifyElementTextByRegex(_ctx, _call, arg, target) {
    await expect(target().first()).toHaveText(new RegExp(arg('regex')));
  },
  async verifyElementTextDifferentFrom(_ctx, _call, arg, target) {
    await expect
      .poll(async () => norm(await target().first().innerText(), arg('trimText'), arg('ignoreCase')), {
        message: `chữ của đối tượng lẽ ra phải khác "${arg('textToAvoid')}"`,
      })
      .not.toBe(norm(arg('textToAvoid'), arg('trimText'), arg('ignoreCase')));
  },
  async verifyText(ctx, call, arg, target) {
    const wanted = nfc(arg('text'));
    if (call.object) {
      await expect
        .poll(async () => nfc(await target().first().innerText()), {
          message: `đối tượng không chứa chữ "${arg('text')}"`,
        })
        .toContain(wanted);
      return;
    }
    await expect
      .poll(() => pageText(ctx.page), { message: `không thấy chữ "${arg('text')}" trên màn hình` })
      .toContain(wanted);
  },
  async verifyTextAbsent(ctx, _call, arg) {
    await expect
      .poll(() => pageText(ctx.page), { message: `chữ "${arg('text')}" lẽ ra không được hiện` })
      .not.toContain(nfc(arg('text')));
  },
  async verifyValue(_ctx, _call, arg, target) {
    await expect(target().first()).toHaveValue(arg('value'));
  },
  async verifyEmpty(_ctx, _call, _arg, target) {
    await expect(target().first()).toHaveValue('');
  },
  async verifyCount(_ctx, _call, arg, target) {
    await expect(target()).toHaveCount(Number(arg('count')));
  },
  async verifyUrl(ctx, _call, arg) {
    await expect
      .poll(() => ctx.page.url(), { message: `địa chỉ trang không chứa "${arg('contains')}"` })
      .toContain(arg('contains'));
  },

  // ── Web · Verify option ──────────────────────────────────────────────────
  async verifyOptionPresentByLabel(_ctx, _call, arg, target) {
    await expect(selectEl(target).locator('option', { hasText: arg('label') })).not.toHaveCount(0);
  },
  async verifyOptionPresentByValue(_ctx, _call, arg, target) {
    await expect(selectEl(target).locator(`option[value="${arg('value')}"]`)).not.toHaveCount(0);
  },
  async verifyOptionSelectedByIndex(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'index', arg('index'), true);
  },
  async verifyOptionSelectedByLabel(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'label', arg('label'), true);
  },
  async verifyOptionSelectedByValue(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'value', arg('value'), true);
  },
  async verifyOptionDeselectedByIndex(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'index', arg('index'), false);
  },
  async verifyOptionDeselectedByLabel(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'label', arg('label'), false);
  },
  async verifyOptionDeselectedByValue(_ctx, _call, arg, target) {
    await expectOption(selectEl(target), 'value', arg('value'), false);
  },

  // ── Web · Wait ───────────────────────────────────────────────────────────
  async waitForElementPresent(_ctx, _call, arg, target) {
    await target().first().waitFor({ state: 'attached', timeout: secs(arg('timeout')) });
  },
  async waitForElementNotPresent(_ctx, _call, arg, target) {
    await target().first().waitFor({ state: 'detached', timeout: secs(arg('timeout')) });
  },
  async waitForElementVisible(_ctx, _call, arg, target) {
    await target().first().waitFor({ state: 'visible', timeout: secs(arg('timeout')) });
  },
  async waitForElementNotVisible(_ctx, _call, arg, target) {
    await target().first().waitFor({ state: 'hidden', timeout: secs(arg('timeout')) });
  },
  async waitForElementEnabled(_ctx, _call, arg, target) {
    await expect(target().first()).toBeEnabled({ timeout: secs(arg('timeout')) });
  },
  async waitForElementDisabled(_ctx, _call, arg, target) {
    await expect(target().first()).toBeDisabled({ timeout: secs(arg('timeout')) });
  },
  async waitForElementClickable(_ctx, _call, arg, target) {
    await expect(target().first()).toBeVisible({ timeout: secs(arg('timeout')) });
    await expect(target().first()).toBeEnabled({ timeout: secs(arg('timeout')) });
  },
  async waitText(ctx, _call, arg) {
    await expect
      .poll(() => pageText(ctx.page), {
        message: `chờ mãi không thấy chữ "${arg('text')}"`,
        timeout: Number(arg('timeoutMs')) || 10_000,
      })
      .toContain(nfc(arg('text')));
  },

  // ── Web · JavaScript ─────────────────────────────────────────────────────
  async executeJavascript(ctx, _call, arg) {
    const result = await ctx.page.evaluate((code) => new Function(code)(), arg('script'));
    return result === undefined || result === null ? '' : asText(result);
  },

  // ── Other ─────────────────────────────────────────────────────────
  async delay(ctx, _call, arg) {
    await ctx.page.waitForTimeout(Number(arg('ms')) || 0);
  },
  async setVariable(ctx, _call, arg) {
    ctx.vars[arg('name')] = arg('value');
  },
  async generateUniqueCode(_ctx, _call, arg) {
    const suffix = `${formatDate(new Date(), 'yyMMdd-HHmmss')}-${Math.random().toString(36).slice(2, 5)}`;
    return arg('prefix') ? `${arg('prefix')}-${suffix}` : suffix;
  },
  async getDate(_ctx, _call, arg) {
    const days = Number(arg('offsetDays') || 0);
    if (!Number.isFinite(days)) throw new Error(`"Days from today" phải là số, nhận "${arg('offsetDays')}"`);
    return formatDate(new Date(Date.now() + days * 86_400_000), arg('format') || 'dd/MM/yyyy');
  },
  async verifyVariable(ctx, _call, arg) {
    const name = arg('name');
    const actual = ctx.vars[name];
    if (actual === undefined) throw new Error(`chưa có biến "${name}" — phải có keyword ghi Output variable "${name}" (hoặc "Set variable") trước`);
    const op = arg('op');
    const expected = arg('value');
    if (op === 'notEmpty') expect(actual, `biến "${name}"`).not.toBe('');
    else if (op === 'contains') expect(nfc(actual), `biến "${name}"`).toContain(nfc(expected));
    else expect(nfc(actual), `biến "${name}"`).toBe(nfc(expected));
  },
  async screenshot(ctx, _call, arg) {
    const name = arg('name') || 'anh-chup';
    await ctx.attach(name, await ctx.page.screenshot());
  },
  async comment() {
    /* chỉ để đọc */
  },
};

async function requireDialog(ctx: RunContext, timeoutSec: number): Promise<Dialog> {
  const until = Date.now() + timeoutSec * 1000;
  while (!ctx.pendingDialog && Date.now() < until) await ctx.page.waitForTimeout(100);
  if (!ctx.pendingDialog) throw new Error('không có hộp thoại (alert/confirm/prompt) nào đang mở');
  return ctx.pendingDialog;
}

/**
 * Kiểm test case TRƯỚC khi chạy: keyword có thật không, đối tượng có trong kho không (đúng loại không),
 * tham số bắt buộc có đủ không, step có tên chưa.
 *
 * Có bước này thì một test case gõ sai tên đối tượng sẽ báo ngay ở dòng đầu, thay vì chạy nửa
 * chừng rồi đỏ — mà chạy nửa chừng trên dữ liệu thật là đã kịp đụng vào hệ thống.
 */
export function validate(tc: TestCase, objects: ObjectRepository): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  (tc.variables ?? []).forEach((v, i) => {
    const at = `Biến cục bộ ${i + 1}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name ?? '')) problems.push(`${at}: tên "${v.name ?? ''}" không hợp lệ (chữ, số, _)`);
    else if (seen.has(v.name)) problems.push(`${at}: tên "${v.name}" bị trùng`);
    seen.add(v.name);
  });
  if (!Array.isArray(tc.steps) || tc.steps.length === 0) {
    problems.push('Test case chưa có test step nào');
    return problems;
  }
  tc.steps.forEach((step, si) => {
    if (step.disabled) return;
    const stepAt = `Test step ${si + 1}${step.name ? ` «${step.name}»` : ''}`;
    if (!Array.isArray(step.keywords) || step.keywords.length === 0) {
      problems.push(`${stepAt}: chưa có keyword nào`);
      return;
    }
    step.keywords.forEach((call, ci) => {
      if (call.disabled) return;
      const spec = KEYWORDS.get(call.keyword);
      const at = `${stepAt} → keyword ${ci + 1}`;
      if (!spec) {
        problems.push(`${at}: không có keyword "${call.keyword}" trong danh mục`);
        return;
      }
      if (spec.object === true && !call.object) problems.push(`${at} (${spec.label}): thiếu Test Object`);
      if (call.object && !objects.objects[call.object]) {
        problems.push(`${at} (${spec.label}): không có đối tượng "${call.object}" trong kho`);
      }
      for (const argSpec of spec.args) {
        if (!argSpec.required) continue;
        const v = call.args?.[argSpec.name];
        if (v === undefined || v === '') {
          problems.push(`${at} (${spec.label}): thiếu tham số bắt buộc "${argSpec.label}"`);
        }
      }
    });
  });
  return problems;
}

/** Nhãn một keyword, dùng cho `test.step` con và dòng log — đọc là hình dung được thao tác. */
export function describeCall(call: KeywordCall, objects: ObjectRepository, index: number): string {
  const spec = KEYWORDS.get(call.keyword);
  const label = call.name?.trim() || spec?.label || call.keyword;
  const objName = call.object ? objects.objects[call.object]?.name ?? call.object : '';
  const args = Object.entries(call.args ?? {})
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([, v]) => `"${v}"`)
    .join(', ');
  return [`${index + 1}. ${label}`, objName && `→ ${objName}`, args && `(${args})`, call.output && `⇒ ${call.output}`]
    .filter(Boolean)
    .join(' ');
}

/** Nhãn một test step: số thứ tự + tên người viết đặt. */
export const describeStep = (step: TestStep, index: number): string =>
  `Step ${index + 1}: ${step.name?.trim() || KEYWORDS.get(step.keywords?.[0]?.keyword ?? '')?.label || '(chưa đặt tên)'}`;

/** Chạy đúng một keyword. Ném `KeywordError` có kèm vị trí để báo cáo đọc ra ngay. */
export async function runCall(ctx: RunContext, call: KeywordCall, at: CallAt): Promise<void> {
  const handler = HANDLERS[call.keyword];
  if (!handler) throw new KeywordError(call, at, 'chưa cài đặt keyword này trong engine.ts');

  const arg = (name: string): string => {
    try {
      return resolveValue(call.args?.[name], ctx);
    } catch (err) {
      throw new KeywordError(call, at, (err as Error).message);
    }
  };
  let resolved: Locator | undefined;
  const target = (): Locator => {
    if (resolved) return resolved;
    const obj = call.object ? ctx.objects.objects[call.object] : undefined;
    if (!obj) throw new KeywordError(call, at, `không có đối tượng "${call.object}" trong kho`);
    return toLocator(ctx.frame ?? ctx.page, obj);
  };

  try {
    const obj = call.object ? ctx.objects.objects[call.object] : undefined;
    if (obj) resolved = await resolveTarget(ctx, obj, call.keyword, call.object as string);
    const result = await handler(ctx, call, arg, target);
    if (call.output && result !== undefined) ctx.vars[call.output] = result;
  } catch (err) {
    if (err instanceof KeywordError) throw err;
    throw new KeywordError(call, at, (err as Error).message);
  }
}

export { KEYWORDS, readObjects };
