'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { readAsar, writeAsar, sha } = require('../src/asar.cjs');
const installed = 'C:\\Users\\txyc_\\AppData\\Local\\Programs\\antigravity\\resources\\app.asar';
const app = fs.existsSync(installed + '.zh-CN-original') ? installed + '.zh-CN-original' : installed;
test('Rebuild shipped ASAR and preserve all packed and unpacked metadata', () => {
  const original = readAsar(fs.readFileSync(app));
  const preload = original.files.get('dist/preload.js').data;
  const replacement = Buffer.concat([preload, Buffer.from('\n// 中文测试\n')]);
  const rebuilt = readAsar(writeAsar(original, new Map([['dist/preload.js', replacement]])));
  assert.equal(rebuilt.files.size, original.files.size);
  for (const [name, member] of original.files) assert.ok(rebuilt.files.get(name).data.equals(name === 'dist/preload.js' ? replacement : member.data), name);
  assert.equal(rebuilt.files.get('dist/preload.js').entry.integrity.hash, sha(replacement));
  assert.equal(JSON.stringify(original.header.files.node_modules.files['chrome-devtools-mcp']), JSON.stringify(rebuilt.header.files.node_modules.files['chrome-devtools-mcp']));
});
test('Reject corrupted packed member', () => {
  const bytes = fs.readFileSync(app);
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => readAsar(bytes), /Integrity mismatch/);
});
