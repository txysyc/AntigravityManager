'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { readAsar, writeAsar, sha } = require('../src/asar.cjs');
function originalBytes() {
  const data = Buffer.from('const label = "Original";');
  const entry = { size: data.length, offset: '0', integrity: { algorithm: 'SHA256', hash: sha(data), blockSize: 4194304, blocks: [sha(data)] } };
  const archive = { header: { files: { dist: { files: { 'preload.js': entry } }, node_modules: { files: { 'chrome-devtools-mcp': { files: { 'native.node': { size: 10, unpacked: true } } } } } } }, files: new Map([['dist/preload.js', { entry, data }]]) };
  return writeAsar(archive);
}

test('Rebuild ASAR fixture and preserve all packed and unpacked metadata', () => {
  const original = readAsar(originalBytes());
  const preload = original.files.get('dist/preload.js').data;
  const replacement = Buffer.concat([preload, Buffer.from('\n// 中文测试\n')]);
  const rebuilt = readAsar(writeAsar(original, new Map([['dist/preload.js', replacement]])));
  assert.equal(rebuilt.files.size, original.files.size);
  for (const [name, member] of original.files) assert.ok(rebuilt.files.get(name).data.equals(name === 'dist/preload.js' ? replacement : member.data), name);
  assert.equal(rebuilt.files.get('dist/preload.js').entry.integrity.hash, sha(replacement));
  assert.equal(JSON.stringify(original.header.files.node_modules.files['chrome-devtools-mcp']), JSON.stringify(rebuilt.header.files.node_modules.files['chrome-devtools-mcp']));
});
test('Reject corrupted packed member', () => {
  const bytes = originalBytes();
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => readAsar(bytes), /Integrity mismatch/);
});
