'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { sha, readAsar } = require('../src/asar.cjs');
const root = path.resolve(__dirname, '..');
const restore = process.argv.includes('--restore');
const app = process.argv.slice(2).find(x => !x.startsWith('--')) || 'C:\\Users\\txyc_\\AppData\\Local\\Programs\\antigravity';
const target = path.join(app, 'resources', 'app.asar');
const backup = target + '.zh-CN-original';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8'));
const current = fs.readFileSync(target), digest = sha(current);
const supportedPatches = [manifest.patchedSha256, ...(manifest.acceptedPatchedSha256 || [])];
if (restore) {
  if (digest === manifest.originalSha256) { console.log('Already restored.'); process.exit(0); }
  if (!supportedPatches.includes(digest)) throw Error('Application changed; refusing to overwrite an update.');
  const original = fs.readFileSync(backup);
  if (sha(original) !== manifest.originalSha256) throw Error('Backup integrity mismatch.');
  replace(original); console.log('Restored original Antigravity. Restart to take effect.');
} else {
  if (digest === manifest.patchedSha256) { console.log('Already installed.'); process.exit(0); }
  if (digest !== manifest.originalSha256 && !supportedPatches.includes(digest)) throw Error('Unsupported installed build. No files changed.');
  const patch = fs.readFileSync(path.join(root, 'dist/app.asar'));
  if (sha(patch) !== manifest.patchedSha256) throw Error('Patch integrity mismatch.');
  readAsar(patch);
  if (fs.existsSync(backup)) {
    if (sha(fs.readFileSync(backup)) !== manifest.originalSha256) throw Error('Existing backup differs; refusing to overwrite it.');
  } else {
    if (digest !== manifest.originalSha256) throw Error('Original backup missing; cannot upgrade this patch safely.');
    fs.writeFileSync(backup, current, { flag: 'wx' });
  }
  replace(patch); console.log('Installed Chinese UI patch. Original backed up at ' + backup + '. Restart Antigravity to take effect.');
}
function replace(bytes) {
  const temporary = target + '.zh-CN-new';
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  try { fs.renameSync(temporary, target); }
  catch (error) { fs.unlinkSync(temporary); throw error; }
}
