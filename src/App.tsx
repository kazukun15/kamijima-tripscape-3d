import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Search,X,ChevronRight,ArrowUpRight,Compass,Bookmark,Check,Ship,Footprints,Bike,Share2,BookOpen,MapPin,SlidersHorizontal,Info,ArrowLeft,Leaf,Sun,Mountain,Waves,Landmark,Utensils,CircleHelp,CheckCircle2,Globe,ChevronUp,ChevronDown,Layers} from 'lucide-react';
import poiData from '../data/poi/verified.json';
import countyData from '../data/ehime-pois.json';
import islandData from '../data/islands.json';
import topicData from '../data/topics.json';
import stats from '../data/stats.json';
import type {Context,Island,MapState,Mode,Poi,Season,Topic,CountyPoi} from './model';
import {directionsUrl,mapStateHash,normalize,matchesSearch,matchesIsland,orderedSections,publicPoi,readMapState,recommend,requiresFerry} from './engine';
import type {ViewRequest} from './MapView';
import {requestReachability,type ReachabilityMode,type ReachabilityResult} from './reachability';
const MapView=lazy(()=>import('./MapView'));
type PrefecturePoi=CountyPoi & {name_kana?:string;address?:string|null;source_data_url?:string;license_url?:string;source_updated_at?:string|null;location_scope:string;summary?:string;source_name?:string};
const pois=(poiData as Poi[]).filter(publicPoi),countyPois=countyData as PrefecturePoi[],islands=islandData as Island[],topics=topicData as Topic[];
function readCountyId(){const id=new URLSearchParams(location.hash.slice(1)).get('county');return countyPois.some(p=>p.id===id)?id:null;}
const categories=['絶景 / 展望','歴史 / 文化財','神社 / 寺','アート','海 / 海岸 / 海水浴場','自然','サイクリング','体験','食','買い物','宿泊','港 / 船','橋','公園','キャンプ','産業景観','島の暮らし','季節限定','隠れスポット'];
function initialState(){return readMapState(location.hash,pois,islands,topics,categories,currentSeason());}
function currentSeason():Season{const m=new Date().getMonth()+1;return m>=3&&m<=5?'春':m>=6&&m<=8?'夏':m>=9&&m<=11?'秋':'冬';}
function readSaved():string[]{try{const value:unknown=JSON.parse(localStorage.getItem('tripscape-saved')||'[]');return Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'&&(pois.some(p=>p.id===id)||countyPois.some(p=>p.id===id))))]:[];}catch{return [];}}
const iconFor=(p:Poi)=>p.categories.includes('食')?Utensils:p.categories.includes('海 / 海岸 / 海水浴場')?Waves:p.categories.includes('歴史 / 文化財')?Landmark:p.categories.includes('絶景 / 展望')?Mountain:MapPin;
const ModeIcon={walking:Footprints,cycling:Bike,ferry:Ship};
const modeNames={walking:'徒歩',cycling:'自転車',ferry:'船'};
const reachModeNames:Record<ReachabilityMode,string>={walking:'徒歩',driving:'車',cycling:'自転車'};

function ReachabilityControls({name,mode,minutes,state,result,error,onMode,onMinutes,onCalculate,onClear}:{name:string;mode:ReachabilityMode;minutes:number;state:'idle'|'loading'|'success'|'error';result:ReachabilityResult|null;error:string;onMode:(mode:ReachabilityMode)=>void;onMinutes:(minutes:number)=>void;onCalculate:()=>void;onClear:()=>void}){
  return <details className="reachability-panel">
    <summary>到達圏を調べる <ChevronDown size={16} aria-hidden="true"/></summary>
    <div className="reachability-content">
      <p>{name}からの到達圏を表示します。</p>
      <label>移動手段<select aria-label="到達圏の移動手段" value={mode} onChange={e=>onMode(e.target.value as ReachabilityMode)}><option value="walking">徒歩</option><option value="driving">車</option><option value="cycling">自転車</option></select></label>
      <label>所要時間<select aria-label="到達圏の所要時間" value={minutes} onChange={e=>onMinutes(Number(e.target.value))}>{[10,20,30,60].map(n=><option key={n} value={n}>{n}分</option>)}</select></label>
      <button className="reachability-calculate" onClick={onCalculate} disabled={state==='loading'}>{state==='loading'?'読み込み中…':'到達圏を表示'}</button>
      {state==='loading'&&<button className="reachability-clear" onClick={onClear}>読み込みを中止</button>}
      {state==='success'&&result&&<><div className="reachability-legend"><span aria-hidden="true"/>{reachModeNames[mode]} {minutes}分の目安</div>{result.snappedDistanceMeters!==null&&<p>道路上の計算開始地点は、スポットから約{Math.round(result.snappedDistanceMeters)}mです。</p>}<p>道路データ: {result.sourceDate} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://github.com/kazukun15/kamijima-tripscape-3d/releases/tag/reachability-data-20261116" target="_blank" rel="noopener noreferrer">計算に使った道路データ</a></p><button className="reachability-clear" onClick={onClear}>到達圏を消す</button></>}
      <div className="reachability-status" role="status" aria-live="polite">{state==='loading'?'到達圏を読み込んでいます。':state==='error'?error:state==='success'?'到達圏を地図に表示しました。':''}</div>
      <p>事前に計算した道路網の目安です。出発点は近くの道路に置き換えるため、実際の入口や道路接続と異なる場合があります。船の航路は除外し、渋滞や通行止めは反映していません。色の範囲には実際に通れない場所も含まれる場合があります。</p>
    </div>
  </details>;
}

function LocationMapLink({lat,lng,address}:{lat:number|null;lng:number|null;address?:string|null}){
  if(lat===null||lng===null||!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const displayedAddress=address?.trim();
  const label=displayedAddress?`${displayedAddress}をGoogle マップで開く（新しいタブ）`:'Google マップで場所を開く（新しいタブ）';
  const href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  return <a className="location-map-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}><MapPin size={16} aria-hidden="true"/><span>{displayedAddress||'Google マップで場所を開く'}{displayedAddress&&<small>Google マップで開く</small>}</span><ArrowUpRight size={16} aria-hidden="true"/></a>;
}

export default function App(){
  const initial=useRef(initialState()).current;
  const initialCounty=useRef(readCountyId()).current;
  const [selectedCounty,setSelectedCounty]=useState<string|null>(initialCounty);
  const [selected,setSelected]=useState<string|null>(initial.poi),[island,setIsland]=useState(initial.island),[q,setQ]=useState(initial.q),[category,setCategory]=useState(initial.category),[terrain,setTerrain]=useState(initial.terrain),[deep,setDeep]=useState(initial.deep);
  const [view,setView]=useState<ViewRequest>({kind:initialCounty?'countyPoi':initial.poi?'poi':initial.island!=='all'?'island':'overview',id:initialCounty||initial.poi||initial.island,nonce:0});
  const [season,setSeason]=useState<Season>(initial.season),[mode,setMode]=useState<Mode>(initial.mode),[saved,setSaved]=useState(readSaved),[savedOnly,setSavedOnly]=useState(!!window.history.state?.tripscapeSavedOnly),[history,setHistory]=useState<string[]>(initial.poi?[initial.poi]:[]);
  const [topic,setTopic]=useState<string|null>(initial.topic),[filtersOpen,setFiltersOpen]=useState(false),[sheet,setSheet]=useState<'compact'|'detail'|'deep'>(initial.deep?'deep':'detail'),[about,setAbout]=useState(false),[status,setStatus]=useState('地図を読み込み中'),[toast,setToast]=useState('');
  const [origin,setOrigin]=useState<{lat:number;lng:number}|undefined>(),[originType,setOriginType]=useState<'port'|'current'>('port');
  const [mapMenuOpen,setMapMenuOpen]=useState(false),[compactFiltersOpen,setCompactFiltersOpen]=useState(false);
  const [reachMode,setReachMode]=useState<ReachabilityMode>('walking'),[reachMinutes,setReachMinutes]=useState(30);
  const [reachState,setReachState]=useState<'idle'|'loading'|'success'|'error'>('idle'),[reachError,setReachError]=useState('');
  const [reachResult,setReachResult]=useState<{key:string;mode:ReachabilityMode;minutes:number;data:ReachabilityResult}|null>(null);
  const reachController=useRef<AbortController|null>(null),reachSequence=useRef(0),reachCurrentKey=useRef('');
  const dialog=useRef<HTMLDialogElement>(null),searchInput=useRef<HTMLInputElement>(null),detailHeading=useRef<HTMLHeadingElement>(null),filterTrigger=useRef<HTMLElement|null>(null),detailTrigger=useRef<HTMLElement|null>(null),previousUrl=useRef<{state:MapState;savedOnly:boolean;county:string|null}|null>(null),restoringHistory=useRef(false),flushUrl=useRef<(()=>void)|null>(null);
  const p=pois.find(p=>p.id===selected),cp=countyPois.find(p=>p.id===selectedCounty);
  const reachKey=p?`poi:${p.id}`:cp?`county:${cp.id}`:'';
  reachCurrentKey.current=reachKey;
  const activeReach=reachResult&&reachResult.key===reachKey&&reachResult.mode===reachMode&&reachResult.minutes===reachMinutes?reachResult.data:null;
  const context:Context={island,season,mode,hour:new Date().getHours(),history,categories:category==='all'?[]:[category]};
  const visible=useMemo(()=>pois.filter(p=>(island==='all'||p.island===island)&&(category==='all'||p.categories.includes(category))&&(!savedOnly||saved.includes(p.id))&&(!topic||p.related_topics.includes(topic))&&matchesSearch(p,q)),[island,category,q,savedOnly,saved,topic]);
  const visibleCounty=useMemo(()=>island==='all'&&category==='all'&&!topic?countyPois.filter(p=>(!savedOnly||saved.includes(p.id))&&normalize(q).split(' ').filter(Boolean).every(term=>normalize([p.name,p.name_kana,p.municipality,p.address||'',p.summary||''].join(' ')).includes(term))):[],[island,category,q,savedOnly,saved,topic]);
  const totalVisible=visible.length+visibleCounty.length;
  const municipalityCount=new Set([...countyPois.map(item=>item.municipality),'上島町']).size;
  const selectedIsland=islands.find(i=>i.name===island);
  const islandSuggestions=q.trim()&&!savedOnly&&!topic&&category==='all'?islands.filter(i=>matchesIsland(i,q)):[];
  const suggestions=p?recommend(p,pois,context):[];
  const speak=useCallback((text:string)=>setToast(text),[]);
  const clearReachability=useCallback(()=>{reachSequence.current++;reachController.current?.abort();reachController.current=null;setReachResult(null);setReachError('');setReachState('idle');},[]);
  useEffect(()=>{clearReachability();},[reachKey,clearReachability]);
  useEffect(()=>()=>{reachSequence.current++;reachController.current?.abort();},[]);
  async function calculateReachability(){
    const coordinates=p?{lat:p.coordinates.lat,lng:p.coordinates.lng}:cp?{lat:cp.lat,lng:cp.lng}:null;
    if(!coordinates||coordinates.lat===null||coordinates.lng===null||!Number.isFinite(coordinates.lat)||!Number.isFinite(coordinates.lng))return;
    reachController.current?.abort();const controller=new AbortController(),sequence=++reachSequence.current,key=reachKey;
    reachController.current=controller;setReachResult(null);setReachError('');setReachState('loading');
    try{
      const data=await requestReachability({id:(p||cp)!.id,lat:coordinates.lat,lng:coordinates.lng,mode:reachMode,minutes:reachMinutes,signal:controller.signal});
      if(controller.signal.aborted||sequence!==reachSequence.current||reachCurrentKey.current!==key)return;
      setReachResult({key,mode:reachMode,minutes:reachMinutes,data});setReachState('success');
    }catch(error){
      if(controller.signal.aborted||sequence!==reachSequence.current||reachCurrentKey.current!==key)return;
      setReachResult(null);setReachError(error instanceof Error&&error.name==='ReachabilityError'?error.message:'到達圏を計算できませんでした。通信状況を確認して、もう一度お試しください。');setReachState('error');
    }finally{if(reachController.current===controller)reachController.current=null;}
  }
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{try{localStorage.setItem('tripscape-saved',JSON.stringify(saved));}catch{speak('保存できません。この画面を開いている間は利用できます。');}},[saved,speak]);
  useEffect(()=>{
    const state:MapState={poi:selected,island,q,category,terrain,deep,topic,season,mode};const previous=previousUrl.current;previousUrl.current={state,savedOnly,county:selectedCounty};const restored=restoringHistory.current;restoringHistory.current=false;
    const write=()=>{const hash=mapStateHash(state)+(selectedCounty?'&county='+encodeURIComponent(selectedCounty):''),url=`${location.pathname}${location.search}${hash}`,snapshot={...window.history.state,tripscapeSavedOnly:savedOnly};if(!previous||restored)window.history.replaceState(snapshot,'',url);else if(hash!==location.hash||savedOnly!==!!window.history.state?.tripscapeSavedOnly)window.history.pushState(snapshot,'',url);};
    flushUrl.current=write;
    const onlyQueryChanged=!!previous&&q!==previous.state.q&&savedOnly===previous.savedOnly&&selectedCounty===previous.county&&Object.keys(state).every(key=>key==='q'||state[key as keyof MapState]===previous.state[key as keyof MapState]);
    const timer=onlyQueryChanged&&!restored?setTimeout(write,300):null;if(!timer)write();return()=>{if(timer)clearTimeout(timer);};
  },[selected,selectedCounty,island,q,category,terrain,deep,topic,season,mode,savedOnly]);
  useEffect(()=>{const restore=()=>{const s=initialState(),county=readCountyId(),bookmarks=!!window.history.state?.tripscapeSavedOnly;if(previousUrl.current&&mapStateHash(s)===mapStateHash(previousUrl.current.state)&&bookmarks===previousUrl.current.savedOnly&&county===previousUrl.current.county){restoringHistory.current=false;return;}restoringHistory.current=true;setSelected(s.poi);setSelectedCounty(county);setIsland(s.island);setQ(s.q);setCategory(s.category);setTerrain(s.terrain);setDeep(s.deep);setTopic(s.topic);setSeason(s.season);setMode(s.mode);setSavedOnly(bookmarks);setFiltersOpen(false);setSheet(s.deep?'deep':'detail');setView(v=>({kind:county?'countyPoi':s.poi?'poi':s.island!=='all'?'island':'overview',id:county||s.poi||s.island,nonce:v.nonce+1}));};window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);return()=>{window.removeEventListener('hashchange',restore);window.removeEventListener('popstate',restore);};},[]);
  useEffect(()=>{if(about)dialog.current?.showModal();else dialog.current?.close();},[about]);
  useEffect(()=>{if(selected||selectedCounty){const frame=requestAnimationFrame(()=>detailHeading.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);}},[selected,selectedCounty]);
  useEffect(()=>{if(filtersOpen&&window.matchMedia('(max-width:760px), (orientation:landscape)').matches){const frame=requestAnimationFrame(()=>searchInput.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);}},[filtersOpen]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||about)return;if(filtersOpen){event.preventDefault();setFiltersOpen(false);filterTrigger.current?.focus({preventScroll:true});}else if(mapMenuOpen){event.preventDefault();setMapMenuOpen(false);}else if(selected||selectedCounty){event.preventDefault();dismissDetail();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[filtersOpen,selected,selectedCounty,about,mapMenuOpen]);
  function select(id:string){const target=pois.find(p=>p.id===id);if(!target)return;flushUrl.current?.();const trigger=document.activeElement as HTMLElement|null;detailTrigger.current=trigger?.closest('.detail-panel')?null:trigger;if(!visible.some(p=>p.id===id)){setIsland('all');setQ('');setCategory('all');setTopic(null);setSavedOnly(false);}setSelectedCounty(null);setSelected(id);setDeep(false);setSheet('detail');setFiltersOpen(false);setView(v=>({kind:'poi',id,nonce:v.nonce+1}));setHistory(h=>[...h.filter(x=>x!==id),id].slice(-20));}
  function selectCounty(id:string){if(!countyPois.some(item=>item.id===id))return;flushUrl.current?.();const trigger=document.activeElement as HTMLElement|null;detailTrigger.current=trigger?.closest('.detail-panel')?null:trigger;if(!visibleCounty.some(item=>item.id===id)){setIsland('all');setQ('');setCategory('all');setTopic(null);setSavedOnly(false);}setSelected(null);setSelectedCounty(id);setDeep(false);setSheet('detail');setFiltersOpen(false);setMapMenuOpen(false);setView(v=>({kind:'countyPoi',id,nonce:v.nonce+1}));}
  function chooseIsland(name:string){setIsland(name);closeDetail();setQ('');setCategory('all');setTopic(null);setSavedOnly(false);setFiltersOpen(false);setView(v=>({kind:name==='all'?'overview':'island',id:name,nonce:v.nonce+1}));}
  function closeDetail(){setSelected(null);setSelectedCounty(null);setDeep(false);setSheet('detail');}
  function dismissDetail(){closeDetail();requestAnimationFrame(()=>{const trigger=detailTrigger.current;const target=trigger?.isConnected&&trigger.getClientRects().length?trigger:window.matchMedia('(orientation:landscape)').matches?document.querySelector<HTMLButtonElement>('.landscape-explore'):window.matchMedia('(max-width:760px)').matches?document.querySelector<HTMLButtonElement>('.mobile-explore-toggle'):searchInput.current;target?.focus({preventScroll:true});});}
  function showFilteredMap(){setView(v=>({kind:island==='all'?'overview':'island',id:island,nonce:v.nonce+1}));}
  function updateSearch(value:string){if(selected||selectedCounty||!q&&value||q&&!value)showFilteredMap();setQ(value);closeDetail();}
  function updateCategory(value:string){showFilteredMap();setCategory(value);closeDetail();}
  function openFilters(){filterTrigger.current=document.activeElement as HTMLElement|null;setMapMenuOpen(false);setFiltersOpen(true);}
  function chooseTopic(id:string){setTopic(id);closeDetail();setQ('');setIsland('all');setCategory('all');setSavedOnly(false);openFilters();setView(v=>({kind:'overview',id:'all',nonce:v.nonce+1}));}
  function toggleBookmarks(){const next=!savedOnly;setSavedOnly(next);setQ('');setCategory('all');setTopic(null);setIsland('all');closeDetail();openFilters();setView(v=>({kind:'overview',id:'all',nonce:v.nonce+1}));}
  function reset(){setQ('');setCategory('all');setTopic(null);setSavedOnly(false);chooseIsland('all');}
  function toggleSave(id:string){const removing=saved.includes(id);setSaved(old=>old.includes(id)?old.filter(s=>s!==id):[...old,id]);if(removing&&savedOnly&&(selected===id||selectedCounty===id))closeDetail();speak(removing?'旅のしおりから削除しました。':'旅のしおりに保存しました。');}
  async function share(){flushUrl.current?.();try{await navigator.clipboard.writeText(location.href);speak('この地図のURLをコピーしました。');}catch{speak('URLをコピーできません。アドレスバーのURLで共有できます。');}}
  function locate(){
    if(!navigator.geolocation){speak('このブラウザーは現在地取得に対応していません。');return;}
    speak('現在地を確認しています。');
    navigator.geolocation.getCurrentPosition(({coords})=>{
      setOrigin({lat:coords.latitude,lng:coords.longitude});setOriginType('current');
      if(coords.longitude<131.6||coords.longitude>134.3||coords.latitude<32.5||coords.latitude>34.8){speak('現在地は表示範囲の外です。外部地図の案内を確認してください。');return;}
      setView(v=>({kind:'location',coordinates:[coords.longitude,coords.latitude],nonce:v.nonce+1}));speak('現在地を表示しました。位置は保存しません。');
    },()=>speak('現在地を取得できませんでした。位置情報の許可や端末の設定を確認してください。'),{timeout:10000,maximumAge:60000});
  }
  const TopicIcon=mode==='ferry'?Ship:mode==='cycling'?Bike:Footprints;
  const activeTopic=topics.find(t=>t.id===topic);
  const filtered=island!=='all'||!!q||category!=='all'||!!topic||savedOnly;
  const reachControls=(name:string)=><ReachabilityControls name={name} mode={reachMode} minutes={reachMinutes} state={reachState} result={activeReach} error={reachError} onMode={value=>{clearReachability();setReachMode(value);}} onMinutes={value=>{clearReachability();setReachMinutes(value);}} onCalculate={calculateReachability} onClear={clearReachability}/>;
  return <div className={`app-shell ${mapMenuOpen?'landscape-settings-open':''}`}>
    <a className="skip-link" href="#search-input" onClick={event=>{event.preventDefault();if(window.matchMedia('(max-width:760px), (orientation:landscape)').matches)openFilters();else searchInput.current?.focus();}}>検索へ移動</a>
    <header className="topbar">
      <button className="brand" onClick={reset} aria-label="愛媛県の地図を全域表示"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt=""/><span>EHIME <b>TRIPSCAPE</b></span></button>
      <div className="header-center">愛媛県の観光地図</div>
      <nav aria-label="地図の便利な機能"><button className={savedOnly?'active':''} onClick={toggleBookmarks} aria-pressed={savedOnly} aria-label={`旅のしおり ${saved.length}件`}><Bookmark size={16}/>旅のしおり<span className="count-badge">{saved.length}</span></button><button onClick={share} aria-label="地図のURLをコピー"><Share2 size={17}/><span className="desktop-label">共有</span></button><button onClick={()=>setAbout(true)} aria-label="この地図について"><Info size={18}/></button></nav>
    </header>
    <main>
      <Suspense fallback={<div className="map-loading"><Compass size={32}/><p>愛媛県の地図を読み込んでいます</p></div>}><MapView pois={pois} visible={visible} countyPois={visibleCounty} selectedCountyPoi={selectedCounty} onCountyPoi={selectCounty} islands={islands} selected={selected} view={view} mobileSheet={sheet} onPoi={select} onIsland={chooseIsland} terrain={terrain} onTerrain={setTerrain} onStatus={setStatus} onLocate={locate} reachability={activeReach?.geojson??null}/></Suspense>
      <aside id="explorer-panel" className={`explorer ${filtersOpen?'mobile-open':''} ${compactFiltersOpen?'compact-filter-open':''}`} aria-label="地点の検索と絞り込み">
        <div className="explorer-heading"><button className="mobile-close icon-button" onClick={()=>{setFiltersOpen(false);filterTrigger.current?.focus({preventScroll:true});}} aria-label="検索パネルを閉じる"><X size={18}/></button><h1>観光スポット</h1></div>
        <div className="search-field"><Search size={17}/><input ref={searchInput} id="search-input" aria-label="観光スポットを検索" placeholder="名称・市町・島を検索" value={q} onChange={e=>updateSearch(e.target.value)}/>{q&&<button onClick={()=>{updateSearch('');searchInput.current?.focus();}} aria-label="検索をクリア"><X size={14}/></button>}</div>
        <button className="compact-filter-toggle" onClick={()=>setCompactFiltersOpen(open=>!open)} aria-expanded={compactFiltersOpen} aria-controls="filter-controls">絞り込み <ChevronDown size={16}/></button>
        <div id="filter-controls" className="filter-controls">
        <section className="filter-section"><div className="section-label">上島町の島を選ぶ</div><div className="island-grid"><button className={island==='all'?'active':''} onClick={()=>chooseIsland('all')} aria-pressed={island==='all'}>すべての地域</button>{islands.map(i=><button key={i.id} className={island===i.name?'active':''} onClick={()=>chooseIsland(i.name)} aria-pressed={island===i.name}>{i.name}<span>{stats.by_island[i.name as keyof typeof stats.by_island]}</span></button>)}</div></section>
        <section className="filter-section"><div className="section-label">興味から探す <button onClick={()=>{setCategory('all');setTopic(null);setQ('');setSavedOnly(false);closeDetail();}}>リセット</button></div><div className="category-grid">{['絶景 / 展望','歴史 / 文化財','海 / 海岸 / 海水浴場','自然','食','アート'].map((c,i)=>{const Icon=[Mountain,Landmark,Waves,Leaf,Utensils,Globe][i];return <button key={c} className={category===c?'active':''} onClick={()=>updateCategory(category===c?'all':c)} aria-pressed={category===c}><Icon size={14}/>{['絶景','歴史・文化','海辺','自然','食','アート'][i]}</button>;})}</div><select aria-label="すべての観光カテゴリ" value={category} onChange={e=>updateCategory(e.target.value)}><option value="all">すべてのカテゴリ</option>{categories.map(c=><option key={c}>{c}</option>)}</select></section>
        <section className="travel-context"><div><Sun size={15}/><select aria-label="旅の季節" value={season} onChange={e=>setSeason(e.target.value as Season)}>{(['春','夏','秋','冬'] as Season[]).map(s=><option key={s}>{s}</option>)}</select><span>の旅</span></div><div className="mode-buttons" role="group" aria-label="移動手段">{(['walking','cycling','ferry'] as Mode[]).map(m=>{const Icon=ModeIcon[m];return <button key={m} aria-label={modeNames[m]} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>setMode(m)}><Icon size={16}/></button>;})}</div></section>
        {activeTopic&&<div className="topic-banner"><button onClick={()=>setTopic(null)} aria-label="テーマを解除"><X size={14}/></button><strong>{activeTopic.name}</strong><p>{activeTopic.summary}</p></div>}
        </div>
        {filtered&&<div className="filter-chips" aria-label="現在の絞り込み条件">{island!=='all'&&<button onClick={()=>{setIsland('all');closeDetail();setView(v=>({kind:'overview',id:'all',nonce:v.nonce+1}));}} aria-label={`${island}の絞り込みを解除`}>{island}<X size={12}/></button>}{q&&<button onClick={()=>updateSearch('')} aria-label="検索語の絞り込みを解除">「{q}」<X size={12}/></button>}{category!=='all'&&<button onClick={()=>updateCategory('all')} aria-label="カテゴリの絞り込みを解除">{category.split(' / ')[0]}<X size={12}/></button>}{topic&&<button onClick={()=>setTopic(null)} aria-label="テーマの絞り込みを解除">{activeTopic?.name}<X size={12}/></button>}{savedOnly&&<button onClick={()=>setSavedOnly(false)} aria-label="しおりの絞り込みを解除"><Bookmark size={12}/>しおり<X size={12}/></button>}<button className="filter-clear" onClick={reset}>条件をクリア</button></div>}
        <div className="results-heading"><span>{savedOnly?'旅のしおり':filtered?'検索結果':'地図にある場所'}</span><b aria-live="polite">{totalVisible}<small>件</small></b></div>
        <p className="coverage-note">{municipalityCount}市町から一部の地点を掲載しています。最新情報は各出典をご確認ください。{(category!=='all'||topic)&&'県内の追加地点はテーマ・カテゴリ未分類のため、この条件では表示しません。'}</p>
        <div className="results" aria-label="観光スポット一覧">{islandSuggestions.length>0&&<section className="island-suggestions" aria-label="検索に関連する島"><h2>関連する島</h2>{islandSuggestions.map(i=><div key={i.id}><button className="result-item" onClick={()=>chooseIsland(i.name)}><span className="result-icon"><Compass size={17}/></span><span className="result-copy"><small>島の公式紹介から</small><strong>{i.name}</strong><small>{i.summary}</small></span><ChevronRight size={15}/></button><a href={i.official_url} target="_blank" rel="noopener noreferrer">{i.name}の公式ガイド <ArrowUpRight size={12}/></a></div>)}</section>}{visible.map(p=>{const Icon=iconFor(p);return <button className={`result-item ${selected===p.id?'selected':''}`} key={p.id} onClick={()=>select(p.id)}><span className="result-icon"><Icon size={17}/></span><span className="result-copy"><small>{p.island} · {p.categories[0].split(' / ')[0]}</small><strong>{p.name}</strong></span><ChevronRight size={15}/></button>;})}{visibleCounty.map(item=><button className={`result-item county-result ${selectedCounty===item.id?'selected':''}`} key={item.id} onClick={()=>selectCounty(item.id)}><span className="result-icon"><MapPin size={17}/></span><span className="result-copy"><small>{item.municipality} · {item.source_name||(item.source_data_url?'自治体公開データ':'県観光情報')}</small><strong>{item.name}</strong></span><ChevronRight size={15}/></button>)}{totalVisible===0&&islandSuggestions.length===0&&<div className="empty-results">{savedOnly&&saved.length===0?<><Bookmark size={24}/><h2>旅のしおりは、まだ空です</h2><p>気になる場所の詳細で、しおりボタンを押すとここに保存できます。</p><button onClick={reset}>観光スポットを探す</button></>:<><Search size={24}/><h2>条件に合う場所はありません</h2><p>{savedOnly?'保存した場所に合う条件がありません。絞り込みを解除してみてください。':'検索語や絞り込み条件を変えてみてください。'}</p><button onClick={reset}>条件をリセット</button></>}</div>}</div>
        <button className="research-note" onClick={()=>setAbout(true)}><CheckCircle2 size={14}/><span>掲載情報と出典について</span><ArrowUpRight size={13}/></button>
      </aside>
      <div className="mobile-search"><div className="search-field"><Search size={17}/><input aria-label="モバイルで観光スポットを検索" placeholder="名称・市町・島を検索" value={q} onChange={e=>{updateSearch(e.target.value);openFilters();}}/></div><button onClick={openFilters} aria-expanded={filtersOpen} aria-controls="explorer-panel" aria-label="検索とフィルターを開く"><SlidersHorizontal size={18}/></button></div>
      <div className="map-breadcrumb"><b>{selectedIsland?.name||'愛媛県'}</b></div>
      {!p&&!cp&&<section className="welcome-card glass"><h2>{selectedIsland?.name||'観光スポット'}</h2><p>{selectedIsland?.summary||'地図上のピンを選ぶと、場所の詳細を確認できます。'}</p><div className="welcome-counts"><div><b>{totalVisible}</b><span>{filtered?'条件に合う場所':'確認済みの場所'}</span></div><div><b>8</b><span>上島町の主要島</span></div></div><button className="primary" disabled={!totalVisible} onClick={()=>visible[0]?select(visible[0].id):visibleCounty[0]&&selectCounty(visibleCounty[0].id)}>最初のスポットを見る <ArrowUpRight size={17}/></button>{selectedIsland&&<a className="text-link" href={selectedIsland.official_url} target="_blank" rel="noopener noreferrer">島の公式ガイド <ArrowUpRight size={13}/></a>}<div className="welcome-foot"><Compass size={15}/><span>地図を動かしてスポットを探せます</span></div></section>}
      {p&&<section className={`detail-panel glass sheet-${sheet}`} aria-label="観光スポットの詳細">
        <button className="sheet-handle" onClick={()=>setSheet(sheet==='compact'?'detail':'compact')} aria-label="詳細パネルの高さを切り替え" aria-expanded={sheet!=='compact'}><span/></button>
        <div className="detail-top"><span className="eyebrow">{p.island}</span><div><button className="icon-button" aria-label={`${p.name}をしおり${saved.includes(p.id)?'から削除':'に保存'}`} aria-pressed={saved.includes(p.id)} onClick={()=>toggleSave(p.id)}>{saved.includes(p.id)?<Check size={19}/>:<Bookmark size={19}/>}</button><button className="icon-button" onClick={dismissDetail} aria-label="地点詳細を閉じる"><X size={20}/></button></div></div>
        <div className="detail-scroll" key={p.id}>
          <div className="detail-heading"><span className="place-number">{String(pois.indexOf(p)+1).padStart(2,'0')} <span>/ {String(stats.verified).padStart(2,'0')}</span></span><h2 ref={detailHeading} tabIndex={-1}>{p.name}</h2><div className="place-meta"><MapPin size={13}/>{p.island}<span/> {p.categories[0].split(' / ')[0]}</div><LocationMapLink lat={p.coordinates.lat} lng={p.coordinates.lng}/></div>
          {reachControls(p.name)}
          <div className="detail-tabs"><button className={!deep?'active':''} aria-pressed={!deep} onClick={()=>{setDeep(false);setSheet('detail');}}>場所のこと</button><button className={deep?'active':''} aria-pressed={deep} onClick={()=>{setDeep(true);setSheet('deep');}}><BookOpen size={14}/> 深掘り</button></div>
          {!deep?<><p className="description">{p.description}</p><div className="tag-row">{p.related_topics.slice(0,4).map(t=><button key={t} onClick={()=>chooseTopic(t)}>{t}<ArrowUpRight size={10}/></button>)}</div></>:<>
            <div className="deep-heading"><h3>この場所について</h3><p>公式資料をもとに紹介します。</p></div>
            {orderedSections(p.deep_dive,context).map((s,i)=><article className="deep-section" key={s.title}><span className="deep-index">{String(i+1).padStart(2,'0')}</span><h4>{s.title}</h4><p>{s.text}</p><a href={s.source_urls[0]} target="_blank" rel="noopener noreferrer">この記述の出典 <ArrowUpRight size={11}/></a></article>)}
            {p.related_people.length>0&&<div className="people"><span className="section-label">関わる人物</span>{p.related_people.map(name=><button key={name} onClick={()=>{updateSearch(name);setIsland('all');setCategory('all');setTopic(null);setSavedOnly(false);openFilters();}}>{name}<Search size={12}/></button>)}</div>}
            <div className="topic-graph"><span className="section-label">つながるテーマ</span><div className="graph-center"><MapPin size={14}/>{p.name}</div><div className="graph-branches">{p.related_topics.map(t=><button key={t} onClick={()=>chooseTopic(t)}>{t}<ChevronRight size={12}/></button>)}</div><div className="theme-next">{topics.find(t=>t.id===p.related_topics[0])?.related_topics.map(t=><button key={t} onClick={()=>chooseTopic(t)}>さらに「{t}」へ <ArrowUpRight size={11}/></button>)}</div></div>
          </>}
          <section className="access-card"><div className="section-label"><TopicIcon size={15}/> ここへの行き方</div><div className="origin-options"><button className={originType==='port'?'active':''} aria-pressed={originType==='port'} onClick={()=>setOriginType('port')}>港から</button><button className={originType==='current'?'active':''} aria-pressed={originType==='current'} onClick={()=>{if(!origin)locate();else setOriginType('current');}}>現在地から</button></div><strong>{originType==='port'?(p.access.port||'島へのアクセス'):origin?'現在地からの外部案内':'現在地の取得が必要です'}</strong><p>{p.access.note}</p>{p.location_scope.includes('代表地点')&&<p className="coordinate-note">地図の印: {p.location_scope}</p>}{(mode==='ferry'||requiresFerry(undefined,p.island)||originType==='current')&&<div className="ferry-note"><Ship size={14}/><span>{p.island==='津波島'?'予約した渡船を利用します。':'島への移動には航路を利用する場合があります。'} 最新の運航・時刻表を確認してください。</span></div>}
          <div className="access-links"><a href={p.access.official_url} target="_blank" rel="noopener noreferrer">公式の航路・アクセス <ArrowUpRight size={13}/></a>{mode!=='ferry'&&p.access.modes.includes(mode)&&<a href={originType==='current'?directionsUrl(p,mode,origin):`${directionsUrl(p,mode)}${p.access.port?'&origin='+encodeURIComponent(p.access.port+' 上島町'):''}`} target="_blank" rel="noopener noreferrer">{modeNames[mode]}ルートを外部地図で確認 <ArrowUpRight size={13}/></a>}</div><small>案内確認日 {p.access.checked_at} · 所要時間は公式の目安</small></section>
          {p.warnings.length>0&&<div className="place-warning"><CircleHelp size={16}/><div>{p.warnings.map(w=><p key={w}>{w}</p>)}</div></div>}
          <section className="next-places"><div className="section-label">おすすめの場所</div>{suggestions.map(({poi,reasons})=><button className="next-place" key={poi.id} onClick={()=>select(poi.id)}><div><small>{poi.island} · {reasons.slice(0,2).join(' / ')}</small><strong>{poi.name}</strong></div><ArrowUpRight size={17}/></button>)}</section>
          <details className="sources" open={deep}><summary><CheckCircle2 size={14}/>出典・確認情報 <ChevronDown size={14}/></summary><div><dl><dt>確認日</dt><dd>{p.last_verified_at}</dd><dt>状態</dt><dd>{p.verification_status==='official_verified'?'公式情報で確認':'複数の公式資料で照合'}</dd><dt>資料更新日</dt><dd>{p.content_date||'記載なし'}</dd><dt>地点について</dt><dd>{p.location_scope}</dd><dt>位置の出典</dt><dd>{p.coordinate_source}</dd></dl><div className="source-links">{p.source_urls.map((url,i)=><a key={url} href={url} target="_blank" rel="noopener noreferrer"><span>{i+1}. {new URL(url).hostname.includes('iyokannet')?'愛媛県公式観光':new URL(url).hostname.includes('gsi')?'国土地理院資料':'上島町公式観光'}</span><ArrowUpRight size={12}/></a>)}</div></div></details>
        </div>
        <div className="detail-footer"><CheckCircle2 size={12}/><span>確認日 {p.last_verified_at}</span><button onClick={share}>この場所を共有 <Share2 size={13}/></button></div>
      </section>}
      {cp&&<section className={`detail-panel glass sheet-${sheet}`} aria-label="観光スポットの詳細">
        <button className="sheet-handle" onClick={()=>setSheet(sheet==='compact'?'detail':'compact')} aria-label="詳細パネルの高さを切り替え" aria-expanded={sheet!=='compact'}><span/></button>
        <div className="detail-top"><span className="eyebrow">{cp.municipality}</span><div><button className="icon-button" aria-label={`${cp.name}をしおり${saved.includes(cp.id)?'から削除':'に保存'}`} aria-pressed={saved.includes(cp.id)} onClick={()=>toggleSave(cp.id)}>{saved.includes(cp.id)?<Check size={19}/>:<Bookmark size={19}/>}</button><button className="icon-button" onClick={dismissDetail} aria-label="地点詳細を閉じる"><X size={20}/></button></div></div>
        <div className="detail-scroll" key={cp.id}><div className="detail-heading"><h2 ref={detailHeading} tabIndex={-1}>{cp.name}</h2><div className="place-meta"><MapPin size={13}/>{cp.municipality} <span/> {cp.source_name||(cp.source_data_url?'自治体公開データ':'県観光情報')}</div><LocationMapLink lat={cp.lat} lng={cp.lng} address={cp.address}/></div>
          {reachControls(cp.name)}
          {cp.summary&&<p className="description">{cp.summary}</p>}<p className="description">{cp.location_scope}</p>
          <section className="access-card"><div className="section-label"><MapPin size={15}/> 場所を確認</div><p>営業時間や休業日は公式情報をご確認ください。</p><div className="access-links"><a href={`https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}&travelmode=walking`} target="_blank" rel="noopener noreferrer">徒歩ルートを外部地図で確認 <ArrowUpRight size={13}/></a><a href={cp.source_url} target="_blank" rel="noopener noreferrer">掲載元のページ <ArrowUpRight size={13}/></a></div></section>
          <details className="sources" open><summary><CheckCircle2 size={14}/>出典・確認情報 <ChevronDown size={14}/></summary><div><dl><dt>確認日</dt><dd>{cp.checked_at}</dd><dt>資料更新日</dt><dd>{cp.source_updated_at||'記載なし'}</dd><dt>利用条件</dt><dd>{cp.license_url?<><span>{cp.municipality}の観光施設一覧を加工（</span><a href={cp.license_url} target="_blank" rel="noopener noreferrer">{cp.license}</a><span>）</span></>:cp.license}</dd><dt>地点について</dt><dd>{cp.location_scope}</dd></dl><div className="source-links">{cp.source_data_url&&<a href={cp.source_data_url} target="_blank" rel="noopener noreferrer">自治体の公開データ（CSV） <ArrowUpRight size={12}/></a>}<a href={cp.source_url} target="_blank" rel="noopener noreferrer">データの公開元 <ArrowUpRight size={12}/></a></div></div></details>
        </div><div className="detail-footer"><CheckCircle2 size={12}/><span>確認日 {cp.checked_at}</span><button onClick={share}>この場所を共有 <Share2 size={13}/></button></div>
      </section>}
      {!p&&!cp&&<div className="journey-strip glass"><div className="journey-mark"><Compass size={23}/></div><div><strong>{activeTopic?.name||selectedIsland?.name||'観光スポット'}</strong><small>{totalVisible}件 · {modeNames[mode]}</small></div><button onClick={openFilters} aria-expanded={filtersOpen} aria-controls="explorer-panel" aria-label="島と場所の一覧を表示"><ChevronRight size={20}/></button></div>}
      <button className="mobile-explore-toggle" onClick={openFilters} aria-expanded={filtersOpen} aria-controls="explorer-panel"><Compass size={15}/>場所を探す <span>{totalVisible}</span><ChevronUp size={14}/></button>
      {activeReach&&<a className="reachability-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>}
      <nav className="landscape-dock" aria-label="地図メニュー">
        <button onClick={reset} aria-label="愛媛県の地図を全域表示"><Globe size={19}/><span>全域</span></button>
        <button className="landscape-explore" onClick={openFilters} aria-expanded={filtersOpen} aria-controls="explorer-panel"><Search size={19}/><span>探す</span></button>
        <button onClick={()=>{setFiltersOpen(false);setMapMenuOpen(!mapMenuOpen);}} aria-label="地図設定" aria-expanded={mapMenuOpen}><Layers size={19}/><span>地図設定</span></button>
        <button onClick={toggleBookmarks} aria-label={`旅のしおり ${saved.length}件`} aria-pressed={savedOnly}><Bookmark size={19}/><span>しおり{saved.length>0?` ${saved.length}`:''}</span></button>
        <button onClick={share} aria-label="地図のURLをコピー"><Share2 size={19}/><span>共有</span></button>
        <button onClick={()=>setAbout(true)} aria-label="この地図について"><Info size={19}/><span>情報</span></button>
        <a className="dock-attribution" href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル / U.S. NIMA VMAP0</a>
      </nav>
      <div className="map-status" role="status"><span className="status-dot"/>{status}<span className="status-divider"/>上島町の確認 {stats.checked_at}<button onClick={()=>setAbout(true)}>出典</button></div>
    </main>
    {toast&&<div className="toast" role="status">{toast}</div>}
    <dialog ref={dialog} onCancel={()=>setAbout(false)} onClick={e=>{if(e.target===dialog.current)setAbout(false);}}><div className="about-header"><span aria-hidden="true"/><button className="icon-button" onClick={()=>setAbout(false)} aria-label="地図の説明を閉じる"><X size={21}/></button></div><h2>この地図について</h2><p>愛媛県全体の地形と、出典を確認した観光地点を探索する地図です。上島町の詳細な地点情報を収録しています。自治体の公式サービスではありません。</p><div className="audit-counts"><div><b>{pois.length+countyPois.length}</b><span>公開地点</span></div><div><b>{stats.pending}</b><span>上島町の未確認候補</span></div><div><b>8</b><span>上島町の主要島</span></div></div><p>上島町の公式一覧148件から調査し、景勝地・島の代表地点3件を追加しました。県内では自治体・観光協会などの公開情報に基づく地点{countyPois.length}件も掲載しています。{municipalityCount}市町すべてを収録していますが、掲載地点は各市町の一部です。未確認地点は推測して掲載せず、出典を記録しています。</p><p>3D地形は国土地理院の標高データをもとに表示しています。海域など標高データのない場所は高さ0mで表示しており、実際の標高を示すものではありません。地形を読み込めない場合は地形表示を停止し、必要に応じて2D地図も利用できます。</p><p>建物の高さを確認できるデータは現在0件です。高さを仮定した建物表示はしていません。写真は公式サイトから無断転載せず、リンクで案内しています。</p><p>しおりはこのブラウザー内に保存されます。現在地はボタン操作時だけ取得し、保存しません。外部地図を開くと、そのサービスへ行き先と取得済みの現在地が渡されます。</p><p>松山市・久万高原町の観光施設一覧を加工（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>）。いよ観ネット由来の地点は各掲載元の利用条件を参照してください。</p><div className="about-links"><a href="https://kamijima.info/" target="_blank" rel="noopener noreferrer">上島町公式観光ガイド <ArrowUpRight size={14}/></a><a href="https://kamijima.info/concerned/" target="_blank" rel="noopener noreferrer">2026年版パンフレット <ArrowUpRight size={14}/></a><a href={`${import.meta.env.BASE_URL}data/pois.geojson`} download>上島町の公開地点GeoJSON <ArrowUpRight size={14}/></a></div><small>上島町データ確認日 {stats.checked_at} · 各自治体のデータ確認日は地点詳細に表示</small></dialog>
  </div>;
}
