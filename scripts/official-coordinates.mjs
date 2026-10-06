import {readFile,writeFile} from 'node:fs/promises';
const points=[];
for(const id of ['289','3102']){
  const s=await readFile(`research/raw/ehime-${id}.html`,'utf8');
  const r=/id:\s*"([^"]+)"\s*,name:\s*"([^"]+)"\s*,latitude:\s*"([^"]+)"\s*,longitude:\s*"([^"]+)"/g;
  for(const m of s.matchAll(r))points.push({id:m[1],name:m[2],lat:+m[3],lng:+m[4],source:`https://www.iyokannet.jp/spot/${id}`,own_url:`https://www.iyokannet.jp/spot/${m[1]}`});
}
const unique=[...new Map(points.map(x=>[x.id,x])).values()];
await writeFile('research/ehime-points.json',JSON.stringify(unique,null,2));
console.log(unique.filter(x=>x.lng>133.11).map(x=>`${x.id} ${x.name} ${x.lat},${x.lng}`).join('\n'));
const areas=[];
for(const name of ['弓削島','佐島','生名島','岩城島','魚島','高井神島','豊島','津波島']){
  const url=`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent('上島町'+name)}`;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(String(r.status));const d=await r.json();areas.push({name,url,results:d});console.log(name,JSON.stringify(d));}
  catch(e){areas.push({name,url,error:String(e)});}
}
await writeFile('research/gsi-islands.json',JSON.stringify(areas,null,2));
