/**
 * `npm install` của package electron thỉnh thoảng giải nén hỏng im lặng trên thư mục OneDrive
 * (dist/ chỉ còn thư mục locales rỗng). Script này chạy sau install: thiếu electron.exe thì tải
 * (nếu chưa có trong cache) rồi tự giải nén lại bằng `tar` có sẵn của Windows 10+/macOS/Linux.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = resolve(ROOT, 'node_modules/electron');
const DIST = resolve(PKG, 'dist');
const exe = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';

if (existsSync(resolve(DIST, exe))) {
  console.log(`electron ok: ${resolve(DIST, exe)}`);
  process.exit(0);
}

const { version } = require(resolve(PKG, 'package.json'));
const arch = process.arch;
const zipName = `electron-v${version}-${process.platform}-${arch}.zip`;
const cacheRoot =
  process.env.ELECTRON_CACHE ??
  (process.platform === 'win32'
    ? resolve(process.env.LOCALAPPDATA, 'electron/Cache')
    : process.platform === 'darwin'
      ? resolve(process.env.HOME, 'Library/Caches/electron')
      : resolve(process.env.HOME, '.cache/electron'));

const findZip = () => {
  if (!existsSync(cacheRoot)) return null;
  for (const dir of readdirSync(cacheRoot)) {
    const p = resolve(cacheRoot, dir, zipName);
    if (existsSync(p)) return p;
  }
  return null;
};

let zip = findZip();
if (!zip) {
  console.log(`downloading ${zipName} …`);
  spawnSync(process.execPath, [resolve(PKG, 'install.js')], { stdio: 'inherit' });
  zip = findZip();
}
if (!zip) {
  console.error(`cannot find ${zipName} under ${cacheRoot}`);
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
// tar của Windows (bsdtar) mở được zip; tar của Git Bash hiểu "C:" là máy remote.
const tar = process.platform === 'win32' ? resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32/tar.exe') : 'tar';
const r = spawnSync(tar, ['-xf', zip, '-C', DIST], { stdio: 'inherit' });
if (r.status !== 0 || !existsSync(resolve(DIST, exe))) {
  console.error(`extracting ${zip} failed`);
  process.exit(1);
}
writeFileSync(resolve(PKG, 'path.txt'), exe);
console.log(`electron ${version} extracted from ${zip}`);
