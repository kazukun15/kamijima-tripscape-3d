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
mkdir -p -- "$DOWNLOAD" "$CUSTOM" "$OUTPUT"
for cmd in curl osmium docker python3 sha256sum sudo; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
for file in "$DOWNLOAD/japan.osm.pbf" "$DOWNLOAD/japan.osm.pbf.part" "$CUSTOM/ehime-buffer.osm.pbf" "$CUSTOM/valhalla.json" "$OUTPUT/build-summary.json"; do
  [[ ! -e "$file" ]] || { echo "Refusing to overwrite existing task file: $file" >&2; exit 1; }
done

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
docker pull "$IMAGE"
docker run -d --name "$CONTAINER" -p 127.0.0.1:8002:8002 -v "$CUSTOM:/custom_files" \
  -e use_tiles_ignore_pbf=False -e force_rebuild=False -e build_admins=True -e build_time_zones=False \
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
sudo python3 "$TASK_DIR/configure.py"
docker start "$CONTAINER" >/dev/null
wait_for_server
python3 "$TASK_DIR/verify-status.py"
python3 "$TASK_DIR/canary.py"
python3 "$TASK_DIR/generate.py" --source-date "$SOURCE_DATE" --out "$OUTPUT"
SOURCE_DATE="$SOURCE_DATE" SOURCE_SHA="$SOURCE_SHA" PBF_URL="$PBF_URL" IMAGE="$IMAGE" python3 - "$OUTPUT/source-meta.json" <<'PY'
import json, os, pathlib, sys
doc = {'source_url':os.environ['PBF_URL'],'source_date':os.environ['SOURCE_DATE'],
       'source_sha256':os.environ['SOURCE_SHA'],'valhalla_image':os.environ['IMAGE'],
       'bbox':[131.4,32.4,134.6,35.0],'extract_strategy':'smart: multipolygon,boundary',
       'max_snap_m':100,'build_admins':True,'build_elevation':False,'build_time_zones':False,
       'ferry_exclusion':'experimental hard exclusion; separate canaries passed'}
pathlib.Path(sys.argv[1]).write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
PY
echo "Generated task artifacts: $OUTPUT"
