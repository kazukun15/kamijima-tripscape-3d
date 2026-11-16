#!/usr/bin/env python3
"""Require the pinned engine and a loaded, admin-aware OSM graph."""
import json
from urllib.parse import urlencode
from urllib.request import urlopen

url = 'http://127.0.0.1:8002/status?' + urlencode({'json': json.dumps({'verbose': True})})
with urlopen(url, timeout=30) as response:
    data = json.load(response)
if data.get('version') != '3.9.1' or data.get('has_tiles') is not True or data.get('has_admins') is not True or data.get('warnings'):
    raise SystemExit('Unexpected status; do not generate: '+json.dumps(data))
print(json.dumps(data, ensure_ascii=False))
