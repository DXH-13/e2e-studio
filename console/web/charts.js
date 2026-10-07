/**
 * Hai biểu đồ theo thời gian cho trang Tổng quan — SVG dựng tay, không thư viện.
 *
 * Bảng màu lấy từ bộ palette đã kiểm bằng máy (không phải chọn bằng mắt):
 * kiểm lightness band, chroma floor, tách màu cho người mù màu, và tương phản
 * với nền — đạt ở CẢ chế độ sáng lẫn tối. Đổi màu thì chạy lại `npm run check:contrast`.
 *
 * Mỗi biểu đồ chỉ MỘT chuỗi số liệu nên không cần chú giải: tiêu đề đã nói nó là gì.
 * Hai đại lượng khác thang (số lỗi ≠ số lần chạy) nằm ở hai biểu đồ riêng, không
 * bao giờ ghép hai trục vào một khung.
 */

const NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** `2026-08-28` -> `28/8` — nhãn trục ngang gọn, đọc kiểu Việt. */
function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Bậc chia trục dọc dễ đọc: 1, 2, 5, 10, 20, 50…
 *
 * Tối thiểu là 1 vì mọi số ở đây đều là phép ĐẾM — trục chia 0,5 lỗi thì vô nghĩa.
 */
function niceStep(max, targetTicks = 4) {
  if (max <= 0) return 1;
  const raw = max / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return Math.max(1, Math.round(step));
}

/**
 * Vẽ một biểu đồ theo ngày.
 *
 * @param {HTMLElement} host   thẻ bọc; hàm tự dựng lại toàn bộ nội dung bên trong
 * @param {Array} data         [{ date, <valueKey> }] đã sắp theo thời gian tăng dần
 * @param {object} opts        { kind: 'line'|'bar', valueKey, presenceKey, label, unit }
 *
 * `presenceKey` phân biệt **ngày không chạy test** với **ngày chạy mà không có lỗi**.
 * Hai chuyện đó khác hẳn nhau: vẽ ngày chưa chạy thành điểm 0 là nói dối người đọc
 * rằng hôm đó đã kiểm và sạch lỗi. Ngày không có dữ liệu thì để trống, và đường
 * nối bị cắt tại đó thay vì kéo thẳng qua.
 */
export function drawTimeChart(host, data, opts) {
  const { kind = 'line', valueKey, presenceKey, label, unit = '' } = opts;
  host.innerHTML = '';

  const has = (d) => (presenceKey ? Number(d[presenceKey]) > 0 : true);
  const values = data.filter(has).map((d) => Number(d[valueKey]) || 0);
  const maxValue = Math.max(...values, 0);

  if (!values.length) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'No data in this range.';
    host.append(empty);
    return;
  }

  // Toạ độ trong hệ viewBox; SVG co giãn theo bề ngang thẻ bọc.
  const W = 720;
  const H = 200;
  const PAD = { top: 14, right: 16, bottom: 26, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const step = niceStep(maxValue);
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const y = (v) => PAD.top + plotH - (v / yMax) * plotH;
  const slot = plotW / data.length;
  const xCenter = (i) => PAD.left + slot * (i + 0.5);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart-svg',
    role: 'img',
    'aria-label': `${label} by day`,
    preserveAspectRatio: 'none',
  });

  // ── Lưới + nhãn trục dọc: nhạt, lùi ra sau dữ liệu ──────────────────────
  for (let v = 0; v <= yMax; v += step) {
    svg.append(
      el('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: 'chart-gridline' }),
    );
    const t = el('text', { x: PAD.left - 7, y: y(v) + 3.5, class: 'chart-tick', 'text-anchor': 'end' });
    t.textContent = String(v);
    svg.append(t);
  }

  // ── Nhãn trục ngang: thưa dần khi nhiều ngày, để chữ không chồng nhau ───
  const labelEvery = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== data.length - 1) return;
    const t = el('text', { x: xCenter(i), y: H - 8, class: 'chart-tick', 'text-anchor': 'middle' });
    t.textContent = shortDate(d.date);
    svg.append(t);
  });

  if (kind === 'bar') {
    // Khe giữa các cột để hai cột cạnh nhau không dính thành một khối.
    const barW = Math.max(3, Math.min(28, slot - 6));
    data.forEach((d, i) => {
      if (!has(d)) return;
      const v = Number(d[valueKey]) || 0;
      if (v === 0) return;
      svg.append(
        el('rect', {
          x: xCenter(i) - barW / 2,
          y: y(v),
          width: barW,
          height: Math.max(2, PAD.top + plotH - y(v)),
          rx: 4,
          class: 'chart-bar',
          'data-i': i,
        }),
      );
    });
  } else {
    // Cắt thành từng đoạn liên tục; khoảng trống giữa hai đoạn = những ngày không chạy.
    const segments = [];
    let current = [];
    data.forEach((d, i) => {
      if (!has(d)) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push(`${xCenter(i)},${y(Number(d[valueKey]) || 0)}`);
    });
    if (current.length) segments.push(current);

    for (const seg of segments) {
      if (seg.length > 1) svg.append(el('polyline', { points: seg.join(' '), class: 'chart-line' }));
    }
    data.forEach((d, i) => {
      if (!has(d)) return;
      svg.append(
        el('circle', { cx: xCenter(i), cy: y(Number(d[valueKey]) || 0), r: 4, class: 'chart-dot', 'data-i': i }),
      );
    });
  }

  // ── Lớp bắt chuột: một dải phủ kín mỗi ngày, rộng hơn hẳn cái chấm ──────
  const hover = el('g', { class: 'chart-hit' });
  data.forEach((d, i) => {
    hover.append(
      el('rect', { x: PAD.left + slot * i, y: PAD.top, width: slot, height: plotH, 'data-i': i }),
    );
  });
  svg.append(hover);

  const cursor = el('line', { class: 'chart-cursor', y1: PAD.top, y2: PAD.top + plotH, x1: 0, x2: 0 });
  cursor.style.opacity = '0';
  svg.append(cursor);

  host.append(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.append(tip);

  const show = (i) => {
    const d = data[i];
    const v = Number(d[valueKey]) || 0;
    tip.innerHTML = has(d)
      ? `<strong>${shortDate(d.date)}</strong><span>${v}${unit ? ` ${unit}` : ''}</span>`
      : `<strong>${shortDate(d.date)}</strong><span>no test run</span>`;
    tip.hidden = false;
    // Đặt theo tỉ lệ vì SVG co giãn — không dùng toạ độ pixel của viewBox.
    tip.style.left = `${((xCenter(i) / W) * 100).toFixed(2)}%`;
    cursor.setAttribute('x1', xCenter(i));
    cursor.setAttribute('x2', xCenter(i));
    cursor.style.opacity = '1';
    host.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
    host.querySelector(`[data-i="${i}"]:not(rect[y="${PAD.top}"])`)?.classList.add('is-active');
  };

  hover.addEventListener('mousemove', (event) => {
    const i = Number(event.target.dataset.i);
    if (!Number.isNaN(i)) show(i);
  });
  host.addEventListener('mouseleave', () => {
    tip.hidden = true;
    cursor.style.opacity = '0';
    host.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
  });
}

/**
 * Bảng số liệu tương đương biểu đồ.
 *
 * Không phải phần thừa: người dùng trình đọc màn hình, người in ra giấy, và người
 * cần con số chính xác đều đọc bảng chứ không đọc hình.
 */
export function chartTable(data, columns) {
  const rows = data
    .filter((d) => columns.some((c) => Number(d[c.key]) > 0))
    .map(
      (d) =>
        `<tr><td>${shortDate(d.date)}</td>${columns.map((c) => `<td class="num">${d[c.key] ?? 0}</td>`).join('')}</tr>`,
    )
    .join('');

  return `
    <details class="chart-data">
      <summary>View data as table</summary>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>${rows || '<tr><td colspan="9" class="muted">No days with test runs yet.</td></tr>'}</tbody>
        </table>
      </div>
    </details>`;
}
