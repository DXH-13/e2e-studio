/**
 * Khuôn dữ liệu của Test Case không-cần-code.
 *
 * Bốn thứ, bốn việc rõ ràng — đúng cách Katalon chia, và cũng là lý do nó tái sử dụng được:
 *
 *   · **Test Object** (`objects/<project>/**.to`, mỗi object một file) — "chỉ vào cái gì trên màn hình".
 *     Đổi giao diện thì sửa MỘT chỗ ở đây, mọi test case dùng nó tự đúng theo.
 *   · **Keyword** (`shared/keyword/catalog.json`) — "làm hành động gì".
 *   · **Test Case** (`testcases/**\/*.json`) — "làm gì, theo thứ tự nào". Chỉ gồm tên keyword +
 *     tên đối tượng + tham số; không có dòng code nào.
 *   · **Test Data** (`testdata/<partner>-<app>-<env>.json`) — "làm với giá trị nào".
 *     Test case tham chiếu bằng `${data:khoá}` nên chạy được mọi môi trường.
 *
 * ## Test Case → Test Step → Keyword
 *
 * Một Test Case gồm nhiều **Test Step CÓ TÊN**, mỗi step gộp một hoặc nhiều **keyword**.
 * Đây là điểm khác quan trọng so với bản đầu (mỗi bước đúng một keyword):
 *
 *   · Người đọc test case thấy được **ý định** ("Chọn nơi nhận hàng"), không phải một danh sách
 *     hai chục thao tác vụn.
 *   · Báo cáo Playwright dựng đúng cây đó — step hỏng thì biết ngay hỏng ở *việc* nào, rồi mới
 *     mở ra xem keyword nào trong việc đó.
 *   · Đó cũng là cách Katalon hiển thị test case: dòng cha là bước nghiệp vụ, dòng con là keyword.
 */

/** Phương thức chọn phần tử (Katalon: selection method) + Role của Playwright. Mô hình ở `object-model.cjs`. */
export type SelectionMethod = 'attributes' | 'xpath' | 'css' | 'role';
export type MatchCondition = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'matchesRegex';

/** Một dòng bảng thuộc tính; `detect` = cột "Detect object by?" của Katalon. */
export interface ObjectProperty {
  name: string;
  condition: MatchCondition;
  value: string;
  detect: boolean;
}

export interface XPathEntry {
  /** xpath:attributes · xpath:idRelative · xpath:neighbor · xpath:link · xpath:position · xpath:custom */
  type: string;
  value: string;
}

export interface RoleLocator {
  role: string;
  name?: string;
  condition?: MatchCondition;
}

export interface TestObject {
  /** Tên người đọc hiểu, hiện trên console và trong báo cáo. */
  name: string;
  method: SelectionMethod;
  properties: ObjectProperty[];
  xpaths: XPathEntry[];
  selectedXPath: number;
  css: string;
  role: RoleLocator | null;
  /** Selector CSS của iframe cha (Katalon: parent iframe). */
  frame?: string;
  /** Recorder tự ghi: màn hình lúc bắt được đối tượng, để người sau dễ hình dung. */
  screen?: string;
  createdAt?: string;
}

export interface ObjectRepository {
  objects: Record<string, TestObject>;
}

/** Một lệnh trong test step. */
export interface KeywordCall {
  /** Khớp `id` trong `shared/keyword/catalog.json`. */
  keyword: string;
  /** Tên người viết đặt cho dòng này; bỏ trống thì hiện nhãn keyword. */
  name?: string;
  /** Khoá của Test Object — bỏ trống với keyword không cần đối tượng. */
  object?: string;
  args?: Record<string, string | number>;
  /** Tên biến nhận giá trị keyword trả về (cột Output của akaAT) — chỉ với keyword có `returns`. */
  output?: string;
  /** Tắt tạm một keyword mà không phải xoá. */
  disabled?: boolean;
}

/** Một bước nghiệp vụ có tên, gộp nhiều keyword. */
/**
 * Ba pha của một test case (theo akaAT Studio / Katalon): Set up → Main Execution → Tear Down.
 * Set up lỗi thì BỎ QUA Main, nhưng Tear Down LUÔN chạy — kể cả khi Set up hay Main lỗi.
 */
export type StepPhase = 'setup' | 'main' | 'teardown';
export const PHASES: StepPhase[] = ['setup', 'main', 'teardown'];

export interface TestStep {
  /** Tên do người viết đặt — đây là thứ hiện trên báo cáo, nên đặt theo Ý ĐỊNH, không theo thao tác. */
  name: string;
  /** Pha của step; thiếu = `main` (file định dạng cũ không có trường này). */
  phase?: StepPhase;
  keywords: KeywordCall[];
  /** Tắt cả bước (kèm mọi keyword trong đó) mà không phải xoá. */
  disabled?: boolean;
}

export interface TestCase {
  /** Tên file (không đuôi). */
  id: string;
  /**
   * Thư mục chứa test case, tính từ `testcases/`. Rỗng = nằm ngay gốc.
   *
   * Lưu theo CÂY THƯ MỤC chứ không gom theo kênh: một bộ test thật sự được tổ chức theo nghiệp vụ
   * ("Đăng nhập / Giỏ hàng / Thanh toán"), và cùng một nhánh nghiệp vụ có thể có bài của nhiều
   * kênh. Kênh là một THUỘC TÍNH của test case, không phải chỗ cất nó.
   */
  folder?: string;
  name: string;
  /** Project mà test case thuộc về — quyết định kho đối tượng. */
  partner: string;
  /** Bộ test data mà test case đọc `${data:...}` từ đó. Mặc định `keyword`. */
  dataApp?: string;
  /**
   * Khổ màn hình lúc ghi (recorder tự lưu): chạy lại dùng đúng khổ này thay vì khổ mặc định của bộ,
   * trừ khi lần chạy chỉ định `--device`. `mobile` = có giả lập cảm ứng (Device toolbar của DevTools).
   */
  viewport?: { width: number; height: number; dpr?: number; mobile?: boolean };
  /** Khổ máy người dùng chọn (mã trong devices.json) — thắng cả `viewport` lúc ghi; bỏ trống = theo khổ lúc ghi / mặc định. */
  device?: string;
  /** Mã TC trong kế hoạch test mà test case này phủ — để báo cáo đối chiếu được. */
  tcIds?: string[];
  /** Kết quả mong đợi (từng dòng) — nhập từ Excel hoặc người dùng tự ghi; chỉ để đọc, runner không kiểm. */
  expected?: string[];
  tags?: string[];
  /** Nguồn gốc khi nhập từ ngoài vào (vd tên file Excel). */
  source?: string;
  /** Recorder ghi lại nguồn gốc; sửa tay xong vẫn giữ để biết bài này từ đâu ra. */
  recordedAt?: string;
  updatedAt?: string;
  /**
   * Biến cục bộ của test case: đặt sẵn trước khi chạy, đọc bằng `${var:tên}` — cùng không gian với
   * Output variable, nên keyword sau có thể ghi đè. Giá trị được thay ô cắm (`${global:…}`, `${data:…}`) lúc khởi động.
   */
  variables?: TestCaseVariable[];
  steps: TestStep[];
}

export interface TestCaseVariable {
  name: string;
  value: string;
}

/** Một tham số của keyword, dùng cho cả runner lẫn ô nhập trên console. */
export interface KeywordArg {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiline';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

export interface KeywordSpec {
  id: string;
  group: string;
  label: string;
  summary: string;
  detail?: string;
  /** `true` bắt buộc có đối tượng, `'optional'` có cũng được, `false` không dùng. */
  object: boolean | 'optional';
  /** Keyword trả về giá trị → console hiện ô Output variable, runner ghi vào `${var:<output>}`. */
  returns?: boolean;
  args: KeywordArg[];
}

export interface KeywordCatalog {
  groups: { id: string; label: string }[];
  keywords: KeywordSpec[];
}

/** Một nút trên cây thư mục test case — console dựng cây từ danh sách này. */
export interface TreeNode {
  type: 'folder' | 'case';
  /** Đường dẫn tính từ `testcases/`: `Giỏ hàng/Thanh toán` hoặc `Giỏ hàng/Thanh toán/the-tin-dung`. */
  path: string;
  name: string;
  children?: TreeNode[];
  /** Chỉ có ở `type: 'case'`. */
  testCase?: TestCase;
}

/**
 * Test suite kiểu akaAT Studio (2.10): gom test case đã có, mỗi test case chạy với một run profile và
 * một hay nhiều round — mỗi round là một bộ giá trị ghi đè biến cục bộ của test case.
 */
export interface TestSuiteRound {
  id: string;
  name: string;
  /** Bỏ tick = không chạy round này. */
  enabled?: boolean;
  /** Tên biến → giá trị; biến không có ở đây giữ giá trị mặc định của test case. Nhận `${data:…}`/`${global:…}`. */
  values: Record<string, string>;
}

/** Test data dạng bảng (`testdata/datasets/<project>/<id>.data`): dùng chung, test suite chọn bộ + dòng khi gắn test case. */
export interface Dataset {
  id: string;
  name: string;
  columns: string[];
  rows: { id: string; name?: string; values: Record<string, string> }[];
}

/** Gắn một biến cục bộ của test case: lấy từ cột của dòng test data, hoặc một giá trị cố định. */
export type VariableBinding = { column: string } | { value: string };

export interface TestSuiteEntry {
  id: string;
  /** Đường dẫn test case tính từ `testcases/<project>/`, không đuôi. */
  path: string;
  enabled?: boolean;
  /** Mã khổ màn hình trong `config/devices.json`; trống = khổ lúc ghi của test case (hoặc khổ mặc định của bộ). */
  profile?: string;
  /** Không có round = chạy một lần với biến mặc định. */
  rounds?: TestSuiteRound[];
  /**
   * Test data gắn cho test case: mỗi dòng đã chọn = một round. Giá trị của dòng ghi đè global variable cùng tên (kể cả URL,
   * secret — nên chọn dòng "Dev" là chạy trên máy chủ dev); `bindings` quyết định biến cục bộ nào lấy cột nào.
   * Biến cục bộ không khai binding mà trùng tên cột thì tự lấy cột đó.
   */
  testData?: { dataset: string; rows: string[]; bindings?: Record<string, VariableBinding> };
}

export interface TestSuite {
  id: string;
  name: string;
  partner: string;
  /** Số test chạy cùng lúc (Concurrent Instance của akaAT) — thành `--workers`. */
  concurrency?: number;
  testCases: TestSuiteEntry[];
  updatedAt?: string;
}
