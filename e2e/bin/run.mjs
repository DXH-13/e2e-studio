#!/usr/bin/env node
/**
 * Cửa vào duy nhất để chạy test.
 *
 *   npm test -- --partner demo
 *   npm test -- --partner demo --headed --grep "Search"
 *   npm test -- --list
 *
 * Việc của file này: kiểm tra tổ hợp project/bộ/môi trường có hợp lệ không,
 * nạp `config/env/<env>.env` vào process, rồi gọi Playwright. Mọi cấu hình
 * thật nằm ở `playwright.config.ts` — file này không tự quyết gì thêm.
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const { partners: PARTNERS } = readJson('config/partners.json');
const { environments: ENVIRONMENTS } = readJson('config/environments.json');
const { devices: DEVICES, defaults: DEVICE_DEFAULTS } = readJson('config/devices.json');

function parseArgs(argv) {
  const out = { passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--force') out.force = true;
    else if (a === '--headed') out.headed = true;
    else if (a === '--device' || a === '-d') out.device = argv[++i];
    else if (a === '--suite') out.suite = argv[++i];
    else if (a === '--browser') out.browser = argv[++i];
    else if (a === '--folder') out.folder = argv[++i] ?? '';
    else if (a === '--ui') out.passthrough.push('--ui');
    else if (a === '--debug') out.passthrough.push('--debug');
    else if (a === '--partner' || a === '-p') out.partner = argv[++i];
    else if (a === '--app' || a === '-a') out.app = argv[++i];
    else if (a === '--env' || a === '-e') out.env = argv[++i];
    else if (a === '--grep' || a === '-g') out.passthrough.push('--grep', argv[++i]);
    else out.passthrough.push(a);
  }
  return out;
}

function printList() {
  console.log('\nPROJECT / SUITE\n');
  for (const p of PARTNERS) {
    console.log(`  ${p.code.padEnd(8)} ${p.name}`);
    for (const s of p.suites) {
      const flags = [
        s.ready ? 'ready' : 'EMPTY SKELETON',
        s.mocked ? 'mocked' : 'real backend',
        s.writes ? 'writes data' : 'read-only',
      ].join(' · ');
      console.log(`      --app ${s.app.padEnd(13)} ${s.label.padEnd(30)} [${flags}]`);
    }
    console.log('');
  }
  console.log('SCREEN SIZES  (--device)\n');
  let group = null;
  for (const d of DEVICES) {
    if (d.group !== group) {
      group = d.group;
      console.log(`  ${group}`);
    }
    const def = Object.entries(DEVICE_DEFAULTS)
      .filter(([, code]) => code === d.code)
      .map(([app]) => `default for ${app}`)
      .join(", ");
    console.log(`      ${d.code.padEnd(16)} ${d.name.padEnd(22)} ${`${d.width}x${d.height}`.padEnd(10)} ${def}`);
  }
  console.log('');
  console.log('ENVIRONMENTS\n');
  for (const e of ENVIRONMENTS) {
    const file = `config/env/${e.code}.env`;
    const has = existsSync(resolve(ROOT, file)) ? '' : '  (missing config file)';
    console.log(`  --env ${e.code.padEnd(6)} ${e.name.padEnd(12)} ${e.readOnly ? '[READ-ONLY]' : '           '} ${e.description}${has}`);
  }
  console.log('');
}

function loadEnvFile(code) {
  const path = resolve(ROOT, 'config/env', `${code}.env`);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function fail(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  console.error('  Run `npm test -- --list` to see the valid combinations.\n');
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  printList();
  process.exit(0);
}

const partnerCode = args.partner ?? process.env.E2E_PARTNER ?? PARTNERS[0]?.code;
const appKind = args.app ?? process.env.E2E_APP ?? 'keyword';
const envCode = args.env ?? process.env.E2E_ENV ?? 'local';

const partner = PARTNERS.find((p) => p.code === partnerCode);
if (!partner) fail(`No project "${partnerCode}". Available: ${PARTNERS.map((p) => p.code).join(', ')}`);

const suite = partner.suites.find((s) => s.app === appKind);
if (!suite) fail(`Project "${partnerCode}" has no suite "${appKind}". Available: ${partner.suites.map((s) => s.app).join(', ')}`);

const environment = ENVIRONMENTS.find((e) => e.code === envCode);
if (!environment) fail(`No environment "${envCode}". Available: ${ENVIRONMENTS.map((e) => e.code).join(', ')}`);

if (!suite.ready) {
  fail(`Suite "${partnerCode}/${appKind}" has no specs yet (empty skeleton).`);
}

if (environment.readOnly && suite.writes && !args.force) {
  fail(
    `Environment "${envCode}" is read-only, but suite "${partnerCode}/${appKind}" creates/modifies data.\n` +
      '    If you really need to run it: add --force',
  );
}

if (args.device) {
  if (!DEVICES.some((d) => d.code === args.device)) {
    fail(`No screen size "${args.device}". Available: ${DEVICES.map((d) => d.code).join(", ")}`);
  }
  if (suite.kind !== 'browser') {
    fail(`Suite "${partnerCode}/${appKind}" does not open a browser, so --device has no effect.`);
  }
}

if (args.headed && suite.kind !== 'browser') {
  fail(`Suite "${partnerCode}/${appKind}" only makes HTTP calls; there is no browser to open.`);
}

const fileEnv = loadEnvFile(envCode);
// Biến đã có sẵn ngoài shell thắng file — để ghi đè tạm thời không phải sửa file.
const childEnv = { ...fileEnv, ...process.env };

// Kiểm URL trước khi khởi động Playwright, để lỗi hiện ở đây cho dễ đọc. Bộ keyword thì không bắt buộc: mỗi test case
// tự mở trang bằng Open Browser (URL đầy đủ); có URL gốc thì chỉ để đường dẫn tương đối chạy được.
const baseUrlOptional = appKind === 'keyword';
if (!childEnv[suite.baseUrlKey] && !baseUrlOptional) {
  fail(
    `Missing ${suite.baseUrlKey}.\n` +
      `    Add it in Global variables of the project on the console (or config/env/${envCode}.env).`,
  );
}

childEnv.E2E_PARTNER = partnerCode;
childEnv.E2E_APP = appKind;
childEnv.E2E_ENV = envCode;
if (args.force) childEnv.E2E_FORCE = '1';
if (args.device) childEnv.E2E_DEVICE = args.device;
if (args.suite) childEnv.E2E_SUITE = args.suite;
if (args.folder !== undefined) childEnv.E2E_FOLDER = args.folder;
if (args.browser) {
  if (!['chromium', 'msedge', 'firefox'].includes(args.browser)) fail(`No browser "${args.browser}". Available: chromium, msedge, firefox`);
  childEnv.E2E_BROWSER = args.browser;
}
if (args.headed) childEnv.E2E_HEADED = '1';

/** Nhãn khổ màn hình đang dùng, kể cả khi người dùng không truyền --device. */
function deviceLabel() {
  // Cùng luật với defaultDeviceCode (config/registry.ts).
  const fallback = DEVICE_DEFAULTS[appKind] ?? DEVICE_DEFAULTS.keyword;
  const code = args.device || fallback;
  const d = DEVICES.find((x) => x.code === code);
  const label = d ? `${d.name} ${d.width}x${d.height}` : code;
  if (args.device) return label;
  // Bộ keyword: mỗi bài chạy đúng khổ lúc ghi (tc.viewport); khổ mặc định chỉ cho bài chưa có thông tin đó.
  return appKind === 'keyword' ? `as recorded per test case (fallback ${label})` : `${label} (default)`;
}

const banner = [
  '',
  `  ▸ ${partner.name} · ${suite.label}`,
  ...(baseUrlOptional ? [] : [`    environment ${environment.name}${environment.readOnly ? ' (read-only)' : ''}`]),
  `    url         ${childEnv[suite.baseUrlKey] || '(none — each test case opens its own page)'}`,
  `    backend     ${suite.mocked ? 'MOCKED (fixtures) — real BE untouched' : 'REAL'}`,
  ...(suite.kind === 'browser'
    ? [`    screen      ${deviceLabel()}`, `    display     ${args.headed ? "HEADED (1 worker)" : "headless"}`]
    : []),
  '',
].join('\n');
console.log(banner);

// Gọi thẳng CLI của Playwright bằng Node, KHÔNG qua npx:
//   - npx trên Windows là `npx.cmd`, mà Node từ bản vá bảo mật 2024 không cho
//     spawn file .cmd nếu không bật shell (lỗi EINVAL);
//   - bật shell thì tham số bị nối thành chuỗi, nên `--grep "Log in"` tách sai.
// Gọi thẳng cli.js né được cả hai, lại nhanh hơn vì bỏ một tầng tiến trình.
const playwrightCli = resolve(ROOT, 'node_modules/@playwright/test/cli.js');
if (!existsSync(playwrightCli)) {
  fail('Playwright is not installed. Run `npm install` in e2e/ first.');
}

const child = spawn(process.execPath, [playwrightCli, 'test', ...(args.headed ? ['--headed'] : []), ...args.passthrough], {
  cwd: ROOT,
  env: childEnv,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
