import { defineConfig } from '@playwright/test';
import { getSuite, getEnvironment, getPartner, applyEnvConfig, optionalBaseUrl, resolveDevice } from './config/registry';

/**
 * Cấu hình Playwright duy nhất cho mọi project. Chọn project bằng biến môi trường, do `bin/run.mjs`
 * (hoặc console) đặt:
 *
 *     npm test -- --partner demo
 */

const partnerCode = process.env.E2E_PARTNER ?? '';
const appKind = process.env.E2E_APP ?? 'keyword';
const envCode = process.env.E2E_ENV ?? 'local';

getPartner(partnerCode);
const suite = getSuite(partnerCode, appKind);
const environment = getEnvironment(envCode);

applyEnvConfig(envCode);

// Chặn ở đây chứ không chờ test chạy rồi mới hỏng dữ liệu.
if (environment.readOnly && suite.writes && process.env.E2E_FORCE !== '1') {
  throw new Error(
    [
      `Môi trường "${envCode}" là read-only, mà bộ "${partnerCode}/${appKind}" có ghi dữ liệu (writes: true).`,
      'Nếu thật sự cần chạy, đặt E2E_FORCE=1 hoặc truyền --force.',
    ].join('\n'),
  );
}

const device = resolveDevice(appKind, process.env.E2E_DEVICE);

/**
 * Chạy có mở trình duyệt thì ép về một worker: nhiều cửa sổ song song nhảy loạn trên màn hình,
 * mà mở trình duyệt vốn chỉ để người ngồi xem. Chạy ẩn thì vẫn song song bình thường.
 */
const headed = process.env.E2E_HEADED === '1';

/** Trình duyệt chạy test (--browser): chromium = Chrome, msedge = Edge cài trên máy, firefox = Firefox của Playwright. */
const browser = (process.env.E2E_BROWSER ?? 'chromium') as 'chromium' | 'msedge' | 'firefox';
const isFirefox = browser === 'firefox';

/**
 * Mỗi lần chạy một thư mục riêng: `reports/<runKey>/<runId>`. Console truyền `E2E_RUN_ID` để thư mục
 * trùng id lần chạy nó lưu; chạy tay từ CLI thì tự đặt theo mốc thời gian.
 */
const RUN_KEY = `${partnerCode}-${appKind}-${envCode}`;
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `cli-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')}`;
const REPORT_DIR = `reports/${RUN_KEY}/${RUN_ID}`;

export default defineConfig({
  testDir: '.',
  testMatch: suite.testMatch,
  outputDir: `${REPORT_DIR}/artifacts`,

  timeout: 45_000,
  expect: { timeout: 8_000 },

  fullyParallel: !headed,
  workers: headed ? 1 : process.env.CI ? 2 : 4,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: `${REPORT_DIR}/html`, open: 'never' }],
    ['json', { outputFile: `${REPORT_DIR}/results.json` }],
    ['./reporters/run-summary.ts', { reportDir: REPORT_DIR, runKey: RUN_KEY, partner: partnerCode, app: appKind, env: envCode }],
    ['./reporters/kw-progress.ts'],
  ],

  use: {
    // URL gốc không bắt buộc — test case tự mở trang (Open Browser với URL đầy đủ).
    baseURL: optionalBaseUrl(envCode, suite.baseUrlKey),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    // Mở trình duyệt thì phóng to hết màn — bài ghi ở khổ desktop (viewport: null trong runner) lấp đúng cửa sổ.
    // --start-maximized là cờ riêng của nhân Chromium; Firefox không nhận.
    ...(headed && !isFirefox ? { launchOptions: { args: ['--start-maximized'] } } : {}),
    // Khổ desktop + mở trình duyệt: viewport theo cửa sổ cho lấp đúng màn hình. Playwright cấm deviceScaleFactor đi cùng
    // viewport null, mà test.use không xoá được giá trị đặt ở đây, nên khi đó không đặt.
    viewport: headed && !device.mobile ? null : { width: device.width, height: device.height },
    ...(headed ? {} : { deviceScaleFactor: device.dpr }),
    // Firefox không hỗ trợ isMobile — giữ khổ màn hình, bỏ giả lập di động.
    isMobile: device.mobile && !isFirefox,
    hasTouch: device.mobile && !isFirefox,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },

  projects: [
    {
      name: `${partnerCode}-${appKind}`,
      use: isFirefox ? { browserName: 'firefox' } : browser === 'msedge' ? { browserName: 'chromium', channel: 'msedge' } : { browserName: 'chromium' },
    },
  ],
});
