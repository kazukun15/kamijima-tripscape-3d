#!/usr/bin/env python3
"""Enable required Valhalla settings in the task-owned temporary config only."""
import json
from pathlib import Path
import sys

work = Path(__file__).resolve().parent
config = (work/'custom_files'/'valhalla.json').resolve()
if not config.is_relative_to(work) or not config.is_file():
    raise SystemExit('Task-specific Valhalla config not found')
data = json.loads(config.read_text(encoding='utf8'))
limits = data.setdefault('service_limits', {})
limits['allow_hard_exclusions'] = True
limits.setdefault('status', {})['allow_verbose'] = True
config.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('Configured hard exclusions and verbose status:', config)
