'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPatch, defaultOutputDirectory } = require('../scripts/build.cjs');
const { loadProfiles, compareVersions } = require('../src/profiles.cjs');
const { readAsar, writeAsar, sha } = require('../src/asar.cjs');
const oldProfile = require('../profiles/2.23.0.json');
const fixtureRoot = path.resolve(process.env.ANTIGRAVITY_FIXTURES_DIRECTORY || path.join(__dirname, '../../../artifacts/fixtures'));
const oldOriginal = path.join(fixtureRoot, 'app.asar');
const oldPatch = path.resolve(__dirname, '../../../artifacts/fixtures/2.23.0/patched-0.4.1.asar');
const testRoot = path.resolve(__dirname, '../../../artifacts/tests');

function fixture(callback) {
  fs.mkdirSync(testRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(testRoot, 'release-build-'));
  const appDir = path.join(directory, 'App 含空格'), outputDirectory = path.join(directory, 'release');
  fs.mkdirSync(path.join(appDir, 'resources'), { recursive: true });
  const file = path.join(appDir, 'resources/app.asar');
  fs.copyFileSync(oldOriginal, file);
  try { callback({ directory, appDir, outputDirectory, file }); } finally {
    assert.ok(path.resolve(directory).startsWith(testRoot + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('profile ordering follows numeric versions and release directories isolate application and patch versions', () => {
  fixture(({ directory }) => {
    const profileDirectory = path.join(directory, 'profiles');
    fs.mkdirSync(profileDirectory);
    for (const version of ['2.9.0', '2.10.0', '2.23.1', '2.23.1-beta.2', '2.23.1-beta.10']) {
      fs.writeFileSync(path.join(profileDirectory, version + '.json'), JSON.stringify({ version, originalSha256: 'a'.repeat(64) }));
    }
    assert.deepEqual(loadProfiles(profileDirectory).map(profile => profile.version), ['2.9.0', '2.10.0', '2.23.1-beta.2', '2.23.1-beta.10', '2.23.1']);
    assert.equal(compareVersions('2.23.1', '2.23.1'), 0);
    assert.notEqual(defaultOutputDirectory('2.23.0'), defaultOutputDirectory('2.23.1'));
    assert.notEqual(defaultOutputDirectory('2.23.0', '0.4.1'), defaultOutputDirectory('2.23.0', '0.5.0'));
    assert.throws(() => defaultOutputDirectory('../outside'), /版本号/);
  });
});

test('build automatically recognizes the verified original and preserves English and untouched source bytes', () => {
  fixture(({ appDir, outputDirectory, file }) => {
    const before = fs.readFileSync(file), original = readAsar(before);
    assert.equal(sha(before), oldProfile.originalSha256);
    const manifest = buildPatch({ appDir, outputDirectory });
    const patch = fs.readFileSync(path.join(outputDirectory, 'app.asar')), archive = readAsar(patch);
    assert.equal(manifest.version, oldProfile.version);
    assert.equal(manifest.patchVersion, require('../package.json').version);
    assert.notEqual(manifest.patchedSha256, oldProfile.patchedSha256);
    assert.equal(manifest.baselineModules['dist/preload.js'], sha(original.files.get('dist/preload.js').data));
    assert.deepEqual(fs.readFileSync(file), before);
    for (const [name, member] of original.files) {
      const patched = archive.files.get(name).data;
      if (!manifest.changedFiles.includes(name)) assert.deepEqual(patched, member.data, name);
      else if (name === 'dist/preload.js') assert.ok(patched.subarray(0, member.data.length).equals(member.data));
      else assert.ok(patched.toString().endsWith('\n} else {\n' + member.data.toString() + '\n}\n'), name);
    }
    const identity = archive.files.get('dist/locale.cjs').data.toString();
    assert.ok(identity.includes('"patchVersion":"' + manifest.patchVersion + '"'));
    assert.ok(identity.includes('"originalSha256":"' + manifest.originalSha256 + '"'));
    assert.deepEqual(buildPatch({ appDir, outputDirectory }), manifest);
    assert.deepEqual(fs.readFileSync(path.join(outputDirectory, 'app.asar')), patch);
  });
});

test('unknown fingerprints fail without changing source or creating a release', () => {
  fixture(({ appDir, outputDirectory, file }) => {
    const archive = readAsar(fs.readFileSync(file));
    const packageInfo = JSON.parse(archive.files.get('package.json').data);
    const modified = writeAsar(archive, new Map([['package.json', Buffer.from(JSON.stringify({ ...packageInfo, changed: true }))]]));
    fs.writeFileSync(file, modified);
    assert.throws(() => buildPatch({ appDir, outputDirectory }), /文件指纹尚未验证/);
    assert.deepEqual(fs.readFileSync(file), modified);
    assert.equal(fs.existsSync(outputDirectory), false);
  });
});

test('known historical patches rebuild only from an intact matching original backup', () => {
  fixture(({ directory, appDir, outputDirectory, file }) => {
    const historical = fs.readFileSync(oldPatch), backupPath = path.join(directory, 'original.asar');
    assert.equal(sha(historical), oldProfile.patchedSha256);
    fs.writeFileSync(file, historical);
    fs.writeFileSync(backupPath, 'damaged');
    assert.throws(() => buildPatch({ appDir, outputDirectory, backupPath }), /文件指纹尚未验证/);
    fs.copyFileSync(oldOriginal, backupPath);
    const manifest = buildPatch({ appDir, outputDirectory, backupPath });
    assert.equal(manifest.originalSha256, oldProfile.originalSha256);
    assert.ok(manifest.acceptedPatchedSha256.includes(oldProfile.patchedSha256));
    assert.deepEqual(fs.readFileSync(file), historical);
  });
});

test('release conflicts and incomplete output cannot overwrite an existing archive or manifest', () => {
  fixture(({ directory, appDir, outputDirectory }) => {
    buildPatch({ appDir, outputDirectory });
    const manifestPath = path.join(outputDirectory, 'manifest.json');
    const archivePath = path.join(outputDirectory, 'app.asar');
    const originalManifest = fs.readFileSync(manifestPath), originalArchive = fs.readFileSync(archivePath);
    const changedManifest = JSON.stringify({ ...JSON.parse(originalManifest), patchVersion: '0.0.0' });
    fs.writeFileSync(manifestPath, changedManifest);
    assert.throws(() => buildPatch({ appDir, outputDirectory }), /拒绝覆盖/);
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), changedManifest);
    assert.deepEqual(fs.readFileSync(archivePath), originalArchive);
    fs.writeFileSync(manifestPath, originalManifest);
    fs.writeFileSync(archivePath, 'different output');
    assert.throws(() => buildPatch({ appDir, outputDirectory }), /拒绝覆盖/);
    assert.equal(fs.readFileSync(archivePath, 'utf8'), 'different output');
    assert.deepEqual(fs.readFileSync(manifestPath), originalManifest);
    const incomplete = path.join(directory, 'incomplete');
    fs.mkdirSync(incomplete);
    fs.writeFileSync(path.join(incomplete, 'app.asar'), originalArchive);
    assert.throws(() => buildPatch({ appDir, outputDirectory: incomplete }), /不完整/);
    assert.equal(fs.existsSync(path.join(incomplete, 'manifest.json')), false);
    assert.equal(fs.existsSync(outputDirectory + '.build.lock'), false);
  });
});

test('verified application releases build independently and require their matching language server', () => {
  fixture(({ directory, appDir, outputDirectory }) => {
    const profile = loadProfiles().find(candidate => candidate.version === '2.23.1');
    assert.ok(profile, '新版兼容性配置必须在独立验证后提供');
    const newerApp = path.join(directory, 'App 2.23.1');
    const newerOutput = path.join(directory, 'release-2.23.1');
    fs.mkdirSync(path.join(newerApp, 'resources/bin'), { recursive: true });
    fs.copyFileSync(path.join(fixtureRoot, '2.23.1/app.asar'), path.join(newerApp, 'resources/app.asar'));
    assert.throws(() => buildPatch({ appDir: newerApp, outputDirectory: newerOutput }), /语言服务文件指纹/);
    fs.writeFileSync(path.join(newerApp, 'resources/bin/language_server.exe'), 'unrecognized binary');
    assert.throws(() => buildPatch({ appDir: newerApp, outputDirectory: newerOutput }), /语言服务文件指纹/);
    assert.equal(fs.existsSync(newerOutput), false);
    fs.copyFileSync(path.join(fixtureRoot, '2.23.1/language_server.exe'), path.join(newerApp, 'resources/bin/language_server.exe'));
    const older = buildPatch({ appDir, outputDirectory });
    const olderBytes = fs.readFileSync(path.join(outputDirectory, 'app.asar'));
    const newer = buildPatch({ appDir: newerApp, outputDirectory: newerOutput });
    assert.equal(newer.version, '2.23.1');
    assert.equal(newer.languageServerSha256, profile.languageServerSha256);
    assert.notEqual(newer.originalSha256, older.originalSha256);
    assert.notEqual(newer.patchedSha256, older.patchedSha256);
    assert.deepEqual(fs.readFileSync(path.join(outputDirectory, 'app.asar')), olderBytes);
    assert.equal(sha(fs.readFileSync(path.join(newerApp, 'resources/app.asar'))), profile.originalSha256);
  });
});
