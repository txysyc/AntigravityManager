'use strict';
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function readAsar(bytes) {
  if (bytes.length < 16 || bytes.readUInt32LE(0) !== 4) throw Error('Invalid ASAR header');
  const headerSize = bytes.readUInt32LE(4), jsonSize = bytes.readUInt32LE(12);
  if (16 + jsonSize > 8 + headerSize || 8 + headerSize > bytes.length) throw Error('Invalid ASAR bounds');
  const header = JSON.parse(bytes.subarray(16, 16 + jsonSize).toString('utf8'));
  const files = new Map();
  function walk(tree, prefix = '') {
    for (const [name, entry] of Object.entries(tree.files || {})) {
      const path = prefix + name;
      if (entry.files) walk(entry, path + '/');
      else if (!entry.unpacked && !entry.link) {
        const start = 8 + headerSize + Number(entry.offset), end = start + entry.size;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 8 + headerSize || end > bytes.length) throw Error('Invalid member range: ' + path);
        const data = bytes.subarray(start, end);
        if (entry.integrity && (entry.integrity.algorithm !== 'SHA256' || sha(data) !== entry.integrity.hash)) throw Error('Integrity mismatch: ' + path);
        files.set(path, { entry, data });
      }
    }
  }
  walk(header);
  return { header, files };
}
function writeAsar(archive, replacements = new Map()) {
  const header = structuredClone(archive.header), blocks = [];
  let offset = 0;
  function walk(tree, prefix = '') {
    for (const [name, entry] of Object.entries(tree.files || {})) {
      const path = prefix + name;
      if (entry.files) walk(entry, path + '/');
      else if (!entry.unpacked && !entry.link) {
        const data = replacements.get(path) ?? archive.files.get(path).data;
        entry.offset = String(offset); entry.size = data.length; offset += data.length;
        if (entry.integrity) {
          const blockSize = entry.integrity.blockSize;
          if (!Number.isSafeInteger(blockSize) || blockSize <= 0) throw Error('Invalid integrity block size');
          const hashes = [];
          for (let i = 0; i < data.length; i += blockSize) hashes.push(sha(data.subarray(i, i + blockSize)));
          entry.integrity = { algorithm: 'SHA256', hash: sha(data), blockSize, blocks: hashes };
        }
        blocks.push(data);
      }
    }
  }
  walk(header);
  const json = Buffer.from(JSON.stringify(header)), padded = Math.ceil((4 + json.length) / 4) * 4;
  const size = Buffer.alloc(8), pickle = Buffer.alloc(4 + padded);
  size.writeUInt32LE(4); size.writeUInt32LE(pickle.length, 4);
  pickle.writeUInt32LE(padded); pickle.writeUInt32LE(json.length, 4); json.copy(pickle, 8);
  return Buffer.concat([size, pickle, ...blocks]);
}
module.exports = { readAsar, writeAsar, sha };
