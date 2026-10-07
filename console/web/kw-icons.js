/**
 * Icon cho từng keyword — hình theo HÀNH ĐỘNG (bấm, gõ, kiểm tra, chờ…), màu theo nhóm để nhìn lướt danh sách là phân
 * biệt được thao tác / kiểm tra / chờ. Luật khớp theo id keyword nên keyword mới thêm vào catalog tự có icon hợp lý.
 */

const GLYPHS = {
  app: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>',
  newTab: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M12 12v5M9.5 14.5h5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  closeWindow: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
  switchWindow: '<rect x="7" y="3" width="14" height="12" rx="2"/><path d="M17 19H5a2 2 0 0 1-2-2V7"/>',
  retrieve: '<path d="M12 3v11M7.5 9.5L12 14l4.5-4.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  click: '<path d="M5 3l6.5 16 2.3-6.7L20.5 10z"/>',
  doubleClick: '<path d="M5 6l5.5 13.5 2-5.8 5.8-2z"/><path d="M15 3.5l1-1.5M18.5 6l1.8-.8M17.5 2.8l.3 1.7"/>',
  rightClick: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6.5M6 9.5h12"/><path d="M12.6 3.6A5.6 5.6 0 0 1 17.4 9h-4.8z" class="kw-glyph-fill"/>',
  hover: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 10V4.5a1.5 1.5 0 0 1 3 0V10M15 10.5V6.5a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.6a6 6 0 0 1-5.1-2.9L3.2 14a1.5 1.5 0 0 1 2.5-1.6L9 15"/>',
  drag: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  scroll: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4M9.5 16.5 12 19l2.5-2.5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  eraser: '<path d="M8 20h12M5.5 13.5l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5z"/><path d="M9 10l5 5"/>',
  submit: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  listCheck: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.3 1.3L7.2 5M3.5 12l1.3 1.3L7.2 11"/>',
  listX: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l3 3M7 5 4 8M4 11l3 3M7 11l-3 3"/>',
  count: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  alert: '<path d="M4 5h16v11H9.5L4 20z"/><path d="M12 8v3.5M12 13.5h.01"/>',
  frame: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7.5" y="7.5" width="9" height="9" rx="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  checkNot: '<circle cx="12" cy="12" r="9"/><path d="M5.8 18.2 18.2 5.8"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  variable: '<path d="M8 4c-3 0-3 3-3 5.5S4 12 3 12c1 0 2 .5 2 2.5S5 20 8 20M16 4c3 0 3 3 3 5.5s1 2.5 2 2.5c-1 0-2 .5-2 2.5s0 5.5-3 5.5"/><path d="M10 10l4 4M14 10l-4 4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  comment: '<path d="M4 5h16v11H9.5L4 20z"/><path d="M8 9.5h8M8 12.5h5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  logout: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M15 16.5 19.5 12 15 7.5M19.5 12H9"/>',
  hash: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
};

// Thứ tự quan trọng: luật cụ thể đứng trước luật chung (verifyAlert… phải ra icon alert trước khi rơi vào verify).
const RULES = [
  [/^openBrowser$/, 'browser'],
  [/^(deleteAllCookies|clearBrowserSession)$/, 'logout'],
  [/^uploadFile$/, 'upload'],
  [/^clickAndDownload$/, 'download'],
  [/^generateUniqueCode$/, 'hash'],
  [/^getDate$/, 'calendar'],
  [/^openNewTab$/, 'newTab'],
  [/^navigateToUrl$/, 'link'],
  [/^refresh$/, 'refresh'],
  [/^back$/, 'back'],
  [/^forward$/, 'forward'],
  [/^closeCurrentWindow$/, 'closeWindow'],
  [/^switchToWindow/, 'switchWindow'],
  [/^(switchToFrame|switchToDefaultContent)/, 'frame'],
  [/Alert/, 'alert'],
  [/^getNumberOf/, 'count'],
  [/^(get|waitText$)/, (id) => (id === 'waitText' ? 'hourglass' : 'retrieve')],
  [/^doubleClick$/, 'doubleClick'],
  [/^rightClick$/, 'rightClick'],
  [/^clickWithJavascript$/, 'code'],
  [/^click/, 'click'],
  [/^mouseOver$/, 'hover'],
  [/^dragAndDrop/, 'drag'],
  [/^scroll/, 'scroll'],
  [/^send/, 'keyboard'],
  [/^clearText$/, 'eraser'],
  [/^submit$/, 'submit'],
  [/^pickAnyDate$/, 'calendar'],
  [/^set(Css)?Attribute$/, 'pencil'],
  [/^deselect/, 'listX'],
  [/^select/, 'listCheck'],
  [/^executeJavascript$/, 'code'],
  [/^setVariable$/, 'variable'],
  [/^delay$/, 'clock'],
  [/^waitFor/, 'hourglass'],
  [/^verify.*(Not|Absent|Different|Deselected)/, 'checkNot'],
  [/^verify/, 'check'],
  [/^screenshot$/, 'camera'],
  [/^comment$/, 'comment'],
];

// Màu theo loại việc: điều hướng · thao tác · lấy dữ liệu · kiểm tra · chờ/hộp thoại · tiện ích.
function toneOf(kw) {
  if (/^verify/.test(kw.id) && !/Alert/.test(kw.id)) return 'verify';
  if (/^(waitFor|waitText|delay)/.test(kw.id) || kw.group === 'alert') return 'wait';
  if (kw.group === 'get' || /^get/.test(kw.id)) return 'get';
  if (['browser', 'window', 'frame'].includes(kw.group)) return 'nav';
  if (kw.group === 'other') return 'core';
  return 'act';
}

export function keywordGlyph(id) {
  for (const [re, glyph] of RULES) {
    if (re.test(id)) return typeof glyph === 'function' ? glyph(id) : glyph;
  }
  return 'click';
}

/** `<span class="kw-icon kw-tone-…">` chứa SVG — dùng ở ô chọn keyword, bảng step và màn tra cứu Keyword. */
export function keywordIcon(kw, { size = '' } = {}) {
  if (!kw) return '';
  return `<span class="kw-icon kw-tone-${toneOf(kw)}${size ? ` kw-icon-${size}` : ''}" aria-hidden="true"><svg viewBox="0 0 24 24">${GLYPHS[keywordGlyph(kw.id)]}</svg></span>`;
}
