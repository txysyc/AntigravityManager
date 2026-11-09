'use strict';
// 仅生成独立运行样本，阻止 Electron 测试副本接管系统协议关联。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readAsar, writeAsar, sha } = require('../../engines/localization/src/asar.cjs');

const root = path.resolve(__dirname, '../..');
function prepareRuntimeArchive(input, output) {
  const resolved = path.resolve(output);
  const relative = path.relative(root, resolved);
  if (!/^(artifacts|output)[\\/]/.test(relative)) throw Error('运行样本只能写入工作区隔离目录。');
  const realParent = path.relative(fs.realpathSync(root), fs.realpathSync(path.dirname(resolved)));
  if (!/^(artifacts|output)(?:[\\/]|$)/.test(realParent)) throw Error('运行样本目录不能指向工作区之外。');
  const bytes = fs.readFileSync(input);
  const archive = readAsar(bytes);
  const main = archive.files.get('dist/main.js')?.data.toString('utf8');
  const registration = /electron_1\.app\.setAsDefaultProtocolClient\(PROTOCOL(?:, \.\.\.protocolClientArgs)?\);/g;
  if (!main || [...main.matchAll(registration)].length !== 2) throw Error('未匹配中英文分支的协议注册调用，不能安全启动隔离样本。');
  const source = main.replace(registration, 'void 0; /* isolated runtime: preserve protocol association */');
  new vm.Script(source, { filename: 'dist/main.js' });
  const runtime = writeAsar(archive, new Map([['dist/main.js', Buffer.from(source)]]));
  fs.writeFileSync(resolved, runtime, { flag: 'wx' });
  return { candidateSha256: sha(bytes), runtimeSha256: sha(runtime), output: resolved };
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('用法：node tools/verification/prepare-runtime-asar.cjs <候选 ASAR> <隔离输出 ASAR>');
  console.log(JSON.stringify(prepareRuntimeArchive(input, output)));
}
