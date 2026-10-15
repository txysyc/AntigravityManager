'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { errorResult } = require('../cli.cjs');

test('文件操作错误提供中文说明并保留原始诊断', () => {
  for (const code of ['EEXIST', 'ENOENT', 'EACCES', 'EPERM', 'EBUSY', 'ENOSPC', 'OTHER']) {
    const result = errorResult(Object.assign(new Error('original diagnostic'), { code }));
    assert.equal(result.success, false);
    assert.match(result.message, /^[\u3400-\u9fff]/);
    assert.match(result.message, /original diagnostic/);
  }
  assert.equal(errorResult(new Error('不支持的操作。')).message, '不支持的操作。');
});

test('CLI 缺少应用文件时返回中文 JSON 失败结果和非零退出码', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-cli-'));
  try {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../cli.cjs'), 'inspect', '--app-dir', path.join(temporary, 'missing app'), '--data-dir', path.join(temporary, 'data')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.success, false);
    assert.match(payload.message, /^找不到所需文件或目录/);
    assert.match(payload.message, /ENOENT/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
