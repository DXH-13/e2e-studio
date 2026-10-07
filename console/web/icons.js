/**
 * Icon loại file dùng chung cho cây, bảng, tab và wizard: hình tờ giấy gập góc, mỗi loại một màu và một hình nhỏ bên trong
 * (test case = checklist, test object = tâm ngắm, test data = bảng, test suite = các tầng xếp chồng). Thư mục là folder vàng.
 */
const TITLE = {
  case: 'Test case',
  object: 'Test object',
  data: 'Test data',
  suite: 'Test suite',
  folder: 'Folder',
  globals: 'Global variables',
  results: 'Test results',
  keyword: 'Keywords',
  schedule: 'Schedules',
};

const PAGE = '<path class="fi-page" d="M6.2 2.5h8.3L19 7v13.3a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 20.3V3.7a1.2 1.2 0 0 1 1.2-1.2z"/><path class="fi-fold" d="M14.5 2.5V6a1 1 0 0 0 1 1H19"/>';

const GLYPH = {
  case: '<path class="fi-glyph" d="M8 12.2l1.5 1.5 2.7-2.9M8 17.2h8M13.8 12.6H16"/>',
  object: '<circle class="fi-glyph" cx="12" cy="14.5" r="3.2"/><path class="fi-glyph" d="M12 9.6v1.6M12 17.8v1.6M7.1 14.5h1.6M15.3 14.5h1.6"/>',
  data: '<path class="fi-glyph" d="M7.8 10.8h8.4v7.6H7.8zM7.8 13.3h8.4M7.8 15.9h8.4M11 10.8v7.6"/>',
  suite: '<path class="fi-glyph" d="M12 10.2l4.6 2.2-4.6 2.2-4.6-2.2zM7.4 15l4.6 2.2 4.6-2.2"/>',
  // Ba loại dưới chỉ dùng làm icon tiêu đề trang (không phải loại file trong cây).
  globals: '<circle class="fi-glyph" cx="12" cy="14.5" r="3.6"/><path class="fi-glyph" d="M8.4 14.5h7.2M12 10.9c1 1 1.4 2.2 1.4 3.6s-.4 2.6-1.4 3.6c-1-1-1.4-2.2-1.4-3.6s.4-2.6 1.4-3.6z"/>',
  results: '<path class="fi-glyph" d="M8 11h8v7.4H8z"/><path class="fi-glyph" d="M9.9 14.8l1.4 1.4 2.8-2.9"/>',
  schedule: '<circle class="fi-glyph" cx="12" cy="14.5" r="3.8"/><path class="fi-glyph" d="M12 12.4v2.1l1.5.9"/>',
  keyword: '<path class="fi-glyph" d="M10 11c-1 0-1.5.5-1.5 1.4v.8c0 .6-.4 1-1 1 .6 0 1 .4 1 1v.8c0 .9.5 1.4 1.5 1.4M14 11c1 0 1.5.5 1.5 1.4v.8c0 .6.4 1 1 1-.6 0-1 .4-1 1v.8c0 .9-.5 1.4-1.5 1.4"/>',
};

const FOLDER =
  '<path class="fi-folder" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>';

export function fileIcon(kind) {
  const body = kind === 'folder' ? FOLDER : `${PAGE}${GLYPH[kind] ?? ''}`;
  return `<span class="file-icon file-icon-${kind}" title="${TITLE[kind] ?? ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg></span>`;
}
