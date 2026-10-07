import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Ghi `summary.json` — bản tóm tắt CHUẨN HOÁ của một lần chạy, cho console đọc.
 *
 * Vì sao không dùng thẳng `results.json` của Playwright: file đó lồng nhau sâu
 * (suite → suite → spec → test → results) và đổi hình theo cấu hình, nên console
 * sẽ phải hiểu nội bộ Playwright. File này phẳng, chỉ giữ đúng thứ console cần,
 * và có sẵn `partner/app/env` để lọc.
 *
 * Không thay `tc-reporter.ts`: cái kia đối chiếu với bộ TC nghiệp vụ, cái này
 * tóm tắt kỹ thuật lần chạy.
 */

export interface RunSummaryOptions {
  reportDir?: string;
  runKey?: string;
  partner?: string;
  app?: string;
  env?: string;
}

interface TestRecord {
  title: string;
  /** Mã TC trích từ tên test, phần trước dấu `|`. */
  ids: string[];
  file: string;
  status: string;
  durationMs: number;
  retry: number;
  error?: string;
  /** Đường dẫn tương đối so với thư mục report — mở được từ trang báo cáo. */
  screenshot?: string;
  trace?: string;
}

const E2E_ROOT = path.resolve(__dirname, '..');
const ID_PATTERN = /\b[A-Z]{2,6}_\d+\b/g;

export default class RunSummaryReporter implements Reporter {
  private readonly outDir: string;
  private readonly meta: Required<Omit<RunSummaryOptions, 'reportDir'>>;
  private readonly tests: TestRecord[] = [];
  private startedAt = Date.now();

  constructor(options: RunSummaryOptions = {}) {
    this.outDir = path.resolve(E2E_ROOT, options.reportDir ?? 'reports');
    this.meta = {
      runKey: options.runKey ?? 'unknown',
      partner: options.partner ?? '',
      app: options.app ?? '',
      env: options.env ?? '',
    };
  }

  onBegin(): void {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const head = test.title.split('|')[0];
    const attachment = (name: string) => {
      const found = result.attachments.find((a) => a.name === name && a.path);
      return found?.path ? path.relative(this.outDir, found.path).split(path.sep).join('/') : undefined;
    };

    this.tests.push({
      title: test.title,
      ids: [...new Set(head.match(ID_PATTERN) ?? [])],
      file: path.relative(E2E_ROOT, test.location.file).split(path.sep).join('/'),
      // Test đánh dấu `test.fail()` (lỗi đã biết, chưa sửa) KHÔNG phải là lỗi:
      // Playwright coi nó là "đúng như dự kiến". Đọc thẳng `result.status` thì
      // console đếm nhầm chúng thành lỗi và số liệu lệch hẳn với terminal.
      status: test.expectedStatus === 'failed' && result.status === 'failed' ? 'expected-fail' : result.status,
      durationMs: result.duration,
      retry: result.retry,
      // Chỉ dòng đầu — thông điệp đủ để nhận ra lỗi, chi tiết đã có trong trace.
      error: result.error?.message?.split('\n').slice(0, 3).join('\n'),
      screenshot: attachment('screenshot'),
      trace: attachment('trace'),
    });
  }

  onEnd(result: FullResult): void {
    // `npx playwright test --list` cũng chạy reporter tới onEnd mà không có test nào kết thúc —
    // ghi đè lúc đó là summary.json của lần chạy thật biến thành 0/0 và console báo "0/0 đạt".
    if (this.tests.length === 0) return;
    const finishedAt = Date.now();
    // Một test chạy lại nhiều lần thì chỉ lấy lần cuối, để số liệu khớp cái Playwright in ra.
    const latest = new Map<string, TestRecord>();
    for (const t of this.tests) {
      const key = `${t.file}::${t.title}`;
      const prev = latest.get(key);
      if (!prev || t.retry >= prev.retry) latest.set(key, t);
    }
    const tests = [...latest.values()];

    const summary = {
      ...this.meta,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - this.startedAt,
      status: result.status,
      totals: {
        total: tests.length,
        // 'expected-fail' = lỗi đã biết, đánh dấu test.fail() — tính là đạt như Playwright.
        passed: tests.filter((t) => t.status === 'passed' || t.status === 'expected-fail').length,
        failed: tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length,
        expectedFail: tests.filter((t) => t.status === 'expected-fail').length,
        skipped: tests.filter((t) => t.status === 'skipped').length,
      },
      tests,
    };

    fs.mkdirSync(this.outDir, { recursive: true });
    fs.writeFileSync(path.join(this.outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  }
}
