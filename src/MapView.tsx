import {useCallback,useEffect,useRef,useState} from 'react';
import maplibregl,{type Map as LibreMap,type StyleSpecification} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Navigation,RotateCcw,Plus,Minus,Layers,Mountain} from 'lucide-react';
import type {Island,Poi} from './model';
import {publicPoi} from './engine';
import {installMarkerLabels} from './markerLabels';
import {loadGsiTerrain} from './gsiTerrain';

export interface CountyMapPoi {id:string;name:string;lat:number;lng:number;}
export interface ViewRequest {kind:'overview'|'island'|'poi'|'countyPoi'|'location';id?:string;coordinates?:[number,number];nonce:number;}
interface Props {pois:Poi[];visible:Poi[];islands:Island[];selected:string|null;countyPois?:CountyMapPoi[];selectedCountyPoi?:string|null;onCountyPoi?:(id:string)=>void;view:ViewRequest;mobileSheet:'compact'|'detail'|'deep';onPoi:(id:string)=>void;onIsland:(name:string)=>void;terrain:boolean;onTerrain:(value:boolean)=>void;onStatus:(text:string)=>void;onLocate:()=>void;}
const base=import.meta.env.BASE_URL;
const localTiles=(folder:string)=>new URL(`${base}${folder}/{z}/{x}/{y}.png`,location.href).href.replace(/%7B/g,'{').replace(/%7D/g,'}');
const bounds:[number,number,number,number]=[133.05,34.10,133.43,34.34];
const ehimeBounds:[[number,number],[number,number]]=[[131.95,32.65],[133.95,34.5]];
const attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>（標高を加工）｜Shoreline data: U.S. NIMA, Vector Map Level 0 (VMAP0)';
maplibregl.addProtocol('gsi-dem',(request,controller)=>loadGsiTerrain(request.url,controller.signal,base));
const emptyGeo={type:'FeatureCollection' as const,features:[]};
function createPoiMarker(p:Poi,selected:boolean,onPoi:(id:string)=>void){
  const el=document.createElement('button');el.className=`poi-marker ${selected?'selected':''}`;
  el.type='button';el.title=p.name;el.dataset.poiId=p.id;
  el.setAttribute('aria-label',`地図で${p.name}を開く`);el.setAttribute('aria-pressed',String(selected));
  const pin=document.createElement('span');pin.className='marker-pin';pin.setAttribute('aria-hidden','true');
  pin.innerHTML='<svg viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 42C14 37 2 26 2 17a15 15 0 0 1 30 0c0 9-12 20-15 25Z" fill="currentColor" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><circle cx="17" cy="17" r="5" fill="white"/></svg>';
  const label=document.createElement('span');label.className='marker-name';label.textContent=p.name;
  el.append(pin,label);el.addEventListener('click',e=>{e.stopPropagation();onPoi(p.id);});return el;
}
function countyButton(p:CountyMapPoi,selected:boolean,onSelect:(id:string)=>void){
  const el=document.createElement('button');el.type='button';el.className=`poi-marker county-marker ${selected?'selected':''}`;el.dataset.poiId=p.id;
  el.setAttribute('aria-label',`地図で${p.name}を開く`);el.setAttribute('aria-pressed',String(selected));
  const pin=document.createElement('span');pin.className='marker-pin';pin.setAttribute('aria-hidden','true');
  pin.innerHTML='<svg viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 42C14 37 2 26 2 17a15 15 0 0 1 30 0c0 9-12 20-15 25Z" fill="currentColor" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><circle cx="17" cy="17" r="5" fill="white"/></svg>';
  const label=document.createElement('span');label.className='marker-name';label.textContent=p.name;el.append(pin,label);
  el.addEventListener('click',e=>{e.stopPropagation();onSelect(p.id);});return el;
}
function clusterButton(count:number,onClick:()=>void){
  const el=document.createElement('button');el.type='button';el.className='county-cluster';el.textContent=String(count);
  el.setAttribute('aria-label',`${count}件の観光地点を拡大`);
  Object.assign(el.style,{width:'44px',height:'44px',borderRadius:'50%',background:'#b86838',color:'#fff',border:'2px solid white',boxShadow:'0 2px 8px #1238',fontWeight:'700',fontSize:'14px',display:'grid',placeItems:'center'});
  el.onclick=e=>{e.stopPropagation();onClick();};return el;
}
function showCountyList(group:CountyMapPoi[],onSelect:(id:string)=>void){
  document.querySelector('.county-cluster-list')?.remove();
  const trigger=document.activeElement as HTMLElement|null;
  const box=document.createElement('div');box.className='county-cluster-list';box.setAttribute('role','dialog');box.setAttribute('aria-label','重なっている観光地点');
  Object.assign(box.style,{position:'fixed',zIndex:'200',left:'50%',top:'50%',transform:'translate(-50%, -50%)',width:'min(320px, calc(100vw - 32px))',maxHeight:'min(320px, 70dvh)',overflow:'auto',padding:'16px',background:'#fffefa',borderRadius:'12px',boxShadow:'0 8px 40px #163b4055',border:'1px solid #b9d2c7'});
  const heading=document.createElement('strong');heading.textContent='この周辺の観光地点';box.append(heading);
  const dismiss=()=>{box.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.setAttribute('aria-label','地点一覧を閉じる');Object.assign(close.style,{float:'right',padding:'6px',minHeight:'44px'});close.onclick=dismiss;box.append(close);
  for(const p of group){const button=document.createElement('button');button.type='button';button.textContent=p.name;Object.assign(button.style,{display:'block',width:'100%',minHeight:'44px',textAlign:'left',padding:'10px 4px',borderTop:'1px solid #dce9e2'});button.onclick=()=>{box.remove();onSelect(p.id);};box.append(button);}
  box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();dismiss();}});document.body.append(box);close.focus();
}
const sameCoordinate=(group:CountyMapPoi[])=>group.every(p=>p.lat===group[0].lat&&p.lng===group[0].lng);
function groupCounty(pois:CountyMapPoi[],project:(p:CountyMapPoi)=>{x:number;y:number},selected:string|null|undefined){
  const items=pois.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)),points=items.map(project),parents=items.map((_,i)=>i);
  const root=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    if(items[i].id===selected||items[j].id===selected)continue;
    const dx=points[i].x-points[j].x,dy=points[i].y-points[j].y;
    if(dx*dx+dy*dy<56*56)parents[root(j)]=root(i);
  }
  const groups=new Map<number,CountyMapPoi[]>();items.forEach((p,i)=>{const key=root(i),group=groups.get(key)||[];group.push(p);groups.set(key,group);});
  return Array.from(groups.values());
}
export function createMapStyle():StyleSpecification {
  return {version:8,sources:{
    base:{type:'raster',tiles:['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],tileSize:256,minzoom:5,maxzoom:18,attribution},
    'base-local':{type:'raster',tiles:[localTiles('basemap')],tileSize:256,minzoom:8,maxzoom:14,bounds},
    terrain:{type:'raster-dem',tiles:['gsi-dem://{z}/{x}/{y}'],tileSize:256,minzoom:1,maxzoom:14,encoding:'mapbox',attribution},
    buildings:{type:'geojson',data:emptyGeo},
  },layers:[
    {id:'sea',type:'background',paint:{'background-color':'#dcecf0'}},
    {id:'base',type:'raster',source:'base',paint:{'raster-saturation':-.12,'raster-fade-duration':0}},
    {id:'base-local',type:'raster',source:'base-local',paint:{'raster-saturation':-.12,'raster-fade-duration':0}},
    {id:'shade',type:'hillshade',source:'terrain',paint:{'hillshade-exaggeration':.32,'hillshade-shadow-color':'#385a50','hillshade-highlight-color':'#f9f7dd','hillshade-accent-color':'#a8b1a0'}},
    // Empty until geometry AND explicit numeric heights have been verified. No invented default height.
    {id:'buildings',type:'fill-extrusion',source:'buildings',filter:['all',['has','height'],['>', ['get','height'],0]],paint:{'fill-extrusion-height':['get','height'],'fill-extrusion-base':0,'fill-extrusion-color':'#829994','fill-extrusion-opacity':.7}},
  ]};
}
function webglAvailable(){try{const c=document.createElement('canvas');const context=c.getContext('webgl2')||c.getContext('webgl');if(!context)return false;context.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}}

// The map spans the screen behind the panels. Aim at the part that is actually
// visible, and recompute these insets when a sheet or the viewport changes.
function cameraPadding(host:HTMLElement,selected:boolean){
  const bounds=host.getBoundingClientRect(),main=host.closest('main')||host;
  const padding={top:55,bottom:100,left:40,right:40};
  const mobile=window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
  for(const el of main.querySelectorAll<HTMLElement>('.explorer,.detail-panel,.welcome-card')){
    const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
    if(mobile){
      if(el.matches('.detail-panel')&&selected)padding.bottom=Math.max(padding.bottom,bounds.bottom-rect.top+20);
    }else if(rect.left<bounds.left+bounds.width/2){
      padding.left=Math.max(padding.left,rect.right-bounds.left+24);
    }else padding.right=Math.max(padding.right,bounds.right-rect.left+24);
  }
  if(mobile){
    padding.top=110;
    padding.bottom=Math.max(padding.bottom,selected?100:155);
    // The deepest sheet must still leave room for the complete pin above it.
    if(selected&&bounds.height<650)padding.top=150;
    padding.left=30;padding.right=30;
  }
  return padding;
}

function selectedPinOffset(host:HTMLElement):[number,number]|null {
  const pin=host.querySelector<HTMLElement>('.poi-marker.selected');if(!pin)return null;
  const rect=pin.getBoundingClientRect(),bounds=host.getBoundingClientRect(),gap=6;
  const obstacles=Array.from((host.closest('main')||host).querySelectorAll<HTMLElement>('.explorer,.detail-panel,.welcome-card,.map-toolbar,.mobile-map-settings,.mobile-search,.map-actions,.pitch-control,.map-breadcrumb,.journey-strip,.mobile-explore-toggle,.landscape-dock,.dock-attribution,.map-status')).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
  const valid=(left:number,top:number)=>left>=bounds.left+gap&&top>=bounds.top+gap&&left+rect.width<=bounds.right-gap&&top+rect.height<=bounds.bottom-gap&&!obstacles.some(r=>left<r.right+gap&&left+rect.width>r.left-gap&&top<r.bottom+gap&&top+rect.height>r.top-gap);
  if(valid(rect.left,rect.top))return null;
  const xs=new Set([rect.left,bounds.left+gap,bounds.right-gap-rect.width]),ys=new Set([rect.top,bounds.top+gap,bounds.bottom-gap-rect.height]);
  for(const r of obstacles){xs.add(r.right+gap);xs.add(r.left-gap-rect.width);ys.add(r.bottom+gap);ys.add(r.top-gap-rect.height);}
  let best=Infinity,offset:[number,number]|null=null;
  for(const top of ys)for(const left of xs){const distance=(left-rect.left)**2+(top-rect.top)**2;if(distance<best&&valid(left,top)){best=distance;offset=[rect.left-left,rect.top-top];}}
  return offset;
}

export default function MapView(props:Props){
  const host=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),latest=useRef(props);
  const raster=useRef<import('leaflet').Map|null>(null);
  const markers=useRef(new Map<string,maplibregl.Marker>()),islandMarkers=useRef<maplibregl.Marker[]>([]);
  const countyMarkers=useRef(new Map<string,maplibregl.Marker>());
  const [fallback,setFallback]=useState(()=>new URLSearchParams(location.search).get('renderer')==='2d'||!webglAvailable());
  const [ready,setReady]=useState(false),[mapType,setMapType]=useState<'local'|'photo'>('local'),[pitch,setPitch]=useState(48);
  const [demFailed,setDemFailed]=useState(false),[shade,setShade]=useState(true);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [clusterKamijima,setClusterKamijima]=useState(true);
  const [expandedKamijima,setExpandedKamijima]=useState(false);
  const [rasterReady,setRasterReady]=useState(false),[viewportRevision,setViewportRevision]=useState(0);
  const onRasterReady=useCallback((value:import('leaflet').Map|null)=>{raster.current=value;setRasterReady(!!value);},[]);
  latest.current=props;
  useEffect(()=>{
    if(fallback||!host.current)return;
    let m:LibreMap,terrainFailed=false;
    try{
      m=new maplibregl.Map({container:host.current,style:createMapStyle(),center:[132.8,33.6],zoom:7.2,pitch:latest.current.terrain?48:0,bearing:-12,minZoom:5,maxZoom:18,maxPitch:80,maxBounds:[[128,30],[137,37]],attributionControl:{compact:true},dragRotate:true,renderWorldCopies:false,fadeDuration:0});
      map.current=m;
    }catch{setFallback(true);props.onStatus('WebGLを利用できないため2D地図を表示');return;}
    m.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:'metric'}),'bottom-left');
    const labels=installMarkerLabels(host.current);m.on('render',labels.schedule);
    let initialized=false;
    const initialize=()=>{
      if(initialized)return;initialized=true;
      m.setTerrain(latest.current.terrain&&!terrainFailed?{source:'terrain',exaggeration:1}:null);
      setReady(true);
      host.current?.setAttribute('data-map-ready','true');
      for(const island of latest.current.islands){
        const el=document.createElement('button');el.className='island-marker';el.textContent=island.name;el.style.zIndex='2';
        el.style.display=m.getZoom()<9.5?'none':'';
        el.setAttribute('aria-label',`地図から${island.name}を選択`);
        el.addEventListener('click',e=>{e.stopPropagation();latest.current.onIsland(island.name);});
        islandMarkers.current.push(new maplibregl.Marker({element:el,anchor:'center',offset:[0,22]}).setLngLat(island.coordinates).addTo(m));
      }
    };
    m.on('style.load',initialize);m.on('load',initialize);
    m.on('error',e=>{
      const source=(e as {sourceId?:string}).sourceId;
      if(source==='terrain'||source==='shade'){
        terrainFailed=true;setDemFailed(true);m.setTerrain(null);m.setPitch(0);
        if(m.getLayer('shade'))m.setLayoutProperty('shade','visibility','none');
        latest.current.onTerrain(false);latest.current.onStatus('標高を読み込めないため2D表示');
      }else if(source==='base')latest.current.onStatus('背景地図を読み込めません。通信状況をご確認ください。オフラインでは上島町周辺の一部のみ表示できます。');
      else if(source==='photo')latest.current.onStatus('航空写真を読み込めません。淡色地図に切り替えられます。');
    });
    m.getCanvas().addEventListener('webglcontextlost',()=>{setFallback(true);latest.current.onTerrain(false);latest.current.onStatus('描画が中断したため2D地図に切り替えました');});
    const onCamera=()=>{setPitch(Math.round(m.getPitch()));const clustered=m.getZoom()<9.5;setClusterKamijima(clustered);if(m.getZoom()<8.8)setExpandedKamijima(false);islandMarkers.current.forEach(marker=>{marker.getElement().style.display=clustered?'none':'';});};m.on('moveend',onCamera);
    let diagnosticFrame=0;
    const updateDiagnostics=()=>{
      diagnosticFrame=0;
      const el=host.current;if(!el)return;
      el.dataset.terrainActive=String(!!m.getTerrain());
      el.dataset.mapPitch=String(m.getPitch());el.dataset.mapBearing=String(m.getBearing());el.dataset.mapZoom=String(m.getZoom());
      const b=m.getBounds();el.dataset.mapBounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
      const selected=latest.current.pois.find(p=>p.id===latest.current.selected),county=latest.current.countyPois?.find(p=>p.id===latest.current.selectedCountyPoi);
      try{const elevation=m.queryTerrainElevation(county?[county.lng,county.lat]:selected?[selected.coordinates.lng!,selected.coordinates.lat!]:[132.765,33.839]);el.dataset.terrainElevation=elevation==null?'unavailable':String(elevation);}
      catch{el.dataset.terrainElevation='unavailable';}
    };
    const scheduleDiagnostics=()=>{if(!diagnosticFrame)diagnosticFrame=requestAnimationFrame(updateDiagnostics);};
    m.on('idle',scheduleDiagnostics);m.on('sourcedata',scheduleDiagnostics);m.on('moveend',scheduleDiagnostics);
    const observer=new ResizeObserver(()=>{m.resize();setViewportRevision(v=>v+1);});observer.observe(host.current);
    return ()=>{cancelAnimationFrame(diagnosticFrame);m.off('idle',scheduleDiagnostics);m.off('sourcedata',scheduleDiagnostics);m.off('moveend',scheduleDiagnostics);labels.destroy();observer.disconnect();markers.current.forEach(v=>v.remove());markers.current.clear();countyMarkers.current.forEach(v=>v.remove());countyMarkers.current.clear();islandMarkers.current.forEach(v=>v.remove());islandMarkers.current=[];m.remove();map.current=null;};
  },[fallback]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const places=props.visible.filter(publicPoi),cluster=clusterKamijima&&!expandedKamijima&&places.length>1&&!props.selected;
    const clusterKey='__kamijima_cluster:'+places.map(p=>p.id).sort().join('|');
    const visible=new Set(cluster?[clusterKey]:places.map(p=>p.id));
    markers.current.forEach((marker,id)=>{if(!visible.has(id)){marker.remove();markers.current.delete(id);}});
    if(cluster&&!markers.current.has(clusterKey)){
      const lng=places.reduce((s,p)=>s+p.coordinates.lng!,0)/places.length,lat=places.reduce((s,p)=>s+p.coordinates.lat!,0)/places.length;
      const el=clusterButton(places.length,()=>{m.stop();setExpandedKamijima(true);m.fitBounds([[133.119,34.157],[133.341,34.300]],{padding:host.current?cameraPadding(host.current,false):{top:55,bottom:100,left:40,right:40},pitch:0,bearing:0,maxZoom:11.5,duration:500});});el.setAttribute('aria-label',`上島町の観光地点 ${places.length}件を拡大`);
      markers.current.set(clusterKey,new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(m));
    }
    if(cluster)return;
    for(const p of places){
      const existing=markers.current.get(p.id);
      if(existing){const el=existing.getElement();el.classList.toggle('selected',p.id===props.selected);el.setAttribute('aria-pressed',String(p.id===props.selected));continue;}
      const el=createPoiMarker(p,p.id===props.selected,id=>latest.current.onPoi(id));
      markers.current.set(p.id,new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([p.coordinates.lng!,p.coordinates.lat!]).addTo(m));
    }
  },[ready,props.visible,props.selected,clusterKamijima,expandedKamijima]);
  useEffect(()=>{if(props.view.kind==='overview')setExpandedKamijima(false);},[props.view.nonce]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const update=()=>{
      const data=latest.current.countyPois||[],selected=latest.current.selectedCountyPoi;
      const groups=groupCounty(data,p=>m.project([p.lng,p.lat]),selected),keep=new Set<string>();
      for(const group of groups){
        const ids=group.map(p=>p.id).sort().join('|'),key=(group.length===1?'p:':'c:')+ids;keep.add(key);
        const lng=group.reduce((sum,p)=>sum+p.lng,0)/group.length,lat=group.reduce((sum,p)=>sum+p.lat,0)/group.length;
        const existing=countyMarkers.current.get(key);if(existing){existing.setLngLat([lng,lat]);if(group.length===1){const el=existing.getElement();el.classList.toggle('selected',selected===group[0].id);el.setAttribute('aria-pressed',String(selected===group[0].id));}continue;}
        const el=group.length===1?countyButton(group[0],selected===group[0].id,id=>latest.current.onCountyPoi?.(id)):clusterButton(group.length,()=>{if(sameCoordinate(group)||m.getZoom()>=16)showCountyList(group,id=>latest.current.onCountyPoi?.(id));else m.flyTo({center:[lng,lat],zoom:Math.min(18,m.getZoom()+2),duration:500});});
        countyMarkers.current.set(key,new maplibregl.Marker({element:el,anchor:group.length===1?'bottom':'center'}).setLngLat([lng,lat]).addTo(m));
      }
      countyMarkers.current.forEach((marker,key)=>{if(!keep.has(key)){marker.remove();countyMarkers.current.delete(key);}});
    };
    m.on('moveend',update);update();return()=>{m.off('moveend',update);};
  },[ready,props.countyPois,props.selectedCountyPoi]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    m.setTerrain(props.terrain&&!demFailed?{source:'terrain',exaggeration:1}:null);
    m.easeTo({pitch:props.terrain&&!demFailed?48:0,duration:300});
    props.onStatus(props.terrain&&!demFailed?'3D地形を表示中':demFailed?'標高を読み込めないため2D表示':'2D地図');
  },[props.terrain,ready,demFailed]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const v=props.view,active=props.selected||props.selectedCountyPoi,padding=host.current?cameraPadding(host.current,!!active):{top:55,bottom:100,left:40,right:40};
    // Terrain can lift a pin away from the requested camera center. After an
    // automatic flight only, ensure the real pin stays clear of the controls.
    let cancelled=false,attempts=0,correctionFrame=0;
    const settle=()=>{
      if(cancelled||!active||(latest.current.selected||latest.current.selectedCountyPoi)!==active||latest.current.view.nonce!==props.view.nonce||m.isMoving()||!host.current)return;
      const offset=selectedPinOffset(host.current);if(!offset||attempts>=2)return;
      attempts++;m.panBy(offset,{duration:0});
      m.once('idle',onIdle);
    };
    const onIdle=()=>{correctionFrame=requestAnimationFrame(settle);};
    const onUserMove=(event:{originalEvent?:unknown})=>{if(event.originalEvent){cancelled=true;m.off('idle',onIdle);cancelAnimationFrame(correctionFrame);}};
    const viewPitch=props.terrain&&!demFailed?m.getPitch():0;
    // A level overview guarantees that both ends of Ehime remain visible even
    // in a short landscape viewport. Terrain remains enabled and can be tilted.
    if(v.kind==='overview')m.fitBounds(ehimeBounds,{padding,pitch:0,bearing:0,duration:500,maxZoom:8});
    else if(v.kind==='location'&&v.coordinates)m.flyTo({center:v.coordinates,zoom:14,pitch:viewPitch,duration:500,padding});
    else if(v.kind==='poi'){
      const p=props.selected?props.pois.find(p=>p.id===v.id):null;
      if(p)m.flyTo({center:[p.coordinates.lng!,p.coordinates.lat!],zoom:14,pitch:latest.current.terrain&&!demFailed?55:0,duration:600,padding});
      else m.easeTo({padding:{top:0,right:0,left:0,bottom:0},duration:200});
    }else if(v.kind==='countyPoi'){
      const p=props.countyPois?.find(p=>p.id===v.id);if(p)m.flyTo({center:[p.lng,p.lat],zoom:14,pitch:latest.current.terrain&&!demFailed?55:0,duration:600,padding});
    }else if(v.kind==='island'){
      const i=props.islands.find(i=>i.name===v.id);if(i)m.flyTo({center:i.coordinates,zoom:i.zoom,pitch:viewPitch,duration:600,padding});
    }
    if(active){m.once('idle',onIdle);m.on('movestart',onUserMove);}
    return()=>{cancelled=true;cancelAnimationFrame(correctionFrame);m.off('idle',onIdle);m.off('movestart',onUserMove);};
  },[props.view,ready,props.mobileSheet,props.selected,props.selectedCountyPoi,props.countyPois,viewportRevision]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    if(mapType==='photo'){
      if(!m.getSource('photo')){
        m.addSource('photo',{type:'raster',tiles:['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],tileSize:256,maxzoom:18,attribution});
        m.addLayer({id:'photo',type:'raster',source:'photo'},'shade');
      }else m.setLayoutProperty('photo','visibility','visible');
    }else if(m.getLayer('photo'))m.setLayoutProperty('photo','visibility','none');
  },[mapType,ready]);
  const zoom=(delta:number)=>{
    if(!fallback){delta>0?map.current?.zoomIn():map.current?.zoomOut();return;}
    const m=raster.current;if(!m)return;
    const selected=latest.current.pois.find(p=>p.id===latest.current.selected),county=latest.current.countyPois?.find(p=>p.id===latest.current.selectedCountyPoi);
    const anchor=county?[county.lat,county.lng] as [number,number]:selected?[selected.coordinates.lat!,selected.coordinates.lng!] as [number,number]:m.getCenter();
    m.setZoomAround(anchor,m.getZoom()+delta);
  };
  return <div className={`map-stage ${settingsOpen?'map-settings-open':''}`} data-renderer={fallback?'leaflet':'maplibre'} data-view={props.view.kind}>
    {fallback?<RasterMap {...props} onReady={onRasterReady} expandedKamijima={expandedKamijima} onExpandKamijima={setExpandedKamijima}/>:<div className="map-host" ref={host} aria-label="愛媛県3D観光地図"/>}
    {!fallback&&<button className="mobile-map-settings" aria-label={`地図の表示設定を${settingsOpen?'閉じる':'開く'}`} aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><Layers size={17}/><span>設定</span></button>}
    <div className="map-toolbar" aria-label="地図の表示設定">
      <button className={props.terrain&&!fallback?'active':''} onClick={()=>props.onTerrain(!props.terrain)} disabled={fallback||demFailed} aria-pressed={props.terrain&&!fallback}><Mountain size={16}/>{props.terrain&&!fallback?'3D 地形':'2D 地図'}</button>
      <button onClick={()=>setMapType(mapType==='local'?'photo':'local')} disabled={fallback} aria-label="背景地図を切り替え"><Layers size={16}/>{mapType==='local'?'淡色地図':'航空写真'}</button>
      <button onClick={()=>{const m=map.current;if(m?.getLayer('shade')){m.setLayoutProperty('shade','visibility',shade?'none':'visible');setShade(!shade);}}} disabled={fallback||demFailed} aria-pressed={shade}>陰影</button>
    </div>
    <div className="map-actions">
      <button aria-label="拡大" onClick={()=>zoom(1)} disabled={fallback?!rasterReady:!ready}><Plus size={19}/></button>
      <button aria-label="縮小" onClick={()=>zoom(-1)} disabled={fallback?!rasterReady:!ready}><Minus size={19}/></button>
      <div className="toolbar-rule"/>
      <button aria-label="北を上に戻す" onClick={()=>map.current?.easeTo({bearing:0,pitch:props.terrain?48:0})} disabled={fallback}><Navigation size={18}/></button>
      <button aria-label="現在地を表示" onClick={props.onLocate}><span className="locate-icon">◎</span></button>
    </div>
    {!fallback&&<div className="pitch-control"><label htmlFor="pitch">視点 <span>{pitch}°</span></label><input id="pitch" aria-label="地図の傾斜" type="range" min="0" max="80" value={pitch} disabled={!ready||!props.terrain||demFailed} onChange={e=>map.current?.setPitch(Number(e.target.value))}/><button aria-label="視点を初期値に戻す" disabled={!ready} onClick={()=>map.current?.easeTo({pitch:props.terrain&&!demFailed?48:0,bearing:-12})}><RotateCcw size={13}/></button></div>}
    <div className="map-instruction">{fallback?'ドラッグで移動 · ＋/−で拡大縮小':'ドラッグで移動 · Ctrl＋ドラッグで回転・傾斜'}</div>
  </div>;
}

function RasterMap(props:Props&{onReady:(map:import('leaflet').Map|null)=>void;expandedKamijima:boolean;onExpandKamijima:(value:boolean)=>void}){
  const host=useRef<HTMLDivElement>(null),leaf=useRef<import('leaflet').Map|null>(null),group=useRef<import('leaflet').LayerGroup|null>(null),latest=useRef(props);
  const countyGroup=useRef<import('leaflet').LayerGroup|null>(null),islandElements=useRef<HTMLButtonElement[]>([]);
  const markers=useRef(new Map<string,import('leaflet').Marker>());
  const [loaded,setLoaded]=useState(false),[viewportRevision,setViewportRevision]=useState(0),[clusterKamijima,setClusterKamijima]=useState(true);latest.current=props;
  useEffect(()=>{
    let cancelled=false,observer:ResizeObserver,labels:ReturnType<typeof installMarkerLabels>;
    Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]).then(([L])=>{
      if(cancelled||!host.current)return;
      const m=L.map(host.current,{zoomControl:false,minZoom:5,maxZoom:18,maxBounds:[[30,128],[37,137]]}).setView([33.6,132.8],7);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{tileSize:256,minNativeZoom:5,maxNativeZoom:18,attribution}).on('tileerror',()=>latest.current.onStatus('背景地図を読み込めません。通信状況をご確認ください。オフラインでは上島町周辺の一部のみ表示できます。')).addTo(m);
      L.tileLayer(localTiles('basemap'),{tileSize:256,minNativeZoom:8,maxNativeZoom:14,bounds:[[34.10,133.05],[34.34,133.43]]}).addTo(m);
      for(const i of latest.current.islands){const el=document.createElement('button');el.className='island-marker';el.textContent=i.name;el.style.display=m.getZoom()<9.5?'none':'';islandElements.current.push(el);el.setAttribute('aria-label',`地図から${i.name}を選択`);el.onclick=()=>latest.current.onIsland(i.name);L.marker([i.coordinates[1],i.coordinates[0]],{keyboard:false,icon:L.divIcon({html:el,className:'island-leaflet'})}).addTo(m);}
      leaf.current=m;group.current=L.layerGroup().addTo(m);countyGroup.current=L.layerGroup().addTo(m);setLoaded(true);
      labels=installMarkerLabels(host.current);m.on('move zoomend',labels.schedule);
      const updateCamera=()=>{const clustered=m.getZoom()<9.5;setClusterKamijima(clustered);if(m.getZoom()<8.8)latest.current.onExpandKamijima(false);islandElements.current.forEach(el=>{el.style.display=clustered?'none':'';});if(host.current){const b=m.getBounds();host.current.dataset.mapBounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');host.current.dataset.mapZoom=String(m.getZoom());host.current.dataset.mapPitch='0';host.current.dataset.mapBearing='0';host.current.dataset.terrainActive='false';}};
      m.on('moveend zoomend',updateCamera);updateCamera();latest.current.onReady(m);
      latest.current.onTerrain(false);latest.current.onStatus('2D地図を表示中');host.current.setAttribute('data-map-ready','true');
      observer=new ResizeObserver(()=>{m.invalidateSize();setViewportRevision(v=>v+1);});observer.observe(host.current);
    }).catch(()=>latest.current.onStatus('地図を読み込めません。地点一覧から探してください。'));
    return()=>{cancelled=true;labels?.destroy();observer?.disconnect();leaf.current?.remove();leaf.current=null;group.current=null;countyGroup.current=null;islandElements.current=[];markers.current.clear();latest.current.onReady(null);};
  },[]);
  useEffect(()=>{
    if(!loaded||!group.current)return;
    let cancelled=false;
    import('leaflet').then(L=>{
      if(cancelled||!group.current)return;
      const places=props.visible.filter(publicPoi),cluster=clusterKamijima&&!props.expandedKamijima&&places.length>1&&!props.selected,clusterKey='__kamijima_cluster:'+places.map(p=>p.id).sort().join('|');
      const visible=new Set(cluster?[clusterKey]:places.map(p=>p.id));
      markers.current.forEach((marker,id)=>{if(!visible.has(id)){group.current!.removeLayer(marker);markers.current.delete(id);}});
      if(cluster&&!markers.current.has(clusterKey)){
        const lat=places.reduce((s,p)=>s+p.coordinates.lat!,0)/places.length,lng=places.reduce((s,p)=>s+p.coordinates.lng!,0)/places.length;
        const el=clusterButton(places.length,()=>{const map=leaf.current;if(!map||!host.current)return;map.stop();latest.current.onExpandKamijima(true);const pad=cameraPadding(host.current,false);map.fitBounds([[34.157,133.119],[34.300,133.341]],{paddingTopLeft:[pad.left,pad.top],paddingBottomRight:[pad.right,pad.bottom],maxZoom:11.5});});el.setAttribute('aria-label',`上島町の観光地点 ${places.length}件を拡大`);
        const marker=L.marker([lat,lng],{keyboard:false,icon:L.divIcon({html:el,className:'poi-leaflet',iconSize:[44,44],iconAnchor:[22,22]})}).addTo(group.current);
        markers.current.set(clusterKey,marker);
      }
      if(cluster)return;
      for(const p of places){
        const existing=markers.current.get(p.id);
        if(existing){
          const el=existing.getElement()?.querySelector<HTMLButtonElement>('.poi-marker');
          el?.classList.toggle('selected',p.id===props.selected);el?.setAttribute('aria-pressed',String(p.id===props.selected));existing.setZIndexOffset(p.id===props.selected?1000:0);continue;
        }
        const el=createPoiMarker(p,p.id===props.selected,id=>latest.current.onPoi(id));
        const marker=L.marker([p.coordinates.lat!,p.coordinates.lng!],{keyboard:false,icon:L.divIcon({html:el,className:'poi-leaflet',iconSize:[44,48],iconAnchor:[22,48]}),zIndexOffset:p.id===props.selected?1000:0}).addTo(group.current);
        markers.current.set(p.id,marker);
      }
    });
    return()=>{cancelled=true;};
  },[loaded,props.visible,props.selected,clusterKamijima,props.expandedKamijima]);
  useEffect(()=>{
    if(!loaded||!leaf.current||!countyGroup.current)return;
    let cancelled=false;const m=leaf.current;
    import('leaflet').then(L=>{
      if(cancelled||!countyGroup.current)return;
      const update=()=>{
        if(!countyGroup.current)return;countyGroup.current.clearLayers();
        const groups=groupCounty(latest.current.countyPois||[],p=>m.latLngToContainerPoint([p.lat,p.lng]),latest.current.selectedCountyPoi);
        for(const group of groups){
          const lat=group.reduce((s,p)=>s+p.lat,0)/group.length,lng=group.reduce((s,p)=>s+p.lng,0)/group.length;
          const el=group.length===1?countyButton(group[0],latest.current.selectedCountyPoi===group[0].id,id=>latest.current.onCountyPoi?.(id)):clusterButton(group.length,()=>{if(sameCoordinate(group)||m.getZoom()>=16)showCountyList(group,id=>latest.current.onCountyPoi?.(id));else m.setView([lat,lng],Math.min(18,m.getZoom()+2));});
          L.marker([lat,lng],{keyboard:false,icon:L.divIcon({html:el,className:'poi-leaflet',iconSize:group.length===1?[44,48]:[44,44],iconAnchor:group.length===1?[22,48]:[22,22]})}).addTo(countyGroup.current);
        }
      };
      m.on('moveend',update);update();cleanup=()=>m.off('moveend',update);
    });
    let cleanup=()=>{};return()=>{cancelled=true;cleanup();};
  },[loaded,props.countyPois,props.selectedCountyPoi]);
  useEffect(()=>{
    if(!loaded||!leaf.current||!host.current)return;const m=leaf.current,v=props.view,active=props.selected||props.selectedCountyPoi,padding=cameraPadding(host.current,!!active);
    const aimAt=(coordinates:[number,number],zoom:number)=>{
      // Leaflet setView has no panel padding. Offset the geographic center so
      // that the destination is centered in the uncovered part of the map.
      const point=m.project(coordinates,zoom).subtract([(padding.left-padding.right)/2,(padding.top-padding.bottom)/2]);
      m.setView(m.unproject(point,zoom),zoom,{animate:false});
    };
    if(v.kind==='overview')m.fitBounds([[32.65,131.95],[34.5,133.95]],{paddingTopLeft:[padding.left,padding.top],paddingBottomRight:[padding.right,padding.bottom]});
    else if(v.kind==='island'){const i=props.islands.find(i=>i.name===v.id);if(i)aimAt([i.coordinates[1],i.coordinates[0]],i.zoom);}
    else if(v.kind==='poi'){const p=props.selected?props.pois.find(p=>p.id===v.id):null;if(p)aimAt([p.coordinates.lat!,p.coordinates.lng!],14);}
    else if(v.kind==='countyPoi'){const p=props.countyPois?.find(p=>p.id===v.id);if(p)aimAt([p.lat,p.lng],14);}
    else if(v.coordinates)aimAt([v.coordinates[1],v.coordinates[0]],14);
    const frame=requestAnimationFrame(()=>{if(!host.current||!active)return;const offset=selectedPinOffset(host.current);if(offset)m.panBy(offset,{animate:false});});
    return()=>cancelAnimationFrame(frame);
  },[props.view,loaded,props.mobileSheet,props.selected,props.selectedCountyPoi,props.countyPois,viewportRevision]);
  return <div className="map-host" ref={host} aria-label="愛媛県2D観光地図"/>;
}
