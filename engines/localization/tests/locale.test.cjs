'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readAsar } = require('../src/asar.cjs');
function fixture(saved) {
  const directory = path.join(__dirname, '../../../artifacts/tests'); fs.mkdirSync(directory, { recursive: true });
  const profile = fs.mkdtempSync(path.join(directory, 'locale-'));
  if (saved) fs.writeFileSync(path.join(profile, 'ui-language.json'), JSON.stringify({ language: saved }));
  const handlers = new Map(), sent = [];
  const frame = { url: 'https://127.0.0.1:2345/' }, sender = { mainFrame: frame };
  const appMenu = { items: [{ id: 'file', label: 'File' }], append(item) { this.items.push(item); } };
  const electron = {
    app: { getPath: () => profile, whenReady: () => new Promise(() => {}) },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    BrowserWindow: { fromWebContents: value => value === sender ? {} : null, getAllWindows: () => [{ webContents: { send: (...args) => sent.push(args) } }] },
    Menu: { getApplicationMenu: () => appMenu, setApplicationMenu() {} },
    MenuItem: class { constructor(options) { Object.assign(this, options); this.submenu = { items: options.submenu }; } }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/locale-main.cjs'), 'utf8'), {
    module, require: name => name === 'electron' ? electron : require(name), setImmediate, URL
  });
  return { locale: module.exports, profile, handlers, sender, frame, sent, appMenu, electron };
}
test('language persists, broadcasts to windows, updates menu checks and keeps native startup snapshot', () => {
  const f = fixture(); f.locale.setup(); f.locale.setup();
  assert.equal(f.handlers.size, 2);
  assert.equal(f.locale.startupLanguage, 'zh-CN');
  f.electron.Menu.setApplicationMenu(f.appMenu);
  const event = { sender: f.sender, senderFrame: f.frame };
  assert.equal(f.handlers.get('antigravity-locale:set')(event, 'en'), 'en');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.profile, 'ui-language.json'))).language, 'en');
  assert.equal(f.locale.getLanguage(), 'en'); assert.equal(f.locale.startupLanguage, 'zh-CN');
  assert.deepEqual(f.sent[0], ['antigravity-locale:changed', 'en']);
  const entries = f.appMenu.items.find(item => item.id === 'antigravity-language').submenu.items;
  assert.equal(entries.find(item => item.id === 'antigravity-language-en').checked, true);
  assert.equal(entries.find(item => item.id === 'antigravity-language-zh').checked, false);
  assert.throws(() => f.locale.setLanguage('xx'), /Unsupported/);
});
test('foreign origins, guest contents and child frames cannot change language', () => {
  const f = fixture('en'); f.locale.setup(); const set = f.handlers.get('antigravity-locale:set');
  assert.equal(f.locale.startupLanguage, 'en');
  assert.throws(() => set({ sender: {}, senderFrame: f.frame }, 'zh-CN'), /main application/);
  assert.throws(() => set({ sender: f.sender, senderFrame: { url: f.frame.url } }, 'zh-CN'), /main application/);
  f.frame.url = 'https://example.com/';
  assert.throws(() => set({ sender: f.sender, senderFrame: f.frame }, 'zh-CN'), /origin/);
  assert.equal(f.locale.getLanguage(), 'en');
});
test('WebContentsView language changes use the trusted Hub content only', () => {
  const f = fixture();
  const hub = {}, guest = { mainFrame: f.frame };
  const destroyed = { isDestroyed: () => true, send: () => assert.fail('已关闭窗口不应接收语言事件') };
  const closedHub = {};
  f.sender.send = (...args) => f.sent.push(args);
  f.electron.BrowserWindow.fromWebContents = () => null;
  f.locale.setup(() => ({
    resolveHubWindowFromWebContents: contents => contents === f.sender || contents === guest ? hub : null,
    getHubWebContents: window => window === hub ? f.sender : destroyed,
    getHubWindows: () => [hub, hub, closedHub]
  }));
  const read = f.handlers.get('antigravity-locale:get');
  const set = f.handlers.get('antigravity-locale:set');
  const event = { sender: f.sender, senderFrame: f.frame };
  assert.equal(read(event), 'zh-CN');
  assert.throws(() => set({ sender: guest, senderFrame: f.frame }, 'en'), /main application/);
  assert.equal(set(event, 'en'), 'en');
  assert.equal(read(event), 'en');
  assert.deepEqual(f.sent, [['antigravity-locale:changed', 'en']]);
});
test('fixture: packaged native module selects exact original English behavior or Chinese branch', async () => {
  const archive = readAsar(fs.readFileSync(path.join(__dirname, '../../../artifacts/fixtures/2.23.0/patched-0.4.1.asar')));
  const source = archive.files.get('dist/menu.js').data.toString();
  for (const language of ['en', 'zh-CN']) {
    const submenu = () => ({ items: [], insert(i, item) { this.items.splice(i, 0, item); } });
    const file = { label: 'File', submenu: submenu() }, help = { label: 'Help', submenu: submenu() };
    const menu = { items: [file, help] }, exports = {};
    const stubs = {
      './locale.cjs': { startupLanguage: language },
      electron: { Menu: { getApplicationMenu: () => menu, setApplicationMenu() {} }, MenuItem: class { constructor(options) { Object.assign(this, options); } }, app: { getName: () => 'Antigravity' } },
      './utils': { isMacOS: () => false }, './updater': {}, './wsl': { isWslAvailable: () => false }, path
    };
    vm.runInNewContext(source, { exports, require: name => stubs[name] });
    exports.setupApplicationMenu('https://127.0.0.1');
    assert.equal(file.label, language === 'en' ? 'File' : '文件');
    assert.equal(file.submenu.items[0].label, language === 'en' ? 'New Window' : '新建窗口');
    assert.equal(help.submenu.items[0].label, language === 'en' ? 'Docs' : '文档');
  }
});
