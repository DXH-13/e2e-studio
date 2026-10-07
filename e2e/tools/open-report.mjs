/**
 * Mở trang báo cáo E2E bằng trình duyệt mặc định của máy.
 *
 *   node tools/open-report.mjs
 *
 * Báo cáo là file tĩnh trên đĩa (`reports/bao-cao-e2e.html`) — không cần server,
 * không gửi gì ra ngoài.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.resolve(__dirname, '..', 'reports');

/**
 * Báo cáo mới nhất trên đĩa.
 *
 * Mỗi lần chạy nay có thư mục riêng `reports/<runKey>/<runId>` nên không còn một file
 * cố định để mở — dò xuống tối đa hai tầng rồi lấy cái sửa gần đây nhất.
 */
function newestReport() {
  const found = [];
  const scan = (dir, depth) => {
    if (depth > 2 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full, depth + 1);
      else if (entry.name === 'bao-cao-e2e.html') found.push({ full, at: fs.statSync(full).mtimeMs });
    }
  };
  scan(REPORTS, 0);
  return found.sort((a, b) => b.at - a.at)[0]?.full ?? null;
}

const REPORT = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.E2E_REPORT_DIR
    ? path.resolve(__dirname, '..', process.env.E2E_REPORT_DIR, 'bao-cao-e2e.html')
    : newestReport();

if (!REPORT || !fs.existsSync(REPORT)) {
  console.error(`Chưa có báo cáo nào trong ${REPORTS} — chạy npm test trước.`);
  process.exit(1);
}

const [cmd, args] =
  process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', REPORT]]
    : process.platform === 'darwin'
      ? ['open', [REPORT]]
      : ['xdg-open', [REPORT]];

const child = spawn(cmd, args, { stdio: 'ignore', detached: true });

child.on('error', () => {
  console.log(`Không mở được trình duyệt. Mở tay: ${pathToFileURL(REPORT).href}`);
});

child.unref();
console.log(`Đang mở ${pathToFileURL(REPORT).href}`);
