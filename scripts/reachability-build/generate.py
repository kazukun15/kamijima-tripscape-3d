#!/usr/bin/env python3
"""PROTOTYPE: generate validated, per-POI static Valhalla isochrones.

This script expects a separately built, loopback-only Valhalla 3.9.1 instance.
It intentionally refuses publication on unexpected errors or warnings.
"""
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent
MODES = {'walking': 'pedestrian', 'driving': 'auto', 'cycling': 'bicycle'}
TIMES = (10, 20, 30, 60)
MAX_SNAP_M = 100.0
BBOX = (131.4, 32.4, 134.6, 35.0)
MIN_BORDER_KM = 15.0


class BuildFailure(Exception):
    pass


class NoRoad(Exception):
    pass


def distance_m(a, b):
    """Great-circle distance; coordinate order is longitude, latitude."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 2*6371008.8*math.asin(min(1.0, math.sqrt(h)))


def xy(value):
    if not isinstance(value, list) or len(value) < 2:
        raise BuildFailure('Invalid GeoJSON position')
    lon, lat = value[:2]
    if isinstance(lon, bool) or isinstance(lat, bool) or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) or not math.isfinite(lon) or not math.isfinite(lat):
        raise BuildFailure('Non-finite GeoJSON position')
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise BuildFailure('GeoJSON position outside WGS84')
    return [lon, lat]


def rings(geometry):
    if not isinstance(geometry, dict):
        raise BuildFailure('Missing geometry')
    coords = geometry.get('coordinates')
    if geometry.get('type') == 'Polygon':
        polys = [coords]
    elif geometry.get('type') == 'MultiPolygon':
        polys = coords
    else:
        raise BuildFailure('Expected polygon geometry')
    if not isinstance(polys, list) or not polys:
        raise BuildFailure('Empty polygon geometry')
    normalized = []
    for poly in polys:
        if not isinstance(poly, list) or not poly:
            raise BuildFailure('Empty polygon')
        out = []
        for ring in poly:
            if not isinstance(ring, list) or len(ring) < 4:
                raise BuildFailure('Invalid polygon ring')
            points = [xy(position) for position in ring]
            if points[0] != points[-1]:
                raise BuildFailure('Unclosed polygon ring')
            area = abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:])))
            if area < 1e-12:
                raise BuildFailure('Degenerate polygon ring')
            out.append(points)
        normalized.append(out)
    return normalized


def near_boundary(polygons):
    west, south, east, north = BBOX
    for poly in polygons:
        for ring in poly:
            for lon, lat in ring:
                lon_km = 111.12 * math.cos(math.radians(lat))
                if min((lon-west)*lon_km, (east-lon)*lon_km, (lat-south)*111.12, (north-lat)*111.12) <= MIN_BORDER_KM:
                    return True
    return False


def parse_isochrone(doc, origin):
    if doc.get('type') != 'FeatureCollection' or not isinstance(doc.get('features'), list):
        raise BuildFailure('Invalid isochrone FeatureCollection')
    if doc.get('warnings'):
        raise BuildFailure('Valhalla returned warnings; hard exclusions or limits may have been ignored')
    features = doc['features']
    inputs = [f for f in features if f.get('properties', {}).get('type') == 'input']
    snapped = [f for f in features if f.get('properties', {}).get('type') == 'snapped']
    if len(inputs) != 1 or len(snapped) != 1 or inputs[0].get('geometry', {}).get('type') != 'Point' or snapped[0].get('geometry', {}).get('type') != 'MultiPoint':
        raise BuildFailure('Missing or ambiguous origin/snap features')
    if distance_m(xy(inputs[0]['geometry']['coordinates']), origin) > 2:
        raise BuildFailure('Response origin does not match input')
    candidates = snapped[0]['geometry'].get('coordinates')
    if not isinstance(candidates, list) or not candidates:
        raise NoRoad('No road snap candidates')
    distances = [distance_m(xy(point), origin) for point in candidates]
    if max(distances) > MAX_SNAP_M:
        raise NoRoad('At least one road snap candidate exceeds the 100m limit')
    by_time = {minutes: [] for minutes in TIMES}
    for feature in features:
        properties = feature.get('properties', {})
        contour = properties.get('contour')
        if contour is None:
            continue
        if properties.get('metric', 'time') != 'time' or contour not in by_time:
            raise BuildFailure('Unexpected contour')
        by_time[contour].extend(rings(feature.get('geometry')))
    if any(not polygons for polygons in by_time.values()):
        raise BuildFailure('A requested contour is missing')
    if any(near_boundary(polygons) for polygons in by_time.values()):
        raise BuildFailure('Contour approaches the clipped OSM graph boundary')
    contours = {}
    for minutes, polys in by_time.items():
        shape = {'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1 else {'type': 'MultiPolygon', 'coordinates': polys}
        contours[str(minutes)] = {'type': 'Feature', 'properties': {'contour': minutes, 'metric': 'time'}, 'geometry': shape}
    return round(max(distances), 1), contours


def call_api(base, path, payload):
    req = Request(base.rstrip('/') + path, json.dumps(payload).encode(), {'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=120) as response:
            raw = response.read(25_000_001)
            if len(raw) > 25_000_000:
                raise BuildFailure('Unexpectedly large API response')
            return json.loads(raw)
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read(1_000_000))
        except (ValueError, OSError):
            raise BuildFailure('Non-JSON API error') from exc
        if detail.get('error_code') == 171:
            raise NoRoad('No suitable road within search cutoff') from exc
        raise BuildFailure(f"HTTP {exc.code}, Valhalla error code {detail.get('error_code')}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise BuildFailure('Valhalla unavailable or invalid JSON') from exc


def payload(lat, lng, costing):
    return {'locations': [{'lat': lat, 'lon': lng, 'search_cutoff': MAX_SNAP_M, 'minimum_reachability': 1,
                            'search_filter': {'exclude_ferry': True}}],
            'costing': costing, 'costing_options': {costing: {'exclude_ferries': True, 'use_ferry': 0}},
            'contours': [{'time': t} for t in TIMES], 'polygons': True, 'show_locations': True}


def load_points():
    original = json.loads((ROOT/'data/poi/verified.json').read_text(encoding='utf8'))
    county = json.loads((ROOT/'data/ehime-pois.json').read_text(encoding='utf8'))
    result = [{'id': p['id'], 'lat': p['coordinates']['lat'], 'lng': p['coordinates']['lng']} for p in original]
    result.extend({'id': p['id'], 'lat': p['lat'], 'lng': p['lng']} for p in county)
    ids = [p['id'] for p in result]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name) for name in ids):
        raise BuildFailure('Duplicate or unsafe POI identifier')
    for p in result:
        lon, lat = xy([p['lng'], p['lat']])
        if not (BBOX[0] < lon < BBOX[2] and BBOX[1] < lat < BBOX[3]):
            raise BuildFailure(f"POI outside graph bounds: {p['id']}")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8002')
    parser.add_argument('--source-date', required=True, help='OSM replication timestamp from original PBF header')
    parser.add_argument('--out', type=Path, default=WORK/'generated')
    args = parser.parse_args()
    if args.base != 'http://127.0.0.1:8002':
        raise BuildFailure('Only the local Valhalla instance is allowed')
    stamp = dt.datetime.fromisoformat(args.source_date.replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise BuildFailure('Source timestamp must have a time zone')
    out = args.out.resolve()
    if not out.is_relative_to(WORK):
        raise BuildFailure('Output must remain under work/iso-build')
    out.mkdir(parents=True, exist_ok=True)
    failed, counts = [], {'ok': 0, 'no_road': 0, 'error': 0}
    for index, p in enumerate(load_points(), 1):
        result = {'version': 1, **p, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'source_date': args.source_date, 'results': {}}
        for mode, costing in MODES.items():
            try:
                doc = call_api(args.base, '/isochrone', payload(p['lat'], p['lng'], costing))
                snapped_m, contours = parse_isochrone(doc, [p['lng'], p['lat']])
                item = {'status': 'ok', 'snapped_distance_m': snapped_m, 'contours': contours}
            except NoRoad as exc:
                item = {'status': 'no_road', 'snapped_distance_m': None, 'contours': {}}
                print(f"NO_ROAD {p['id']} {mode}: {exc}", flush=True)
            except BuildFailure as exc:
                item = {'status': 'error', 'snapped_distance_m': None, 'contours': {}}
                failed.append((p['id'], mode, str(exc)))
                print(f"ERROR {p['id']} {mode}: {exc}", file=sys.stderr, flush=True)
            counts[item['status']] += 1
            result['results'][mode] = item
        path = out/(quote(p['id'], safe="-_.!~*'()")+'.json')
        path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf8')
        print(f"{index}: {p['id']}", flush=True)
    (out/'build-summary.json').write_text(json.dumps({'counts':counts,'failures':failed}, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'counts': counts, 'failures':len(failed)}), flush=True)
    if failed:
        raise BuildFailure('Unexpected failures; generated files must not be published')


if __name__ == '__main__':
    try:
        main()
    except BuildFailure as exc:
        print(f'BUILD FAILED: {exc}', file=sys.stderr)
        sys.exit(1)
