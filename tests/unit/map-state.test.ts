import {describe,it,expect} from 'vitest';
import {readMapState,mapStateHash} from '../../src/engine';
import data from '../../data/poi/verified.json';
import islandData from '../../data/islands.json';
import topicData from '../../data/topics.json';
import type {Poi,Island,Topic} from '../../src/model';
const pois=data as Poi[],islands=islandData as Island[],topics=topicData as Topic[],categories=['自然','絶景 / 展望'];
const read=(hash:string)=>readMapState(hash,pois,islands,topics,categories,'秋');
describe('shareable map state',()=>{
  it('rejects unsupported values and Deep Dive without a valid place',()=>{
    expect(read('#poi=missing&island=missing&category=missing&topic=missing&season=missing&mode=drive&deep=1')).toEqual({poi:null,island:'all',q:'',category:'all',topic:null,season:'秋',mode:'walking',terrain:true,deep:false});
  });
  it('round trips Japanese queries and the full travel context',()=>{
    const s=read('#poi=sekizen&island=岩城島&q=桜+岩城&category=自然&topic=桜&terrain=0&deep=1&season=春&mode=cycling');
    expect(read(mapStateHash(s))).toEqual(s);expect(s.q).toBe('桜 岩城');expect(s.deep).toBe(true);expect(s.terrain).toBe(false);
  });
  it('keeps private bookmarks and location out of shared URLs',()=>{
    expect(mapStateHash(read(''))).toBe('#season=%E7%A7%8B');
    expect(mapStateHash(read('#saved=1&origin=34,133'))).not.toMatch(/saved|origin/);
  });
});
