import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {load} from 'cheerio';
await mkdir('research/raw',{recursive:true});
const query='[out:json][timeout:35];(nwr["name"](34.12,133.10,34.32,133.42);way["building"]["height"](34.12,133.10,34.32,133.42););out center geom;';
for(const host of ['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter']){
  try{
    const r=await fetch(`${host}?data=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(60000)});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const d=await r.json();await writeFile('research/osm.json',JSON.stringify(d,null,2));
    await writeFile('research/osm-provenance.json',JSON.stringify({url:host,query,checked_at:new Date().toISOString(),license:'ODbL 1.0'},null,2));
    console.log(`OSM ${d.elements.length} features`);break;
  }catch(e){console.log(host,String(e));}
}
const details=JSON.parse(await readFile('research/official-details.json','utf8'));
const urls=[...new Set(details.flatMap(p=>(p.links||[]).filter(l=>/iyokannet.jp\/spot/.test(l))))];
const supplementary=[];
for(const url of urls){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const html=(await r.text()).replace(/AIza[\w-]+/g,'[REDACTED]'), $=load(html);
    await writeFile(`research/raw/ehime-${url.split('/').at(-1)}.html`,html);
    const coordinateLines=html.split('\n').filter(x=>/34\.\d+|133\.\d+|data-lat|latitude|longitude/.test(x)).map(s=>s.replace(/AIza[\w-]+/g,'[REDACTED]'));
    supplementary.push({url,title:$('title').text(),coordinateLines});
  }catch(e){supplementary.push({url,error:String(e)});}
}
await writeFile('research/ehime-coordinates.json',JSON.stringify(supplementary,null,2));
console.log(`Ehime pages ${supplementary.length}`);
for(const name of ['kamijima_guidebook_jp','kamijima_guidemap_en','yumeshima_cyclingmap']){
  const url=`https://kamijima.info/pdf/${name}.pdf`;
  const r=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(r.ok){await writeFile(`research/raw/${name}.pdf`,Buffer.from(await r.arrayBuffer()));console.log(name,'downloaded');}
}
