/**
 * Chuyển ngôn ngữ giao diện Anh ⇄ Việt.
 *
 * Code render vẫn viết tiếng Anh; lớp này dịch chữ ĐANG HIỂN THỊ (text node + title/placeholder/aria-label) theo từ điển
 * mỗi khi DOM đổi. Chỉ dịch cả cụm khớp từ điển hoặc mẫu, nên tên test case, biến, dữ liệu người dùng không bị đụng.
 * Chuỗi chưa có trong từ điển thì giữ tiếng Anh. Tên keyword và mô tả keyword (catalog) cố ý giữ tiếng Anh như akaAT.
 */

const STORAGE_KEY = 'console-lang';

export function currentLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'vi' ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(lang) {
  try {
    if (lang === 'vi') localStorage.setItem(STORAGE_KEY, 'vi');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* không lưu được thì chỉ đổi trong phiên */
  }
  // Về tiếng Anh cần chữ gốc: tải lại để code render vẽ lại từ đầu (bản nháp chưa lưu vẫn được app hỏi như khi đóng).
  location.reload();
}

// ── Từ điển: cụm tiếng Anh đúng như hiển thị → tiếng Việt ────────────────────────────────────────────
const VI = {
  // Khung chung
  'E2E Studio': 'E2E Studio',
  Overview: 'Tổng quan',
  'Tests Explorer': 'Trình quản lý test',
  Tests: 'Kiểm thử',
  'Global variables': 'Biến toàn cục',
  'Test cases': 'Test case',
  'Test case': 'Test case',
  'Object Repository': 'Kho đối tượng',
  'Test data': 'Test data',
  'Test suites': 'Test suite',
  'Test suite': 'Test suite',
  'Test results': 'Kết quả test',
  Reference: 'Tham khảo',
  Keywords: 'Keyword',
  Keyword: 'Keyword',
  Settings: 'Cài đặt',
  Schedules: 'Lịch chạy',
  Projects: 'Project',
  'Main navigation': 'Menu chính',
  'Switch project': 'Đổi project',
  'Collapse / expand menu': 'Thu gọn / mở rộng menu',
  'Collapse menu': 'Thu gọn menu',
  'Drag to resize · double-click to reset': 'Kéo để đổi độ rộng · nháy đúp để về mặc định',
  'Search test cases, test objects': 'Tìm test case, test object',
  'Search test cases and test objects': 'Tìm test case và test object',
  Minimize: 'Thu nhỏ',
  Maximize: 'Phóng to',
  Close: 'Đóng',
  'Close tab': 'Đóng tab',
  'Close tabs': 'Đóng các tab',
  'Close Others': 'Đóng các tab khác',
  'Close to the Right': 'Đóng các tab bên phải',
  'Close Saved': 'Đóng các tab đã lưu',
  'Close All': 'Đóng tất cả',
  'Unpin tab': 'Bỏ ghim tab',
  'Open tabs': 'Tab đang mở',
  'Copy Path': 'Sao chép đường dẫn',
  'Path copied': 'Đã sao chép đường dẫn',
  Copied: 'Đã sao chép',
  'Cannot access the clipboard': 'Không truy cập được clipboard',
  Theme: 'Giao diện',
  Light: 'Sáng',
  Dark: 'Tối',
  System: 'Theo hệ thống',
  Language: 'Ngôn ngữ',
  Breadcrumb: 'Đường dẫn',
  'Could not load data': 'Không tải được dữ liệu',
  'Could not connect to the console server': 'Không kết nối được server console',

  // Nút / thao tác chung
  Save: 'Lưu',
  'Save and run': 'Lưu và chạy',
  'Save & run': 'Lưu & chạy',
  Cancel: 'Huỷ',
  Create: 'Tạo',
  Delete: 'Xoá',
  Edit: 'Sửa',
  Remove: 'Gỡ',
  Rename: 'Đổi tên',
  Discard: 'Bỏ thay đổi',
  New: 'Mới',
  Add: 'Thêm',
  '+ Add': '+ Thêm',
  Open: 'Mở',
  Run: 'Chạy',
  Stop: 'Dừng',
  Log: 'Log',
  Report: 'Báo cáo',
  Search: 'Tìm kiếm',
  Select: 'Chọn',
  'Select all': 'Chọn tất cả',
  'Select all on this page': 'Chọn tất cả trong trang',
  'Clear selection': 'Bỏ chọn',
  'Delete selected': 'Xoá mục đã chọn',
  Expand: 'Mở rộng',
  Collapse: 'Thu gọn',
  'Expand tree': 'Mở cây',
  'Collapse tree': 'Thu cây',
  Enable: 'Bật',
  Disable: 'Tắt',
  enabled: 'đang bật',
  'Enabled — click to disable': 'Đang bật — bấm để tắt',
  'Disabled — click to enable': 'Đang tắt — bấm để bật',
  'Per page': 'Mỗi trang',
  '‹ Prev': '‹ Trước',
  'Next ›': 'Sau ›',
  Name: 'Tên',
  'Name *': 'Tên *',
  Type: 'Loại',
  Size: 'Kích thước',
  Status: 'Trạng thái',
  Result: 'Kết quả',
  Updated: 'Cập nhật',
  Started: 'Bắt đầu',
  'What ran': 'Nội dung chạy',
  Duration: 'Thời lượng',
  Trigger: 'Kích hoạt',
  Time: 'Thời gian',
  Date: 'Ngày',
  Folder: 'Thư mục',
  Contents: 'Nội dung',
  Concurrent: 'Song song',
  optional: 'không bắt buộc',
  required: 'bắt buộc',
  secret: 'bí mật',
  manual: 'thủ công',
  schedule: 'lịch',
  'to confirm': 'để xác nhận',
  'New folder': 'Thư mục mới',
  'Rename folder': 'Đổi tên thư mục',
  'New name': 'Tên mới',
  'Delete folder': 'Xoá thư mục',
  'Cannot delete folder': 'Không xoá được thư mục',
  'Open folder': 'Mở thư mục',
  'Select folder': 'Chọn thư mục',
  'Folder deleted': 'Đã xoá thư mục',
  'Folder renamed': 'Đã đổi tên thư mục',
  'Drag onto a folder to move': 'Kéo thả vào thư mục để di chuyển',
  'Drag onto a folder in the tree to move': 'Kéo thả vào thư mục trên cây để di chuyển',
  'Drag to reorder': 'Kéo để đổi thứ tự',

  // Tổng quan
  'automated tests run': 'test tự động đã chạy',
  'combinations ever run': 'tổ hợp đã từng chạy',
  'open failures': 'lỗi đang mở',
  'Last run': 'Lần chạy gần nhất',
  'Next run': 'Lần chạy tới',
  'Runs over time': 'Số lần chạy theo thời gian',
  'Failures over time': 'Lỗi theo thời gian',
  'Runs by day': 'Lượt chạy theo ngày',
  'Failed by day': 'Lỗi theo ngày',
  'test runs per day': 'lượt chạy mỗi ngày',
  'failed tests per day': 'test lỗi mỗi ngày',
  Passed: 'Đạt',
  Failed: 'Lỗi',
  'Total tests': 'Tổng số test',
  passed: 'đạt',
  failed: 'lỗi',
  finished: 'đã xong',
  'no failures': 'không có lỗi',
  running: 'đang chạy',
  'not run': 'chưa chạy',
  'Time range': 'Khoảng thời gian',
  'Last 24 hours': '24 giờ qua',
  'Last 7 days': '7 ngày qua',
  'Last 14 days': '14 ngày qua',
  'Last 30 days': '30 ngày qua',
  'Last 90 days': '90 ngày qua',
  'UI E2E': 'E2E giao diện',
  'API tests': 'Test API',
  'opens a browser, checks the real UI': 'mở trình duyệt, kiểm tra giao diện thật',
  'No project yet': 'Chưa có project',
  'Add a partner in config/partners.json.': 'Thêm partner trong config/partners.json.',

  // Biến toàn cục
  'New global variable': 'Biến toàn cục mới',
  'Delete global variable': 'Xoá biến toàn cục',
  'Variable deleted': 'Đã xoá biến',
  'Paste this into any keyword argument': 'Dán vào tham số của bất kỳ keyword nào',
  'Names containing SECRET, PASSWORD, TOKEN, API_KEY… are treated as secrets and never shown again.':
    'Tên chứa SECRET, PASSWORD, TOKEN, API_KEY… được coi là bí mật và không hiển thị lại.',
  'No variables yet': 'Chưa có biến nào',
  Variable: 'Biến',
  Variables: 'Biến',
  Value: 'Giá trị',
  'Value *': 'Giá trị *',
  'Variable name': 'Tên biến',
  'Variable value': 'Giá trị biến',
  'New variable': 'Biến mới',
  'New variable name': 'Tên biến mới',
  'New variable value': 'Giá trị biến mới',
  'Remove variable': 'Xoá biến',
  'Delete variable': 'Xoá biến',
  'Search variables': 'Tìm biến',
  'name or value': 'tên hoặc giá trị',
  '•••••• (keep)': '•••••• (giữ nguyên)',

  // Test case
  'Web recorder': 'Ghi thao tác web',
  'Record in': 'Ghi bằng',
  'Stop recording and save the test case': 'Dừng ghi và lưu test case',
  'Stopping recording session…': 'Đang dừng phiên ghi…',
  Recording: 'Đang ghi',
  'Recording failed': 'Ghi thất bại',
  'Recording session finished': 'Đã kết thúc phiên ghi',
  'Open recorded test case': 'Mở test case vừa ghi',
  'No actions yet…': 'Chưa có thao tác nào…',
  recording: 'đang ghi',
  recorded: 'đã ghi',
  'Show browser': 'Hiện trình duyệt',
  'Turn on to watch the browser perform each step (runs one test at a time)': 'Bật để xem trình duyệt chạy từng bước (chạy lần lượt từng test)',
  'Run all': 'Chạy tất cả',
  'Run every automated test case in this folder and its subfolders': 'Chạy mọi test case tự động trong thư mục này và thư mục con',
  'name, TC ID, path': 'tên, mã TC, đường dẫn',
  'No test cases yet': 'Chưa có test case nào',
  'No test case matches': 'Không có test case nào khớp',
  'All test cases': 'Tất cả test case',
  'New test case': 'Test case mới',
  'Test case name': 'Tên test case',
  'Edit test case': 'Sửa test case',
  'Delete test case': 'Xoá test case',
  'Test case deleted': 'Đã xoá test case',
  'Test case saved': 'Đã lưu test case',
  'Close test case': 'Đóng test case',
  'Run test case': 'Chạy test case',
  'Run this test case': 'Chạy test case này',
  'Save, then run this test case': 'Lưu rồi chạy test case này',
  'Test case actions': 'Thao tác test case',
  'Run target': 'Nơi chạy',
  'Run in': 'Chạy bằng',
  'Editor mode': 'Chế độ soạn',
  Script: 'Script',
  'Set up': 'Chuẩn bị',
  'Main execution': 'Thực thi chính',
  'Tear down': 'Dọn dẹp',
  'Main execution: no test steps': 'Thực thi chính: chưa có test step',
  'Add a step to Set up': 'Thêm step vào Chuẩn bị',
  'Add a step to Main execution': 'Thêm step vào Thực thi chính',
  'Add a step to Tear down': 'Thêm step vào Dọn dẹp',
  '+ Add step': '+ Thêm step',
  'Add step': 'Thêm step',
  'No steps yet': 'Chưa có step nào',
  'Untitled test step': 'Test step chưa đặt tên',
  'Test step name': 'Tên test step',
  'Name of this test step — it shows up in the run report': 'Tên của test step này — hiện trong báo cáo khi chạy',
  'Click to fold this test step — drag a keyword onto it to move the keyword into this step':
    'Bấm để gập test step này — kéo một dòng keyword thả lên đây để chuyển keyword vào step',
  '+ Keyword': '+ Keyword',
  'Add a keyword to this test step': 'Thêm keyword vào test step này',
  'Add keyword': 'Thêm keyword',
  'Merge with step above': 'Gộp với step trên',
  'Merge with step below': 'Gộp với step dưới',
  '⊕ Merge into step': '⊕ Gộp vào step',
  '⊕ Add to step': '⊕ Thêm vào step',
  'Clone test step': 'Nhân bản test step',
  'Delete test step': 'Xoá test step',
  Rename: 'Đổi tên',
  Expand: 'Mở',
  Collapse: 'Gập',
  Step: 'Step',
  'Test step': 'Test step',
  'Delete step': 'Xoá step',
  'New step': 'Step mới',
  'Click to edit this step': 'Bấm để sửa step này',
  'Click to edit this keyword': 'Bấm để sửa keyword này',
  'Manual step — click to pick the keyword that performs it': 'Step thủ công — bấm để chọn keyword thực hiện',
  'manual · pick a keyword': 'thủ công · chọn keyword',
  'manual steps': 'step thủ công',
  'Steps without keywords — the test case cannot run until they are automated': 'Step chưa có keyword — test case chưa chạy được cho tới khi tự động hoá hết',
  'Test case variables': 'Biến của test case',
  'Add a variable local to this test case': 'Thêm biến cục bộ cho test case này',
  'This test case has no variables': 'Test case này chưa có biến',
  Arguments: 'Tham số',
  Output: 'Đầu ra',
  'Data input': 'Dữ liệu vào',
  Numbers: 'Số liệu',
  'Output variable': 'Biến lưu kết quả',
  'Save keyword': 'Lưu keyword',
  'Select keyword': 'Chọn keyword',
  'Search keywords': 'Tìm keyword',
  'No keyword matches': 'Không có keyword nào khớp',
  'Mentioned in description': 'Có nhắc trong mô tả',
  'What it does': 'Chức năng',
  'Fix the script lines first': 'Sửa các dòng script lỗi trước',
  'The script has lines that cannot be read — fix them first': 'Script có dòng không đọc được — sửa trước đã',
  'One keyword per line: keyword Object arg="value" -> variable': 'Mỗi dòng một keyword: keyword ĐốiTượng tham_số="giá trị" -> biến',
  'Show browser window': 'Hiện cửa sổ trình duyệt',
  'Runs in the background — click to show the browser window': 'Chạy nền — bấm để hiện cửa sổ trình duyệt',
  'Browser window is shown while running — click to run in the background': 'Đang hiện cửa sổ trình duyệt khi chạy — bấm để chạy nền',

  // Kho đối tượng
  'Test object': 'Test object',
  'Add test object': 'Thêm test object',
  'New test object': 'Test object mới',
  'New test object here': 'Test object mới tại đây',
  'Delete test object': 'Xoá test object',
  'Test object deleted': 'Đã xoá test object',
  'No such test object': 'Không có test object này',
  'No test objects yet': 'Chưa có test object nào',
  'No test object matches': 'Không có test object nào khớp',
  'Search test objects': 'Tìm test object',
  'Select test object': 'Chọn test object',
  '(not used)': '(không dùng)',
  'Test object name *': 'Tên test object *',
  'name, locator': 'tên, locator',
  Locator: 'Locator',
  'Selection method': 'Phương thức định vị',
  Detect: 'Dùng',
  'Detect object by?': 'Dùng để định vị?',
  Property: 'Thuộc tính',
  'Match condition': 'Điều kiện khớp',
  Value: 'Giá trị',
  '+ Add property': '+ Thêm thuộc tính',
  'Remove property': 'Xoá thuộc tính',
  'Only ticked rows locate the element. Equivalent XPath:': 'Chỉ dòng được tick mới dùng để định vị. XPath tương đương:',
  Use: 'Dùng',
  Type: 'Loại',
  'No XPath yet': 'Chưa có XPath',
  '+ Add XPath': '+ Thêm XPath',
  'Remove XPath': 'Xoá XPath',
  'The ticked XPath is used first; if it matches nothing at run time the others are tried in order.':
    'XPath được chọn dùng trước; lúc chạy nếu nó không khớp gì thì thử lần lượt các XPath còn lại.',
  'CSS selector': 'Selector CSS',
  Role: 'Vai trò',
  'Accessible name': 'Tên truy cập',
  'Parent iframe': 'Iframe cha',
  'CSS selector of the iframe containing this element (leave blank for the main page)':
    'Selector CSS của iframe chứa phần tử (để trống nếu nằm ở trang chính)',
  Verify: 'Kiểm tra',
  URL: 'URL',
  'Clone step': 'Nhân bản step',
  Clone: 'Nhân bản',
  'Clone to Set up': 'Nhân bản sang Set up',
  'Clone to Main execution': 'Nhân bản sang Main execution',
  'Clone to Tear down': 'Nhân bản sang Tear down',
  'Test object name is required': 'Chưa nhập tên test object',

  // Xoá project (3 bước)
  'Project actions': 'Thao tác với project',
  'Delete project…': 'Xoá project…',
  'Delete project': 'Xoá project',
  'Deleting…': 'Đang xoá…',
  Review: 'Xem lại',
  Acknowledge: 'Xác nhận từng ý',
  Confirm: 'Gõ mã xác nhận',
  'Everything below belongs to this project and will be removed:': 'Mọi thứ dưới đây thuộc project này và sẽ bị xoá:',
  'Test objects': 'Test object',
  'Run history': 'Lịch sử chạy',
  'Report folders': 'Thư mục báo cáo',
  'Hand-written suites will disappear from the console and the CLI:': 'Các bộ spec viết tay sẽ biến khỏi console và CLI:',
  'A run of this project is in progress.': 'Project đang có lần chạy.',
  'Stop it before deleting.': 'Dừng lần chạy đó trước khi xoá.',
  'Tick every statement to continue.': 'Tick từng ý dưới đây để tiếp tục.',
  'I understand the test cases, test objects, test suites and test data of this project will be removed from the console.':
    'Tôi hiểu test case, test object, test suite và test data của project này sẽ bị gỡ khỏi console.',
  'I understand the run history, reports and schedules of this project will be deleted, and its schedules will stop.':
    'Tôi hiểu lịch sử chạy, báo cáo và lịch chạy của project sẽ bị xoá, các lịch sẽ không chạy nữa.',
  'I understand the data is moved to the trash folder console/data/trash and can only be restored by hand.':
    'Tôi hiểu dữ liệu được dời vào thùng rác console/data/trash và chỉ khôi phục được bằng tay.',
  'This is the last step. Type the project code to delete it.': 'Bước cuối. Gõ đúng mã project để xoá.',
  'Type the code to confirm:': 'Gõ mã để xác nhận:',
  'Type the text below to confirm:': 'Gõ đúng chữ dưới đây để xác nhận:',
  'Their source code in': 'Mã nguồn của chúng ở',
  'is kept.': 'được giữ nguyên.',

  // Khung mô tả keyword trong ô chọn keyword
  'Hover or use ↑/↓ on a keyword to read what it does.': 'Rê chuột hoặc dùng ↑/↓ lên một keyword để xem nó làm gì.',
  Required: 'Bắt buộc',
  Optional: 'Tuỳ chọn',
  'Not used': 'Không dùng',
  'Returns a value — set Output variable, read it later as': 'Trả về một giá trị — đặt Output variable, các step sau đọc bằng',
  Parameters: 'Tham số',
  'No parameters': 'Không có tham số',

  // Test data
  'New test data': 'Test data mới',
  'Create test data': 'Tạo test data',
  'Delete test data': 'Xoá test data',
  'Test data saved': 'Đã lưu test data',
  'Test data deleted': 'Đã xoá test data',
  'No test data yet': 'Chưa có test data nào',
  'Test data name': 'Tên test data',
  '+ Variable': '+ Biến',
  'Add a row: type the variable name and its value': 'Thêm dòng: gõ tên biến và giá trị',
  'Remove this new variable': 'Bỏ biến mới này',
  'Remove new variable': 'Bỏ biến mới',
  'This test data has no variables yet.': 'Test data này chưa có biến.',
  'This test data has unsaved changes. Discard them?': 'Test data này có thay đổi chưa lưu. Bỏ các thay đổi?',
  'Discard changes': 'Bỏ thay đổi',
  'Click “+ Variable” and type a name and its value.': 'Bấm “+ Biến” rồi gõ tên và giá trị.',
  'A list of variables and values (e.g. one for Local, one for Dev). A test suite picks one to override global variables.':
    'Danh sách biến và giá trị (vd một bộ cho Local, một bộ cho Dev). Test suite chọn một bộ để đè biến toàn cục.',

  // Test suite
  'New test suite': 'Test suite mới',
  'Edit test suite': 'Sửa test suite',
  'Test suite name': 'Tên test suite',
  'Test suite name *': 'Tên test suite *',
  'Delete test suite': 'Xoá test suite',
  'Test suite saved': 'Đã lưu test suite',
  'Test suite deleted': 'Đã xoá test suite',
  'No test suites yet': 'Chưa có test suite nào',
  'Create one to run several test cases together.': 'Tạo một suite để chạy nhiều test case cùng lúc.',
  'Run test suite': 'Chạy test suite',
  'Run this test suite': 'Chạy test suite này',
  'Add test case': 'Thêm test case',
  'Click “Add test case”.': 'Bấm “Thêm test case”.',
  'Remove from suite': 'Gỡ khỏi suite',
  'Add a round with its own variable values': 'Thêm round với giá trị biến riêng',
  Round: 'Round',
  'Round name': 'Tên round',
  'Remove round': 'Xoá round',
  'Run this round': 'Chạy round này',
  'Run with this test data': 'Chạy với test data này',
  'Concurrent instance': 'Số test chạy song song',
  'Concurrent instance — how many tests run at the same time (ignored when Show browser is on)':
    'Số test chạy song song — số test chạy cùng lúc (bỏ qua khi bật Hiện trình duyệt)',
  'Save, then run this test suite': 'Lưu rồi chạy test suite này',
  'Test suite actions': 'Thao tác test suite',
  'How many tests run at the same time (ignored when Show browser is on)': 'Số test chạy cùng lúc (bỏ qua khi bật Hiện trình duyệt)',
  'Run profile': 'Cấu hình chạy',
  'As recorded (test case screen size)': 'Như lúc ghi (khổ màn hình của test case)',
  "Screen size the browser uses. “As recorded” keeps each test case's own size.": 'Khổ màn hình trình duyệt dùng. “Như lúc ghi” giữ khổ riêng của từng test case.',
  "Don't use test data": 'Không dùng test data',
  'Variable binding': 'Gắn biến',
  'Test case variable binding': 'Gắn biến cho test case',
  'Binding source': 'Nguồn giá trị',
  'From data column': 'Lấy từ test data',
  'This test case has no local variables to bind.': 'Test case này không có biến cục bộ để gắn.',
  'Select a test case or a round': 'Chọn một test case hoặc round',
  'Pick test data or add a round to run this test case with other values.': 'Chọn test data hoặc thêm round để chạy test case này với giá trị khác.',
  'Its values override global variables of the same name (URLs, secrets…) for this test case.': 'Giá trị của nó đè biến toàn cục cùng tên (URL, secret…) cho test case này.',
  'This test suite has unsaved changes. Close without saving?': 'Test suite này có thay đổi chưa lưu. Đóng mà không lưu?',
  Platform: 'Nền tảng',
  Properties: 'Thuộc tính',
  Back: 'Quay lại',
  Next: 'Tiếp',
  Finish: 'Hoàn tất',
  missing: 'không còn',
  Desktop: 'Máy tính',
  Tablet: 'Máy tính bảng',
  Phone: 'Điện thoại',
  'Screen size': 'Khổ màn hình',
  'Custom…': 'Tuỳ chỉnh…',

  'Settings for': 'Cài đặt cho',
  'No test case selected': 'Chưa chọn test case',
  'Click a test case in the table to set its screen size, test data and rounds.': 'Bấm vào một test case trong bảng để chỉnh khổ màn hình, test data và round.',
  Rounds: 'Round',
  'Add round': 'Thêm round',
  'Runs with': 'Chạy với',
  'Default values': 'Giá trị mặc định',
  skipped: 'bỏ qua',
  'Included in this run — click to skip': 'Có chạy — bấm để bỏ qua',
  'Skipped — click to include in the run': 'Bỏ qua — bấm để đưa vào chạy',
  'Skip this test case': 'Bỏ qua test case này',
  'Include this test case': 'Đưa test case này vào chạy',
  'Included — click to skip': 'Có chạy — bấm để bỏ qua',
  'Skipped — click to include': 'Bỏ qua — bấm để đưa vào chạy',
  'Skip this round': 'Bỏ qua round này',
  'Include this round': 'Đưa round này vào chạy',
  'This test case has no variables — the round runs it with its defaults.': 'Test case này không có biến — round chạy với giá trị mặc định.',
  'No rounds: the test case runs once (with the test data above, if any). Each round is one more run with its own variable values; empty = the test case default, accepts ${global:…}.':
    'Chưa có round: test case chạy một lần (với test data ở trên nếu có). Mỗi round là thêm một lần chạy với giá trị biến riêng; để trống = giá trị mặc định, nhận ${global:…}.',

  // Kết quả test
  Runs: 'Lượt chạy',
  Suite: 'Bộ test',
  'Run log': 'Log lượt chạy',
  'Copy log': 'Sao chép log',
  'Copy the whole log to the clipboard': 'Sao chép toàn bộ log vào clipboard',
  'Log copied': 'Đã sao chép log',
  'The log is still empty': 'Log còn trống',
  'Cannot access the clipboard — the log is selected, press Ctrl+C':
    'Không truy cập được clipboard — log đã được bôi đen, bấm Ctrl+C',
  'Delete run': 'Xoá lượt chạy',
  'Delete runs': 'Xoá các lượt chạy',
  'Delete this run': 'Xoá lượt chạy này',
  'Delete this run and its report': 'Xoá lượt chạy này và báo cáo',
  'Download report': 'Tải báo cáo',
  'Download the report (.html — screenshots and traces are not included)': 'Tải báo cáo (.html — không kèm ảnh chụp và trace)',
  'No runs yet': 'Chưa có lượt chạy nào',
  'No runs match the filter': 'Không có lượt chạy nào khớp bộ lọc',
  'Clear filter': 'Xoá bộ lọc',
  'Loosen the filter, or click “Clear filter”.': 'Nới bộ lọc, hoặc bấm “Xoá bộ lọc”.',
  'Search in suite, project, environment, screen size': 'Tìm theo bộ test, project, môi trường, khổ màn hình',
  'From date': 'Từ ngày',
  'To date': 'Đến ngày',
  'Stop requested': 'Đã yêu cầu dừng',
  All: 'Tất cả',

  // Lịch chạy
  'Add schedule': 'Thêm lịch',
  'New schedule': 'Lịch mới',
  Screen: 'Màn hình',
  'What to run': 'Chạy gì',
  When: 'Khi nào',
  'Custom cron': 'Cron tuỳ chỉnh',
  'Add one with New schedule.': 'Bấm Lịch mới để thêm.',
  'Schedule name': 'Tên lịch',
  'Schedule added': 'Đã thêm lịch',
  'Schedule deleted': 'Đã xoá lịch',
  'Delete schedule': 'Xoá lịch',
  'Delete this schedule? This cannot be undone.': 'Xoá lịch này? Không thể hoàn tác.',
  'No schedules yet': 'Chưa có lịch nào',
  Expression: 'Biểu thức',
  'Cron expression (minute hour day month weekday)': 'Biểu thức cron (phút giờ ngày tháng thứ)',
  'Every 30 minutes': 'Mỗi 30 phút',
  'Every 2 hours': 'Mỗi 2 giờ',
  'Every day 07:00': 'Hằng ngày 07:00',
  'Weekdays 18:00': 'Ngày thường 18:00',
  'Every Monday 06:00': 'Thứ Hai hằng tuần 06:00',
  'Filter tests (optional)': 'Lọc test (không bắt buộc)',
  'leave empty to run the whole suite': 'để trống để chạy cả bộ',
  'leave empty to name it after the combination': 'để trống để đặt tên theo tổ hợp',
  'e.g. demo, smoke, iphone': 'vd demo, smoke, iphone',

  'test cases': 'test case',
  'test cases (.tc files)': 'test case (file .tc)',
  'Test object name': 'Tên test object',

  // Keyword (màn tham khảo)
  'name, id, argument, description': 'tên, mã, tham số, mô tả',
  'View data as table': 'Xem dữ liệu dạng bảng',
};

// ── Mẫu cho chuỗi có số / tên động ─────────────────────────────────────────────────────────────────
const t = (s) => translate(s) ?? s;
const PATTERNS = [
  [/^(\d+) test cases?$/, '$1 test case'],
  [/^(\d+) test objects?$/, '$1 test object'],
  [/^Delete project — (.+)$/, 'Xoá project — $1'],
  [/^Project (.+) deleted — data moved to (.+)$/, 'Đã xoá project $1 — dữ liệu dời vào $2'],
  [/^(\d+) \((\d+) enabled\)$/, '$1 ($2 đang bật)'],
  [/^One of: (.+)$/, 'Một trong: $1'],
  [/^(\d+) variables?$/, '$1 biến'],
  [/^(\d+) suites?$/, '$1 suite'],
  [/^(\d+) folders?$/, '$1 thư mục'],
  [/^(\d+) steps?$/, '$1 step'],
  [/^(\d+) keywords?$/, '$1 keyword'],
  [/^\((\d+) keywords?\)$/, '($1 keyword)'],
  [/^(\d+) runs?$/, '$1 lượt chạy'],
  [/^(.+) \(missing\)$/, '$1 (không còn)'],
  [/^(.+) \((\d+) variables?\)$/, '$1 ($2 biến)'],
  [/^(\d+) issues?$/, '$1 vấn đề'],
  [/^(\d+) selected$/, 'Đã chọn $1'],
  [/^(\d+) bound$/, '$1 đã gắn'],
  [/^(\d+) in this branch$/, '$1 trong nhánh này'],
  [/^(\d+) here$/, '$1 ở đây'],
  [/^(\d+) test cases? here$/, '$1 test case ở đây'],
  [/^(\d+) test cases? in subfolders$/, '$1 test case trong thư mục con'],
  [/^(\d+) automated$/, '$1 tự động'],
  [/^(\d+) partial$/, '$1 một phần'],
  [/^(\d+) manual$/, '$1 thủ công'],
  [/^(\d+)\/(\d+) passed$/, '$1/$2 đạt'],
  [/^(\d+) failed$/, '$1 lỗi'],
  [/^(\d+)\/(\d+) (keywords|runs)$/, (_, a, b, w) => `${a}/${b} ${w === 'runs' ? 'lượt chạy' : 'keyword'}`],
  [/^(\d+)\/(\d+) steps manual$/, '$1/$2 step thủ công'],
  [/^(\d+)\/(\d+) suites ready$/, '$1/$2 suite sẵn sàng'],
  [/^(\d+) issues? left to fix:$/, 'Còn $1 vấn đề cần sửa:'],
  [/^(\d+) (s|min|h|d) ago$/, (_, n, u) => `${n} ${{ s: 'giây', min: 'phút', h: 'giờ', d: 'ngày' }[u]} trước`],
  [/^(\d+) min (\d+) s$/, '$1 phút $2 giây'],
  [/^([\d.]+) s$/, '$1 giây'],
  [/^Showing (.+) of (\d+)(?: \(filtered from (\d+)\))?$/, (_, r, n, f) => `Hiển thị ${r} / ${n}${f ? ` (lọc từ ${f})` : ''}`],
  [/^Page (\d+) \/ (\d+)$/, 'Trang $1 / $2'],
  [/^Run all \((\d+)\)$/, 'Chạy tất cả ($1)'],
  [/^Existing \((\d+)\)$/, 'Đã có ($1)'],
  [/^(UI E2E|API tests|passed|failed) \((\d+)\)$/, (_, w, n) => `${t(w)} (${n})`],
  [/^Last (\d+) days$/, '$1 ngày qua'],
  [/^suites ready · (\d+) projects?$/, 'suite sẵn sàng · $1 project'],
  [/^Round (\d+)$/, 'Round $1'],
  [/^Line (\d+): (.+)$/, (_, n, m) => `Dòng ${n}: ${t(m)}`],
  [/^Remove variable (.+)\?$/, 'Xoá biến $1?'],
  [/^Remove variable (.+)$/, 'Xoá biến $1'],
  [/^Value of (.+)$/, 'Giá trị của $1'],
  [/^Variable (.+) already exists$/, 'Biến $1 đã tồn tại'],
  [/^Test data (.+) created$/, 'Đã tạo test data $1'],
  [/^Moved to (.+)$/, 'Đã chuyển tới $1'],
  [/^New folder in "(.+)"$/, 'Thư mục mới trong "$1"'],
  [/^Theme: (.+)$/, (_, v) => `Giao diện: ${t(v)}`],
  [/^Browser: (.+)$/, 'Trình duyệt: $1'],
  [/^Recording browser: (.+)$/, 'Trình duyệt ghi: $1'],
  [/^Runs in (.+) — click to change$/, 'Chạy bằng $1 — bấm để đổi'],
  [/^Records in (.+) — click to change$/, 'Ghi bằng $1 — bấm để đổi'],
  [/^Opens (.+) and records your actions into a test case$/, 'Mở $1 và ghi thao tác của bạn thành test case'],
  [/^(.+) opened — type the URL to start recording$/, 'Đã mở $1 — gõ địa chỉ để bắt đầu ghi'],
  [/^Test cases — (.+)$/, 'Test case — $1'],
  [/^Edit test object — (.+)$/, 'Sửa test object — $1'],
  [/^Edit step — (.+)$/, 'Sửa step — $1'],
  [/^Edit step$/, 'Sửa step'],
  [/^test data "(.+)" not found$/, 'không tìm thấy test data "$1"'],
  [/^Nothing matches “(.+)”$/, 'Không có kết quả cho “$1”'],
  [/^The (.+) group has not run yet\.$/, (_, g) => `Nhóm ${t(g)} chưa chạy lần nào.`],
  [/^Run: (\w+) — (.+)$/, (_, s, rest) => `Lượt chạy: ${t(s)} — ${t(rest)}`],
  [/^Delete (\d+) selected$/, 'Xoá $1 mục đã chọn'],
  [/^Delete test case "(.+)"\?\s+This cannot be undone\.$/s, 'Xoá test case "$1"?\nKhông thể hoàn tác.'],
  [/^Delete test object "(.+)"\?$/s, 'Xoá test object "$1"?'],
  [/^Delete test suite "(.+)"\?\s+The test cases themselves are kept\.$/s, 'Xoá test suite "$1"?\nCác test case bên trong vẫn được giữ.'],
  [/^Delete test data "(.+)" with (\d+) variables?\?\s+Test suites that use it will skip those runs\.$/s, 'Xoá test data "$1" gồm $2 biến?\nTest suite đang dùng sẽ bỏ qua các lượt chạy đó.'],
  [/^"(.+)" has unsaved changes\.\s+Close and discard them\?$/s, '"$1" có thay đổi chưa lưu.\nĐóng và bỏ các thay đổi?'],
  [/^Deleted (.+)$/, (_, rest) => `Đã xoá ${t(rest)}`],
  [/^Could not delete (\d+): (.+)$/, 'Không xoá được $1: $2'],
  [/^Run profile for the (\d+) selected test cases?$/, 'Cấu hình chạy cho $1 test case đã chọn'],
  [/^Every day at (\d\d:\d\d)$/, 'Hằng ngày lúc $1'],
  [/^Every day at (\d\d:\d\d) — next run: (.+)$/, 'Hằng ngày lúc $1 — lần chạy tới: $2'],
  [/^Add a step to (.+)$/, (_, p) => `Thêm step vào ${t(p)}`],
  [/^(.+) \*$/, (_, base) => (VI[base] ? `${VI[base]} *` : null)],
];

function translate(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || !/[A-Za-z]/.test(s)) return null;
  if (Object.hasOwn(VI, s)) return VI[s];
  for (const [re, rep] of PATTERNS) {
    const target = re.flags.includes('s') ? raw.trim() : s;
    const m = target.match(re);
    if (!m) continue;
    const out = typeof rep === 'function' ? rep(...m) : target.replace(re, rep);
    if (out) return out;
  }
  // Cụm ghép "a · b · c": dịch từng mảnh, chỉ dùng khi có ít nhất một mảnh đổi.
  for (const sep of [' · ', ' — ']) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep);
    const done = parts.map((p) => translate(p));
    if (done.some(Boolean)) return parts.map((p, i) => done[i] ?? p).join(sep);
  }
  return null;
}

// ── Áp lên DOM ─────────────────────────────────────────────────────────────────────────────────────
const SKIP = 'script, style, textarea, pre, code,[contenteditable="true"], [data-no-i18n], .log-view, .kw-script, #log-output';
const ATTRS = ['title', 'placeholder', 'aria-label'];
const done = new WeakMap();

function translateTextNode(node) {
  const el = node.parentElement;
  if (!el || el.closest(SKIP)) return;
  const value = node.nodeValue;
  if (done.get(node) === value) return;
  const out = translate(value);
  if (out != null && out !== value.trim()) {
    const lead = value.match(/^\s*/)[0];
    const trail = value.match(/\s*$/)[0];
    node.nodeValue = lead + out + trail;
  }
  done.set(node, node.nodeValue);
}

function translateAttrs(el) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const out = translate(v);
    if (out != null && out !== v) el.setAttribute(a, out);
  }
  if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP') {
    const label = el.getAttribute('label');
    const out = label && translate(label);
    if (out) el.setAttribute('label', out);
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n);
    else translateAttrs(n);
  }
}

export function initI18n() {
  document.documentElement.lang = currentLang();
  if (currentLang() !== 'vi') return;
  translateTree(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') translateTextNode(m.target);
      else if (m.type === 'attributes') translateAttrs(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'label'] });
}

export const translateForTest = translate;
