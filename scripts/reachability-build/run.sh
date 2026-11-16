#!/usr/bin/env bash
# Run on an isolated Linux runner; the resulting data is reviewed before publication.
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(cd -- "$TASK_DIR/../.." && pwd -P)"
IMAGE='ghcr.io/valhalla/valhalla-scripted:3.9.1@sha256:6238809f9dc3057743d70a20efd3911ec38e458bfa13a0601909b58f68dfd956'
PRIMARY_PBF_URL='https://download.geofabrik.de/asia/japan-261115.osm.pbf'
FALLBACK_PBF_URL='https://download.openstreetmap.fr/extracts/asia/japan.osm.pbf'
PBF_URL=''
CONTAINER="iso-valhalla-${GITHUB_RUN_ID:-local}-$$"
DOWNLOAD="$TASK_DIR/download"
CUSTOM="$TASK_DIR/custom_files"
OUTPUT="$TASK_DIR/generated"
CACHE="$TASK_DIR/graph-cache"
mkdir -p -- "$DOWNLOAD" "$CUSTOM" "$OUTPUT"
for cmd in curl osmium docker python3 sha256sum md5sum sudo; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
for file in "$DOWNLOAD/japan.osm.pbf" "$DOWNLOAD/japan.osm.pbf.part" "$CUSTOM/ehime-buffer.osm.pbf" "$CUSTOM/valhalla.json" "$OUTPUT/build-summary.json"; do
  [[ ! -e "$file" ]] || { echo "Refusing to overwrite existing task file: $file" >&2; exit 1; }
done
[[ -z "$(find "$CUSTOM" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { echo "Refusing to overwrite nonempty task directory: $CUSTOM" >&2; exit 1; }

# A cache is a task-owned, immutable checkpoint: the live container gets copies.
# READY contains the manifest checksum and is written only after validation.
validate_cache() {
  python3 - "$CACHE" "$IMAGE" "$PRIMARY_PBF_URL" "$FALLBACK_PBF_URL" "$1" <<'PY'
import datetime, hashlib, json, pathlib, re, sqlite3, sys, tarfile
cache, image, primary, fallback, require_ready = pathlib.Path(sys.argv[1]), *sys.argv[2:]
def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()
def fail(message): raise SystemExit('Invalid graph cache: ' + message)
if cache.is_symlink() or not cache.is_dir(): fail('missing cache directory')
manifest_path = cache/'manifest.json'
if manifest_path.is_symlink() or not manifest_path.is_file(): fail('missing manifest')
if require_ready == 'yes':
    marker = cache/'READY'
    if marker.is_symlink() or not marker.is_file() or marker.read_text(encoding='ascii').strip() != digest(manifest_path): fail('manifest checksum mismatch')
try: manifest = json.loads(manifest_path.read_text(encoding='utf8'))
except (OSError, ValueError) as exc: fail('invalid manifest: ' + str(exc))
if manifest.get('version') != 1 or manifest.get('valhalla_image') != image: fail('image or version mismatch')
if manifest.get('source_url') not in (primary, fallback): fail('unexpected source URL')
if not re.fullmatch(r'[0-9a-f]{64}', manifest.get('source_sha256', '')): fail('missing source checksum')
try:
    source_date = datetime.datetime.fromisoformat(manifest['source_date'].replace('Z', '+00:00'))
    if source_date.tzinfo is None: fail('source date has no timezone')
except (KeyError, TypeError, ValueError): fail('invalid source date')
if manifest.get('bbox') != [131.4, 32.4, 134.6, 35.0] or manifest.get('extract_strategy') != 'smart: multipolygon,boundary': fail('extraction settings mismatch')
names = ['valhalla_tiles.tar', 'admins.sqlite', 'valhalla.json', 'default_speeds.json', 'file_hashes.txt', '.file_hashes.txt']
files = manifest.get('files')
if not isinstance(files, dict) or set(files) != set(names): fail('unexpected file list')
for name in names:
    path = cache/name
    if path.is_symlink() or not path.is_file() or (name != 'file_hashes.txt' and path.stat().st_size == 0): fail('missing or empty ' + name)
    if digest(path) != files[name]: fail('checksum mismatch for ' + name)
if (cache/'.file_hashes.txt').read_text(encoding='ascii').strip() != digest(cache/'valhalla_tiles.tar', 'md5'): fail('tile MD5 mismatch')
try:
    with tarfile.open(cache/'valhalla_tiles.tar', 'r:') as tiles:
        if tiles.next() is None: fail('empty tile archive')
    with sqlite3.connect((cache/'admins.sqlite').resolve().as_uri() + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA quick_check').fetchone() != ('ok',): fail('invalid admin database')
    cfg = json.loads((cache/'valhalla.json').read_text(encoding='utf8'))
    if cfg['mjolnir']['tile_extract'] != '/custom_files/valhalla_tiles.tar' or cfg['mjolnir']['admin'] != '/custom_files/admins.sqlite': fail('unexpected configured paths')
    json.loads((cache/'default_speeds.json').read_text(encoding='utf8'))
except (OSError, ValueError, KeyError, sqlite3.Error, tarfile.TarError) as exc: fail('unreadable cache: ' + str(exc))
print('Graph cache passed integrity checks', file=sys.stderr)
PY
}

REUSED_CACHE=false
if [[ -e "$CACHE" ]]; then
  validate_cache yes
  REUSED_CACHE=true
  mapfile -t source_fields < <(python3 - "$CACHE/manifest.json" <<'PY'
import json, pathlib, sys
m=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf8'))
for key in ('source_date','source_sha256','source_url'): print(m[key])
PY
  )
  SOURCE_DATE="${source_fields[0]}"; SOURCE_SHA="${source_fields[1]}"; PBF_URL="${source_fields[2]}"
  for file in valhalla_tiles.tar admins.sqlite valhalla.json default_speeds.json file_hashes.txt .file_hashes.txt; do cp -- "$CACHE/$file" "$CUSTOM/$file"; done
else
  for url in "$PRIMARY_PBF_URL" "$FALLBACK_PBF_URL"; do
    if curl --ipv4 --fail --location --retry 3 --retry-all-errors --retry-delay 3 --connect-timeout 20 --output "$DOWNLOAD/japan.osm.pbf.part" "$url"; then
      PBF_URL="$url"; break
    fi
    echo "Unable to fetch source from $url; trying next source" >&2
  done
  [[ -n "$PBF_URL" ]] || { echo 'OSM data download failed' >&2; exit 1; }
  mv -- "$DOWNLOAD/japan.osm.pbf.part" "$DOWNLOAD/japan.osm.pbf"
  SOURCE_DATE="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$DOWNLOAD/japan.osm.pbf")"
  [[ -n "$SOURCE_DATE" ]] || { echo 'OSM replication timestamp missing' >&2; exit 1; }
  SOURCE_SHA="$(sha256sum "$DOWNLOAD/japan.osm.pbf" | cut -d' ' -f1)"
  osmium extract --strategy smart --option types=multipolygon,boundary --bbox 131.4,32.4,134.6,35 \
    -o "$CUSTOM/ehime-buffer.osm.pbf" "$DOWNLOAD/japan.osm.pbf"
  rm -- "$DOWNLOAD/japan.osm.pbf"
fi
docker pull "$IMAGE"
IGNORE_PBF=False
[[ "$REUSED_CACHE" == false ]] || IGNORE_PBF=True
docker run -d --name "$CONTAINER" -p 127.0.0.1:8002:8002 -v "$CUSTOM:/custom_files" \
  -e use_tiles_ignore_pbf="$IGNORE_PBF" -e force_rebuild=False -e build_admins=True -e build_time_zones=False \
  -e build_elevation=False -e build_transit=False -e server_threads=2 "$IMAGE" >/dev/null
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT

wait_for_server() {
  for ((attempt=0; attempt<240; attempt++)); do
    if curl --silent --fail --connect-timeout 2 --max-time 4 http://127.0.0.1:8002/status >/dev/null; then return 0; fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != true ]]; then break; fi
    sleep 10
  done
  docker logs --tail 100 "$CONTAINER" >&2 || true
  echo 'Valhalla did not start' >&2; return 1
}
wait_for_server
docker stop "$CONTAINER" >/dev/null
if [[ "$REUSED_CACHE" == false ]]; then
  # Checkpoint the completed graph before any subsequent configuration or
  # canary can fail. Do not include the large input PBF or mutable tile folder.
  mkdir -- "$CACHE"
  for file in valhalla_tiles.tar admins.sqlite valhalla.json default_speeds.json file_hashes.txt; do
    [[ -f "$CUSTOM/$file" && ! -L "$CUSTOM/$file" ]] || { echo "Missing built graph file: $file" >&2; exit 1; }
    cp -- "$CUSTOM/$file" "$CACHE/$file"
  done
  md5sum "$CACHE/valhalla_tiles.tar" | cut -d' ' -f1 > "$CACHE/.file_hashes.txt"
  SOURCE_DATE="$SOURCE_DATE" SOURCE_SHA="$SOURCE_SHA" PBF_URL="$PBF_URL" IMAGE="$IMAGE" python3 - "$CACHE" <<'PY'
import hashlib, json, os, pathlib, sys
cache=pathlib.Path(sys.argv[1])
names=['valhalla_tiles.tar','admins.sqlite','valhalla.json','default_speeds.json','file_hashes.txt','.file_hashes.txt']
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()
doc={'version':1,'source_url':os.environ['PBF_URL'],'source_date':os.environ['SOURCE_DATE'],
     'source_sha256':os.environ['SOURCE_SHA'],'valhalla_image':os.environ['IMAGE'],
     'bbox':[131.4,32.4,134.6,35.0],'extract_strategy':'smart: multipolygon,boundary',
     'files':{name:sha(cache/name) for name in names}}
(cache/'manifest.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
PY
  validate_cache no
  sha256sum "$CACHE/manifest.json" | cut -d' ' -f1 > "$CACHE/READY"
fi
sudo python3 "$TASK_DIR/configure.py"
docker start "$CONTAINER" >/dev/null
wait_for_server
python3 "$TASK_DIR/verify-status.py"
python3 "$TASK_DIR/canary.py"
python3 "$TASK_DIR/generate.py" --source-date "$SOURCE_DATE" --out "$OUTPUT"
SOURCE_DATE="$SOURCE_DATE" SOURCE_SHA="$SOURCE_SHA" PBF_URL="$PBF_URL" IMAGE="$IMAGE" python3 - "$OUTPUT/source-meta.json" "$CUSTOM" <<'PY'
import hashlib, json, os, pathlib, sys
import numpy, shapely
custom=pathlib.Path(sys.argv[2])
sys.path.insert(0,str(custom.parent))
import generate
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()
doc = {'source_url':os.environ['PBF_URL'],'source_date':os.environ['SOURCE_DATE'],
       'source_sha256':os.environ['SOURCE_SHA'],'valhalla_image':os.environ['IMAGE'],
       'graph_sha256':sha(custom/'valhalla_tiles.tar'),'admin_sha256':sha(custom/'admins.sqlite'),
       'speed_config_sha256':sha(custom/'default_speeds.json'),'runtime_config_sha256':sha(custom/'valhalla.json'),
       'bbox':[131.4,32.4,134.6,35.0],'extract_strategy':'smart: multipolygon,boundary',
       'max_snap_m':100,'build_admins':True,'build_elevation':False,'build_time_zones':False,
       'ferry_exclusion':'experimental hard exclusion; separate canaries passed',
       'contour_processing':{'algorithm':'cumulative-union-with-precision-guard',
                             'grid_degrees':generate.UNION_GRID_DEGREES,
                             'guard_degrees':generate.UNION_GUARD_DEGREES,
                             'numpy_version':numpy.__version__,'shapely_version':shapely.__version__,
                             'geos_version':shapely.geos_version_string}}
pathlib.Path(sys.argv[1]).write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
PY
echo "Generated task artifacts: $OUTPUT"
