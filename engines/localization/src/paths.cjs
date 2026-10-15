'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
exports.engineRoot = path.resolve(__dirname, '..');
exports.workspaceRoot = path.resolve(__dirname, '../../..');
const localData = () => process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local');
exports.defaultApplicationDirectory = () => process.env.ANTIGRAVITY_APP_DIR || path.join(localData(), 'Programs/antigravity');
exports.defaultDataDirectory = (base = localData()) => {
  const bootstrap = path.join(base, 'AntigravityManager');
  const location = path.join(bootstrap, 'location.json');
  if (!fs.existsSync(location)) return bootstrap;
  const selected = JSON.parse(fs.readFileSync(location, 'utf8')).DataDirectory;
  if (typeof selected !== 'string' || !path.isAbsolute(selected) || !fs.existsSync(selected) || !fs.statSync(selected).isDirectory()) {
    throw Error('已配置的数据目录不可用，请恢复目录或检查 location.json。');
  }
  return selected;
};
