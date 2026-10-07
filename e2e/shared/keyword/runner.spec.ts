/**
 * MỘT file spec chạy được MỌI test case không-cần-code.
 *
 * Không sinh code: mỗi file JSON dưới `testcases/**` (thuộc kênh đang chạy) thành một `test()`
 * lúc nạp. Bên trong, mỗi **test step** thành một `test.step` cha, mỗi **keyword** trong step
 * thành một `test.step` con — báo cáo Playwright vì thế dựng đúng cây mà người viết nhìn thấy
 * trên console: step hỏng thì biết ngay hỏng ở *việc* nào, mở ra mới xem keyword nào.
 *
 * Thêm test case = thêm một file JSON (console tự làm khi bấm Lưu hoặc khi ghi thao tác xong).
 * KHÔNG phải sửa file này, cũng không phải khai gì thêm ở `config/partners.json`.
 */
import { test as base, expect } from '@playwright/test';
import { readAllTestData } from '@shared/support/testdata';
import { describeCall, describeStep, registerSelectorEngines, resolveValue, runCall, validate, type RunContext } from './engine';
import { getSuite, resolveDevice } from '@config/registry';

// Mã khổ lạ trong file .tc (devices.json đã đổi) thì rơi về khổ mặc định, không làm hỏng cả lượt chạy.
const knownDevice = (code: string) => {
  try {
    return resolveDevice('keyword', code);
  } catch {
    return null;
  }
};
import { createRunContext } from './context';
import { casePath, readDataset, readObjects, readTestCases, readTestSuite } from './store';
import type { TestCase } from './types';

const partner = process.env.E2E_PARTNER ?? '';
const objects = readObjects(partner);
// Chỉ chạy test case mà MỌI step đều có keyword. Bài nhập từ Excel thường mới gắn máy được mấy bước
// dẫn nhập, còn bước "Kiểm tra …" vẫn thủ công — chạy dở như thế là "đạt" giả (chỉ mở app rồi xong),
// nên bài còn step thủ công không đăng ký thành test; báo cáo cũng không đầy hàng trăm dòng "skipped".
const cases = readTestCases(partner).filter(
  (tc) => tc.steps?.length && tc.steps.every((s) => s.disabled || s.keywords?.length),
);

// Bộ chọn attrs= của phương thức Attributes phải có trước khi fixture mở trang.
base.beforeAll(async () => {
  await registerSelectorEngines();
});

const test = base.extend<{ ctx: RunContext }>({
  ctx: async ({ page }, use, testInfo) => {
    await use(await createRunContext(page, testInfo, objects));
  },
});

/** Tên test: mã TC (nếu test case khai `tcIds`) đứng đầu để đối chiếu được với kế hoạch test. */
function titleOf(tc: TestCase): string {
  const ids = (tc.tcIds ?? []).join(', ');
  return ids ? `${ids} | ${tc.name}` : tc.name;
}

interface PlannedTest {
  tc: TestCase;
  title: string;
  /** Giá trị round của test suite, ghi đè biến cục bộ cùng tên. */
  overrides?: Record<string, string>;
  /** Run profile của test suite (mã khổ màn hình). */
  profile?: string;
  /** Dòng test data của round: ghi đè global variable + biến môi trường (URL, secret) cùng tên cho riêng test này. */
  rowValues?: Record<string, string>;
}

/**
 * Chạy theo test suite (E2E_SUITE, console truyền khi bấm Run suite): mỗi test case × round đang tick thành một
 * test; test case không còn hoặc còn step thủ công vẫn hiện trong báo cáo dưới dạng skipped để biết suite hụt gì.
 */
function planSuite(suitePath: string): PlannedTest[] {
  const suite = readTestSuite(partner, suitePath);
  if (!suite) throw new Error(`Không có test suite "${suitePath}" trong testsuites/${partner}/`);
  const all = new Map(readTestCases(partner).map((tc) => [casePath(tc), tc]));
  const runnable = new Map(cases.map((tc) => [casePath(tc), tc]));
  const planned: PlannedTest[] = [];
  const seen = new Map<string, number>();
  const unique = (title: string) => {
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return n === 1 ? title : `${title} #${n}`;
  };
  for (const entry of suite.testCases ?? []) {
    if (entry.enabled === false) continue;
    const tc = runnable.get(entry.path) ?? all.get(entry.path);
    if (!tc) {
      test(unique(`[${suite.name}] ${entry.path}`), () => test.skip(true, `Test case "${entry.path}" không còn tồn tại`));
      continue;
    }
    if (!runnable.has(entry.path)) {
      test(unique(titleOf(tc)), () => test.skip(true, 'Test case còn step thủ công — tự động hoá hết rồi mới chạy trong suite được'));
      continue;
    }
    if (entry.testData?.dataset) {
      const data = readDataset(partner, entry.testData.dataset);
      if (!data) {
        test(unique(`${titleOf(tc)} [${entry.testData.dataset}]`), () => test.skip(true, `Không có test data "${entry.testData?.dataset}"`));
      } else {
        const bindings = entry.testData.bindings ?? {};
        for (const rowId of entry.testData.rows ?? []) {
          const index = data.rows.findIndex((r) => r.id === rowId);
          if (index < 0) continue;
          const row = data.rows[index];
          const vars: Record<string, string> = {};
          for (const v of tc.variables ?? []) {
            const b = bindings[v.name];
            if (b && 'column' in b) vars[v.name] = row.values[b.column] ?? '';
            else if (b && 'value' in b) vars[v.name] = b.value;
            else if (row.values[v.name] !== undefined) vars[v.name] = row.values[v.name];
          }
          const label = `${data.name} · ${row.name || `Row ${index + 1}`}`;
          planned.push({ tc, title: unique(`${titleOf(tc)} [${label}]`), overrides: vars, profile: entry.profile, rowValues: row.values });
        }
      }
    }
    const rounds = (entry.rounds ?? []).filter((r) => r.enabled !== false);
    if (!entry.rounds?.length && !entry.testData?.dataset) planned.push({ tc, title: unique(titleOf(tc)), profile: entry.profile });
    for (const round of rounds) planned.push({ tc, title: unique(`${titleOf(tc)} [${round.name}]`), overrides: round.values, profile: entry.profile });
  }
  return planned;
}

const suitePath = process.env.E2E_SUITE;
// Run all trên console chạy cả một nhánh thư mục (E2E_FOLDER; rỗng = cả project).
const folderFilter = process.env.E2E_FOLDER;
const inFolder = (tc: TestCase) => !folderFilter || casePath(tc).startsWith(`${folderFilter}/`);
const plan: PlannedTest[] = suitePath
  ? planSuite(suitePath)
  : cases.filter(inFolder).map((tc) => ({ tc, title: titleOf(tc) }));

if (!suitePath && cases.length === 0) {
  test('Chưa có test case không-cần-code nào', () => {
    test.skip(true, `Chưa có file nào thuộc kênh ${partner} trong testcases/ — tạo ở console, mục "Tạo test case".`);
  });
}

// Khoá URL mở app của bộ đang chạy — dòng test data có cột này thì round đó mở app trên máy chủ của dòng.
const baseUrlKey = getSuite(partner, process.env.E2E_APP ?? 'keyword').baseUrlKey;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

for (const { tc, title, overrides, profile, rowValues } of plan) {
  // `--device` (E2E_DEVICE) thắng tất; rồi tới run profile của suite; rồi khổ người dùng chọn cho bài (tc.device);
  // rồi khổ lúc ghi (tc.viewport); cuối cùng khổ mặc định của bộ.
  const profileDevice = profile && !process.env.E2E_DEVICE ? resolveDevice('keyword', profile) : null;
  const pickedDevice = !profileDevice && tc.device && !process.env.E2E_DEVICE ? knownDevice(tc.device) : null;
  const chosen = profileDevice ?? pickedDevice;
  const vp = chosen ? { width: chosen.width, height: chosen.height, dpr: chosen.dpr, mobile: chosen.mobile } : tc.viewport;
  // Mở trình duyệt + bài ghi ở khổ desktop: viewport null = theo cửa sổ (đã --start-maximized) nên lấp đúng màn,
  // không lệch viền như khi ép số đo cứng; headless hoặc khổ điện thoại thì giữ đúng số đo đã ghi.
  const windowSized = process.env.E2E_HEADED === '1' && vp && !vp.mobile;
  const rowBaseUrl = rowValues?.[baseUrlKey]?.replace(/\/+$/, '');
  const group =
    (vp && !process.env.E2E_DEVICE) || rowBaseUrl
      ? (declare: () => void) =>
          test.describe(() => {
            if (rowBaseUrl) test.use({ baseURL: rowBaseUrl });
            if (vp && !process.env.E2E_DEVICE) test.use({
              viewport: windowSized ? null : { width: vp.width, height: vp.height },
              // Playwright không cho deviceScaleFactor đi cùng viewport null (config cũng đã bỏ nó khi headed + keyword;
              // test.use({deviceScaleFactor: undefined}) KHÔNG xoá được giá trị của config).
              ...(windowSized ? {} : { deviceScaleFactor: vp.dpr ?? 1 }),
              isMobile: Boolean(vp.mobile) && process.env.E2E_BROWSER !== 'firefox',
              hasTouch: Boolean(vp.mobile) && process.env.E2E_BROWSER !== 'firefox',
            });
            declare();
          })
      : (declare: () => void) => declare();
  group(() => {
  // Console tra kết quả từng step theo annotation này — tên test trùng nhau được, đường dẫn thì không.
  // Khai tĩnh (không push lúc chạy) để reporter đọc được ngay từ step đầu tiên.
  test(title, { annotation: { type: 'case', description: casePath(tc) } }, async ({ ctx }) => {
    // Kiểm khuôn trước khi chạm vào hệ thống: sai tên đối tượng / thiếu tham số thì dừng ngay.
    const problems = validate(tc, objects);
    expect(
      problems,
      `Test case "${tc.name}" (${casePath(tc)}) chưa chạy được:\n  - ${problems.join('\n  - ')}`,
    ).toEqual([]);

    // Test case có thể trỏ sang bộ test data khác (mặc định bộ keyword của project) — nạp lại cho đúng bộ.
    if (tc.dataApp) ctx.data = readAllTestData(tc.dataApp);

    // Ba pha: Set up → Main Execution → Tear Down. Set up lỗi thì bỏ qua Main; Tear Down luôn chạy
    // (dọn dữ liệu / trạng thái) rồi lỗi đầu tiên mới được ném ra để test đỏ đúng chỗ.
    const PHASE_LABEL: Record<string, string> = { setup: 'Set up', main: 'Main execution', teardown: 'Tear down' };
    const phaseOf = (step: TestCase['steps'][number]) => step.phase ?? 'main';
    const runPhase = async (phase: string) => {
      for (const [si, step] of tc.steps.entries()) {
        if (step.disabled || phaseOf(step) !== phase) continue;
        await test.step(`[${PHASE_LABEL[phase]}] ${describeStep(step, si)}`, async () => {
          for (const [ci, call] of step.keywords.entries()) {
            if (call.disabled) continue;
            await test.step(describeCall(call, objects, ci), async () => {
              await runCall(ctx, call, { stepIndex: si, stepName: step.name, callIndex: ci });
            });
          }
        });
      }
    };

    // Dòng test data: đặt biến môi trường (keyword đọc ${env:…} từ process.env lúc gọi) và global variable cho riêng test này,
    // khôi phục khi xong — mỗi worker chạy tuần tự từng test nên không lẫn sang test khác.
    const savedEnv = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(rowValues ?? {})) {
      if (!ENV_NAME.test(key) || value === '') continue;
      savedEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
    if (rowValues) ctx.globals = { ...ctx.globals, ...Object.fromEntries(Object.entries(rowValues).filter(([, v]) => v !== '')) };

    let firstError: unknown = null;
    try {
      // Biến cục bộ của bài vào ctx.vars trước Set up; giá trị có thể trỏ ${global:…}/${data:…}.
      for (const v of tc.variables ?? []) ctx.vars[v.name] = resolveValue(v.value, ctx);
      for (const [name, value] of Object.entries(overrides ?? {})) ctx.vars[name] = resolveValue(value, ctx);
      await runPhase('setup');
      await runPhase('main');
    } catch (err) {
      firstError = err;
    }
    try {
      await runPhase('teardown');
    } catch (err) {
      firstError ??= err;
    }
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (firstError) throw firstError;
  });
  });
}
