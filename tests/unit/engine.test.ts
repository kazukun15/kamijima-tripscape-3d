import {describe,it,expect} from 'vitest';
import {publicPoi,matchesSearch,matchesIsland,normalize,recommend,orderedSections,requiresFerry,directionsUrl,kmBetween} from '../../src/engine';
import data from '../../data/poi/verified.json';
import islands from '../../data/islands.json';
import type {Poi,Context} from '../../src/model';
const pois=data as Poi[],p=pois[0];
const context:Context={island:'all',season:'春',mode:'walking',hour:17,history:[],categories:[]};
describe('verified-only discovery',()=>{
  it('excludes missing coordinates, sources and pending regardless of score',()=>{
    expect(publicPoi(p)).toBe(true);
    for(const changed of [{verification_status:'pending'},{coordinates:{lat:null,lng:null}},{coordinate_source_urls:[]},{source_urls:[]},{coordinates:{lat:NaN,lng:133}}])expect(publicPoi({...p,...changed} as Poi)).toBe(false);
  });
  it('normalizes widths and kana',()=>{expect(normalize(' レモン　Ａ ')).toBe('れもん a');expect(matchesSearch(p,'せきぜんざん')).toBe(true);});
  it('finds sourced island themes without inventing mural POI coordinates',()=>{expect(islands.filter(i=>matchesIsland(i,'漫画')).map(i=>i.name)).toEqual(['高井神島']);expect(islands.filter(i=>matchesIsland(i,'マンガ')).map(i=>i.name)).toEqual(['高井神島']);expect(matchesSearch(pois.find(p=>p.id==='takaikami-light')!,'漫画')).toBe(false);});
  it('requires all search terms and discovers topics and people',()=>{expect(matchesSearch(p,'桜 岩城')).toBe(true);expect(matchesSearch(p,'桜 魚島')).toBe(false);expect(matchesSearch(pois.find(p=>p.id==='iwagi-museum')!,'若山牧水')).toBe(true);expect(matchesSearch(pois.find(p=>p.id==='loghouse')!,'塩')).toBe(true);});
  it('does not mutate source sections when arranging by travel context',()=>{const s=[{title:'自然',text:'a',source_urls:[]},{title:'アクセス',text:'b',source_urls:[]}];expect(orderedSections(s,{...context,mode:'cycling'})[0].title).toBe('アクセス');expect(s[0].title).toBe('自然');});
});
describe('recommendations and access',()=>{
  it('excludes selected and pending records, returns reasons and valid distances',()=>{const results=recommend(p,[...pois,{...p,id:'unverified',verification_status:'pending'}],context);expect(results).toHaveLength(3);for(const r of results){expect(r.poi.id).not.toBe(p.id);expect(r.poi.id).not.toBe('unverified');expect(r.reasons.length).toBeGreaterThan(0);expect(r.km).toBeGreaterThanOrEqual(0);}});
  it('penalizes previously visited places without deleting them',()=>{const candidates=pois.slice(0,3);const first=recommend(p,candidates,context);const after=recommend(p,candidates,{...context,history:[first[0].poi.id]});expect(after.find(r=>r.poi.id===first[0].poi.id)!.score).toBe(first[0].score-4);});
  it('uses real distance symmetrically',()=>{expect(kmBetween(p,p)).toBe(0);expect(kmBetween(p,pois[1])).toBeCloseTo(kmBetween(pois[1],p));});
  it('distinguishes bridge-connected islands from ferry islands',()=>{expect(requiresFerry('弓削島','岩城島')).toBe(false);expect(requiresFerry('弓削島','豊島')).toBe(true);expect(requiresFerry('豊島','豊島')).toBe(false);expect(requiresFerry(undefined,'岩城島')).toBe(true);});
  it('creates encoded destination routes and only includes a supplied origin',()=>{const u=new URL(directionsUrl(p,'cycling',{lat:34.25,lng:133.2}));expect(u.searchParams.get('travelmode')).toBe('bicycling');expect(u.searchParams.get('origin')).toBe('34.25,133.2');expect(u.searchParams.get('destination')).toBe(`${p.coordinates.lat},${p.coordinates.lng}`);expect(new URL(directionsUrl(p,'walking')).searchParams.has('origin')).toBe(false);});
});
