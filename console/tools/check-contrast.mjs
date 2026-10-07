/**
 * Kiểm tương phản bảng màu của console — chạy: `npm run check:contrast`.
 *
 * Ghi chú đầu `web/styles.css` yêu cầu "đổi màu thì kiểm lại, đừng chọn bằng mắt";
 * đây là cái để chạy lại. Nó ĐỌC THẲNG token từ `styles.css` (các dòng
 * `--ten: light-dark(sáng, tối);`) nên không có chuyện bảng màu đổi mà bản kiểm
 * vẫn còn số cũ.
 *
 * Ngưỡng WCAG 2.1: chữ thường 4.5:1, thành phần đồ hoạ mang nghĩa 3:1. Viền là
 * trang trí — không mang nghĩa, không truyền đạt thông tin nào — nên chỉ cần
 * nhìn ra, để ở 1.35 cho khỏi tụt về vô hình.
 *
 * KHÔNG kiểm ở đây: hai màu chuỗi số liệu của biểu đồ có tách nhau không. Chúng
 * nằm ở HAI khung riêng và tách nhau bằng SẮC chứ không bằng độ sáng, nên đo tỉ
 * số tương phản giữa chúng là đo sai thứ.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'styles.css');

/** `--bg: light-dark(#f7f7f8, #0b0b0d);` -> { bg: ['#f7f7f8', '#0b0b0d'] } */
function readTokens(css) {
  const out = {};
  const re = /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
  for (const [, name, light, dark] of css.matchAll(re)) out[name] = [light, dark];
  return out;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [nhãn, token chữ, token nền, ngưỡng] — đúng những cặp thật sự chồng lên nhau trên màn hình. */
const PAIRS = [
  ['chữ thường trên nền trang', 'text', 'bg', 4.5],
  ['chữ thường trên thẻ', 'text', 'surface', 4.5],
  ['chữ mờ trên thẻ', 'text-dim', 'surface', 4.5],
  ['chữ rất mờ trên thẻ', 'text-faint', 'surface', 4.5],
  ['chữ rất mờ trên nền trang', 'text-faint', 'bg', 4.5],
  ['chữ trên nút chính', 'accent-on', 'accent', 4.5],
  ['menu đang chọn', 'accent-ink', 'accent-soft', 4.5],
  ['chip đạt', 'ok', 'ok-soft', 4.5],
  ['chip lỗi', 'fail', 'fail-soft', 4.5],
  ['chip cảnh báo', 'warn', 'warn-soft', 4.5],
  ['chip đang chạy', 'info', 'info-soft', 4.5],
  ['chip mờ', 'text-faint', 'surface-2', 4.5],
  ['số "đạt" trên thẻ', 'ok', 'surface', 4.5],
  ['số "lỗi" trên thẻ', 'fail', 'surface', 4.5],
  ['vệt menu đang chọn', 'accent', 'surface', 3.0],
  ['đường biểu đồ (lỗi)', 'series-bug', 'surface', 3.0],
  ['cột biểu đồ (lần chạy)', 'series-run', 'surface', 3.0],
  ['lưới biểu đồ trên thẻ', 'chart-grid', 'surface', 1.1],
  ['viền thẻ (chỉ cần nhìn ra)', 'border', 'surface', 1.15],
  ['viền mạnh (chỉ cần nhìn ra)', 'border-strong', 'surface', 1.35],
];

const tokens = readTokens(readFileSync(CSS, 'utf8'));
let failed = 0;
let missing = 0;

for (const [modeName, idx] of [
  ['SÁNG', 0],
  ['TỐI', 1],
]) {
  console.log(`\n── ${modeName} ──`);
  for (const [label, fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`THIẾU token: ${!tokens[fg] ? `--${fg}` : `--${bg}`}  (${label})`);
      missing++;
      continue;
    }
    const ratio = contrast(tokens[fg][idx], tokens[bg][idx]);
    const ok = ratio >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? 'đạt ' : 'HỎNG'} ${ratio.toFixed(2).padStart(5)} (cần ${min})  ${label}` +
        `  [${tokens[fg][idx]} trên ${tokens[bg][idx]}]`,
    );
  }
}

if (missing) console.log(`\n${missing} cặp không kiểm được vì thiếu token — tên token đã đổi?`);
console.log(failed ? `\n${failed} cặp KHÔNG đạt ngưỡng.` : '\nTất cả đạt ngưỡng.');
process.exit(failed || missing ? 1 : 0);
