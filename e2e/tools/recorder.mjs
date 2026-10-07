#!/usr/bin/env node
/**
 * GHI THAO TÁC → sinh thẳng kịch bản keyword + Test Object.
 *
 *   node tools/recorder.mjs --partner demo --name "Search docs" [--folder "Smoke"] [--browser msedge|firefox]
 *
 * Mở một trình duyệt THẬT (trống — người ghi tự gõ địa chỉ trang cần test), rồi ngồi nghe thao tác của
 * người dùng. Mỗi cú bấm / gõ / chọn được quy về **một keyword** trong
 * `shared/keyword/catalog.json` và **một Test Object** trong `objects/<project>/**.to`.
 * Kết thúc: đóng trình duyệt, hoặc console ghi chữ `stop` vào file điều khiển.
 *
 * Vì sao tự viết thay vì dùng `playwright codegen`: codegen sinh ra **code TypeScript**, mà mục
 * tiêu ở đây là người không biết code vẫn sửa lại được kịch bản. Nên recorder này sinh ra
 * **dữ liệu** (JSON keyword + kho đối tượng dùng lại được), đúng mô hình Katalon.
 *
 * Ba quy ước quan trọng:
 *   · **Không đụng vào source FE.** Không thêm `data-testid`; chỉ dùng id/aria/role/text sẵn có.
 *   · **Đối tượng trùng thì dùng lại**, không đẻ bản sao: khớp theo chuỗi định vị.
 *   · **Không ghi thao tác lên chính trang báo cáo/recorder** — chỉ nghe trên tab của app.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from '@playwright/test';
import { createRequire } from 'node:module';
import { RECORDER_SCRIPT } from './recorder-page.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OBJECT_MODEL = resolve(ROOT, 'shared/keyword/object-model.cjs');
const { normalizeObject, signatures } = createRequire(import.meta.url)(OBJECT_MODEL);

// ── Tham số dòng lệnh ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--partner') out.partner = argv[++i];
    else if (a === '--env') out.env = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--id') out.id = argv[++i];
    else if (a === '--folder') out.folder = argv[++i];
    else if (a === '--control') out.control = argv[++i];
    else if (a === '--events') out.events = argv[++i];
    else if (a === '--browser') out.browser = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PARTNER = args.partner;
if (!PARTNER) throw new Error('Thiếu --partner <mã project>');
const ENV_CODE = args.env ?? 'local';
const IS_FIREFOX = args.browser === 'firefox';
// Mốc thao tác cuối cùng đã ghi — Firefox dùng để đoán điều hướng do trang hay do người gõ địa chỉ.
let lastPageEventAt = 0;

// ── Nạp cấu hình môi trường (giống bin/run.mjs, không dùng thư viện ngoài) ──
function loadEnv(code) {
  const file = resolve(ROOT, 'config/env', `${code}.env`);
  // Console truyền Global variables qua biến môi trường; file .env chỉ còn là dự phòng nên thiếu cũng không sao.
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = line.slice(i + 1).trim();
    }
  }
}
loadEnv(ENV_CODE);

// ── Kho đối tượng ───────────────────────────────────────────────────────────
// Kho object = cây objects/<project>/**.to (khoá = đường dẫn bỏ đuôi); recorder chỉ ghi thêm object mới.
const objectsDir = resolve(ROOT, 'objects', PARTNER);
const repo = { objects: {} };
const readObjectTree = (dir, rel) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) readObjectTree(abs, rel ? `${rel}/${entry.name}` : entry.name);
    else if (entry.name.endsWith('.to')) {
      try {
        repo.objects[`${rel ? `${rel}/` : ''}${entry.name.slice(0, -3)}`] = normalizeObject(JSON.parse(readFileSync(abs, 'utf8')));
      } catch {
        /* file hỏng — bỏ qua */
      }
    }
  }
};
readObjectTree(objectsDir, '');
const newObjectKeys = new Set();

const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'doi_tuong';

/**
 * Tìm đối tượng đã có trỏ cùng phần tử; không có thì tạo khoá mới. "Cùng phần tử" = locator chính của lần ghi này
 * trùng một locator bất kỳ của object trong kho (object cũ có thể đang dùng phương thức khác).
 *
 * Khoá đặt theo kiểu Katalon `<Màn hình>/<tên>` để danh sách trên console tự gom nhóm theo màn.
 */
function objectKeyFor(candidate, screen) {
  const primary = signatures(candidate)[0];
  for (const [key, obj] of Object.entries(repo.objects)) {
    if (primary && signatures(obj).includes(primary)) return key;
  }
  // Tên theo chuẩn <loại>_<tên>: btn_submit, input_email, label_title…
  const base = `${slug(screen) || 'ManHinh'}/${candidate.kind || 'elm'}_${slug(candidate.name).replace(/^[a-z]+_/, '')}`;
  let key = base;
  for (let i = 2; repo.objects[key]; i++) key = `${base}_${i}`;
  repo.objects[key] = { ...candidate, screen, createdAt: new Date().toISOString() };
  newObjectKeys.add(key);
  return key;
}

// ── Test case đang ghi ──────────────────────────────────────────────────────
//
// Mỗi thao tác ghi được là MỘT test step riêng, tên để trống (console hiện tên keyword). Người dùng tự gộp
// các step thành một việc trên console (kéo-thả / chuột phải → Merge) khi cần.
const steps = [];
/** Mốc thao tác gần nhất — khoảng nghỉ thực tế giữa hai thao tác được ghi thành keyword `delay`. */
let lastActionAt = 0;

function pushDelay() {
  if (!lastActionAt) return;
  const gap = Date.now() - lastActionAt;
  if (gap < 1000) return;
  pushCall({ keyword: 'delay', args: { ms: String(Math.round(gap / 500) * 500) } });
}
const eventsFile = args.events ? resolve(args.events) : null;

function pushCall(call) {
  const step = { name: '', keywords: [call] };
  steps.push(step);
  lastActionAt = Date.now();
  if (eventsFile) {
    // Console đọc file này để hiện danh sách theo thời gian thực.
    appendFileSync(
      eventsFile,
      `${JSON.stringify({ at: Date.now(), stepIndex: steps.length - 1, stepName: step.name, call })}\n`,
      'utf8',
    );
  }
  const desc = [call.keyword, call.object, JSON.stringify(call.args ?? {})].filter(Boolean).join('  ');
  // eslint-disable-next-line no-console
  console.log(`  [${steps.length}]  ${desc}`);
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `  Đang ghi thao tác — project ${PARTNER}`,
      '  Trình duyệt mở trống — gõ địa chỉ trang cần test vào thanh địa chỉ, recorder tự ghi keyword Open Browser.',
      '',
      '  Thao tác bình thường như người dùng. Mỗi cú bấm / gõ chữ / chọn trong danh sách',
      '  sẽ thành một bước trong kịch bản.',
      '',
      '  XONG THÌ: đóng cửa sổ trình duyệt (hoặc bấm "Dừng ghi" trên console).',
      '',
    ].join('\n'),
  );

  // RECORDER_CDP_PORT: mở cổng DevTools để script kiểm thử điều khiển được trình duyệt ghi (không dùng khi ghi tay).
  // Cửa sổ phóng to hết màn, không giả lập điện thoại — cần khổ điện thoại thì tự bật bằng DevTools.
  const launchArgs = ['--start-maximized'];
  if (process.env.RECORDER_CDP_PORT) launchArgs.push(`--remote-debugging-port=${process.env.RECORDER_CDP_PORT}`);
  let browser;
  try {
    browser = IS_FIREFOX
      ? await firefox.launch({ headless: false })
      : await chromium.launch({ headless: false, args: launchArgs, ...(args.browser === 'msedge' ? { channel: 'msedge' } : {}) });
  } catch (err) {
    if (IS_FIREFOX && /missing dependencies|freebl3|0xc0000|blocked/i.test(err.message)) {
      throw new Error(
        "Could not open Playwright's Firefox: Windows (Smart App Control / DLL blocking policy) does not allow its libraries to load. " +
          'Record with Chrome or Edge, or allow it and run "npx playwright install firefox".',
      );
    }
    throw err;
  }
  const context = await browser.newContext({
    viewport: null,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  // Cài script nghe TRƯỚC khi mở tab đầu tiên — `addInitScript` chỉ chạy cho những lần điều hướng
  // SAU khi cài, mở tab trước là mất luôn thao tác đầu.

  /**
   * Kênh nhận sự kiện từ trang.
   *
   * `exposeBinding` sống qua mọi lần điều hướng, kể cả trong iframe — nên không phải cài lại
   * sau mỗi lần đổi màn.
   */
  await context.exposeBinding('__recordStep', (_source, payload) => {
    lastPageEventAt = Date.now();
    try {
      handle(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('  (bỏ qua một thao tác không dựng được bước):', err.message);
    }
  });

  await context.addInitScript({ path: OBJECT_MODEL });
  await context.addInitScript(RECORDER_SCRIPT);

  const page = await context.newPage();
  {
    // Trang trống nhưng không trắng loá: vẽ nền tối + gợi ý, URL vẫn là about:blank nên lần gõ địa chỉ đầu tiên
    // vẫn được nhận là "mở trang" (openBrowser).
    await page.goto('about:blank');
    await page.setContent(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Recording</title></head>
      <body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f1115;color:#9aa8bd;font:15px system-ui,sans-serif">
        <div style="text-align:center;line-height:1.7">
          <div style="font-size:34px">⏺</div>
          <div>Type the URL of the app you want to test into the address bar.</div>
          <div style="font-size:13px;opacity:.7">Every click, input and selection becomes a step. Close this window to finish.</div>
        </div>
      </body></html>`,
    );
  }

  // Mọi điều hướng của khung chính (gõ địa chỉ, redirect, pushState của SPA) đều đi qua đây —
  // trang không tự báo được lần tải đầu tiên vì script nghe chỉ chạy sau khi tài liệu đã có.
  //
  // Phân biệt NGƯỜI gõ địa chỉ với APP tự chuyển trang: Chrome chỉ bắn Page.frameRequestedNavigation cho
  // điều hướng do trang khởi xướng (script, bấm link, submit form); gõ vào thanh địa chỉ thì không.
  // Người gõ → navigateToUrl (bước thao tác); app tự chuyển → chỉ verifyUrl (kiểm tra kết quả) — ép mở lại
  // URL app sinh ra (vd trang thanh toán có chữ ký dùng một lần) là chạy lại chắc chắn hỏng.
  let pageInitiatedAt = 0;
  let lastNavAt = 0;
  if (!IS_FIREFOX) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const mainFrameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    cdp.on('Page.frameRequestedNavigation', (e) => {
      if (e.frameId === mainFrameId) pageInitiatedAt = Date.now();
    });
  }
  // Firefox không có CDP: đoán theo thời gian — điều hướng ngay sau một thao tác đã ghi, hoặc ngay sau lần chuyển trang
  // trước (redirect/app tự chuyển lúc tải), là do trang; còn lại coi là người gõ địa chỉ.
  const isTyped = () =>
    IS_FIREFOX ? Date.now() - lastPageEventAt > 1500 && Date.now() - lastNavAt > 3000 : Date.now() - pageInitiatedAt > 1500;
  // URL người gõ = request điều hướng ĐẦU (chưa qua redirect); URL commit có thể đã bị đổi bởi 302.
  let pending = null;
  page.on('request', (r) => {
    if (!r.isNavigationRequest() || r.frame() !== page.mainFrame() || r.redirectedFrom()) return;
    pending = { url: r.url(), typed: isTyped(), at: Date.now() };
  });
  let lastUrl = page.url();
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!url || url === 'about:blank' || url === lastUrl) return;
    const prev = lastUrl;
    lastUrl = url;
    lastNavAt = Date.now();
    const nav = pending && Date.now() - pending.at < 30_000 ? pending : null;
    pending = null;
    try {
      onNavigate(url, prev, nav);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('  (bỏ qua một lần điều hướng không dựng được bước):', err.message);
    }
  });

  // ── Dừng: đóng trình duyệt, hoặc console ghi "stop" vào file điều khiển ───
  let done = false;
  const finish = () => {
    done = true;
  };
  context.on('close', finish);
  browser.on('disconnected', finish);
  // Edge chạy nền sau khi đóng cửa sổ nên không bắn 'disconnected' — đóng tab cuối cùng cũng là xong.
  const watchPage = (p) =>
    p.on('close', () => {
      if (context.pages().length === 0) finish();
    });
  context.pages().forEach(watchPage);
  context.on('page', watchPage);

  const control = args.control ? resolve(args.control) : null;
  while (!done) {
    await new Promise((r) => setTimeout(r, 400));
    if (control && existsSync(control) && readFileSync(control, 'utf8').trim() === 'stop') break;
  }

  await browser.close().catch(() => undefined);
  save();
}

/**
 * Điều hướng khung chính → keyword:
 *   - lần đầu (từ trang trống): openBrowser <url người gõ> — bước Set up;
 *   - người gõ địa chỉ mới: navigateToUrl <url người gõ>;
 *   - app tự chuyển (bấm link/nút, SPA đổi route, redirect, sang cổng thanh toán): thêm step verifyUrl —
 *     chốt "bấm xong phải sang đúng màn này"; cùng origin kiểm path, khác origin kiểm host+path.
 *     Chưa có bước Main nào (app redirect ngay sau khi mở) thì bỏ qua: keyword kiểm tra không được nằm ở Set up.
 */
function onNavigate(url, prev, nav) {
  const u = new URL(url);
  // URL người gõ không mang phần #hash (trình duyệt không gửi lên mạng) — nếu chỉ khác hash thì lấy URL đã commit
  // để app điều hướng bằng hash (#/route) không mất route.
  const typedUrl = nav && nav.url !== url.replace(/#.*$/, '') ? nav.url : url;
  if (prev === 'about:blank') {
    pushCall({ keyword: 'openBrowser', args: { url: typedUrl } });
    return;
  }
  if (nav?.typed) {
    pushDelay();
    pushCall({ keyword: 'navigateToUrl', args: { url: typedUrl } });
    return;
  }
  if (steps.length < 2) return;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(prev).origin === u.origin;
  } catch {
    /* prev không phải URL — coi như khác origin */
  }
  steps.push({ name: '', keywords: [{ keyword: 'verifyUrl', args: { contains: sameOrigin ? u.pathname : `${u.host}${u.pathname}` } }] });
  lastActionAt = Date.now();
}

/** Khổ màn hình gần nhất trang báo lên — lưu vào test case để chạy lại đúng khổ. */
let lastViewport = null;

/** Quy một sự kiện của trang về một bước keyword. */
function handle(ev) {
  if (ev.viewport?.width) lastViewport = { width: ev.viewport.width, height: ev.viewport.height, dpr: ev.viewport.dpr ?? 1, mobile: Boolean(ev.viewport.mobile) };
  const screen = ev.screen || 'ManHinh';

  // Điều hướng do phía Node bắt qua page.on('framenavigated') (onNavigate) — sự kiện của trang chỉ để biết tên màn.
  if (ev.type === 'navigate') return;

  // Phím đặc biệt bấm ngoài ô nhập (Escape đóng lớp phủ, F5 tải lại…): không có phần tử nào để dựng test object.
  if (ev.type === 'key' && !ev.object) {
    pushDelay();
    pushCall({ keyword: 'sendSpecialKeyboardCharacter', args: { key: ev.value } });
    return;
  }

  const candidate = normalizeObject({ name: ev.name, kind: ev.kind, ...(ev.object ?? {}) });
  const key = objectKeyFor(candidate, screen);
  if (ev.type === 'input') {
    // Gõ nhiều lần vào cùng một ô: gộp thành MỘT keyword mang giá trị cuối. Không gộp thì test
    // case đầy những dòng nhập dở dang, đọc không ra ý định.
    const last = steps.at(-1)?.keywords.at(-1);
    if (last && last.keyword === 'sendKeys' && last.object === key) {
      last.args.keys = ev.value;
      lastActionAt = Date.now();
      return;
    }
    pushDelay();
    pushCall({ keyword: 'sendKeys', object: key, args: { keys: ev.value } });
    return;
  }

  if (ev.type === 'select') {
    pushDelay();
    pushCall({ keyword: 'selectOption', object: key, args: { label: ev.value } });
    return;
  }

  if (ev.type === 'click') {
    pushDelay();
    pushCall({ keyword: 'click', object: key });
    return;
  }

  if (ev.type === 'key') {
    pushDelay();
    pushCall({ keyword: 'sendSpecialKeyboardCharacter', object: key, args: { key: ev.value } });
    return;
  }

  if (ev.type === 'assert') {
    pushDelay();
    pushCall({ keyword: 'verifyText', args: { text: ev.value } });
  }
}

function save() {
  const id = args.id || `tc-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
  const folder = String(args.folder ?? 'Ghi thao tác')
    .split('/')
    .map((x) => x.trim())
    .filter((x) => x && x !== '.' && x !== '..')
    .join('/');
  const dir = resolve(ROOT, 'testcases', folder);
  mkdirSync(dir, { recursive: true });
  for (const key of newObjectKeys) {
    const file = resolve(objectsDir, `${key}.to`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(repo.objects[key], null, 2)}\n`, 'utf8');
  }

  // Khuôn chung: step mở app = Set up, thao tác ghi được = Main, thêm Tear down "Kết thúc".
  if (steps[0]) steps[0].phase = 'setup';
  for (const st of steps.slice(1)) st.phase = 'main';
  steps.push({ name: 'Kết thúc', phase: 'teardown', keywords: [{ keyword: 'screenshot', args: { name: 'ket-thuc' } }] });
  const tc = {
    id,
    folder,
    name: args.name || 'Test case ghi tự động',
    partner: PARTNER,
    dataApp: 'keyword',
    tcIds: [],
    tags: ['recorded'],
    recordedAt: new Date().toISOString(),
    ...(lastViewport ? { viewport: lastViewport } : {}),
    steps,
  };
  // Đuôi .tc — cùng luật với shared/keyword/store.ts.
  writeFileSync(resolve(dir, `${id}.tc`), `${JSON.stringify(tc, null, 2)}\n`, 'utf8');

  const total = steps.reduce((n, st) => n + st.keywords.length, 0);
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `  Đã lưu test case: testcases/${folder}/${id}.tc  (${steps.length} test step, ${total} keyword)`,
      `  Kho đối tượng:    objects/${PARTNER}/  (+${newObjectKeys.size} đối tượng mới, ${Object.keys(repo.objects).length} tổng)`,
      '',
      `  Chạy thử:  npm test -- --partner ${PARTNER} --app keyword --env ${ENV_CODE}`,
      '',
    ].join('\n'),
  );
  // Console đọc dòng này để biết file nào vừa sinh ra.
  console.log(`RECORDER_SAVED ${folder ? `${folder}/` : ''}${id}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`\n  Không ghi được: ${err.message}\n`);
  // Dòng máy đọc: console hiện đúng câu lỗi thay vì cả đoạn log hướng dẫn phía trên.
  console.error(`RECORDER_ERROR ${err.message}`);
  process.exit(1);
});
