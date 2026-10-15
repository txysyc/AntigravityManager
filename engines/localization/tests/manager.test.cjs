'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { writeAsar, sha } = require('../src/asar.cjs');
const { inspect, mutate, atomicReplace } = require('../src/manager.cjs');
function fixture(version = '2.23.1') {
  const base = path.resolve(__dirname, '../../../artifacts/tests');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'antigravity-manager-'));
  const app = path.join(directory, 'App with spaces'), data = path.join(directory, 'manager data');
  fs.mkdirSync(path.join(app, 'resources'), { recursive: true });
  const bytes = Buffer.from(JSON.stringify({ name: 'antigravity', version }));
  const entry = { size: bytes.length, offset: '0' };
  const file = path.join(app, 'resources/app.asar');
  fs.writeFileSync(file, writeAsar({ header: { files: { 'package.json': entry } }, files: new Map([['package.json', { entry, data: bytes }]]) }));
  return { directory, app, data, file };
}
test('unknown version or unknown fingerprint cannot be patched, even with the supported version number', () => {
  for (const version of ['2.23.1', '2.23.0']) {
    const f = fixture(version);
    try {
      const before = fs.readFileSync(f.file);
      const snapshot = inspect(f.app, f.data);
      assert.equal(snapshot.status, 'unsupported'); assert.equal(snapshot.canInstall, false);
      assert.throws(() => mutate('install', f.app, f.data, () => {}), /尚未适配/);
      assert.deepEqual(fs.readFileSync(f.file), before);
      assert.equal(fs.existsSync(path.join(f.data, 'localization.lock')), false);
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  }
});
test('replacement refuses concurrent application updates and removes its temporary file', () => {
  const f = fixture();
  try {
    const before = fs.readFileSync(f.file), expected = sha(before);
    fs.appendFileSync(f.file, 'updated');
    assert.throws(() => atomicReplace(f.file, Buffer.from('patch'), expected), /发生变化/);
    assert.equal(fs.readFileSync(f.file).subarray(-7).toString(), 'updated');
    assert.equal(fs.existsSync(f.file + '.zh-manager-new'), false);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('restore rejects damaged backups and keeps a known patch unchanged', () => {
  const f = fixture();
  try {
    const patch = fs.readFileSync(path.resolve(__dirname, '../../../artifacts/localization/app.asar'));
    fs.writeFileSync(f.file, patch);
    fs.writeFileSync(f.file + '.zh-CN-original', 'invalid backup');
    assert.equal(inspect(f.app, f.data).canRestore, false);
    assert.throws(() => mutate('restore', f.app, f.data, () => {}), /原始备份/);
    assert.deepEqual(fs.readFileSync(f.file), patch);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('verified release installs, survives repeat installation, and restores from external versioned backup', () => {
  const f = fixture();
  try {
    const original = fs.readFileSync(path.resolve(__dirname, '../../../artifacts/fixtures/app.asar'));
    fs.writeFileSync(f.file, original);
    assert.equal(inspect(f.app, f.data).canInstall, true);
    const installed = mutate('install', f.app, f.data, () => {});
    assert.equal(installed.status, 'patched'); assert.equal(installed.canRestore, true);
    assert.equal(fs.existsSync(f.file + '.zh-CN-original'), false);
    const patched = fs.readFileSync(f.file);
    mutate('install', f.app, f.data, () => {});
    assert.deepEqual(fs.readFileSync(f.file), patched);
    assert.equal(mutate('restore', f.app, f.data, () => {}).status, 'unpatched');
    assert.deepEqual(fs.readFileSync(f.file), original);
    const profile = require('../profiles/2.23.0.json');
    assert.equal(sha(fs.readFileSync(path.join(f.data, 'backups/localization', profile.version, profile.originalSha256, 'app.asar'))), profile.originalSha256);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
