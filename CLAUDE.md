# E2E Studio — hướng dẫn cho AI

Đọc README.md trước. Tóm tắt:

- `console/` — server Node **không dependency** (node:sqlite, cần Node 22.13+) + giao diện vanilla JS ở `console/web/`. Không thêm framework/thư viện frontend.
- `e2e/` — bộ chạy Playwright + TypeScript, keyword ở `e2e/shared/keyword/`.
- Giao diện song ngữ Anh / Việt: chuỗi mới phải có cả hai.

## Lệnh kiểm tra

- `cd e2e && npm run typecheck` — sau khi sửa code TypeScript.
- `cd e2e && npm test -- --partner demo` — chạy test mẫu (console phải chạy ở cổng 5077).
- `cd console && npm run check:contrast` — sau khi đổi màu giao diện.
- `cd console && npm start` — chạy console tại http://127.0.0.1:5077

## Thiết kế giao diện

Dùng plugin Impeccable (khai báo trong `.claude/settings.json`) cho mọi việc UI ở `console/web/`:
`/impeccable critique`, `/impeccable audit`, `/impeccable polish`.

## Không commit

`console/data/`, `e2e/testdata/*.json`, `e2e/config/env/*.env` — có thể chứa secret.
