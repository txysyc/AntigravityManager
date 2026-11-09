'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadProfiles } = require('../../engines/localization/src/profiles.cjs');

const projectRoot = path.resolve(__dirname, '../..');

function readReleaseNotes(root = projectRoot) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  const { version: patchVersion } = JSON.parse(read('engines/localization/package.json'));
  const releases = read('CHANGELOG.md').split(/^## /m).slice(1).map(section => {
    const [heading, ...lines] = section.split(/\r?\n/);
    const match = /^(\d+\.\d+\.\d+)(?: - \d{4}-\d{2}-\d{2})?$/.exec(heading);
    return { version: match?.[1], body: lines.join('\n').trim() };
  }).filter(release => release.version === version);
  if (releases.length !== 1) {
    throw Error('CHANGELOG.md 需要唯一的管理器版本章节：## ' + version);
  }

  const { body } = releases[0];
  const sections = body.split(/^### /m).slice(1).map(section => section.split('\n'));
  const highlights = sections.filter(([name]) => name === '主要变化');
  if (highlights.length !== 1 || !highlights[0].slice(1).some(line => /^- \S/.test(line))) {
    throw Error('CHANGELOG.md 的当前版本需要「主要变化」和至少一条用户可见的改动。');
  }

  const compatibility = sections.filter(([name]) => name === '兼容性');
  const profiles = loadProfiles(path.join(root, 'engines/localization/profiles'));
  if (!profiles.length) throw Error('没有已验证的 Antigravity 兼容配置。');
  const targets = [...new Set(profiles.map(profile => profile.version))];
  const asCode = value => '`' + value + '`';
  const expected = [
    ['- 内置汉化补丁：', asCode(patchVersion)],
    ['- 已验证的 Antigravity 版本：', targets.map(asCode).join('、')],
  ];
  for (const [label, value] of expected) {
    const matching = compatibility.length === 1 ? compatibility[0].filter(line => line.startsWith(label)) : [];
    if (matching.length !== 1 || matching[0] !== label + value) {
      throw Error('CHANGELOG.md 的当前版本「兼容性」应包含：' + label + value);
    }
  }
  return body + '\n';
}

if (require.main === module) {
  try {
    const [output, blobUrl] = process.argv.slice(2);
    const body = readReleaseNotes();
    const notes = blobUrl ? body.replace(/\]\(([A-Za-z0-9_.-][^\s():#]*\.md(?:#[^\s)]+)?)\)/g,
      (_, file) => '](' + new URL(file, blobUrl + '/') + ')') : body;
    if (output) fs.writeFileSync(output, notes, 'utf8');
    else process.stdout.write(notes);
  } catch (error) {
    console.error('无法生成发行说明：' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { readReleaseNotes };
