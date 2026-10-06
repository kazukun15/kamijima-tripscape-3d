import distance from '@turf/distance';
import type {Context,Poi,Section,Island} from './model';
export const publicPoi=(p:Poi)=>['official_verified','multi_source_verified','coordinate_verified'].includes(p.verification_status)&&Number.isFinite(p.coordinates.lat)&&Number.isFinite(p.coordinates.lng)&&p.coordinates.lat!==null&&p.coordinates.lng!==null&&p.source_urls.length>0&&p.coordinate_source_urls.length>0;
export function normalize(text:string){return text.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/\s+/g,' ').trim();}
export function matchesIsland(i:Pick<Island,'name'|'kana'|'english'|'summary'|'search_terms'>,q:string){const text=normalize([i.name,i.kana,i.english,i.summary,...(i.search_terms||[])].join(' '));return normalize(q).split(' ').filter(Boolean).every(t=>text.includes(t));}
const aliases:Record<string,string[]>= {'夕日':['夕日','夕景','夕方'],'漫画':['漫画','マンガ','まんが'],'塩':['塩','製塩','藻塩','荘園'],'桜':['桜','さくら','春'],'レモン':['レモン','れもん','柑橘']};
export function matchesSearch(p:Poi,q:string){
  const text=normalize([p.name,p.name_kana,p.island,p.summary,...p.categories,...p.tags,...p.related_topics,...p.related_people,...p.deep_dive.map(s=>s.text)].join(' '));
  return normalize(q).split(' ').filter(Boolean).every(term=>{const list=aliases[term]||[term];return list.some(t=>text.includes(normalize(t)));});
}
export function kmBetween(a:Poi,b:Poi){return distance([a.coordinates.lng!,a.coordinates.lat!],[b.coordinates.lng!,b.coordinates.lat!]);}
export function recommend(selected:Poi,pois:Poi[],context:Context){
  return pois.filter(p=>p.id!==selected.id&&publicPoi(p)).map(p=>{
    let score=0;const reasons:string[]=[];
    if(p.island===selected.island){score+=5;reasons.push('同じ島');}
    if(context.island!=='all'&&p.island===context.island)score+=2;
    const themes=p.related_topics.filter(t=>selected.related_topics.includes(t));
    if(themes.length){score+=themes.length*3;reasons.push('つながるテーマ');}
    score+=p.tags.filter(t=>selected.tags.includes(t)).length;
    const km=kmBetween(selected,p);score+=Math.max(0,2-km/3);
    if(p.island===selected.island&&km<2)reasons.push('近くの場所');
    if(p.best_season.includes(context.season)){score+=2;reasons.push(`${context.season}の見どころ`);}
    if(p.access.modes.includes(context.mode))score+=1.5;
    if(context.hour>=16&&p.best_time.includes('夕方'))score+=1;
    if(p.categories.some(c=>context.categories.includes(c)))score+=1;
    if(context.history.includes(p.id))score-=4;
    if(selected.related_pois.includes(p.id))score+=3;
    return {poi:p,score,reasons:reasons.length?reasons:['別の島を発見'],km};
  }).sort((a,b)=>b.score-a.score||a.poi.id.localeCompare(b.poi.id)).slice(0,3);
}
export function orderedSections(sections:Section[],context:Context){
  return [...sections].sort((a,b)=>priority(b,context)-priority(a,context));
}
function priority(s:Section,c:Context){return (s.title.includes('季節')?2:0)+(c.mode==='cycling'&&s.title.includes('アクセス')?5:0)+(c.mode==='walking'&&s.title.includes('自然')?3:0)+(c.hour>=16&&s.title.includes('撮影')?4:0);}
const landIslands=new Set(['弓削島','佐島','生名島','岩城島']);
export function requiresFerry(originIsland:string|undefined,destination:string){return !originIsland||originIsland!==destination&&!(landIslands.has(originIsland)&&landIslands.has(destination));}
export function directionsUrl(p:Poi,mode:'walking'|'cycling',origin?:{lat:number;lng:number}){
  const u=new URL('https://www.google.com/maps/dir/');u.searchParams.set('api','1');
  u.searchParams.set('destination',`${p.coordinates.lat},${p.coordinates.lng}`);
  u.searchParams.set('travelmode',mode==='cycling'?'bicycling':'walking');
  if(origin)u.searchParams.set('origin',`${origin.lat},${origin.lng}`);
  return u.href;
}
