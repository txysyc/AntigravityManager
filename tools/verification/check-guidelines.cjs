'use strict';
// 只检查可机械验证的约定，规范是否符合需求仍需人工或协作者审查。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
let checked = 0;
function check(condition, message) {
  checked++;
  if (!condition) failures.push(message);
}
function files(directory, extension) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return ['bin', 'obj'].includes(entry.name) ? [] : files(file, extension);
    return file.endsWith(extension) ? [file] : [];
  });
}
const documents = ['AGENTS.md', 'README.md', 'docs/architecture.md', 'docs/development.md', 'docs/modules/localization.md', ...files('spec', '.md')];
for (const file of documents) {
  const source = read(file);
  check(source.endsWith('\n') && !source.includes('\r'), `${file} 应使用 LF 并保留末尾换行`);
  const prose = source.replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][\w+.-]*:|#)/i.test(href)) continue;
    const target = path.resolve(root, path.dirname(file), decodeURIComponent(href.split('#')[0]));
    check(fs.existsSync(target), `${file} 的链接不存在：${href}`);
  }
}
const manager = JSON.parse(read('package.json'));
const configured = read('Directory.Build.props').match(/<Version>([^<]+)<\/Version>/)?.[1];
check(manager.version === configured, '管理器的 package.json 与 Directory.Build.props 版本不一致');
for (const file of files('src/AntigravityManager.Desktop', '.xaml')) {
  for (const match of read(file).matchAll(/\b(?:Text|Content|Header|Title|ToolTip)="([A-Za-z][A-Za-z0-9 .&/+\-]{2,})"/g)) {
    check(/^(?:Antigravity(?: Manager)?|MANAGER)$/.test(match[1]), `${file} 存在待核对的英文界面文案：${match[1]}`);
  }
}
for (const file of files('src/AntigravityManager.Desktop', '.cs')) {
  check(!/(?:publishStatus|SetStatus|MessageBox\.Show)\(error\.Message\b/.test(read(file)), `${file} 直接展示异常，缺少中文说明`);
}
for (const match of read('scripts/publish.ps1').matchAll(/\bthrow '([^']+)'/g)) {
  check(/[\u3400-\u9fff]/.test(match[1]), `发布脚本存在待核对的英文提示：${match[1]}`);
}
if (failures.length) {
  failures.forEach(message => console.error('未通过：' + message));
  process.exitCode = 1;
} else {
  console.log(`规范检查通过：${checked} 项（链接、文档换行、版本与部分中文提示）。`);
  console.log('仍需按 AGENTS.md 审查语义、测试范围、模块边界和实际界面。');
}
