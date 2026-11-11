'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../../src/internal/localization/payload.json');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const { nativeManifest } = require(path.join(root, 'src/native-localize.cjs'));
const { installChineseUI } = require(path.join(root, 'src/renderer-localize.js'));
const dictionary = read('translations/zh-CN.json');
const config = {
  patchVersion: read('package.json').version,
  remote: read('translations/zh-CN.remote.json'),
  rules: read('translations/zh-CN.dynamic.json'),
};
const bridge = "{getLanguage:()=>electron_1.ipcRenderer.invoke('antigravity-locale:get'),setLanguage:language=>electron_1.ipcRenderer.invoke('antigravity-locale:set',language),onLanguageChanged:callback=>electron_1.ipcRenderer.on('antigravity-locale:changed',(_event,language)=>callback(language))}";
const preload = '\n// Antigravity Chinese UI patch\n(' + installChineseUI.toString() + ')(' + JSON.stringify(dictionary) + ',' + bridge + ',' + JSON.stringify(config) + ');\n';
new vm.Script(preload);
new vm.Script(fs.readFileSync(path.join(root, 'src/locale-main.cjs'), 'utf8'));
for (const rule of config.rules) {
  if (!['ui', 'settings', 'title-menu', 'attribute', 'marketplace'].includes(rule.scope) || !rule.pattern.startsWith('^') || !rule.pattern.endsWith('$') || !rule.replacement) throw Error('动态翻译规则缺少有效边界。');
  new RegExp(rule.pattern);
}
for (const entry of [dictionary, config.remote]) {
  for (const [key, value] of Object.entries(entry)) if (!key || typeof value !== 'string' || !value) throw Error('翻译词条无效。');
}
const content = JSON.stringify({ patchVersion: config.patchVersion, nativeManifest, preload }) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== content) throw Error('Go 汉化资源已过期，请重新生成。');
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content);
}
