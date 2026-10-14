import ssl
import urllib.request
from pathlib import Path

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
for url in ['http://127.0.0.1:2968/', 'https://localhost:2967/', 'https://[::1]:2967/']:
    try:
        data = opener.open(url, timeout=4).read()
        Path('analysis/frontend.html').write_bytes(data)
        print(url, len(data), data[:1200])
        break
    except Exception as error:
        print(url, type(error).__name__)
