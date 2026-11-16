#!/usr/bin/env python3
"""Require the pinned engine and a loaded, admin-aware OSM graph."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


def status_url():
    # Valhalla's query parser does not decode '+' into a space.  The compact
    # JSON contains no spaces, so form encoding cannot introduce '+' here.
    payload = json.dumps({'verbose': True}, separators=(',', ':'))
    return 'http://127.0.0.1:8002/status?' + urlencode({'json': payload})


def verify_status(data):
    if not isinstance(data, dict) or data.get('version') != '3.9.1' or data.get('has_tiles') is not True or data.get('has_admins') is not True or data.get('warnings'):
        raise SystemExit('Unexpected status; do not generate: '+json.dumps(data, ensure_ascii=False))


def main():
    try:
        with urlopen(status_url(), timeout=30) as response:
            data = json.load(response)
    except HTTPError as exc:
        body = exc.read(4096).decode('utf8', errors='replace')
        raise SystemExit(f'Valhalla status HTTP {exc.code}: {body}') from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SystemExit(f'Valhalla status unavailable or invalid: {exc}') from exc
    verify_status(data)
    print(json.dumps(data, ensure_ascii=False))


if __name__ == '__main__':
    main()
