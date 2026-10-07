import type { Page, TestInfo } from '@playwright/test';
import { readAllTestData, readGlobalVariables } from '@shared/support/testdata';
import type { RunContext } from './engine';
import type { ObjectRepository } from './types';

/** RunContext của runner.spec.ts: trang đang chạy + test data, global variables, biến cục bộ của test case. */
export async function createRunContext(page: Page, testInfo: TestInfo, objects: ObjectRepository): Promise<RunContext> {
  const vars: Record<string, string> = {};
  const context: RunContext = {
    page,
    objects,
    data: readAllTestData(),
    globals: readGlobalVariables(),
    vars,
    frame: undefined,
    pendingDialog: undefined,
    attach: async (name, body) => {
      await testInfo.attach(name, { body, contentType: 'image/png' });
    },
    onHeal: ({ object, broken, used }) => {
      testInfo.annotations.push({ type: 'self-healing', description: `${object}: ${broken} không khớp, đã dùng ${used}` });
    },
  };
  // Có listener thì Playwright KHÔNG tự đóng alert/confirm/prompt — hộp thoại chờ keyword Accept/Dismiss.
  page.on('dialog', (dialog) => {
    context.pendingDialog = dialog;
  });
  return context;
}
