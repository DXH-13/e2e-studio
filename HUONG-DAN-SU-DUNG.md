# Hướng dẫn sử dụng E2E Studio Console

> Dành cho tester không cần biết code. Tất cả thao tác đều thực hiện qua giao diện trình duyệt.

---

## Mục lục

1. [Khởi động](#1-khởi-động)
2. [Giao diện tổng quan](#2-giao-diện-tổng-quan)
3. [Quản lý Project](#3-quản-lý-project)
4. [Object Repository — Kho đối tượng](#4-object-repository--kho-đối-tượng)
5. [Tạo test case](#5-tạo-test-case)
   - [Cách 1: Ghi thao tác (Recorder)](#cách-1-ghi-thao-tác-recorder)
   - [Cách 2: Soạn thủ công bằng keyword](#cách-2-soạn-thủ-công-bằng-keyword)
6. [Danh sách Keyword](#6-danh-sách-keyword)
7. [Biến và tham số](#7-biến-và-tham-số)
8. [Chạy test case](#8-chạy-test-case)
9. [Test Suites — Bộ test](#9-test-suites--bộ-test)
10. [Test Data — Dữ liệu test](#10-test-data--dữ-liệu-test)
11. [Global Variables — Biến toàn cục](#11-global-variables--biến-toàn-cục)
12. [Schedules — Lịch chạy tự động](#12-schedules--lịch-chạy-tự-động)
13. [Test Results — Xem kết quả](#13-test-results--xem-kết-quả)
14. [Overview — Trang tổng quan](#14-overview--trang-tổng-quan)

---

## 1. Khởi động

### Yêu cầu (cài một lần duy nhất)

Trước khi dùng lần đầu, vào thư mục `e2e/` và chạy hai lệnh:

```
cd e2e
npm install
node node_modules/@playwright/test/cli.js install chromium
```

> **Lưu ý:** Phải vào đúng thư mục `e2e/`, không phải thư mục gốc của project.

### Mở console

```
cd console
npm start
```

Sau đó mở trình duyệt và vào địa chỉ: **http://localhost:5077**

---

## 2. Giao diện tổng quan

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR: 🔍 Tìm kiếm (Ctrl+P)                          │
├──────────────┬──────────────────────────────────────────┤
│              │  TAB BAR (như trình duyệt)               │
│   SIDEBAR    ├──────────────────────────────────────────┤
│              │                                          │
│  · Overview  │           NỘI DUNG TAB                   │
│  · Obj Repo  │                                          │
│  · Test cases│                                          │
│  · Test data │                                          │
│  · Test suites                                          │
│  · Test results                                         │
│  · Keywords  │                                          │
│  · Schedules │                                          │
│              │                                          │
│  [Project]   │                                          │
└──────────────┴──────────────────────────────────────────┘
```

**Sidebar** — menu điều hướng chính. Có thể thu gọn bằng nút `⟨` ở cạnh phải.

**Tab bar** — mỗi màn và mỗi test case mở trong tab riêng, như VS Code. Đóng tab bằng nút `×`. Chuột phải vào tab để có thêm tùy chọn.

**Tìm kiếm (Ctrl+P)** — tìm nhanh test case và test object theo tên từ bất kỳ màn nào.

**Drawer log** — ngăn log trượt ra từ cạnh dưới khi test đang chạy, hiển thị kết quả real-time.

---

## 3. Quản lý Project

Khi vào console lần đầu, bạn ở màn **chọn project**. Mỗi project là một ứng dụng cần test (ví dụ: "Demo", "Shop", "CRM").

### Tạo project mới
Bấm **New project** → nhập tên → **Create**.

### Mở project
Bấm vào card của project. Tất cả test case, test object, biến toàn cục đều gắn với project này.

### Chuyển project
Bấm tên project ở chân sidebar → chọn project khác hoặc bấm **All projects**.

---

## 4. Object Repository — Kho đối tượng

**Object Repository** là nơi lưu danh sách **Test Object** — các phần tử giao diện web (nút bấm, ô nhập, nhãn, dropdown...) được đặt tên có nghĩa và dùng lại trong nhiều test case.

> **Tại sao cần Test Object?** Thay vì ghi nhớ selector `#btn-submit` hay `//button[@type='submit']`, bạn chỉ cần tham chiếu đến `btn_dang_nhap`. Nếu website thay đổi selector, chỉ cần sửa một chỗ trong kho, tất cả test case tự cập nhật.

### Cấu trúc tên Test Object

Tên phải bắt đầu bằng tiền tố chỉ loại phần tử:

| Tiền tố | Loại phần tử |
|---------|-------------|
| `btn_` | Button (nút bấm) |
| `input_` | Ô nhập liệu (text, số, ngày) |
| `label_` | Nhãn văn bản |
| `link_` | Liên kết |
| `chk_` | Checkbox |
| `radio_` | Radio button |
| `select_` | Dropdown / picker |
| `item_` | Mục trong danh sách |
| `list_` | Danh sách |
| `card_` | Card |
| `img_` | Hình ảnh |
| `dialog_` | Hộp thoại / sheet |
| `tab_` | Tab |
| `table_` | Bảng |
| `frame_` | Iframe |
| `elm_` | Phần tử khác |

**Ví dụ:** `btn_dang_nhap`, `input_mat_khau`, `label_thong_bao_loi`

### Tạo Test Object thủ công

1. Vào **Object Repository** → bấm **New test object** (hoặc chuột phải vào cây sidebar → *New test object*)
2. Chọn **loại phần tử** (tiền tố tự điền)
3. Nhập **tên** (phần sau tiền tố)
4. Chọn **phương thức tìm**:
   - **CSS Selector** — ví dụ: `#login-btn`, `.submit-button`
   - **XPath** — ví dụ: `//button[@id='login']`
   - **Text** — tìm theo nội dung văn bản
   - **Placeholder** — tìm ô nhập theo placeholder
   - **Role** — tìm theo vai trò ARIA (button, textbox, link...)
   - **Test ID** — tìm theo `data-testid`
   - **Attributes** — tìm theo bất kỳ thuộc tính HTML nào
5. Nhập **giá trị selector**
6. Bấm **Save**

### Tổ chức theo thư mục

- Chuột phải vào cây sidebar → **New folder** để tạo thư mục nhóm
- Kéo-thả test object sang thư mục khác để di chuyển
- Khi đổi tên hoặc di chuyển object, console tự động cập nhật tất cả test case đang dùng nó

### Xoá Test Object

Console sẽ từ chối xoá nếu vẫn còn test case tham chiếu đến object đó, kèm danh sách các test case cần sửa trước.

---

## 5. Tạo test case

### Cách 1: Ghi thao tác (Recorder)

Recorder mở một trình duyệt thật, ghi lại mọi thao tác của bạn và tự tạo test case đầy đủ — không cần gõ bất kỳ dòng code nào.

**Các bước:**

1. Vào **Test cases**
2. Bấm nút **Web recorder** (hoặc dropdown để chọn browser: Chromium / Edge / Firefox)
3. Trình duyệt mở ra — gõ URL trang cần test và bắt đầu thao tác như người dùng bình thường
4. Trong lúc ghi, màn **Test cases** hiển thị real-time danh sách keyword đang được ghi lại
5. Bấm **Stop** khi xong
6. Test case tự lưu vào thư mục `Recordings/`
7. Bấm **Open recorded test case** để mở và chỉnh sửa nếu cần

> **Mẹo:** Đặt tên test case trước khi bấm Start để test case được lưu đúng tên ngay từ đầu.

---

### Cách 2: Soạn thủ công bằng keyword

**Bước 1: Tạo Test Object** (nếu chưa có)

Vào **Object Repository** và tạo các Test Object cho những phần tử sẽ dùng trong test case (xem [mục 4](#4-object-repository--kho-đối-tượng)).

**Bước 2: Tạo test case mới**

1. Vào **Test cases**
2. Bấm nút **New**
3. Nhập tên test case → **Create**
4. Test case mở trong tab riêng

**Bước 3: Thêm Test Step**

Test step là một nhóm hành động có tên theo *ý định* — ví dụ: "Mở trang đăng nhập", "Điền thông tin", "Xác nhận kết quả".

- Bấm **+ Add step** → đặt tên step
- Mỗi test case có 3 pha cố định:
  - **Set up** — chuẩn bị (ví dụ: mở browser)
  - **Main execution** — thực hiện nghiệp vụ chính
  - **Tear down** — dọn dẹp (ví dụ: chụp màn hình, đóng browser)

**Bước 4: Thêm Keyword vào step**

Mỗi step chứa một hoặc nhiều keyword. Keyword là hành động cụ thể.

- Bấm **+ Add keyword** trong step → chọn keyword từ catalog
- Nếu keyword cần Test Object (ví dụ: Click, Send Keys): chọn từ dropdown
- Điền các tham số (URL, văn bản, timeout...)
- Có thể dùng biến trong tham số (xem [mục 7](#7-biến-và-tham-số))

**Bước 5: Thêm biến cục bộ** (tùy chọn)

Bấm **+ Add** ở phần **Variables** để tạo biến riêng của test case (ví dụ: `username`, `password`). Tham chiếu bằng `${var:username}`.

**Bước 6: Lưu**

Bấm icon 💾 (Save) hoặc **Ctrl+S**.

---

### Cấu trúc test case trong trình soạn

```
Test case: "Đăng nhập thành công"
│
├── Variables
│   ├── username = tomsmith
│   └── password = SuperSecretPassword!
│
├── SET UP
│   └── Step: "Open Browser"
│       └── Open Browser  url = https://...
│
├── MAIN EXECUTION
│   ├── Step: "Điền thông tin đăng nhập"
│   │   ├── Send Keys  [input_username] → ${var:username}
│   │   └── Send Keys  [input_password] → ${var:password}
│   └── Step: "Bấm nút đăng nhập"
│       └── Click  [btn_dang_nhap]
│
└── TEAR DOWN
    └── Step: "Chụp màn hình kết quả"
        └── Take Screenshot  name = ket-thuc
```

---

## 6. Danh sách Keyword

Xem đầy đủ tại màn **Keywords** trong sidebar. Dưới đây là tóm tắt các keyword thường dùng:

### Web · Browser (Điều hướng trang)

| Keyword | Mô tả |
|---------|-------|
| **Open Browser** | Mở trang tại URL chỉ định |
| **Navigate To URL** | Điều hướng đến URL mới |
| **Back** | Quay lại trang trước |
| **Forward** | Tiến đến trang tiếp |
| **Refresh** | Tải lại trang |
| **Delete All Cookies** | Xoá toàn bộ cookie |

### Web · Element (Tương tác phần tử)

| Keyword | Mô tả |
|---------|-------|
| **Click** | Bấm vào phần tử |
| **Double Click** | Bấm đúp |
| **Right Click** | Bấm chuột phải |
| **Mouse Over** | Hover chuột qua phần tử |
| **Send Keys** | Gõ văn bản vào ô nhập |
| **Drag And Drop To Element** | Kéo thả đến phần tử khác |
| **Scroll To Element** | Cuộn trang đến phần tử |
| **Click If Present** | Bấm nếu phần tử tồn tại (không lỗi nếu không có) |

### Web · Text & form

| Keyword | Mô tả |
|---------|-------|
| **Clear Text** | Xoá nội dung ô nhập |
| **Upload File** | Tải file lên |
| **Submit** | Submit form |

### Web · Data retrieval (Lấy dữ liệu)

| Keyword | Mô tả |
|---------|-------|
| **Get Text** | Lấy văn bản của phần tử → lưu vào biến |
| **Get Attribute Value** | Lấy giá trị thuộc tính HTML |
| **Get CSS Attribute Value** | Lấy giá trị CSS |

### Web · Select (Dropdown)

| Keyword | Mô tả |
|---------|-------|
| **Select Option By Label** | Chọn option theo nhãn hiển thị |
| **Select Option By Value** | Chọn option theo value |
| **Select Option By Index** | Chọn option theo vị trí số |

### Web · Verify (Kiểm tra)

| Keyword | Mô tả |
|---------|-------|
| **Verify Element Present** | Kiểm tra phần tử có mặt |
| **Verify Element Not Present** | Kiểm tra phần tử không có mặt |
| **Verify Element Visible** | Kiểm tra phần tử đang hiển thị |
| **Verify Element Text** | Kiểm tra văn bản của phần tử |
| **Verify Element Attribute Value** | Kiểm tra giá trị thuộc tính |
| **Verify Url** | Kiểm tra URL hiện tại |
| **Verify Text Present** | Kiểm tra văn bản có xuất hiện trên trang |

### Web · Wait (Chờ đợi)

| Keyword | Mô tả |
|---------|-------|
| **Wait For Element Present** | Chờ cho đến khi phần tử xuất hiện |
| **Wait For Element Visible** | Chờ cho đến khi phần tử hiển thị |
| **Wait For Element Not Present** | Chờ cho đến khi phần tử biến mất |

### Core (Tiện ích)

| Keyword | Mô tả |
|---------|-------|
| **Delay (Wait)** | Dừng N giây |
| **Set Variable Value** | Gán giá trị vào biến |
| **Take Screenshot** | Chụp màn hình |
| **Generate Unique Code** | Sinh mã ngẫu nhiên |
| **Get Date** | Lấy ngày giờ hiện tại |
| **Verify Variable** | Kiểm tra giá trị biến (equals / contains / regex) |

---

## 7. Biến và tham số

Bất kỳ ô tham số nào trong keyword đều có thể dùng cú pháp `${...}` để chèn giá trị động:

| Cú pháp | Nguồn giá trị | Ví dụ |
|---------|--------------|-------|
| `${var:tên}` | Biến cục bộ của test case | `${var:username}` |
| `${global:tên}` | Global Variables của project | `${global:PRODUCT_URL}` |
| `${data:tên}` | Test Data gắn với Test Suite | `${data:email}` |
| `${env:TÊN}` | Biến môi trường (file .env) | `${env:BASE_URL}` |

**Ví dụ thực tế:**

```
Send Keys  [input_username]  giá trị = ${var:username}
Open Browser                 url = ${global:DEMO_URL}
Verify Element Text          text = Xin chào, ${data:ho_ten}
```

### Output variable (Biến đầu ra)

Một số keyword như **Get Text**, **Get Attribute Value** có thể lưu kết quả vào biến để dùng ở bước sau:

1. Chọn keyword → ô **Output variable** hiện ra
2. Đặt tên biến (ví dụ: `ten_san_pham`)
3. Ở keyword sau, tham chiếu bằng `${var:ten_san_pham}`

---

## 8. Chạy test case

### Chạy một test case

Có hai cách:
- Từ **danh sách**: bấm nút ▶ ở cuối dòng test case
- Từ **trình soạn**: bấm icon ▶ Run trên thanh công cụ

### Chạy toàn thư mục

Bấm **Run all (N)** ở góc trên phải danh sách — chạy tất cả test case đã tự động hoá trong thư mục hiện tại và các thư mục con.

### Chọn browser

Bấm nút **Chrome** (hoặc tên browser đang chọn) ở thanh công cụ:
- **Chrome** (Chromium)
- **Edge** (MS Edge)
- **Firefox**

### Headed / Headless

Toggle **Show browser** ở thanh công cụ:
- **Tắt (Headless)** — mặc định. Browser chạy ẩn, nhanh hơn, có thể chạy nhiều test song song
- **Bật (Show browser)** — browser hiện ra màn hình, dễ quan sát khi debug. Chỉ chạy tuần tự

### Xem log real-time

Sau khi bấm Run, drawer log tự mở ở cuối màn hình:
- Log cuộn tự động theo tiến trình
- Mỗi keyword pass/fail được đánh dấu
- Bấm **Stop** để dừng giữa chừng
- Khi xong, drawer hiển thị tóm tắt: `passed: N · failed: M · duration: Xs`

---

## 9. Test Suites — Bộ test

Test Suite giúp bạn gom nhiều test case lại để chạy cùng một lần, với nhiều tùy chọn cấu hình.

### Tạo Test Suite

1. Vào **Test suites** → bấm **New test suite**
2. Đặt tên → **Create**

### Thêm test case vào suite

Bấm **Add test case** → wizard 3 bước:

**Bước 1 — Select test cases:** Duyệt cây thư mục, tick chọn một hoặc nhiều test case

**Bước 2 — Select run profile:** Chọn khổ màn hình cho các test case vừa chọn (As recorded / Phone / Tablet / Desktop)

**Bước 3 — Bind test data:** Với mỗi test case, có thể gắn Test Data và map biến cục bộ với cột dữ liệu

### Cấu hình từng test case trong suite

Click vào dòng test case để mở **pane Properties** bên phải:

- **Screen size** — khổ màn hình riêng cho test case này
- **Test data** — chọn dataset để dùng
- **Variable binding** — map từng biến cục bộ với:
  - *Default* — dùng giá trị mặc định trong test case
  - *From data column* — lấy từ cột của dataset
  - *Value* — gán giá trị cố định
- **Rounds** — chạy test case nhiều lần với bộ giá trị biến khác nhau (ví dụ: "Đăng nhập admin", "Đăng nhập user thường")

### Bật/Tắt test case trong suite

Bấm icon con mắt 👁 ở đầu mỗi dòng để bật/tắt. Test case tắt sẽ bị bỏ qua khi chạy suite.

### Concurrent instance

Ô số trên thanh công cụ (mặc định 1) — bao nhiêu test chạy cùng lúc. Tối đa 8. Bị bỏ qua khi **Show browser** đang bật.

### Chạy Test Suite

- Nút ▶ ở danh sách
- Hoặc bấm **Save + Run** ▶ trong trình soạn

---

## 10. Test Data — Dữ liệu test

Test Data là một bảng biến—giá trị, dùng để chạy cùng một test case với nhiều bộ dữ liệu khác nhau.

**Ví dụ:** Bộ "Local" có `email = test@local.com`, bộ "Production" có `email = test@prod.com`.

### Tạo Test Data

1. Vào **Test data** → bấm **New test data**
2. Đặt tên (ví dụ: "Tài khoản Local") → **Create**

### Thêm biến

- Bấm **+ Variable** → nhập tên và giá trị ngay trong bảng
- Nhấn **Enter** để thêm biến tiếp theo liên tục
- Bấm **Save** để lưu

### Quy tắc đặt tên biến

Chỉ dùng chữ cái, số và dấu `_`, không bắt đầu bằng số. Ví dụ: `email`, `MAT_KHAU`, `ho_ten_2`.

### Biến bí mật

Tên chứa `SECRET`, `PASSWORD`, `PASS`, `TOKEN`, `APIKEY`, `API_KEY`, `PRIVATE` được tự động coi là bí mật:
- Giá trị không bao giờ gửi về trình duyệt
- Ô nhập hiển thị dạng `••••••`
- Để trống khi lưu = giữ giá trị cũ

### Gắn Test Data vào Test Suite

Khi thêm test case vào suite (xem [mục 9](#9-test-suites--bộ-test)), chọn dataset ở pane Properties.

---

## 11. Global Variables — Biến toàn cục

Global Variables là biến đặt một lần, dùng được trong **mọi test case** của project qua cú pháp `${global:tên}`.

**Dùng cho:** URL ứng dụng, thông tin tài khoản chung, mã sản phẩm, các giá trị không đổi giữa các test case.

### Tạo biến

1. Vào **Global variables** → bấm **New variable**
2. Nhập **tên** (ví dụ: `DEMO_URL`)
3. Nhập **giá trị** (ví dụ: `https://the-internet.herokuapp.com`)
4. Bấm **Create**

### Dùng biến trong test case

Trong bất kỳ ô tham số nào của keyword, gõ: `${global:DEMO_URL}`

> **Mẹo:** Chuột phải vào dòng biến → **Copy ${global:…}** để copy cú pháp sẵn.

### Biến bí mật

Giống Test Data — tên chứa `PASSWORD`, `SECRET`, `TOKEN`... tự động được ẩn giá trị.

---

## 12. Schedules — Lịch chạy tự động

Schedules cho phép test tự động chạy theo lịch mà không cần ai ngồi bấm nút.

### Tạo lịch

1. Vào **Schedules** → bấm **New schedule**
2. Cài đặt **What to run** (cột trái):
   - **Suite** — chọn test suite cần chạy
   - **Filter tests** — lọc test case theo tên (tùy chọn, để trống = chạy cả suite)
   - **Screen size** — khổ màn hình
   - **Schedule name** — tên lịch (để trống = tự đặt)
3. Cài đặt **When** (cột phải):
   - Chọn một trong các **mẫu nhanh**:
     - Every day 07:00
     - Every 2 hours
     - Every 30 minutes
     - Every Monday 06:00
     - Weekdays 18:00
   - Hoặc chọn **Custom cron** và gõ biểu thức cron tùy ý
   - Preview hiện mô tả và thời điểm chạy tiếp theo
4. Bấm **Add schedule**

### Cú pháp cron (tham khảo)

```
┌── Phút (0-59)
│  ┌── Giờ (0-23)
│  │  ┌── Ngày trong tháng (1-31)
│  │  │  ┌── Tháng (1-12)
│  │  │  │  ┌── Ngày trong tuần (0-7, 0 và 7 = Chủ nhật)
│  │  │  │  │
0  7  *  *  *     Mỗi ngày lúc 07:00
*/30 * * * *      Mỗi 30 phút
0 9-18 * * 1-5    Mỗi giờ từ 9h-18h, các ngày trong tuần
```

### Quản lý lịch

- **Enable/Disable** — bật/tắt lịch mà không cần xoá
- Bảng hiển thị: trạng thái, lần chạy tiếp theo, lần chạy cuối + kết quả
- **Delete** — xoá lịch (test case và kết quả không bị xoá)

---

## 13. Test Results — Xem kết quả

### Bảng kết quả

Mỗi lần bấm Run tạo ra một bản ghi trong **Test results**. Bảng hiển thị:

- **What ran** — tên suite hoặc test case, loại, project, browser/khổ màn hình
- **Result** — trạng thái:
  - 🟢 **passed** — tất cả test đạt
  - 🔴 **failed** — có test thất bại
  - ⚠️ **error** — lỗi hệ thống (không chạy được)
  - ⏹ **stopped** — bị dừng thủ công
- **Numbers** — N passed · M failed · K skipped
- **Started** — thời gian + bao lâu trước + thời gian chạy + nguồn (manual / schedule)

### Xem log

Bấm **Log** ở cuối dòng → drawer log mở lại, hiện toàn bộ log của lần chạy đó.

### Xem Playwright Report

Bấm **Report** (nếu có) → mở báo cáo HTML chi tiết của Playwright trong tab mới:
- Danh sách từng test case kèm pass/fail
- Screenshot chụp lúc lỗi
- Video replay và trace (nếu có)
- Thời gian từng bước

### Tải báo cáo

Bấm icon ⬇ Download để tải file HTML về máy — đặt tên theo format `report-{project}-{suite}-{thời gian}.html`.

### Bộ lọc

- **Suite** — lọc theo bộ test
- **Result** — lọc theo trạng thái
- **Time** — Last 24h / 7d / 30d / Custom (chọn ngày cụ thể)
- **Search** — tìm theo tên suite, project, browser, screen size

### Xoá hàng loạt

Tick checkbox nhiều dòng → nút **Delete** xoá cả log lẫn file báo cáo.

---

## 14. Overview — Trang tổng quan

Màn hình đầu tiên sau khi chọn project. Hiển thị:

### Các chỉ số tổng hợp

| Chỉ số | Ý nghĩa |
|--------|---------|
| Suites ready | Bao nhiêu bộ test đã có test case |
| Test cases | Tổng số file test case |
| Automated tests run | Tổng lần test đã chạy |
| Passed | Số test đạt, kèm tỷ lệ % |
| Open failures | Số lỗi hiện tại (từ lần chạy gần nhất) |
| Combinations run | Bao nhiêu tổ hợp đã từng chạy |

### Biểu đồ xu hướng

- **Failures over time** — số test lỗi mỗi ngày
- **Runs over time** — số lần chạy mỗi ngày
- Bộ lọc **Time range**: Last 7 / 14 / 30 / 90 days

### Bảng trạng thái

Danh sách tất cả bộ test với kết quả lần chạy gần nhất, số liệu và thời gian.

---

## Câu hỏi thường gặp

**Q: Test case hiển thị chip "manual steps" nghĩa là gì?**
A: Test case còn có test step chưa được gắn keyword nào — nhập từ Excel hoặc đặt placeholder. Cần mở và gắn keyword cho các step đó trước khi chạy được.

**Q: Nút ▶ Run bị mờ (disabled)?**
A: Test case chưa có keyword nào (chưa tự động hoá), hoặc còn step thủ công. Bấm mở test case để xem và hoàn thiện.

**Q: Chạy xong hiện "Run error" thay vì passed/failed?**
A: Có thể Playwright chưa cài hoặc browser chưa được tải. Chạy lại hai lệnh trong thư mục `e2e/`:
```
npm install
node node_modules/@playwright/test/cli.js install chromium
```

**Q: Biến ${global:...} không có giá trị khi chạy?**
A: Kiểm tra lại tên biến trong Global Variables — tên phân biệt hoa thường. Hoặc giá trị đang để trống.

**Q: Có thể dùng nhiều browser cùng lúc không?**
A: Mỗi lần chạy chỉ dùng một browser. Để test trên nhiều browser, tạo nhiều lần chạy riêng lẻ.

**Q: Test suite chạy chậm, có cách tăng tốc không?**
A: Tắt **Show browser** (chạy headless) và tăng **Concurrent instance** lên 2-4 trong trình soạn suite.

---

*Tài liệu cập nhật theo phiên bản hiện tại của E2E Studio.*
