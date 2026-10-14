"""Offline, bounded extraction of gzip resources embedded in the selected binary."""
import hashlib
import json
import re
import zlib
import struct
from pathlib import Path

binary = Path(r'C:\Users\txyc_\AppData\Local\Programs\antigravity\resources\bin\language_server.exe')
data = binary.read_bytes()
out = Path('analysis/embedded')
out.mkdir(parents=True, exist_ok=True)
records = []
for match in re.finditer(b'\x1f\x8b\x08', data):
    offset = match.start()
    try:
        decoder = zlib.decompressobj(31)
        decoded = decoder.decompress(data[offset:offset + 32_000_000], 64_000_000)
        if not decoder.eof or len(decoded) < 2000:
            continue
        text = decoded.decode('utf-8')
        if not any(term in text for term in ['Antigravity', 'createElement', '<html', 'react', 'webpack']):
            continue
        digest = hashlib.sha256(decoded).hexdigest()
        suffix = '.html' if '<html' in text[:1000] else '.js' if 'function' in text else '.txt'
        name = f'{offset}-{digest[:12]}{suffix}'
        (out / name).write_bytes(decoded)
        records.append({'offset': offset, 'bytes': len(decoded), 'sha256': digest, 'file': name})
    except (zlib.error, UnicodeError):
        pass
(out / 'index.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(json.dumps(records, indent=2))
zip_entries = []
for match in re.finditer(b'PK\x03\x04', data):
    offset = match.start()
    try:
        version, flags, compression = struct.unpack_from('<HHH', data, offset + 4)
        size = struct.unpack_from('<I', data, offset + 18)[0]
        name_size, extra_size = struct.unpack_from('<HH', data, offset + 26)
        if version > 63 or not 0 < name_size < 500:
            continue
        name = data[offset + 30:offset + 30 + name_size].decode('utf-8')
        zip_entries.append({'offset': offset, 'compression': compression, 'size': size, 'name': name})
        if name.endswith(('.js', '.html', '.css', '.json')) and 0 < size < 32_000_000:
            start = offset + 30 + name_size + extra_size
            decoded = zlib.decompress(data[start:start + size], -15) if compression == 8 else data[start:start + size]
            safe_name = f'{offset}-' + Path(name).name
            (out / safe_name).write_bytes(decoded)
    except (struct.error, zlib.error, UnicodeError):
        pass
(out / 'zip-index.json').write_text(json.dumps(zip_entries, indent=2), encoding='utf-8')
print('ZIP entries:', len(zip_entries))
print(json.dumps(zip_entries[:25], indent=2))
