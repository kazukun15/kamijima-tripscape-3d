import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
const metadata=JSON.parse(await readFile('research/terrain-verification.json','utf8'));
const tasks=metadata.tiles.map(({z,x,y})=>({z,x,y}));let next=0,downloaded=0;
await Promise.all(Array.from({length:4},async()=>{
 while(next<tasks.length){
  const {z,x,y}=tasks[next++],path=`public/basemap/${z}/${x}/${y}.png`;
  if(await access(path).then(()=>true,()=>false))continue;
  const url=`https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`;
  const r=await fetch(url,{signal:AbortSignal.timeout(35000)});if(!r.ok)throw new Error(`${r.status} ${url}`);
  await mkdir(`public/basemap/${z}/${x}`,{recursive:true});await writeFile(path,Buffer.from(await r.arrayBuffer()));downloaded++;
  if(downloaded%40===0)console.log(`Cached ${downloaded} additional base tiles`);
 }
}));
metadata.base_map_tiles=tasks.length;metadata.base_map_maxzoom=14;
await writeFile('research/terrain-verification.json',JSON.stringify(metadata,null,2));
console.log(`Ready: ${tasks.length} base tiles, ${downloaded} downloaded.`);
