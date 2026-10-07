import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

/**
 * Báo tiến độ từng test step / keyword của bộ keyword ngay lúc chạy, mỗi sự kiện một dòng `@@kw-step {json}`.
 * Console tách các dòng này khỏi log để tô trạng thái trên bảng step; khoá `si` / `si-ci` khớp với `/api/testcases/last-run`.
 */
const STEP = /^\[[^\]]+\] Step (\d+):/;
const CALL = /^(\d+)\. /;

function keyOf(step: TestStep): string | null {
  const si = STEP.exec(step.title)?.[1];
  if (si) return String(Number(si) - 1);
  const parent = STEP.exec(step.parent?.title ?? '')?.[1];
  const ci = CALL.exec(step.title)?.[1];
  return parent && ci ? `${Number(parent) - 1}-${Number(ci) - 1}` : null;
}

export default class KeywordProgress implements Reporter {
  private emit(test: TestCase, step: TestStep, status: string): void {
    if (step.category !== 'test.step') return;
    const path = test.annotations.find((a) => a.type === 'case')?.description;
    const key = keyOf(step);
    if (!path || key == null) return;
    process.stdout.write(`@@kw-step ${JSON.stringify({ case: path, key, status })}\n`);
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep): void {
    this.emit(test, step, 'running');
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
    this.emit(test, step, step.error ? 'failed' : 'passed');
  }

  printsToStdio(): boolean {
    return false;
  }
}
