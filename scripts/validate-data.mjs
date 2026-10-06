import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const [poi,pending,islands,topics,stats,schema,geo,published]=await Promise.all(['data/poi/verified.json','research/pending.json','data/islands.json','data/topics.json','data/stats.json','requirements/tourism_poi.schema.json','public/data/pois.geojson','public/data/poi.json'].map(read));
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
console.log(`Validated ${poi.length} public POIs, ${pending.length} isolated candidates, ${islands.length} islands, ${topics.length} themes; schema, sources, relations and GeoJSON agree.`);
