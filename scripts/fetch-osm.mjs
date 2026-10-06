import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const bboxes=[[133.10,34.22,133.26,34.32],[133.26,34.22,133.42,34.32],[133.10,34.12,133.26,34.22],[133.26,34.12,133.42,34.22]];
const elements=new Map();
const sources=[];
for(let i=0;i<bboxes.length;i++){
  const url=`https://api.openstreetmap.org/api/0.6/map?bbox=${bboxes[i].join(',')}`,path=`research/raw/osm-${i}.xml`;
  let xml;
  try{xml=await readFile(path,'utf8');}catch{
    const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`OSM ${r.status}`);
    xml=await r.text();await writeFile(path,xml);
  }
  const $=load(xml,{xml:true});
  $('node,way').each((_,el)=>{
    const e=$(el),type=el.name,tags={};e.children('tag').each((_,t)=>{tags[$(t).attr('k')]=$(t).attr('v');});
    const item={type,id:Number(e.attr('id')),tags};
    if(type==='node'){item.lat=Number(e.attr('lat'));item.lon=Number(e.attr('lon'));}
    else item.nodes=e.children('nd').toArray().map(n=>Number($(n).attr('ref')));
    elements.set(`${type}/${item.id}`,item);
  });
  sources.push(url);console.log(`OSM section ${i+1}: ${elements.size}`);
}
const list=[...elements.values()],nodes=new Map(list.filter(e=>e.type==='node').map(e=>[e.id,e]));
for(const way of list.filter(e=>e.type==='way')){
  way.geometry=way.nodes.map(id=>nodes.get(id)).filter(Boolean).map(n=>({lat:n.lat,lon:n.lon}));
  if(way.geometry.length){way.center={lat:way.geometry.reduce((a,n)=>a+n.lat,0)/way.geometry.length,lon:way.geometry.reduce((a,n)=>a+n.lon,0)/way.geometry.length};}
}
await writeFile('research/osm.json',JSON.stringify({elements:list},null,2));
await writeFile('research/osm-provenance.json',JSON.stringify({sources,checked_at:new Date().toISOString(),license:'ODbL 1.0'},null,2));
console.log(`Named: ${list.filter(e=>e.tags.name).length}; roads: ${list.filter(e=>e.tags.highway).length}`);
