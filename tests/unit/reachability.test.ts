import {afterEach,describe,expect,it,vi} from 'vitest';
import {requestReachability} from '../../src/reachability';

const feature={type:'Feature',properties:{contour:30},geometry:{type:'Polygon',coordinates:[[[132.75,33.83],[132.78,33.83],[132.78,33.85],[132.75,33.85],[132.75,33.83]]]}};
const input={id:'example',lat:33.84,lng:132.76,mode:'walking' as const,minutes:30,signal:new AbortController().signal};
const data=()=>({version:1,id:'example',lat:33.84,lng:132.76,source_date:'2026-11-15T00:00:00Z',results:{walking:{status:'ok',snapped_distance_m:12,contours:{'30':feature}}}});
function respond(value:unknown,status=200){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})));}
afterEach(()=>vi.unstubAllGlobals());
describe('precomputed reachability',()=>{
  it('returns a validated polygon for the selected place and time',async()=>{
    respond(data());const result=await requestReachability(input);
    expect(result.geojson.features).toEqual([feature]);expect(result.snappedDistanceMeters).toBe(12);expect(result.sourceDate).toBe('2026-11-15');
  });
  it('does not display results for a different or missing place',async()=>{
    respond({...data(),id:'other'});await expect(requestReachability(input)).rejects.toThrow('一致しない');
    respond({},404);await expect(requestReachability(input)).rejects.toThrow('まだありません');
    respond(null);await expect(requestReachability(input)).rejects.toThrow('一致しない');
  });
  it('rejects missing roads or a distant snap',async()=>{
    respond({...data(),results:{walking:{status:'no_road'}}});await expect(requestReachability(input)).rejects.toThrow('道路が見つかりません');
    respond({...data(),results:{walking:{status:'ok',snapped_distance_m:250,contours:{'30':feature}}}});await expect(requestReachability(input)).rejects.toThrow('遠いため');
  });
  it('rejects malformed or non-polygon geometry',async()=>{
    respond({...data(),results:{walking:{status:'ok',snapped_distance_m:10,contours:{'30':{type:'Feature',geometry:{type:'Point',coordinates:[132.76,33.84]}}}}}});
    await expect(requestReachability(input)).rejects.toThrow('形状を確認できない');
  });
  it('does not display a contour near the edge of the road dataset',async()=>{
    respond({...data(),results:{walking:{status:'ok',snapped_distance_m:10,contours:{},limited_contours:['30']}}});
    await expect(requestReachability(input)).rejects.toThrow('道路データの端');
    respond({...data(),results:{walking:{status:'outside_data',snapped_distance_m:10,contours:{}}}});
    await expect(requestReachability(input)).rejects.toThrow('道路データの端');
  });
});
