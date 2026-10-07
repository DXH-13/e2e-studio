// Chạy trong renderer (sandbox). Đánh dấu "đang ở app desktop" và cầu nối cho 3 nút cửa sổ tự vẽ.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  shell: 'electron',
  windowControl: (action) => ipcRenderer.send('window-control', action),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_event, state) => cb(state)),
});

window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('desktop'));
