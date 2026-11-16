#!/usr/bin/env python3
"""Synthetic fixtures only; does not claim a real Valhalla build works."""
import copy
import unittest
from unittest.mock import patch
import canary
import generate

ORIGIN = [132.7, 33.8]
RING = [[132.69,33.79],[132.71,33.79],[132.71,33.81],[132.69,33.79]]


def sample():
    features = [{'type':'Feature','properties':{'contour':n,'metric':'time'},
                 'geometry':{'type':'Polygon','coordinates':[RING]}} for n in generate.TIMES]
    features += [{'type':'Feature','properties':{'type':'input'},'geometry':{'type':'Point','coordinates':ORIGIN}},
                 {'type':'Feature','properties':{'type':'snapped'},'geometry':{'type':'MultiPoint','coordinates':[[132.7001,33.8]]}}]
    return {'type':'FeatureCollection','features':features}


class IsoFixtures(unittest.TestCase):
    def test_all_contours_and_snap(self):
        d, contours = generate.parse_isochrone(sample(), ORIGIN)
        self.assertGreater(d, 0)
        self.assertLess(d, 100)
        self.assertEqual(set(contours), {'10','20','30','60'})
        self.assertEqual(contours['10']['geometry']['type'], 'Polygon')

    def test_multiple_features_preserved(self):
        doc = sample();doc['features'].append(copy.deepcopy(doc['features'][0]))
        _, contours = generate.parse_isochrone(doc, ORIGIN)
        self.assertEqual(contours['10']['geometry']['type'], 'MultiPolygon')
        self.assertEqual(len(contours['10']['geometry']['coordinates']), 2)

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

    def test_bad_or_near_boundary_ring_rejected(self):
        doc=sample();doc['features'][0]['geometry']['coordinates']=[[[132.7,33.8],[132.71,33.8],[132.71,33.81]]]
        with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)
        doc=sample();doc['features'][0]['geometry']['coordinates']=[[[131.41,33.8],[131.42,33.8],[131.42,33.81],[131.41,33.8]]]
        with self.assertRaises(generate.BuildFailure): generate.parse_isochrone(doc, ORIGIN)

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
            if path=='/trace_attributes':return {'edges':[{'drive_on_right':False,'use':'road'}]}
            if body['locations'][0]['lat'] in (33.84989,34.2467164,33.91338434607816,33.2294974) and body.get('costing_options',{}).get('auto',{}).get('use_ferry')==0:
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


if __name__=='__main__':unittest.main()
