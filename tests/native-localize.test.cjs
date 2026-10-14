'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { patchNativeSource, nativeManifest } = require('../src/native-localize.cjs');
const originals = path.join(__dirname, '..', 'analysis', 'original');

test('verified native fixtures retain valid JavaScript and all display anchors match', () => {
  for (const [file, anchors] of Object.entries(nativeManifest)) {
    if (file.includes('/ideInstall/')) continue;
    const source = fs.readFileSync(path.join(originals, path.basename(file)), 'utf8');
    const patched = patchNativeSource(file, source);
    assert.equal(patched.replacements.length, anchors.length, file);
    new vm.Script(patched.source, { filename: file });
    assert.deepEqual(patchNativeSource(file, patched.source), { source: patched.source, replacements: [] });
  }
});

test('updater action keys, menu lookup names, and renderer/user context labels survive', () => {
  const updater = patchNativeSource('dist/updater.js', fs.readFileSync(path.join(originals, 'updater.js'), 'utf8')).source;
  assert.ok(updater.includes('MenuUpdateStep["CheckForUpdates"] = "Check for Updates"'));
  assert.ok(updater.includes('[MenuUpdateStep.RestartToUpdate]: () => quitAndInstall()'));
  const context = patchNativeSource('dist/ipcHandlers.js', fs.readFileSync(path.join(originals, 'ipcHandlers.js'), 'utf8')).source;
  assert.ok(context.includes("label: item.label ?? ''"));
  assert.ok(context.includes("onSelect(item.id)"));
  assert.ok(context.includes("ipcMain.handle('dialog:open-workspace'"));
});

test('translated File menu still accepts delayed WSL items and menu callbacks work', async () => {
  const source = fs.readFileSync(path.join(originals, 'menu.js'), 'utf8');
  const submenu = () => ({ items: [], insert(i, item) { this.items.splice(i, 0, item); } });
  const file = { label: 'File', submenu: submenu() };
  const help = { label: 'Help', submenu: submenu() };
  const updater = { label: 'Check for Updates', id: 'check-for-updates', click() {} };
  const appMenu = { items: [file, help, updater] };
  let opens = 0;
  const stubs = {
    electron: { Menu: { getApplicationMenu: () => appMenu, setApplicationMenu() {} }, MenuItem: class { constructor(value) { Object.assign(this, value); } }, app: { getName: () => 'Antigravity' }, shell: {} },
    './utils': { isMacOS: () => false, createWindow: () => opens++ },
    './updater': {},
    './wsl': { isWslAvailable: () => true, listWslDistros: async () => [{ name: 'Ubuntu' }], getActiveWslDistro: () => 'Ubuntu' },
    path: require('node:path'),
  };
  const exports = {};
  vm.runInNewContext(patchNativeSource('dist/menu.js', source).source, { exports, require: name => stubs[name], console, process });
  exports.setupApplicationMenu('https://localhost');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(file.label, '文件');
  assert.equal(help.label, '帮助');
  assert.deepEqual(Array.from(file.submenu.items, item => item.label), ['新建窗口', '连接到 WSL', '在本地重新打开']);
  file.submenu.items[0].click();
  assert.equal(opens, 1);
  assert.equal(file.submenu.items[1].submenu[0].label, 'Ubuntu');
  assert.equal(updater.label, 'Check for Updates');
});

test('unknown files are byte-identical and existing newline style is preserved', () => {
  const source = "const label = 'New Window';\r\n";
  assert.deepEqual(patchNativeSource('other.js', source), { source, replacements: [] });
  const patched = patchNativeSource('dist/main.js', "label: 'New Window'\r\n").source;
  assert.equal(patched, "label: '新建窗口'\r\n");
});
