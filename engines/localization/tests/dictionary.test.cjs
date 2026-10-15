'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('fixed dictionary has unique keys and preserves theme brands and security semantics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../translations/zh-CN.json'), 'utf8');
  const keys = [...source.matchAll(/^  ("(?:[^"\\]|\\.)*"):/gm)].map(match => JSON.parse(match[1]));
  assert.equal(new Set(keys).size, keys.length, '词库不能含有被 JSON.parse 静默覆盖的重复键');
  const dictionary = JSON.parse(source);
  for (const brand of ['Catppuccin', 'Gruvbox Material', 'Dracula', 'Monokai', 'Tokyo Night', 'Vesper']) {
    assert.equal(dictionary[brand], undefined, '保留主题专名：' + brand);
  }
  assert.equal(dictionary['Full machine'], '整台计算机');
  assert.equal(dictionary['Turbo mode'], '完全放行模式');
  assert.equal(dictionary['Solarized Light'], 'Solarized（浅色）');
  assert.match(dictionary['All terminal commands require review. The agent can read or write to any file in the machine.'], /所有终端命令都需要审核/);
  assert.match(dictionary['A high-risk mode that disables all safety barriers. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts.'], /高风险.*关闭所有安全防护.*不会提示审核/);
});
