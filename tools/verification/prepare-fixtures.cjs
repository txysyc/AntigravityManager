'use strict';
// 仅从指纹完全匹配的原版或已知可逆补丁恢复测试资源。
const fs = require('node:fs');
const path = require('node:path');
const { readAsar, writeAsar, sha } = require('../../engines/localization/src/asar.cjs');
const profile = require('../../engines/localization/profiles/2.23.0.json');
const root = path.resolve(__dirname, '../..');
function prepare(input) {
  let original = fs.readFileSync(input);
  if (sha(original) !== profile.originalSha256) {
    if (![profile.patchedSha256, ...(profile.acceptedPatchedSha256 || [])].includes(sha(original))) throw Error('未知 ASAR 指纹，无法准备已验证的测试资源。');
    const archive = readAsar(original), replacements = new Map();
    for (const file of profile.changedFiles) {
      if (file === 'dist/locale.cjs') continue;
      let source = archive.files.get(file).data.toString();
      if (file === 'dist/preload.js') {
        const index = source.lastIndexOf('\n// Antigravity Chinese UI patch\n');
        if (index < 0) throw Error('缺少 preload 补丁识别标记。');
        source = source.slice(0, index);
      } else {
        const marker = '\n} else {\n', index = source.lastIndexOf(marker);
        if (index < 0 || !source.endsWith('\n}\n')) throw Error('缺少可恢复的原始语言分支。');
        source = source.slice(index + marker.length, -3);
      }
      replacements.set(file, Buffer.from(source));
    }
    delete archive.header.files.dist.files['locale.cjs']; archive.files.delete('dist/locale.cjs');
    original = writeAsar(archive, replacements);
  }
  if (sha(original) !== profile.originalSha256) throw Error('恢复出的原版指纹不匹配，未写入测试资源。');
  const destination = path.join(root, 'artifacts/fixtures'); fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'app.asar'), original);
  const modules = path.join(root, 'analysis/original'); fs.mkdirSync(modules, { recursive: true });
  const archive = readAsar(original);
  for (const file of profile.changedFiles.filter(f => f !== 'dist/locale.cjs'))
    fs.writeFileSync(path.join(modules, path.basename(file)), archive.files.get(file).data);
  return { originalSha256: sha(original), fixtures: destination };
}
if (require.main === module) console.log(JSON.stringify(prepare(process.argv[2] || path.join(root, 'artifacts/localization/app.asar'))));
module.exports = { prepare };
