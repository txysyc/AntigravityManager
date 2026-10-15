'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readAsar, writeAsar, sha } = require('../src/asar.cjs');
const { patchNativeSource, nativeManifest } = require('../src/native-localize.cjs');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.resolve(ROOT, '../../artifacts/localization');
function buildPatch({ appDir, outputDirectory = DEFAULT_OUTPUT, backupPath, profile = require('../profiles/2.23.0.json') }) {
const SUPPORTED_SHA = profile.originalSha256;
let previousManifest;
try { previousManifest = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'manifest.json'), 'utf8')); } catch {}
const priorHashes = [...new Set([profile.patchedSha256, ...(profile.acceptedPatchedSha256 || []), ...(previousManifest?.originalSha256 === SUPPORTED_SHA ? [previousManifest.patchedSha256, ...(previousManifest.acceptedPatchedSha256 || [])] : [])])].filter(value => /^[a-f0-9]{64}$/.test(value));
const installedPath = path.join(appDir, 'resources', 'app.asar');
let input = fs.readFileSync(installedPath);
if (priorHashes.includes(sha(input))) input = fs.readFileSync(backupPath || installedPath + '.zh-CN-original');
if (sha(input) !== SUPPORTED_SHA) throw Error('Unsupported Antigravity build. No application files changed.');
const archive = readAsar(input), replacements = new Map(), changes = [];
const pkg = JSON.parse(archive.files.get('package.json').data);
if (pkg.name !== 'antigravity' || pkg.version !== profile.version) throw Error('Wrong application');
for (const file of Object.keys(nativeManifest)) {
  const member = archive.files.get(file);
  if (!member) throw Error('Missing expected member ' + file);
  const result = patchNativeSource(file, member.data.toString('utf8'));
  if (result.replacements.length !== nativeManifest[file].length) throw Error('No native anchors matched: ' + file);
  const localePath = file.includes('/ideInstall/') ? '../locale.cjs' : './locale.cjs';
  const setup = file === 'dist/main.js' ? 'require("./locale.cjs").setup();\n' : '';
  const conditional = '"use strict";\n' + setup + 'if (require(' + JSON.stringify(localePath) + ').startupLanguage === "zh-CN") {\n' + result.source + '\n} else {\n' + member.data.toString('utf8') + '\n}\n';
  new vm.Script(conditional, { filename: file });
  replacements.set(file, Buffer.from(conditional)); changes.push(...result.replacements);
}
const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.json'), 'utf8'));
const rendererConfig = {
  remote: JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.remote.json'), 'utf8')),
  rules: JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/zh-CN.dynamic.json'), 'utf8'))
};
for (const rule of rendererConfig.rules) {
  if (!['ui','settings','title-menu','attribute','marketplace'].includes(rule.scope) || !rule.pattern.startsWith('^') || !rule.pattern.endsWith('$') || !rule.replacement) throw Error('Unbounded dynamic rule');
  new RegExp(rule.pattern);
}
for (const value of Object.values(rendererConfig.remote)) if (typeof value !== 'string' || !value) throw Error('Invalid remote translation');
for (const [key, value] of Object.entries(dictionary)) if (!key || typeof value !== 'string' || !value) throw Error('Invalid translation');
const { installChineseUI } = require('../src/renderer-localize.js');
const preload = archive.files.get('dist/preload.js').data.toString('utf8');
const bridge = `{getLanguage:()=>electron_1.ipcRenderer.invoke('antigravity-locale:get'),setLanguage:language=>electron_1.ipcRenderer.invoke('antigravity-locale:set',language),onLanguageChanged:callback=>electron_1.ipcRenderer.on('antigravity-locale:changed',(_event,language)=>callback(language))}`;
const patchedPreload = preload + '\n// Antigravity Chinese UI patch\n(' + installChineseUI.toString() + ')(' + JSON.stringify(dictionary) + ',' + bridge + ',' + JSON.stringify(rendererConfig) + ');\n';
new vm.Script(patchedPreload);
replacements.set('dist/preload.js', Buffer.from(patchedPreload));
const localeBytes = fs.readFileSync(path.join(ROOT, 'src/locale-main.cjs'));
new vm.Script(localeBytes.toString('utf8'));
const localeEntry = { size: localeBytes.length, offset: '0', integrity: { algorithm: 'SHA256', hash: sha(localeBytes), blockSize: 4194304, blocks: [sha(localeBytes)] } };
archive.header.files.dist.files['locale.cjs'] = localeEntry;
archive.files.set('dist/locale.cjs', { entry: localeEntry, data: localeBytes });
replacements.set('dist/locale.cjs', localeBytes);
const output = writeAsar(archive, replacements), check = readAsar(output);
for (const [file, original] of archive.files) {
  const expected = replacements.get(file) ?? original.data;
  if (!check.files.get(file).data.equals(expected)) throw Error('Round-trip mismatch: ' + file);
}
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'app.asar'), output);
const manifest = { product: pkg.productName, version: pkg.version, patchVersion: require('../package.json').version, originalSha256: sha(input), patchedSha256: sha(output), acceptedPatchedSha256: priorHashes.filter(value => value !== sha(output)), dictionaryEntries: Object.keys(dictionary).length, remoteDictionaryEntries: Object.keys(rendererConfig.remote).length, dynamicRules: rendererConfig.rules.length, changedFiles: [...replacements.keys()], nativeChanges: changes };
fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
return manifest;
}
module.exports = { buildPatch };
if (require.main === module) {
  const { defaultApplicationDirectory } = require('../src/paths.cjs');
  const manifest = buildPatch({ appDir: process.argv[2] || defaultApplicationDirectory() });
  console.log(JSON.stringify({ version: manifest.version, dictionaryEntries: manifest.dictionaryEntries, output: DEFAULT_OUTPUT }));
}
