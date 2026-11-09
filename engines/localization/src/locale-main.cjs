'use strict';
const { app, ipcMain, BrowserWindow, Menu, MenuItem } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const configPath = path.join(app.getPath('userData'), 'ui-language.json');
function valid(language) { return language === 'zh-CN' || language === 'en'; }
function getLanguage() {
  try {
    const language = JSON.parse(fs.readFileSync(configPath, 'utf8')).language;
    return valid(language) ? language : 'zh-CN';
  } catch { return 'zh-CN'; }
}
// All native modules use one startup snapshot, even if the setting changes later.
const startupLanguage = getLanguage();
let installed = false;
let originalSetMenu;
let getHubWindowApi;
function refreshMenu(menu = Menu.getApplicationMenu()) {
  if (!menu) return;
  let entry = menu.items.find(item => item.id === 'antigravity-language');
  if (!entry) {
    entry = new MenuItem({ id: 'antigravity-language', label: 'Language / 语言', submenu: [
      { id: 'antigravity-language-zh', label: '简体中文', type: 'radio', checked: getLanguage() === 'zh-CN', click: () => setLanguage('zh-CN') },
      { id: 'antigravity-language-en', label: 'English', type: 'radio', checked: getLanguage() === 'en', click: () => setLanguage('en') },
      { type: 'separator' },
      { label: 'Native menus apply after restart / 原生菜单重启后生效', enabled: false }
    ] });
    menu.append(entry);
  }
  for (const item of entry.submenu.items) {
    if (item.id === 'antigravity-language-zh') item.checked = getLanguage() === 'zh-CN';
    if (item.id === 'antigravity-language-en') item.checked = getLanguage() === 'en';
  }
  originalSetMenu(menu);
}
function setLanguage(language) {
  if (!valid(language)) throw Error('Unsupported UI language');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporary = configPath + '.new';
  fs.writeFileSync(temporary, JSON.stringify({ language }, null, 2));
  try { fs.renameSync(temporary, configPath); }
  catch (error) { fs.unlinkSync(temporary); throw error; }
  const hub = getHubWindowApi?.();
  const receivers = hub ? hub.getHubWindows().map(window => hub.getHubWebContents(window)) : BrowserWindow.getAllWindows().map(window => window.webContents);
  for (const contents of new Set(receivers)) {
    if (contents && !contents.isDestroyed?.()) contents.send('antigravity-locale:changed', language);
  }
  refreshMenu();
  return language;
}
function authorize(event) {
  const hub = getHubWindowApi?.();
  const window = hub ? hub.resolveHubWindowFromWebContents(event.sender) : BrowserWindow.fromWebContents(event.sender);
  // 浏览器访客也可能关联到同一宿主；语言设置仅信任宿主的主界面内容。
  if (!window || (hub && hub.getHubWebContents(window) !== event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw Error('Language setting is only available to the main application window');
  }
  const url = new URL(event.senderFrame.url);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Invalid language setting origin');
}
function setup(windowApi) {
  if (installed) return;
  installed = true;
  getHubWindowApi = windowApi;
  ipcMain.handle('antigravity-locale:get', event => { authorize(event); return getLanguage(); });
  ipcMain.handle('antigravity-locale:set', (event, language) => { authorize(event); return setLanguage(language); });
  originalSetMenu = Menu.setApplicationMenu.bind(Menu);
  Menu.setApplicationMenu = menu => { if (menu) refreshMenu(menu); else originalSetMenu(null); };
  app.whenReady().then(() => setImmediate(() => refreshMenu()));
}
module.exports = { startupLanguage, getLanguage, setLanguage, setup };
