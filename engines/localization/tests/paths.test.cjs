'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { defaultDataDirectory } = require('../src/paths.cjs');
test('CLI default data directory follows manager location and rejects missing migrated data', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-paths-'));
  try {
    const bootstrap = path.join(temporary, 'AntigravityManager');
    assert.equal(defaultDataDirectory(temporary), bootstrap);
    fs.mkdirSync(bootstrap);
    const selected = path.join(temporary, 'selected data'); fs.mkdirSync(selected);
    fs.writeFileSync(path.join(bootstrap, 'location.json'), JSON.stringify({ DataDirectory: selected }));
    assert.equal(defaultDataDirectory(temporary), selected);
    fs.rmdirSync(selected);
    assert.throws(() => defaultDataDirectory(temporary), /数据目录不可用/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
