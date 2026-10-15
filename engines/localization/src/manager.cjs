'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { readAsar, sha } = require('./asar.cjs');
const { nativeManifest, patchNativeSource } = require('./native-localize.cjs');
const { buildPatch } = require('../scripts/build.cjs');
const { engineRoot } = require('./paths.cjs');
const profiles = fs.readdirSync(path.join(engineRoot, 'profiles')).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(engineRoot, 'profiles', n))));
const hashes = profile => [profile.patchedSha256, ...(profile.acceptedPatchedSha256 || [])];
const targetPath = appDir => path.join(path.resolve(appDir), 'resources/app.asar');
const backupPath = (dataDir, profile) => path.join(dataDir, 'backups/localization', profile.version, profile.originalSha256, 'app.asar');
const recordPath = dataDir => path.join(dataDir, 'localization/installed.json');
function record(dataDir) { try { return JSON.parse(fs.readFileSync(recordPath(dataDir), 'utf8')); } catch { return null; } }
function inspect(appDir, dataDir) {
  const file = targetPath(appDir), bytes = fs.readFileSync(file), archive = readAsar(bytes);
  const pkg = JSON.parse(archive.files.get('package.json')?.data.toString() || '{}');
  if (pkg.name !== 'antigravity') throw Error('所选目录不是受支持的 Antigravity 应用。');
  const fingerprint = sha(bytes), saved = record(dataDir);
  const generated = saved?.patchedSha256 === fingerprint && saved.appDirectory === path.resolve(appDir);
  const profile = profiles.find(p => p.version === pkg.version && (p.originalSha256 === fingerprint || hashes(p).includes(fingerprint) || (generated && saved.originalSha256 === p.originalSha256)));
  const patched = !!profile && fingerprint !== profile.originalSha256;
  const canRestore = patched && [backupPath(dataDir, profile), file + '.zh-CN-original'].some(p => fs.existsSync(p) && sha(fs.readFileSync(p)) === profile.originalSha256);
  return { appDirectory: path.resolve(appDir), version: pkg.version, fingerprint, status: !profile ? 'unsupported' : patched ? 'patched' : 'unpatched', patchVersion: patched ? saved?.patchVersion || profile.patchVersion : '', baselineVersion: profiles.at(-1).version, canInstall: !!profile && (!patched || canRestore), canRestore };
}
function compare(appDir, dataDir) {
  const snapshot = inspect(appDir, dataDir), baseline = profiles.at(-1);
  const archive = readAsar(fs.readFileSync(targetPath(appDir)));
  const modules = Object.keys(baseline.baselineModules || {}).map(file => {
    const member = archive.files.get(file), expected = nativeManifest[file]?.length || 0;
    let matchedAnchors = 0;
    if (member && expected) {
      const result = patchNativeSource(file, member.data.toString());
      try { new vm.Script(result.source); matchedAnchors = result.replacements.filter(r => baseline.nativeChanges.some(expected => expected.path === file && expected.from === r.from && expected.count === r.count)).length; } catch {}
    }
    return { file, status: !member ? 'missing' : sha(member.data) === baseline.baselineModules[file] ? 'same' : 'changed', expectedAnchors: expected, matchedAnchors };
  });
  return { snapshot, report: { summary: `当前 ${snapshot.version}，参考版本 ${baseline.version}。${snapshot.status === 'unsupported' ? '尚未通过兼容性验证，安装已禁用。' : '文件指纹已匹配受支持版本。'}`, modules, limitations: ['只比较 Electron 模块指纹与原生替换锚点；锚点匹配不等于兼容性通过。', '语言服务内嵌前端、动态页面结构及用户内容保护仍需单独验证；本次不自动批准新版本。'] } };
}
function backups(dataDir) {
  const base = path.join(dataDir, 'backups/localization'), result = [];
  if (!fs.existsSync(base)) return result;
  for (const version of fs.readdirSync(base)) {
    if (!fs.statSync(path.join(base, version)).isDirectory()) continue;
    for (const digest of fs.readdirSync(path.join(base, version))) {
      if (!/^[a-f0-9]{64}$/.test(digest)) continue;
      const file = path.join(base, version, digest, 'app.asar');
      if (fs.existsSync(file)) result.push({ version, originalSha256: digest, path: file, valid: sha(fs.readFileSync(file)) === digest });
    }
  }
  return result;
}
function assertStopped(appDir) {
  if (process.platform !== 'win32') return;
  const script = "$ErrorActionPreference='Stop'; $OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $items=@(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | ForEach-Object { if (!$_.Path) { throw '无法确认应用进程路径' }; $_.Path }); ConvertTo-Json -InputObject $items -Compress";
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' });
  const paths = JSON.parse(output || '[]');
  if (paths.some(p => path.dirname(path.resolve(p)).toLowerCase() === path.resolve(appDir).toLowerCase())) throw Error('请完全退出 Antigravity 后再安装或恢复。');
}
function atomicReplace(target, bytes, expected) {
  const temporary = target + '.zh-manager-new';
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  try {
    if (sha(fs.readFileSync(target)) !== expected) throw Error('应用文件在操作期间发生变化，已停止替换。');
    fs.renameSync(temporary, target);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function mutate(operation, appDir, dataDir, checkStopped = assertStopped) {
  checkStopped(appDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const lock = path.join(dataDir, 'localization.lock'), fd = fs.openSync(lock, 'wx');
  try {
    const snapshot = inspect(appDir, dataDir), saved = record(dataDir);
    if (snapshot.status === 'unsupported') throw Error(`Antigravity ${snapshot.version} 尚未适配；没有替换应用文件。`);
    const profile = profiles.find(p => p.version === snapshot.version && (p.originalSha256 === snapshot.fingerprint || hashes(p).includes(snapshot.fingerprint) || saved?.patchedSha256 === snapshot.fingerprint && saved.originalSha256 === p.originalSha256));
    if (!profile) throw Error(`Antigravity ${snapshot.version} 尚未适配；没有替换应用文件。`);
    const target = targetPath(appDir), backup = backupPath(dataDir, profile), legacy = target + '.zh-CN-original';
    if (operation === 'restore') {
      if (snapshot.status === 'unpatched') return snapshot;
      const original = [backup, legacy].find(p => fs.existsSync(p) && sha(fs.readFileSync(p)) === profile.originalSha256);
      if (!original) throw Error('缺少与当前版本匹配的完整原始备份。');
      atomicReplace(target, fs.readFileSync(original), snapshot.fingerprint);
      return inspect(appDir, dataDir);
    }
    if (snapshot.status === 'patched' && saved?.patchedSha256 === snapshot.fingerprint && saved.patchVersion === require('../package.json').version) return snapshot;
    if (fs.existsSync(backup) && sha(fs.readFileSync(backup)) !== profile.originalSha256) throw Error('原始备份校验失败，拒绝覆盖。');
    if (!fs.existsSync(backup)) {
      const original = snapshot.status === 'unpatched' ? fs.readFileSync(target) : fs.existsSync(legacy) ? fs.readFileSync(legacy) : null;
      if (!original || sha(original) !== profile.originalSha256) throw Error('无法取得当前版本的原始文件。');
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, original, { flag: 'wx' });
    }
    const outputDirectory = path.join(dataDir, 'cache/localization', profile.version);
    const manifest = buildPatch({ appDir, outputDirectory, backupPath: backup, profile });
    const patch = fs.readFileSync(path.join(outputDirectory, 'app.asar'));
    if (sha(patch) !== manifest.patchedSha256) throw Error('补丁校验失败。');
    const state = { appDirectory: path.resolve(appDir), originalSha256: profile.originalSha256, patchedSha256: manifest.patchedSha256, patchVersion: manifest.patchVersion };
    fs.mkdirSync(path.dirname(recordPath(dataDir)), { recursive: true });
    fs.writeFileSync(recordPath(dataDir), JSON.stringify(state, null, 2));
    atomicReplace(target, patch, snapshot.fingerprint);
    return inspect(appDir, dataDir);
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
module.exports = { inspect, compare, backups, mutate, atomicReplace };
