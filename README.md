# E2E Studio

Phần mềm kiểm thử end-to-end **không cần code** cho ứng dụng web, chạy trên Playwright.

- Soạn test case bằng **keyword** (Open Browser, Click, Send Keys, Verify Text…) trên giao diện, hoặc **ghi thao tác** bằng recorder.
- Quản lý **Object Repository**, **Test data**, **Global variables**, **Test suite**, **lịch chạy**.
- Xem kết quả từng step **trực tiếp lúc chạy**, report Playwright và lịch sử các lần chạy.
- Chạy được trên trình duyệt (console web) hoặc app desktop Windows (Electron), giao diện Anh / Việt.

## Cấu trúc

```
console/          Giao diện + server (Node, không dependency; dữ liệu SQLite qua node:sqlite)
  server/         API, lập lịch, chạy test, recorder
  web/            Giao diện (vanilla JS) — web/demo/ là trang web mẫu cho project Demo
  desktop/        Vỏ Electron + lệnh đóng gói bản Windows
e2e/              Bộ chạy test (Playwright + TypeScript)
  config/         partners.json (danh mục project), devices.json (khổ màn hình), environments.json
  shared/keyword/ Danh mục keyword, bộ máy chạy, runner
  testcases/      Test case (.tc) theo project
  objects/        Test object (.to) theo project
  testsuites/     Test suite theo project
  tools/          Recorder
```

## Yêu cầu

- Node.js **22.13+** (console dùng `node:sqlite`).
- Windows / macOS / Linux. App desktop và lệnh đóng gói hiện chỉ cho Windows.

## Cài đặt

```bash
cd e2e
npm install
npx playwright install chromium     # thêm firefox nếu cần
```

## Chạy

**Console trên trình duyệt**

```bash
cd console
npm start                           # → http://127.0.0.1:5077
```

**App desktop (Windows)**

```bash
cd console
npm run app:install                 # lần đầu: cài Electron
npm run app
```

**Đóng gói bản Windows chạy độc lập** (kèm server, bộ test và trình duyệt Playwright)

```bash
cd console
npm run app:build                   # → %LOCALAPPDATA%\E2EStudioBuild\E2EStudio-win32-x64\E2EStudio.exe
```

Giải nén vào thư mục ghi được (Documents, D:\…), không đặt trong Program Files — test case, kết quả và database lưu ngay cạnh `E2EStudio.exe`.

**Dòng lệnh**

```bash
cd e2e
npm test -- --list                  # danh sách project, khổ màn hình
npm test -- --partner demo          # chạy mọi test case của project demo
npm test -- --partner demo --headed --grep "Đăng nhập"
```

Đổi cổng console bằng biến môi trường `PORT` (mặc định `5077`).

## Project Demo

Project `demo` có sẵn 2 test case chạy vào trang web mẫu đi kèm (`console/web/demo/`, phục vụ tại
`http://127.0.0.1:5077/demo/`), nên chạy được ngay, không cần mạng:

- **Mở trang chủ** — mở trang, kiểm chữ.
- **Đăng nhập thành công** — nhập tài khoản từ biến của test case, bấm Login, kiểm thông báo và URL.

Console phải đang chạy (cổng 5077) thì trang mẫu mới mở được.

## Tạo project mới

Trên màn **Projects** bấm **New project**. Console thêm project vào `e2e/config/partners.json` và tạo thư mục
`testcases/`, `objects/`, `testsuites/` cho nó. Sau đó tạo test case bằng **Web recorder** hoặc **New test case**.
