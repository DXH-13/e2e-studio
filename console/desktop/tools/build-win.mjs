/**
 * Đóng gói bản Windows chạy độc lập (portable, không cần cài Node/Playwright trên máy đích):
 *
 *   node tools/build-win.mjs [--out <thư mục>] [--no-zip | --zip-only]
 *
 * Kết quả: <out>/E2EStudio-win32-x64/ (giải nén là chạy E2EStudio.exe) + E2EStudio-win32-x64.zip.
 * Bên trong resources/: app (vỏ Electron) · console (server + web) · e2e (bộ test, kèm node_modules,
 * không kèm reports) · ms-playwright (browser đúng revision của Playwright đang dùng).
 * Mặc định xuất ra %LOCALAPPDATA%\E2EStudioBuild để không đẩy ~1GB lên OneDrive.
 */
import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONSOLE = resolve(DESKTOP, '..');
const E2E = resolve(CONSOLE, '..', 'e2e');
const args = process.argv.slice(2);
const OUT = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : resolve(process.env.LOCALAPPDATA ?? DESKTOP, 'E2EStudioBuild'));
const STAGE = resolve(OUT, 'stage');
const BROWSERS_SRC = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const version = require(resolve(DESKTOP, 'package.json')).version;

const step = (msg) => console.log(`\n▸ ${msg}`);
const rel = (root, p) => p.slice(root.length + 1).split(sep).join('/');

function zipApp(appDir) {
  step('zip');
  const zip = `${appDir}.zip`;
  rmSync(zip, { force: true });
  // Không dùng tar.exe: với gói ~1GB nó tạo zip hỏng (Explorer báo rỗng, tar -t đọc được một phần).
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${appDir}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force`],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`  ${zip}  (${(statSync(zip).size / 1024 / 1024).toFixed(0)} MB)`);
}

if (args.includes('--zip-only')) {
  zipApp(resolve(OUT, 'E2EStudio-win32-x64'));
  process.exit(0);
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

step('console (server + web)');
cpSync(CONSOLE, resolve(STAGE, 'console'), {
  recursive: true,
  filter: (src) => {
    const r = rel(CONSOLE, src);
    return !/^(data|desktop|node_modules|tools)(\/|$)/.test(r);
  },
});

step('e2e (bỏ reports, test-results)');
cpSync(E2E, resolve(STAGE, 'e2e'), {
  recursive: true,
  filter: (src) => {
    const r = rel(E2E, src);
    return !/^(reports|test-results|\.git|node_modules\/\.cache)(\/|$)/.test(r) && !r.endsWith('.log');
  },
});
mkdirSync(resolve(STAGE, 'e2e/reports'), { recursive: true });

step('browsers Playwright');
const { browsers } = JSON.parse(readFileSync(resolve(E2E, 'node_modules/playwright-core/browsers.json'), 'utf8'));
let copied = 0;
for (const b of browsers) {
  if (!b.installByDefault && b.name !== 'winldd') continue;
  const dir = `${b.name.replace(/-/g, '_')}-${b.revision}`;
  const src = resolve(BROWSERS_SRC, dir);
  if (!existsSync(src)) continue;
  cpSync(src, resolve(STAGE, 'ms-playwright', dir), { recursive: true });
  console.log(`  ${dir}`);
  copied += 1;
}
if (!copied) {
  console.error(`Không thấy browser nào ở ${BROWSERS_SRC} — chạy "npx playwright install chromium" trong e2e trước.`);
  process.exit(1);
}

step('electron packager');
const [appDir] = await packager({
  dir: DESKTOP,
  out: OUT,
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: false,
  prune: true,
  name: 'E2EStudio',
  executableName: 'E2EStudio',
  appVersion: version,
  icon: resolve(DESKTOP, 'assets/icon.ico'),
  ignore: [/^\/(build|tools|node_modules)(\/|$)/, /^\/\.gitignore$/],
  extraResource: ['console', 'e2e', 'ms-playwright'].map((d) => resolve(STAGE, d)),
  win32metadata: { CompanyName: 'E2E Studio', ProductName: 'E2E Studio', FileDescription: 'E2E Studio' },
});
rmSync(STAGE, { recursive: true, force: true });

if (!args.includes('--no-zip')) zipApp(appDir);

console.log(`\nDone: ${appDir}\n`);
