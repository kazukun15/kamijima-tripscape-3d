import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const [poi,pending,islands,topics,stats,schema,geo,published]=await Promise.all(['data/poi/verified.json','research/pending.json','data/islands.json','data/topics.json','data/stats.json','requirements/tourism_poi.schema.json','public/data/pois.geojson','public/data/poi.json'].map(read));
const county=await read('data/ehime-pois.json');
assert.ok(county.length>0,'Prefecture dataset is empty');
assert.equal(new Set(county.map(p=>p.id)).size,county.length,'Duplicate prefecture POI ids');
const municipalities=['松山市','今治市','宇和島市','八幡浜市','新居浜市','西条市','大洲市','伊予市','四国中央市','西予市','東温市','上島町','久万高原町','松前町','砥部町','内子町','伊方町','松野町','鬼北町','愛南町'];
assert.deepEqual([...new Set([...county.map(p=>p.municipality),'上島町'])].sort(),[...municipalities].sort(),'Prefecture municipality coverage changed');
for(const p of county){
  assert.ok(p.id&&p.name&&p.municipality&&p.location_scope,`Incomplete prefecture POI: ${p.id}`);
  assert.ok(Number.isFinite(p.lat)&&p.lat>=32.65&&p.lat<=34.5&&Number.isFinite(p.lng)&&p.lng>=131.95&&p.lng<=133.9,`Invalid coordinates: ${p.id}`);
  if(p.coordinates)assert.deepEqual(p.coordinates,{lat:p.lat,lng:p.lng});
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.checked_at)&&p.license);
  if(p.collection==='regional-spots-2026-11-15')assert.ok(p.summary&&p.coordinate_evidence,`Missing regional spot evidence: ${p.id}`);
  for(const url of [p.source_url,p.source_data_url,p.license_url].filter(Boolean))assert.equal(new URL(url).protocol,'https:');
}
const valid=new Ajv2020({strict:false}).compile(schema);
const ids=new Set(poi.map(p=>p.id)),names=new Set(islands.map(i=>i.name)),topicIds=new Set(topics.map(t=>t.id));
assert.equal(ids.size,poi.length,'Duplicate public ids');assert.equal(islands.length,8);
for(const p of poi){
  assert.ok(valid(p),`${p.id}: ${JSON.stringify(valid.errors)}`);
  assert.ok(['official_verified','multi_source_verified','coordinate_verified'].includes(p.verification_status));
  assert.ok(names.has(p.island),`Unknown island ${p.id}`);
  assert.ok(Number.isFinite(p.coordinates.lat)&&p.coordinates.lat>=34.10&&p.coordinates.lat<=34.34);
  assert.ok(Number.isFinite(p.coordinates.lng)&&p.coordinates.lng>=133.05&&p.coordinates.lng<=133.43);
  assert.ok(p.coordinate_source_urls.length&&p.coordinate_source&&p.location_scope);
  assert.ok(p.source_urls.length&&p.deep_dive.length>=2&&p.reference_date&&p.last_verified_at);
  for(const url of [...p.source_urls,...p.coordinate_source_urls,...p.deep_dive.flatMap(s=>s.source_urls)])assert.equal(new URL(url).protocol,'https:');
  for(const id of p.related_pois)assert.ok(ids.has(id)&&id!==p.id);
  for(const id of p.related_topics)assert.ok(topicIds.has(id),`Unknown theme ${id}`);
  for(const s of p.deep_dive)assert.ok(s.text&&s.source_urls.length);
}
for(const p of pending){assert.equal(p.verification_status,'pending');assert.equal(p.coordinates.lat,null);assert.equal(p.coordinates.lng,null);assert.ok(!ids.has(p.id));}
for(const i of islands)assert.ok(poi.some(p=>p.island===i.name),`No verified location: ${i.name}`);
assert.equal(stats.verified,poi.length);assert.equal(stats.pending,pending.length);
assert.equal(stats.official_inventory+stats.additional_pois,poi.length+pending.length);
assert.deepEqual(published,poi);assert.deepEqual(geo.features.map(f=>f.properties.id).sort(),[...ids].sort());
for(const f of geo.features){const p=poi.find(p=>p.id===f.properties.id);assert.deepEqual(f.geometry.coordinates,[p.coordinates.lng,p.coordinates.lat]);}
for(const [island,n] of Object.entries(stats.by_island))assert.equal(n,poi.filter(p=>p.island===island).length);
console.log(`Validated ${poi.length} Kamijima POIs, ${county.length} sourced Ehime POIs, ${pending.length} isolated candidates, ${islands.length} islands and ${topics.length} themes.`);
