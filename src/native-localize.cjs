'use strict';

// Only these verified display contexts are changed. Protocol names, action keys,
// URLs, paths, logged diagnostics, and user-provided labels remain untouched.
const nativeManifest = {};
function define(file, pairs) {
  nativeManifest[`dist/${file}`] = pairs.map(([from, to]) => Object.freeze({ from, to }));
}

const menuLabels = {
  File: '文件', Edit: '编辑', View: '视图', Window: '窗口', Help: '帮助',
  Undo: '撤销', Redo: '重做', Cut: '剪切', Copy: '复制', Paste: '粘贴',
  'Paste and Match Style': '粘贴并匹配样式', 'Select All': '全选', Delete: '删除',
  Reload: '重新加载', 'Force Reload': '强制重新加载',
  'Toggle Developer Tools': '切换开发者工具', 'Actual Size': '实际大小',
  'Zoom In': '放大', 'Zoom Out': '缩小', 'Toggle Full Screen': '切换全屏',
  Minimize: '最小化', Zoom: '缩放', 'Bring All to Front': '将所有窗口前置',
  Close: '关闭', Quit: '退出', Services: '服务', 'Show All': '显示全部',
};
const menuHelper = `
// Antigravity Chinese localization: preserve updater labels used as action keys.
function localizeDisplayMenu(menuInstance) {
    const translations = ${JSON.stringify(menuLabels)};
    for (const item of menuInstance.items || []) {
        if (item.id !== 'check-for-updates') {
            const display = translations[item.label];
            if (display) item.label = display;
            else if (item.role?.toLowerCase() === 'about') item.label = '关于 ' + electron_1.app.getName();
            else if (item.role?.toLowerCase() === 'hide') item.label = '隐藏 ' + electron_1.app.getName();
            else if (item.role?.toLowerCase() === 'hideothers') item.label = '隐藏其他应用';
            else if (item.role?.toLowerCase() === 'quit') item.label = '退出';
        }
        if (item.submenu) localizeDisplayMenu(item.submenu);
    }
}
`;

define('menu.js', [
  ["label: 'New Window'", "label: '新建窗口'"],
  ["label: 'Docs'", "label: '文档'"],
  ["label: 'Connect to WSL'", "label: '连接到 WSL'"],
  ["label: 'Reopen Locally'", "label: '在本地重新打开'"],
  ['const electron_1 = require("electron");', 'const electron_1 = require("electron");' + menuHelper],
  ['electron_1.Menu.setApplicationMenu(menu);', 'localizeDisplayMenu(menu);\n    electron_1.Menu.setApplicationMenu(menu);'],
  ['item.label === submenuLabel', "(item.label === submenuLabel || item.label === ({ File: '文件', Help: '帮助' })[submenuLabel])"],
]);
define('main.js', [
  ["showErrorBox('Binary not found', msg)", "showErrorBox('未找到程序文件', msg)"],
  ['const msg = `language_server binary not found at:\\n${languageServer_1.LS_BINARY}\\n\\nPlease build set a valid location.`;', 'const msg = `未在以下位置找到 language_server 程序：\\n${languageServer_1.LS_BINARY}\\n\\n请构建程序并设置有效的位置。`;'],
  ["title: 'WSL distro not found'", "title: '未找到 WSL 发行版'"],
  ['message: `The WSL distro "${WSL_DISTRO}" is no longer installed.`', 'message: `WSL 发行版“${WSL_DISTRO}”已不再安装。`'],
  ["detail: 'Antigravity opened on Windows instead.'", "detail: 'Antigravity 已在 Windows 中打开。'"],
  ["showErrorBox('WSL setup failed', msg)", "showErrorBox('WSL 设置失败', msg)"],
  ['const msg = `Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`;', 'const msg = `无法将服务程序安装到 WSL 发行版“${WSL_DISTRO}”：\\n${err.message}`;'],
  ["showErrorBox('Startup failed', msg)", "showErrorBox('启动失败', msg)"],
  ["label: 'New Window'", "label: '新建窗口'"],
  ["label: 'No agents running'", "label: '没有正在运行的智能体'"],
  ['label: `Open ${electron_1.app.getName()}`', 'label: `打开 ${electron_1.app.getName()}`'],
  ["label: 'Quit'", "label: '退出'"],
  ["buttons: ['Cancel', 'Quit']", "buttons: ['取消', '退出']"],
  ["title: 'Confirm Quit'", "title: '确认退出'"],
  ["message: 'Are you sure you want to quit?'", "message: '确定要退出吗？'"],
  ["detail: 'There may be agents or background tasks running.'", "detail: '可能仍有智能体或后台任务正在运行。'"],
]);
define('tray.js', [[
  "(count > 0 ? `${count}` : 'No') +\n                    ' agent' +\n                    (count === 1 ? '' : 's') +\n                    ' running'",
  "(count > 0 ? `${count} 个智能体正在运行` : '没有正在运行的智能体')",
]]);
define('ipcHandlers.js', [
  ["showErrorBox('Cannot open folder', t.error)", "showErrorBox('无法打开文件夹', t.error)"],
  ["message: 'Folder is on the Windows filesystem'", "message: '文件夹位于 Windows 文件系统中'"],
  ["title: 'Open workspace'", "title: '打开工作区'"],
  ["title: 'Open workspaces'", "title: '打开多个工作区'"],
]);
define('updater.js', [
  ["title: 'Check for Updates'", "title: '检查更新'"],
  ["message: 'No updates available'", "message: '当前没有可用更新'"],
  ["buttons: ['OK']", "buttons: ['确定']"],
]);
define('wsl.js', [
  ['error: `This folder belongs to the WSL distro "${unc[1]}", but this window is connected to "${distro}".`', 'error: `此文件夹属于 WSL 发行版“${unc[1]}”，但此窗口连接的是“${distro}”。`'],
  ["warning: 'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.'", "warning: '此文件夹位于 Windows 文件系统中。从 WSL（通过 /mnt）访问可能较慢。为获得最佳性能，请将项目保存在 WSL 文件系统中。'"],
  ['error: `This location cannot be opened in WSL: ${winPath}`', 'error: `无法在 WSL 中打开此位置：${winPath}`'],
  ["onStatus?.('Downloading the Antigravity binary\\u2026')", "onStatus?.('正在下载 Antigravity 程序…')"],
  ['onStatus?.(`Installing into ${distro}\\u2026`)', 'onStatus?.(`正在安装到 ${distro}…`)'],
]);
define('provisionSplash.js', [
  ['<div>Setting up WSL: ${escapeHtml(distro)}</div>', '<div>正在设置 WSL：${escapeHtml(distro)}</div>'],
]);
define('ideInstall/wizardHtml.js', [
  ['<html lang="en">', '<html lang="zh-CN">'],
  ['<title>Welcome to Antigravity</title>', '<title>欢迎使用 Antigravity</title>'],
  ['>Setting up…</div>', '>正在设置…</div>'],
  ['alt="Antigravity Icon"', 'alt="Antigravity 图标"'],
  ['<h1>Welcome to the new Antigravity!</h1>', '<h1>欢迎使用全新的 Antigravity！</h1>'],
  ["<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>", '<p>Antigravity 经过重新设计，以智能体为核心，并提供全新功能。如果您仍然需要代码编辑器，可以下载独立的 <b>Antigravity IDE</b> 应用。</p>'],
  ['<span>Download the Antigravity IDE</span>', '<span>下载 Antigravity IDE</span>'],
  ['>Explore the new Antigravity</button>', '>探索全新的 Antigravity</button>'],
]);
Object.values(nativeManifest).forEach(Object.freeze);
Object.freeze(nativeManifest);

/** Apply exact, file-scoped source anchors; return auditable replacement counts. */
function patchNativeSource(file, source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const normalized = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  const entries = nativeManifest[normalized] || [];
  if (entries.length === 0) return { source, replacements: [] };
  // Generated JS in the archive uses LF. Preserve CRLF for callers with Windows copies.
  const crlf = source.includes('\r\n');
  let result = source.replace(/\r\n/g, '\n');
  const replacements = [];
  for (const { from, to } of entries) {
    // Some code insertions retain their original anchor. Never insert twice.
    if (to.includes(from) && result.includes(to)) continue;
    const count = result.split(from).length - 1;
    if (!count) continue;
    result = result.split(from).join(to);
    replacements.push({ path: normalized, from, to, count });
  }
  if (crlf) result = result.replace(/\n/g, '\r\n');
  return { source: result, replacements };
}

module.exports = { patchNativeSource, nativeManifest };
