/**
 * Vỏ Electron cho test console. Không có logic nghiệp vụ ở đây: server Node hiện có (../server)
 * được bật như tiến trình con rồi cửa sổ trỏ vào http://127.0.0.1:<PORT>. Đóng cửa sổ chỉ ẩn xuống
 * khay hệ thống để lịch chạy còn hoạt động; Quit ở khay hoặc Ctrl+Q mới tắt hẳn.
 *
 *   npm run app        (ở console)
 *   PORT=5056 npm run app
 */
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Bản đóng gói (tools/build-win.mjs): console + e2e + browser nằm trong resources/, Node là Node của Electron.
const PACKAGED = app.isPackaged;
const CONSOLE_ROOT = PACKAGED ? resolve(process.resourcesPath, 'console') : resolve(HERE, '..');
const BROWSERS_DIR = PACKAGED ? resolve(process.resourcesPath, 'ms-playwright') : null;
const SERVER_ENTRY = resolve(CONSOLE_ROOT, 'server/index.mjs');
const ICON = nativeImage.createFromPath(resolve(HERE, 'assets/icon.png'));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5077);
const ORIGIN = `http://${HOST}:${PORT}`;
const APP_ID = 'e2e-studio';
const NOTIFY_STATUSES = new Set(['passed', 'failed', 'error', 'stopped']);
// 3 nút cửa sổ do trang tự vẽ trên thanh tiêu đề (web/index.html `.win-controls`) gọi về đây.
ipcMain.on('window-control', (event, action) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) return;
  if (action === 'minimize') target.minimize();
  else if (action === 'maximize') (target.isMaximized() ? target.unmaximize() : target.maximize());
  else if (action === 'close') target.close();
});

app.setAppUserModelId(APP_ID);
Menu.setApplicationMenu(buildMenu());

let win = null;
let tray = null;
let serverChild = null;
let quitting = false;
let logPath = '';
const logTail = [];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(boot).catch((err) => fail('Cannot start the test console', err.message));
}

app.on('before-quit', () => {
  quitting = true;
  stopServer();
});
app.on('window-all-closed', () => {
  /* Giữ app sống ở khay — không quit khi đóng cửa sổ. */
});

async function boot() {
  if (PACKAGED && !writable(CONSOLE_ROOT)) {
    return fail('This folder is read-only', `Test cases, results and the database are stored next to E2EStudio.exe.\nUnzip the app into a folder you can write to (e.g. Documents or D:\\), not Program Files.\n\n${CONSOLE_ROOT}`);
  }
  if (await consoleAlive()) {
    log(`console already running at ${ORIGIN} — attaching, that instance stays after quit`);
  } else {
    startServer();
    await waitForConsole();
  }
  createWindow();
  createTray();
  watchRuns();
}

// ── Server ────────────────────────────────────────────────────────────────

function nodeRuntime() {
  // Node nằm trong Electron (ELECTRON_RUN_AS_NODE): bản đóng gói luôn dùng; bản source chỉ khi máy thiếu Node phù hợp.
  const electronNode = { bin: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' }, label: `electron-node ${process.versions.node}` };
  if (PACKAGED) return electronNode;
  const probe = spawnSync('node', ['-p', 'process.versions.node'], { encoding: 'utf8', windowsHide: true });
  const version = probe.status === 0 ? probe.stdout.trim() : '';
  const [major, minor] = version.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 13)) return { bin: 'node', env: {}, label: `node ${version}` };
  return electronNode;
}

function writable(dir) {
  const probe = resolve(dir, '.write-test');
  try {
    writeFileSync(probe, '');
    rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

function startServer() {
  const runtime = nodeRuntime();
  const logDir = resolve(app.getPath('userData'), 'logs');
  mkdirSync(logDir, { recursive: true });
  logPath = resolve(logDir, 'server.log');
  const out = createWriteStream(logPath, { flags: 'w' });
  log(`starting server with ${runtime.label} on ${ORIGIN}`);

  serverChild = spawn(runtime.bin, ['--no-warnings=ExperimentalWarning', SERVER_ENTRY], {
    cwd: CONSOLE_ROOT,
    env: {
      ...process.env,
      ...runtime.env,
      ...(BROWSERS_DIR ? { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR } : {}),
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const onChunk = (chunk) => {
    out.write(chunk);
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      logTail.push(line);
      if (logTail.length > 200) logTail.shift();
    }
  };
  serverChild.stdout.on('data', onChunk);
  serverChild.stderr.on('data', onChunk);
  serverChild.on('exit', (code) => {
    out.end();
    serverChild = null;
    if (quitting) return;
    fail(`The console server stopped (exit code ${code})`, logTail.slice(-25).join('\n') || `See ${logPath}`);
  });
}

function stopServer() {
  if (!serverChild) return;
  const { pid } = serverChild;
  serverChild = null;
  // Giết cả cây tiến trình: server còn spawn Playwright / recorder bên dưới.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else process.kill(pid, 'SIGTERM');
}

async function consoleAlive() {
  try {
    const res = await fetch(`${ORIGIN}/api/projects`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForConsole(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serverChild) return; // đã thoát → exit handler báo lỗi
    if (await consoleAlive()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  fail('The console server did not answer in time', logTail.slice(-25).join('\n') || `See ${logPath}`);
}

// ── Window ────────────────────────────────────────────────────────────────

const settingsPath = () => resolve(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(patch) {
  writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), ...patch }, null, 2));
}

function createWindow() {
  const saved = readSettings();
  win = new BrowserWindow({
    ...(saved.bounds ?? { width: 1440, height: 900 }),
    minWidth: 960,
    minHeight: 600,
    icon: ICON,
    title: 'E2E Studio',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f5f6f8',
    // Thanh tiêu đề kiểu VS Code: trang tự vẽ thanh trên (36px, vùng kéo) lẫn 3 nút cửa sổ.
    titleBarStyle: 'hidden',
    webPreferences: { preload: resolve(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(ORIGIN);

  // Báo cáo / Playwright report cùng origin mở cửa sổ con; link ra ngoài giao cho trình duyệt.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true, width: 1280, height: 860 } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN)) return;
    e.preventDefault();
    shell.openExternal(url);
  });

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      writeSettings({ maximized: win.isMaximized(), ...(win.isMaximized() ? {} : { bounds: win.getNormalBounds() }) });
    }, 300);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  const sendState = () => win.webContents.send('window-state', { maximized: win.isMaximized() });
  win.on('maximize', () => (saveBounds(), sendState()));
  win.on('unmaximize', () => (saveBounds(), sendState()));
  win.webContents.on('did-finish-load', sendState);

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!readSettings().trayHintShown && tray) {
      tray.displayBalloon({ icon: ICON, title: 'E2E Studio is still running', content: 'Schedules keep firing from the tray. Right-click the tray icon → Quit to stop.' });
      writeSettings({ trayHintShown: true });
    }
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open in browser', click: () => shell.openExternal(ORIGIN) },
        { label: 'Server log', click: () => logPath && shell.openPath(logPath) },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },
  ]);
}

// ── Tray + notifications ──────────────────────────────────────────────────

function createTray() {
  tray = new Tray(ICON.resize({ width: 16, height: 16 }));
  tray.setToolTip(`E2E Studio — ${ORIGIN}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open E2E Studio', click: showWindow },
      { label: 'Open in browser', click: () => shell.openExternal(ORIGIN) },
      { label: 'Server log', click: () => logPath && shell.openPath(logPath) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
  tray.on('balloon-click', showWindow);
}

/** Thăm dò /api/runs: run đang chạy chuyển sang trạng thái kết thúc → thông báo hệ thống. */
function watchRuns() {
  const seen = new Map();
  let primed = false;
  const tick = async () => {
    let runs;
    try {
      runs = (await (await fetch(`${ORIGIN}/api/runs`, { signal: AbortSignal.timeout(4000) })).json()).runs ?? [];
    } catch {
      return;
    }
    for (const run of runs) {
      const before = seen.get(run.id);
      seen.set(run.id, run.status);
      if (!primed || before === undefined || before === run.status || !NOTIFY_STATUSES.has(run.status)) continue;
      notifyRun(run);
    }
    primed = true;
  };
  tick();
  setInterval(tick, 8000);
}

function notifyRun(run) {
  if (!Notification.isSupported()) return;
  const t = run.totals ?? {};
  const counts = t.passed !== undefined ? ` — ${t.passed ?? 0} passed, ${t.failed ?? 0} failed` : '';
  const n = new Notification({
    title: `Run ${run.status}: ${run.suiteLabel ?? run.app ?? ''}`,
    body: `${run.partnerName ?? run.partner ?? ''} · ${run.env ?? ''}${counts}`,
    icon: ICON,
  });
  n.on('click', () => {
    showWindow();
    win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(`#p/${run.partner}/results`)}`).catch(() => {});
  });
  n.show();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[desktop] ${msg}`);
}

function fail(title, detail) {
  quitting = true;
  stopServer();
  dialog.showErrorBox(title, detail || 'No details.');
  app.exit(1);
}
