import {useEffect,useRef,useState} from 'react';
import maplibregl,{type Map as LibreMap,type StyleSpecification} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Navigation,RotateCcw,Plus,Minus,Layers,Mountain} from 'lucide-react';
import type {Island,Poi} from './model';
import {publicPoi} from './engine';

export interface ViewRequest {kind:'overview'|'island'|'poi'|'location';id?:string;coordinates?:[number,number];nonce:number;}
interface Props {pois:Poi[];visible:Poi[];islands:Island[];selected:string|null;view:ViewRequest;mobileSheet:'compact'|'detail'|'deep';onPoi:(id:string)=>void;onIsland:(name:string)=>void;terrain:boolean;onTerrain:(value:boolean)=>void;onStatus:(text:string)=>void;onLocate:()=>void;}
const base=import.meta.env.BASE_URL;
const localTiles=(folder:string)=>new URL(`${base}${folder}/{z}/{x}/{y}.png`,location.href).href.replace(/%7B/g,'{').replace(/%7D/g,'}');
const bounds:[number,number,number,number]=[133.05,34.10,133.43,34.34];
const attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>（DEM・淡色地図を加工）';
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
export function createMapStyle():StyleSpecification {
  return {version:8,sources:{
    base:{type:'raster',tiles:[localTiles('basemap')],tileSize:256,minzoom:8,maxzoom:14,bounds,attribution},
    terrain:{type:'raster-dem',tiles:[localTiles('terrain')],tileSize:256,minzoom:8,maxzoom:14,bounds,encoding:'mapbox',attribution},
    shade:{type:'raster-dem',tiles:[localTiles('terrain')],tileSize:256,minzoom:8,maxzoom:14,bounds,encoding:'mapbox'},
    buildings:{type:'geojson',data:emptyGeo},
  },layers:[
    {id:'sea',type:'background',paint:{'background-color':'#dcecf0'}},
    {id:'base',type:'raster',source:'base',paint:{'raster-saturation':-.12,'raster-fade-duration':0}},
    {id:'shade',type:'hillshade',source:'shade',paint:{'hillshade-exaggeration':.32,'hillshade-shadow-color':'#385a50','hillshade-highlight-color':'#f9f7dd','hillshade-accent-color':'#a8b1a0'}},
    // Empty until geometry AND explicit numeric heights have been verified. No invented default height.
    {id:'buildings',type:'fill-extrusion',source:'buildings',filter:['all',['has','height'],['>', ['get','height'],0]],paint:{'fill-extrusion-height':['get','height'],'fill-extrusion-base':0,'fill-extrusion-color':'#829994','fill-extrusion-opacity':.7}},
  ]};
}
function webglAvailable(){try{const c=document.createElement('canvas');const context=c.getContext('webgl2')||c.getContext('webgl');if(!context)return false;context.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}}

export default function MapView(props:Props){
  const host=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),latest=useRef(props);
  const markers=useRef(new Map<string,maplibregl.Marker>()),islandMarkers=useRef<maplibregl.Marker[]>([]);
  const [fallback,setFallback]=useState(()=>new URLSearchParams(location.search).get('renderer')==='2d'||!webglAvailable());
  const [ready,setReady]=useState(false),[mapType,setMapType]=useState<'local'|'photo'>('local'),[pitch,setPitch]=useState(48);
  const [demFailed,setDemFailed]=useState(false),[shade,setShade]=useState(true);
  latest.current=props;
  useEffect(()=>{
    if(fallback||!host.current)return;
    let m:LibreMap;
    try{
      m=new maplibregl.Map({container:host.current,style:createMapStyle(),center:[133.209,34.246],zoom:11.4,pitch:48,bearing:-12,minZoom:8,maxZoom:17,maxPitch:80,maxBounds:[[132.7,33.8],[133.8,34.6]],attributionControl:{compact:true},dragRotate:true,renderWorldCopies:false,fadeDuration:0});
      map.current=m;
    }catch{setFallback(true);props.onStatus('WebGLを利用できないため2D地図を表示');return;}
    m.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:'metric'}),'bottom-left');
    m.on('load',()=>{
      m.setTerrain({source:'terrain',exaggeration:1});
      setReady(true);latest.current.onStatus('3D地形 · 標高強調 1.0');
      host.current?.setAttribute('data-map-ready','true');
      for(const island of latest.current.islands){
        const el=document.createElement('button');el.className='island-marker';el.textContent=island.name;el.style.zIndex='2';
        el.setAttribute('aria-label',`地図から${island.name}を選択`);
        el.addEventListener('click',e=>{e.stopPropagation();latest.current.onIsland(island.name);});
        islandMarkers.current.push(new maplibregl.Marker({element:el,anchor:'center',offset:[0,22]}).setLngLat(island.coordinates).addTo(m));
      }
    });
    m.on('error',e=>{
      const source=(e as {sourceId?:string}).sourceId;
      if(source==='terrain'||source==='shade'){
        setDemFailed(true);m.setTerrain(null);m.setPitch(0);
        if(m.getLayer('shade'))m.setLayoutProperty('shade','visibility','none');
        latest.current.onTerrain(false);latest.current.onStatus('標高を読み込めないため2D表示');
      }else if(source==='base')latest.current.onStatus('背景地図の一部を読み込めません。地点一覧は利用できます。');
    });
    m.getCanvas().addEventListener('webglcontextlost',()=>{setFallback(true);latest.current.onTerrain(false);latest.current.onStatus('描画が中断したため2D地図に切り替えました');});
    const onCamera=()=>{setPitch(Math.round(m.getPitch()));};m.on('moveend',onCamera);
    m.on('idle',()=>{
      const el=host.current;if(!el)return;
      el.dataset.terrainActive=String(!!m.getTerrain());
      el.dataset.mapPitch=String(m.getPitch());el.dataset.mapBearing=String(m.getBearing());
      const selected=latest.current.pois.find(p=>p.id===latest.current.selected);
      const elevation=m.queryTerrainElevation(selected?[selected.coordinates.lng!,selected.coordinates.lat!]:[133.14723,34.25873]);
      el.dataset.terrainElevation=elevation===null?'unavailable':String(elevation);
    });
    const observer=new ResizeObserver(()=>m.resize());observer.observe(host.current);
    return ()=>{observer.disconnect();markers.current.forEach(v=>v.remove());markers.current.clear();islandMarkers.current.forEach(v=>v.remove());islandMarkers.current=[];m.remove();map.current=null;};
  },[fallback]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    markers.current.forEach(v=>v.remove());markers.current.clear();
    for(const p of props.visible.filter(publicPoi)){
      const el=createPoiMarker(p,p.id===props.selected,id=>latest.current.onPoi(id));
      markers.current.set(p.id,new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([p.coordinates.lng!,p.coordinates.lat!]).addTo(m));
    }
  },[ready,props.visible,props.selected]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    m.setTerrain(props.terrain&&!demFailed?{source:'terrain',exaggeration:1}:null);
    m.easeTo({pitch:props.terrain&&!demFailed?48:0,duration:300});
    props.onStatus(props.terrain&&!demFailed?'3D地形 · 標高強調 1.0':demFailed?'標高を読み込めないため2D表示':'2D地図');
  },[props.terrain,ready,demFailed]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const v=props.view;
    if(v.kind==='overview')m.fitBounds([[133.119,34.157],[133.341,34.300]],{padding:{top:55,bottom:100,left:60,right:80},duration:500,maxZoom:11.5});
    else if(v.kind==='location'&&v.coordinates)m.flyTo({center:v.coordinates,zoom:14,duration:500});
    else if(v.kind==='poi'){
      const p=props.selected?props.pois.find(p=>p.id===v.id):null;
      if(p)m.flyTo({center:[p.coordinates.lng!,p.coordinates.lat!],zoom:14,pitch:latest.current.terrain?55:0,duration:600,padding:{top:innerWidth<760?130:0,right:innerWidth>760?Math.min(370,innerWidth*.28):0,left:innerWidth>760?250:0,bottom:innerWidth<760?(document.querySelector('.detail-panel')?.getBoundingClientRect().height||innerHeight*.55):0}});
      else m.easeTo({padding:{top:0,right:0,left:0,bottom:0},duration:200});
    }else if(v.kind==='island'){
      const i=props.islands.find(i=>i.name===v.id);if(i)m.flyTo({center:i.coordinates,zoom:i.zoom,duration:600,padding:{bottom:innerWidth<760?130:0}});
    }
  },[props.view,ready,props.mobileSheet,props.selected]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    if(mapType==='photo'){
      if(!m.getSource('photo')){
        m.addSource('photo',{type:'raster',tiles:['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],tileSize:256,maxzoom:18,attribution});
        m.addLayer({id:'photo',type:'raster',source:'photo'},'shade');
      }else m.setLayoutProperty('photo','visibility','visible');
    }else if(m.getLayer('photo'))m.setLayoutProperty('photo','visibility','none');
  },[mapType,ready]);
  return <div className="map-stage" data-renderer={fallback?'leaflet':'maplibre'}>
    {fallback?<RasterMap {...props}/>:<div className="map-host" ref={host} aria-label="上島町3D観光地図"/>}
    <div className="map-toolbar" aria-label="地図の表示設定">
      <button className={props.terrain&&!fallback?'active':''} onClick={()=>props.onTerrain(!props.terrain)} disabled={fallback||demFailed} aria-pressed={props.terrain&&!fallback}><Mountain size={16}/>{props.terrain&&!fallback?'3D 地形':'2D 地図'}</button>
      <button onClick={()=>setMapType(mapType==='local'?'photo':'local')} disabled={fallback} aria-label="背景地図を切り替え"><Layers size={16}/>{mapType==='local'?'淡色地図':'航空写真'}</button>
      <button onClick={()=>{const m=map.current;if(m?.getLayer('shade')){m.setLayoutProperty('shade','visibility',shade?'none':'visible');setShade(!shade);}}} disabled={fallback||demFailed} aria-pressed={shade}>陰影</button>
    </div>
    <div className="map-actions">
      <button aria-label="拡大" onClick={()=>map.current?.zoomIn()} disabled={fallback}><Plus size={19}/></button>
      <button aria-label="縮小" onClick={()=>map.current?.zoomOut()} disabled={fallback}><Minus size={19}/></button>
      <div className="toolbar-rule"/>
      <button aria-label="北を上に戻す" onClick={()=>map.current?.easeTo({bearing:0,pitch:props.terrain?48:0})} disabled={fallback}><Navigation size={18}/></button>
      <button aria-label="現在地を表示" onClick={props.onLocate}><span className="locate-icon">◎</span></button>
    </div>
    {!fallback&&<div className="pitch-control"><label htmlFor="pitch">視点 <span>{pitch}°</span></label><input id="pitch" aria-label="地図の傾斜" type="range" min="0" max="80" value={pitch} onChange={e=>map.current?.setPitch(Number(e.target.value))}/><button aria-label="視点を初期値に戻す" onClick={()=>map.current?.easeTo({pitch:props.terrain?48:0,bearing:-12})}><RotateCcw size={13}/></button></div>}
    <div className="map-instruction">{fallback?'ドラッグで移動 · ＋/−で拡大縮小':'ドラッグで移動 · Ctrl＋ドラッグで回転・傾斜'}</div>
  </div>;
}

function RasterMap(props:Props){
  const host=useRef<HTMLDivElement>(null),leaf=useRef<import('leaflet').Map|null>(null),group=useRef<import('leaflet').LayerGroup|null>(null),latest=useRef(props);
  const [loaded,setLoaded]=useState(false);latest.current=props;
  useEffect(()=>{
    let cancelled=false,observer:ResizeObserver;
    Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]).then(([L])=>{
      if(cancelled||!host.current)return;
      const m=L.map(host.current,{zoomControl:true,minZoom:8,maxZoom:17,maxBounds:[[34.10,133.05],[34.34,133.43]]}).setView([34.247,133.211],11);
      L.tileLayer(localTiles('basemap'),{tileSize:256,minNativeZoom:8,maxNativeZoom:14,bounds:[[34.10,133.05],[34.34,133.43]],attribution}).addTo(m);
      for(const i of latest.current.islands){const el=document.createElement('button');el.className='island-marker';el.textContent=i.name;el.setAttribute('aria-label',`地図から${i.name}を選択`);el.onclick=()=>latest.current.onIsland(i.name);L.marker([i.coordinates[1],i.coordinates[0]],{icon:L.divIcon({html:el,className:'island-leaflet'})}).addTo(m);}
      leaf.current=m;group.current=L.layerGroup().addTo(m);setLoaded(true);
      latest.current.onTerrain(false);latest.current.onStatus('2D地図 · WebGL不要');host.current.setAttribute('data-map-ready','true');
      observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(host.current);
    }).catch(()=>latest.current.onStatus('地図を初期化できません。左の地点一覧から探索できます。'));
    return()=>{cancelled=true;observer?.disconnect();leaf.current?.remove();leaf.current=null;};
  },[]);
  useEffect(()=>{
    if(!loaded||!group.current)return;
    import('leaflet').then(L=>{
      group.current?.clearLayers();
      for(const p of props.visible.filter(publicPoi)){
        const el=createPoiMarker(p,p.id===props.selected,id=>latest.current.onPoi(id));
        L.marker([p.coordinates.lat!,p.coordinates.lng!],{icon:L.divIcon({html:el,className:'poi-leaflet',iconSize:[44,48],iconAnchor:[22,48]}),zIndexOffset:p.id===props.selected?1000:0}).addTo(group.current!);
      }
    });
  },[loaded,props.visible,props.selected]);
  useEffect(()=>{
    if(!loaded||!leaf.current)return;const m=leaf.current,v=props.view;
    if(v.kind==='overview')m.fitBounds([[34.157,133.119],[34.300,133.341]],{padding:[40,60]});
    else if(v.kind==='island'){const i=props.islands.find(i=>i.name===v.id);if(i)m.setView([i.coordinates[1],i.coordinates[0]],i.zoom);}
    else if(v.kind==='poi'){const p=props.pois.find(p=>p.id===v.id);if(p)m.setView([p.coordinates.lat!,p.coordinates.lng!],14);}
    else if(v.coordinates)m.setView([v.coordinates[1],v.coordinates[0]],14);
  },[props.view,loaded]);
  return <div className="map-host" ref={host} aria-label="上島町2D観光地図"/>;
}
