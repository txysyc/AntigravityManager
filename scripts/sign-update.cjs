'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

function publicHex(key) {
  return crypto.createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
}

function generateKey(file) {
  const root = fs.realpathSync(path.join(__dirname, '..'));
  const directory = fs.realpathSync(path.dirname(path.resolve(file)));
  const relative = path.relative(root, directory);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
    throw Error('私钥必须保存在仓库目录之外。');
  }
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(directory, path.basename(file)), privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
  console.log(publicHex(privateKey));
}

function signRelease(executable, notesFile) {
  const expectedKey = process.env.MANAGER_UPDATE_PUBLIC_KEY || '';
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(process.env.MANAGER_UPDATE_PRIVATE_KEY || '');
  } catch {
    throw Error('无法读取更新签名私钥。');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicHex(privateKey) !== expectedKey) {
    throw Error('更新签名私钥与构建时的 Ed25519 公钥不匹配。');
  }
  const file = `AntigravityManager-${version}-win-x64.exe`;
  if (path.basename(executable) !== file) throw Error('待签名的 EXE 文件名与管理器版本不匹配。');
  const { size } = fs.statSync(executable);
  if (!size || size > 128 * 1024 * 1024) throw Error('待签名的 EXE 超出支持的大小。');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  const notes = fs.readFileSync(notesFile, 'utf8').trim();
  const manifest = Buffer.from(JSON.stringify({ version, target: 'windows-x64', file, size, sha256, notes }, null, 2) + '\n');
  if (manifest.length > 64 * 1024) throw Error('更新清单超出支持的大小。');
  const directory = path.dirname(executable);
  const manifestPath = path.join(directory, 'update-win-x64.json');
  const signaturePath = manifestPath + '.sig';
  if (fs.existsSync(manifestPath) || fs.existsSync(signaturePath)) throw Error('更新清单或签名已经存在。');
  const signature = crypto.sign(null, manifest, privateKey);
  fs.writeFileSync(manifestPath, manifest, { flag: 'wx' });
  fs.writeFileSync(signaturePath, signature, { flag: 'wx' });
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'generate-key' && args.length === 1) generateKey(...args);
  else if (command === 'sign' && args.length === 2) signRelease(...args);
  else throw Error('用法：sign-update.cjs generate-key <私钥文件> 或 sign <EXE> <更新说明>');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
