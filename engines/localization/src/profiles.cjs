'use strict';
const fs = require('node:fs');
const path = require('node:path');
const profilesDirectory = path.resolve(__dirname, '../profiles');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

function compareVersions(left, right) {
  const a = versionPattern.exec(left), b = versionPattern.exec(right);
  if (!a || !b) throw Error('兼容性配置包含无效的版本号。');
  for (let index = 1; index <= 3; index++) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference) return difference;
  }
  if (!a[4] || !b[4]) return a[4] ? -1 : b[4] ? 1 : 0;
  const preA = a[4].split('.'), preB = b[4].split('.');
  for (let index = 0; index < Math.max(preA.length, preB.length); index++) {
    const x = preA[index], y = preB[index];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numericX = /^\d+$/.test(x), numericY = /^\d+$/.test(y);
    if (numericX && numericY) return Number(x) - Number(y);
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function patchHashes(profile) {
  return [...new Set([profile.patchedSha256, ...(profile.acceptedPatchedSha256 || []), ...Object.keys(profile.patchedVersions || {})])]
    .filter(value => /^[a-f0-9]{64}$/.test(value));
}

function loadProfiles(directory = profilesDirectory) {
  const profiles = fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => {
    const profile = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    if (!versionPattern.test(profile.version) || !/^[a-f0-9]{64}$/.test(profile.originalSha256)) {
      throw Error('兼容性配置无效：' + name);
    }
    return profile;
  });
  return profiles.sort((left, right) => compareVersions(left.version, right.version));
}

module.exports = { loadProfiles, compareVersions, patchHashes };
