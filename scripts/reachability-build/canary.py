#!/usr/bin/env python3
"""Fail-closed ferry canary; requires actual access for all three modes."""
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = 'http://127.0.0.1:8002'
POINTS = {
    'pedestrian': [
        {'lat': 34.1951071411947, 'lon': 133.26782405376434},  # takaikami-light
        {'lat': 34.17650935813562, 'lon': 133.32073867321014},  # kamei-shrine
    ],
    'bicycle': [
        {'lat': 34.1951071411947, 'lon': 133.26782405376434},
        {'lat': 34.17650935813562, 'lon': 133.32073867321014},
    ],
    'auto': [
        {'lat': 34.2467164, 'lon': 133.1475707},  # iwagi-museum
        {'lat': 34.247900529196, 'lon': 133.00579637289047},  # iyokannet-2495
    ],
}


def post(path, body):
    req = Request(BASE+path, json.dumps(body).encode(), {'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=120) as response:
            return json.loads(response.read(1_000_000))
    except HTTPError as exc:
        try:
            return json.loads(exc.read(1_000_000))
        except Exception as parse_exc:
            raise RuntimeError('Invalid HTTP error response') from parse_exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError('Local Valhalla is unavailable') from exc


def request(costing, excluded):
    locations = [{**p, 'minimum_reachability': 1, 'search_cutoff': 100,
                  'search_filter': {'exclude_ferry': True}} for p in POINTS[costing]]
    options = {'use_ferry': 0 if excluded else 1}
    if excluded:
        options['exclude_ferries'] = True
    body = {'locations': locations, 'costing': costing, 'costing_options': {costing: options}}
    return post('/route', body)


def warnings(doc):
    return (doc.get('warnings') or []) + (doc.get('trip', {}).get('warnings') or [])


def verify_driving_side():
    regions = {
        'matsuyama': [(33.84989,132.786365),(33.852435,132.785072)],
        'kamijima': [(34.2467164,133.1475707),(34.24527095795341,133.1472909450531)],
        'toyo': [(33.91338434607816,133.15119221806526),(33.9100662,133.1813187)],
        'nanyo': [(33.2294974,132.7096431),(33.2540299,132.6871617)],
    }
    for name, points in regions.items():
        locations = [{'lat':lat,'lon':lon,'minimum_reachability':1,'search_cutoff':100,
                      'search_filter':{'exclude_ferry':True}} for lat,lon in points]
        route = post('/route', {'locations':locations,'costing':'auto','costing_options':{'auto':{'use_ferry':0}}})
        trip = route.get('trip', {})
        if warnings(route) or trip.get('status') != 0 or not trip.get('legs') or trip.get('summary',{}).get('has_ferry') is True:
            raise RuntimeError(f'{name}: left-driving route unavailable or returned warnings')
        shape = trip['legs'][0].get('shape')
        if not isinstance(shape, str) or not shape:
            raise RuntimeError(f'{name}: driving-side route has no encoded shape')
        trace = post('/trace_attributes', {'encoded_polyline':shape,'shape_match':'edge_walk','costing':'auto',
                                          'filters':{'action':'include','attributes':['edge.drive_on_right','edge.use']}})
        edges = trace.get('edges')
        if warnings(trace) or not isinstance(edges,list) or not edges or any(edge.get('drive_on_right') is not False or edge.get('use') in ('ferry','rail-ferry') for edge in edges):
            raise RuntimeError(f'{name}: road edges did not all report drive_on_right=false')
        print(json.dumps({'region':name,'left_driving_edges':len(edges)}),flush=True)


def main():
    verify_driving_side()
    for mode in ('pedestrian', 'bicycle', 'auto'):
        with_ferry = request(mode, False)
        positive_warnings = warnings(with_ferry)
        # Only for the positive ferry control, permit the observed pedestrian
        # second-pass warning 401; never permit it for output or negative controls.
        permitted = mode == 'pedestrian' and all(isinstance(w,dict) and w.get('code') == 401 for w in positive_warnings)
        if (positive_warnings and not permitted) or with_ferry.get('trip', {}).get('summary', {}).get('has_ferry') is not True:
            raise RuntimeError(f'{mode}: positive ferry route unavailable; exclusion cannot be verified')
        without_ferry = request(mode, True)
        if warnings(without_ferry):
            raise RuntimeError(f'{mode}: Valhalla reported warnings; hard exclusion may be ignored')
        trip = without_ferry.get('trip')
        if trip:
            if trip.get('summary', {}).get('has_ferry') is not False:
                raise RuntimeError(f'{mode}: exclusion still uses a ferry')
            result = 'route_without_ferry'
        elif without_ferry.get('error_code') in (170, 442):
            result = 'no_route'
        else:
            raise RuntimeError(f"{mode}: unexpected error {without_ferry.get('error_code')}")
        print(json.dumps({'mode': mode, 'positive': 'has_ferry', 'excluded': result}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        print(f'FERRY CANARY FAILED: {exc}', file=sys.stderr)
        sys.exit(1)
