import {load} from 'cheerio';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const date = new Date().toISOString().slice(0,10);
await mkdir('research/raw', {recursive:true});
const log=[];
async function page(url, key) {
  const path=`research/raw/${key}.html`;
  try { return await readFile(path,'utf8'); } catch { /* cache miss */ }
  const r=await fetch(url, {signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw new Error(`${r.status}: ${url}`);
  const html=(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/AIza[\w-]+/g,'[REDACTED]');
  await writeFile(path,html);
  log.push({url,status:r.status,checked_at:date,sha256:createHash('sha256').update(html).digest('hex')});
  return html;
}
const $=load(await page('https://kamijima.info/all/','all'));
const inventory=[];
$('.tile').each((_,el)=>{
  const e=$(el), url=e.children('a[href]').attr('href'), name=e.find('h2').text().replace(/\s+/g,' ').trim();
  if(!url || !name) return;
  inventory.push({id:url.split('/').filter(Boolean).at(-1), name, island:e.find('.area span').text().trim(), url, group:e.attr('class'), teaser:e.find('h3').text().replace(/\s+/g,' ').trim()});
});
const unique=[...new Map(inventory.map(x=>[x.url,x])).values()];
const slugCounts=new Map();for(const p of unique)slugCounts.set(p.id,(slugCounts.get(p.id)||0)+1);
await writeFile('research/inventory.json',JSON.stringify(unique,null,2));
console.log(`Official inventory: ${unique.length}`);
let cursor=0;
const results=[];
async function worker(){
  while(cursor<unique.length){
    const item=unique[cursor++];
    try{
      const cacheKey=slugCounts.get(item.id)>1?item.url.split('/').filter(Boolean).slice(-2).join('-'):item.id;
      const html=await page(item.url,cacheKey), p=load(html);
      const table={};
      p('.profile table tr').each((_,el)=>{table[p(el).find('th').text().trim()]=p(el).find('td').text().replace(/\s+/g,' ').trim();});
      const markers=p('[data-lat][data-lng]').toArray().map(el=>({lat:Number(p(el).attr('data-lat')),lng:Number(p(el).attr('data-lng'))}));
      const links=p('.guide a[href], .profile a[href]').toArray().map(el=>p(el).attr('href')).filter(u=>/^https?:/.test(u));
      results.push({...item,description:p('.profile > p').text().replace(/\s+/g,' ').trim(), table, markers, links, modified:p('meta[property="article:modified_time"]').attr('content')||null});
    }catch(e){log.push({url:item.url,error:String(e),checked_at:date});results.push({...item,error:String(e)});}
    if(results.length%20===0) console.log(`Details ${results.length}/${unique.length}`);
  }
}
await Promise.all([worker(),worker()]);
await writeFile('research/official-details.json',JSON.stringify(results,null,2));
for(const slug of ['yugejima','sashima','ikinajima','iwagijima','uoshima','takaikamijima','toyoshima','tsunamijima','concerned','access','accessmap']){
  try{
    const html=await page(`https://kamijima.info/${slug}/`,slug), s=load(html);
    const links=s('a[href]').toArray().map(el=>({title:s(el).text().trim(),url:s(el).attr('href')}));
    await writeFile(`research/${slug}-links.json`,JSON.stringify(links.filter(x=>/\.pdf|town\.kamijima/.test(x.url)),null,2));
  }catch(e){log.push({url:`https://kamijima.info/${slug}/`,error:String(e),checked_at:date});}
}
const query='[out:json][timeout:60];(nwr["name"](34.12,133.10,34.32,133.42);way["building"]["height"](34.12,133.10,34.32,133.42););out center geom;';
try{
  const r=await fetch('https://overpass-api.de/api/interpreter', {method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(90000)});
  if(!r.ok) throw new Error(`Overpass ${r.status}`);
  const osm=await r.json();
  await writeFile('research/osm.json',JSON.stringify(osm,null,2));
  console.log(`OSM features ${osm.elements.length}`);
  log.push({url:'https://overpass-api.de/api/interpreter',query,checked_at:date,license:'ODbL 1.0'});
}catch(e){log.push({source:'OSM',error:String(e),checked_at:date});}
await writeFile('research/fetch-log.json',JSON.stringify(log,null,2));
console.log('Research snapshots saved.');
