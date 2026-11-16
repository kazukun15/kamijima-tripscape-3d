#!/usr/bin/env python3
"""Synthetic fixtures only; does not claim a real Valhalla build works."""
import copy
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import unquote
import canary
import generate

spec = importlib.util.spec_from_file_location('verify_status', Path(__file__).with_name('verify-status.py'))
verify_status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_status)

ORIGIN = [132.7, 33.8]
RING = [[132.69,33.79],[132.71,33.79],[132.71,33.81],[132.69,33.79]]


def sample():
    features = [{'type':'Feature','properties':{'contour':n,'metric':'time'},
                 'geometry':{'type':'Polygon','coordinates':[RING]}} for n in generate.TIMES]
    features += [{'type':'Feature','properties':{'type':'input'},'geometry':{'type':'Point','coordinates':ORIGIN}},
                 {'type':'Feature','properties':{'type':'snapped'},'geometry':{'type':'MultiPoint','coordinates':[[132.7001,33.8]]}}]
    return {'type':'FeatureCollection','features':features}


def ferry_iso(body, force_positive=False):
    mode=body['costing']; origin=canary.POINTS[mode][0]; target=canary.POINTS[mode][1]
    excluded=body['costing_options'][mode].get('exclude_ferries',False)
    center=origin if excluded and not force_positive else target
    x,y=center['lon'],center['lat']
    ring=[[x-.002,y-.002],[x+.002,y-.002],[x+.002,y+.002],[x-.002,y+.002],[x-.002,y-.002]]
    return {'type':'FeatureCollection','features':[
        {'type':'Feature','properties':{'contour':60,'metric':'time'},'geometry':{'type':'Polygon','coordinates':[ring]}},
        {'type':'Feature','properties':{'type':'input'},'geometry':{'type':'Point','coordinates':[origin['lon'],origin['lat']]}},
        {'type':'Feature','properties':{'type':'snapped'},'geometry':{'type':'MultiPoint','coordinates':[[origin['lon'],origin['lat']]]}},
    ]}


class IsoFixtures(unittest.TestCase):
    def test_status_url_has_compact_json_without_form_plus(self):
        url=verify_status.status_url()
        self.assertNotIn('+',url)
        self.assertTrue(url.startswith('http://127.0.0.1:8002/status?json='))
        self.assertEqual(unquote(url.split('json=',1)[1]),'{"verbose":true}')

    def test_status_rejects_missing_admins_bad_version_and_warnings(self):
        good={'version':'3.9.1','has_tiles':True,'has_admins':True}
        verify_status.verify_status(good)
        for change in ({'has_admins':False},{'has_tiles':False},{'version':'3.8.0'},{'warnings':[{'code':1}]}):
            with self.assertRaises(SystemExit):verify_status.verify_status({**good,**change})

    def test_status_http_error_body_is_visible(self):
        error=HTTPError('http://127.0.0.1:8002/status',400,'Bad Request',{},io.BytesIO(b'{"error_code":100}'))
        with patch.object(verify_status,'urlopen',side_effect=error):
            with self.assertRaises(SystemExit) as result:verify_status.main()
        self.assertIn('HTTP 400',str(result.exception))
        self.assertIn('"error_code":100',str(result.exception))

    def test_all_contours_and_snap(self):
        d, contours, limited = generate.parse_isochrone(sample(), ORIGIN)
        self.assertGreater(d, 0)
        self.assertLess(d, 100)
        self.assertEqual(set(contours), {'10','20','30','60'})
        self.assertEqual(limited, [])
        self.assertEqual(contours['10']['geometry']['type'], 'Polygon')

    def test_multiple_features_preserved(self):
        doc = sample();doc['features'].append(copy.deepcopy(doc['features'][0]))
        _, contours, limited = generate.parse_isochrone(doc, ORIGIN)
        self.assertEqual(contours['10']['geometry']['type'], 'MultiPolygon')
        self.assertEqual(len(contours['10']['geometry']['coordinates']), 2)
        self.assertEqual(limited, [])

    def test_any_distant_candidate_means_no_road(self):
        doc=sample();doc['features'][-1]['geometry']['coordinates'].append([132.71,33.8])
        with self.assertRaises(generate.NoRoad): generate.parse_isochrone(doc, ORIGIN)

    def test_missing_snap_or_interval_rejected(self):
        for doc in (sample(), sample()):
            doc['features'].pop()
            with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)
        doc=sample();doc['features'].pop(0)
        with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)

    def test_warning_rejected(self):
        doc=sample();doc['warnings']=[{'code':1}]
        with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)

    def test_bad_ring_rejected(self):
        doc=sample();doc['features'][0]['geometry']['coordinates']=[[[132.7,33.8],[132.71,33.8],[132.71,33.81]]]
        with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)

    def test_boundary_discards_only_affected_intervals(self):
        doc=sample();boundary=[[[131.41,33.8],[131.42,33.8],[131.42,33.81],[131.41,33.8]]]
        doc['features'][3]['geometry']['coordinates']=boundary
        result=generate.mode_result(doc,ORIGIN)
        self.assertEqual(result['status'],'ok')
        self.assertEqual(result['limited_contours'],['60'])
        self.assertEqual(set(result['contours']),{'10','20','30'})
        self.assertGreater(result['snapped_distance_m'],0)

    def test_all_boundary_intervals_have_explicit_outside_data_status(self):
        doc=sample();boundary=[[[131.41,33.8],[131.42,33.8],[131.42,33.81],[131.41,33.8]]]
        for feature in doc['features'][:4]:feature['geometry']['coordinates']=boundary
        result=generate.mode_result(doc,ORIGIN)
        self.assertEqual(result['status'],'outside_data')
        self.assertEqual(result['contours'],{})
        self.assertEqual(result['limited_contours'],['10','20','30','60'])
        self.assertGreater(result['snapped_distance_m'],0)

    def test_boundary_multipolygon_discards_entire_interval(self):
        doc=sample();boundary=[[[131.41,33.8],[131.42,33.8],[131.42,33.81],[131.41,33.8]]]
        doc['features'].append({'type':'Feature','properties':{'contour':20,'metric':'time'},'geometry':{'type':'Polygon','coordinates':boundary}})
        result=generate.mode_result(doc,ORIGIN)
        self.assertEqual(result['limited_contours'],['20'])
        self.assertNotIn('20',result['contours'])
        self.assertEqual(set(result['contours']),{'10','30','60'})

    def test_malformed_boundary_interval_still_rejected(self):
        doc=sample();doc['features'][3]['geometry']['coordinates']=[[[131.41,33.8],[131.42,33.8],[131.42,33.81]]]
        with self.assertRaises(generate.BuildFailure):generate.mode_result(doc,ORIGIN)

    def test_payload_hard_exclusion(self):
        p=generate.payload(33.8,132.7,'bicycle')
        self.assertTrue(p['costing_options']['bicycle']['exclude_ferries'])
        self.assertTrue(p['locations'][0]['search_filter']['exclude_ferry'])
        self.assertEqual(p['locations'][0]['search_cutoff'],100)
        self.assertEqual([v['time'] for v in p['contours']],list(generate.TIMES))

    def test_ferry_canary_rejects_ignored_exclusion(self):
        def fake(path, body):
            if path=='/trace_attributes':return {'edges':[{'drive_on_right':False,'use':'road'}]}
            if len(body['locations'])==2 and body['locations'][0]['lat']==33.84989:
                return {'trip':{'status':0,'legs':[{'shape':'x'}],'summary':{'has_ferry':False}}}
            return {'trip':{'summary':{'has_ferry':True}}}
        with patch.object(canary,'post',side_effect=fake):
            with self.assertRaises(RuntimeError):canary.main()

    def test_ferry_canary_all_modes_valid(self):
        def fake(path, body):
            if path=='/isochrone':return ferry_iso(body)
            if path=='/trace_attributes':return {'edges':[{'drive_on_right':False,'use':'road'}]}
            if body['locations'][0]['lat'] in (33.84989,34.2467164,33.91338434607816,33.2294974) and body.get('costing_options',{}).get('auto',{}).get('use_ferry')==0 and not body.get('costing_options',{}).get('auto',{}).get('exclude_ferries'):
                return {'trip':{'status':0,'legs':[{'shape':'x'}],'summary':{'has_ferry':False}}}
            mode=body['costing'];opts=body['costing_options'][mode]
            if opts.get('exclude_ferries'):return {'error_code':170}
            result={'trip':{'summary':{'has_ferry':True}}}
            if mode=='pedestrian':result['trip']['warnings']=[{'code':401}]
            return result
        with patch.object(canary,'post',side_effect=fake):canary.main()

    def test_right_driving_is_rejected(self):
        with patch.object(canary,'post',side_effect=[{'trip':{'status':0,'legs':[{'shape':'x'}],'summary':{'has_ferry':False}}}, {'edges':[{'drive_on_right':True,'use':'road'}]}]):
            with self.assertRaises(RuntimeError):canary.verify_driving_side()

    def test_isochrone_ignored_exclusion_rejected(self):
        with patch.object(canary,'post',side_effect=lambda path,body:ferry_iso(body,force_positive=True)):
            with self.assertRaises(RuntimeError):canary.verify_isochrone('auto')

    def test_isochrone_warning_and_distant_snap_rejected(self):
        body={'costing':'auto','costing_options':{'auto':{'use_ferry':1}}}
        doc=ferry_iso(body);doc['warnings']=[{'code':1}]
        origin=canary.POINTS['auto'][0];point=[origin['lon'],origin['lat']]
        with self.assertRaises(RuntimeError):canary.isochrone_polygons(doc,point)
        doc=ferry_iso(body);doc['features'][-1]['geometry']['coordinates'].append([origin['lon']+.01,origin['lat']])
        with self.assertRaises(RuntimeError):canary.isochrone_polygons(doc,point)

    def test_boundary_holes_and_multipolygon(self):
        outer=[[0,0],[10,0],[10,10],[0,10],[0,0]]
        hole=[[3,3],[7,3],[7,7],[3,7],[3,3]]
        other=[[20,20],[22,20],[22,22],[20,22],[20,20]]
        polygons=[[outer,hole],[other]]
        self.assertTrue(canary.covers([1,1],polygons))
        self.assertFalse(canary.covers([5,5],polygons))
        self.assertTrue(canary.covers([3,5],polygons))
        self.assertTrue(canary.covers([0,5],polygons))
        self.assertTrue(canary.covers([21,21],polygons))
        self.assertFalse(canary.covers([15,15],polygons))


if __name__=='__main__':unittest.main()
