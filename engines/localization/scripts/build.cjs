'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');
const { readAsar, writeAsar, sha } = require('../src/asar.cjs');
const { patchNativeSource, nativeManifest } = require('../src/native-localize.cjs');
const { loadProfiles, patchHashes } = require('../src/profiles.cjs');
const ROOT = path.resolve(__dirname, '..');
const RELEASE_ROOT = path.resolve(ROOT, '../../artifacts/localization');

function defaultOutputDirectory(version, patchVersion = require('../package.json').version) {
  const safeVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
  if (!safeVersion.test(version) || !safeVersion.test(patchVersion)) throw Error('构建版本号无效。');
  return path.join(RELEASE_ROOT, version, patchVersion);
}

function publishArtifact(outputDirectory, output, manifest) {
  fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
  const lock = outputDirectory + '.build.lock';
  const fd = fs.openSync(lock, 'wx');
  try {
    const archivePath = path.join(outputDirectory, 'app.asar');
    const manifestPath = path.join(outputDirectory, 'manifest.json');
    const hasArchive = fs.existsSync(archivePath), hasManifest = fs.existsSync(manifestPath);
    if (hasArchive || hasManifest) {
      let previous;
      try { previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
      if (!hasArchive || !hasManifest || !isDeepStrictEqual(previous, manifest) || !fs.readFileSync(archivePath).equals(output)) {
        throw Error('输出目录已有不同或不完整的补丁产物，拒绝覆盖；请使用新的补丁版本或输出目录。');
      }
      return;
    }
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(archivePath, output, { flag: 'wx' });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

function buildPatch({ appDir, outputDirectory, backupPath, profile }) {
  const installedPath = path.join(appDir, 'resources', 'app.asar');
  let input = fs.readFileSync(installedPath);
  const installedArchive = readAsar(input);
  const installedPackage = JSON.parse(installedArchive.files.get('package.json')?.data.toString() || '{}');
  if (installedPackage.name !== 'antigravity') throw Error('所选目录不是受支持的 Antigravity 应用。');
  const candidates = (profile ? [profile] : loadProfiles()).filter(candidate => candidate.version === installedPackage.version);
  if (!candidates.length) throw Error('当前 Antigravity 版本尚未适配，没有修改应用文件。');
  const patchVersion = require('../package.json').version;
  outputDirectory = path.resolve(outputDirectory || defaultOutputDirectory(installedPackage.version, patchVersion));
  let previousManifest;
  try { previousManifest = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'manifest.json'), 'utf8')); } catch {}
  const recognizedHashes = candidate => [...new Set([
    candidate.originalSha256, ...patchHashes(candidate),
    ...(previousManifest?.version === candidate.version && previousManifest.originalSha256 === candidate.originalSha256
      ? [previousManifest.patchedSha256, ...(previousManifest.acceptedPatchedSha256 || [])] : [])
  ])].filter(value => /^[a-f0-9]{64}$/.test(value));
  const installedHash = sha(input);
  profile = candidates.find(candidate => recognizedHashes(candidate).includes(installedHash));
  if (!profile) throw Error('当前 Antigravity 文件指纹尚未验证，没有修改应用文件。');
  if (profile.languageServerSha256) {
    const languageServer = path.join(appDir, 'resources/bin/language_server.exe');
    if (!fs.existsSync(languageServer) || sha(fs.readFileSync(languageServer)) !== profile.languageServerSha256) {
      throw Error('当前 Antigravity 语言服务文件指纹尚未验证，没有修改应用文件。');
    }
  }
  const priorHashes = recognizedHashes(profile).filter(value => value !== profile.originalSha256);
  if (priorHashes.includes(sha(input))) input = fs.readFileSync(backupPath || installedPath + '.zh-CN-original');
  if (sha(input) !== profile.originalSha256) throw Error('当前 Antigravity 文件指纹尚未验证，没有修改应用文件。');
  const archive = readAsar(input), replacements = new Map(), changes = [];
  const pkg = JSON.parse(archive.files.get('package.json').data);
  if (pkg.name !== 'antigravity' || pkg.version !== profile.version) throw Error('原始备份与应用身份或版本不匹配。');
  const baselineModules = {};
  for (const file of Object.keys(nativeManifest)) {
    const member = archive.files.get(file);
    if (!member) throw Error('缺少预期的应用文件：' + file);
    baselineModules[file] = sha(member.data);
    const result = patchNativeSource(file, member.data.toString('utf8'));
    if (result.replacements.length !== nativeManifest[file].length) throw Error('原生文案锚点不匹配：' + file);
    const localePath = file.includes('/ideInstall/') ? '../locale.cjs' : './locale.cjs';
    const windowApi = profile.hubWindowApi ? '() => require("./utils.js")' : '';
    const setup = file === 'dist/main.js' ? 'require("./locale.cjs").setup(' + windowApi + ');\n' : '';
    const conditional = '"use strict";\n' + setup + 'if (require(' + JSON.stringify(localePath) + ').startupLanguage === "zh-CN") {\n' + result.source + '\n} else {\n' + member.data.toString('utf8') + '\n}\n';
    new vm.Script(conditional, { filename: file });
    replacements.set(file, Buffer.from(conditional));
    changes.push(...result.replacements);
  }
  const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.json'), 'utf8'));
  const rendererConfig = {
    patchVersion,
    remote: JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.remote.json'), 'utf8')),
    rules: JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.dynamic.json'), 'utf8'))
  };
  for (const rule of rendererConfig.rules) {
    if (!['ui', 'settings', 'title-menu', 'attribute', 'marketplace'].includes(rule.scope) || !rule.pattern.startsWith('^') || !rule.pattern.endsWith('$') || !rule.replacement) throw Error('动态翻译规则缺少有效边界。');
    new RegExp(rule.pattern);
  }
  for (const value of Object.values(rendererConfig.remote)) if (typeof value !== 'string' || !value) throw Error('远程翻译词条无效。');
  for (const [key, value] of Object.entries(dictionary)) if (!key || typeof value !== 'string' || !value) throw Error('翻译词条无效。');
  const { installChineseUI } = require('../src/renderer-localize.js');
  const preloadBytes = archive.files.get('dist/preload.js')?.data;
  if (!preloadBytes) throw Error('缺少预期的应用文件：dist/preload.js');
  baselineModules['dist/preload.js'] = sha(preloadBytes);
  const preload = preloadBytes.toString('utf8');
  const bridge = `{getLanguage:()=>electron_1.ipcRenderer.invoke('antigravity-locale:get'),setLanguage:language=>electron_1.ipcRenderer.invoke('antigravity-locale:set',language),onLanguageChanged:callback=>electron_1.ipcRenderer.on('antigravity-locale:changed',(_event,language)=>callback(language))}`;
  const patchedPreload = preload + '\n// Antigravity Chinese UI patch\n(' + installChineseUI.toString() + ')(' + JSON.stringify(dictionary) + ',' + bridge + ',' + JSON.stringify(rendererConfig) + ');\n';
  new vm.Script(patchedPreload);
  replacements.set('dist/preload.js', Buffer.from(patchedPreload));
  // 元数据属于产物身份，使同一应用的不同补丁版本也具有独立文件指纹。
  const identity = {
    patchVersion, appVersion: pkg.version, originalSha256: profile.originalSha256,
    ...(profile.languageServerSha256 ? { languageServerSha256: profile.languageServerSha256 } : {})
  };
  const localeBytes = Buffer.concat([
    fs.readFileSync(path.join(ROOT, 'src/locale-main.cjs')),
    Buffer.from('\n// Antigravity localization build: ' + JSON.stringify(identity) + '\n')
  ]);
  new vm.Script(localeBytes.toString('utf8'));
  const localeEntry = { size: localeBytes.length, offset: '0', integrity: { algorithm: 'SHA256', hash: sha(localeBytes), blockSize: 4194304, blocks: [sha(localeBytes)] } };
  archive.header.files.dist.files['locale.cjs'] = localeEntry;
  archive.files.set('dist/locale.cjs', { entry: localeEntry, data: localeBytes });
  replacements.set('dist/locale.cjs', localeBytes);
  const output = writeAsar(archive, replacements), check = readAsar(output);
  for (const [file, original] of archive.files) {
    const expected = replacements.get(file) ?? original.data;
    if (!check.files.get(file).data.equals(expected)) throw Error('补丁归档往返校验失败：' + file);
  }
  const manifest = {
    product: pkg.productName, version: pkg.version, patchVersion,
    originalSha256: sha(input), patchedSha256: sha(output),
    ...(profile.languageServerSha256 ? { languageServerSha256: profile.languageServerSha256 } : {}),
    acceptedPatchedSha256: patchHashes(profile).filter(value => value !== sha(output)),
    dictionaryEntries: Object.keys(dictionary).length,
    remoteDictionaryEntries: Object.keys(rendererConfig.remote).length,
    dynamicRules: rendererConfig.rules.length, changedFiles: [...replacements.keys()],
    nativeChanges: changes, baselineModules
  };
  publishArtifact(outputDirectory, output, manifest);
  return manifest;
}

module.exports = { buildPatch, defaultOutputDirectory };
if (require.main === module) {
  const { defaultApplicationDirectory } = require('../src/paths.cjs');
  const manifest = buildPatch({ appDir: process.argv[2] || defaultApplicationDirectory() });
  console.log(JSON.stringify({ version: manifest.version, patchVersion: manifest.patchVersion, dictionaryEntries: manifest.dictionaryEntries, output: defaultOutputDirectory(manifest.version, manifest.patchVersion) }));
}
