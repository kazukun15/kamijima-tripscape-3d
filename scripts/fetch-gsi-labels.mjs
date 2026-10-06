import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
await mkdir('research/raw/vector',{recursive:true});
const bbox=[133.10,34.12,133.42,34.32];
const tile=(lon,lat,z)=>[Math.floor((lon+180)/360*2**z),Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z)];
const labels=[];
const symbols=[];
const z=Number(process.argv[2]||12),a=tile(bbox[0],bbox[3],z),b=tile(bbox[2],bbox[1],z);
for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++){
  const url=`https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/${z}/${x}/${y}.pbf`,path=`research/raw/vector/${z}-${x}-${y}.pbf`;
  try{
    let data;try{data=await readFile(path);}catch{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(String(r.status));data=Buffer.from(await r.arrayBuffer());await writeFile(path,data);}
    const v=new VectorTile(new Pbf(data));
    for(const [name,layer] of Object.entries(v.layers)){
      if(!['label','symbol'].includes(name))continue;
      for(let i=0;i<layer.length;i++){
        const f=layer.feature(i).toGeoJSON(x,y,z);
        if(f.geometry.type==='Point')(name==='label'?labels:symbols).push({...f,properties:{...f.properties,source_url:url}});
      }
    }
  }catch(e){console.log('GSI label tile',x,y,String(e));}
}
await writeFile(`research/gsi-labels${z===12?'':'-'+z}.json`,JSON.stringify(labels,null,2));
await writeFile(`research/gsi-symbols-${z}.json`,JSON.stringify(symbols,null,2));
console.log(`GSI z${z}: ${labels.length} labels / ${symbols.length} symbols`);
console.log(labels.filter(f=>/港|積善山|灯台|展望|久司|立石|三秀|高井神島/.test(f.properties.knj||f.properties.name||'')).map(f=>({properties:f.properties,coordinates:f.geometry.coordinates})));
