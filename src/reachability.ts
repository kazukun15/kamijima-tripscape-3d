export type ReachabilityMode='walking'|'cycling'|'driving';
export interface ReachabilityResult {
  geojson:GeoJSON.FeatureCollection<GeoJSON.Polygon|GeoJSON.MultiPolygon>;
  snappedDistanceMeters:number;
  sourceDate:string;
}
type Request={id:string;lat:number;lng:number;mode:ReachabilityMode;minutes:number;signal:AbortSignal};
type StoredResult={status?:string;snapped_distance_m?:number;contours?:Record<string,unknown>;limited_contours?:string[]};
type StoredData={version?:number;id?:string;lat?:number;lng?:number;source_date?:string;results?:Partial<Record<ReachabilityMode,StoredResult>>};
class ReachabilityError extends Error {constructor(message:string){super(message);this.name='ReachabilityError';}}

function polygonFeature(value:unknown):GeoJSON.Feature<GeoJSON.Polygon|GeoJSON.MultiPolygon>|null {
  if(!value||typeof value!=='object')return null;
  const f=value as GeoJSON.Feature<GeoJSON.Polygon|GeoJSON.MultiPolygon>;
  if(f.type!=='Feature'||!f.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type))return null;
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  if(!Array.isArray(polygons)||!polygons.length)return null;
  let count=0;
  for(const polygon of polygons){
    if(!Array.isArray(polygon)||!polygon.length)return null;
    for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)return null;
      for(const point of ring){
        if(!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1])||point[0]<128||point[0]>137||point[1]<30||point[1]>37||++count>250000)return null;
      }
      if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])return null;
    }
  }
  return f;
}

/** Fetch a precomputed, versioned result; no location or API key is sent to a routing service. */
export async function requestReachability({id,lat,lng,mode,minutes,signal}:Request):Promise<ReachabilityResult>{
  if(!/^[a-zA-Z0-9_-]+$/.test(id)||!['walking','cycling','driving'].includes(mode)||![10,20,30,60].includes(minutes))throw new ReachabilityError('指定された条件では表示できません。');
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();
  if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},20000);
  let data:StoredData;
  try{
    const response=await fetch(`${import.meta.env.BASE_URL}data/reachability/${encodeURIComponent(id)}.json`,{signal:controller.signal});
    if(!response.ok)throw new ReachabilityError(response.status===404?'この地点の到達圏データはまだありません。':'到達圏データを読み込めません。時間をおいてお試しください。');
    try{data=await response.json() as StoredData;}catch(error){if(controller.signal.aborted)throw error;throw new ReachabilityError('到達圏データを読み取れません。');}
  }catch(error){
    if(signal.aborted)throw error;
    if(error instanceof ReachabilityError)throw error;
    throw new ReachabilityError(timedOut?'読み込みに時間がかかりました。もう一度お試しください。':'到達圏データを読み込めません。通信状況をご確認ください。');
  }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
  if(!data||typeof data!=='object'||data.version!==1||data.id!==id||typeof data.lat!=='number'||typeof data.lng!=='number'||Math.abs(data.lat-lat)>0.000001||Math.abs(data.lng-lng)>0.000001||typeof data.source_date!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(data.source_date))throw new ReachabilityError('地点と到達圏データが一致しないため表示できません。');
  const result=data.results?.[mode];
  if(result?.status==='no_road')throw new ReachabilityError('この地点の近くに利用できる道路が見つかりませんでした。');
  if(result?.status==='outside_data'||(Array.isArray(result?.limited_contours)&&result.limited_contours.includes(String(minutes))))throw new ReachabilityError('この時間の範囲は道路データの端に近いため表示できません。');
  if(result?.status!=='ok')throw new ReachabilityError('この地点・移動手段の到達圏は表示できません。');
  if(typeof result.snapped_distance_m!=='number'||!Number.isFinite(result.snapped_distance_m)||result.snapped_distance_m<0||result.snapped_distance_m>100)throw new ReachabilityError('計算開始地点が遠いため、到達圏を表示できません。');
  const feature=polygonFeature(result.contours?.[String(minutes)]);
  if(!feature)throw new ReachabilityError('到達圏の形状を確認できないため表示できません。');
  return {geojson:{type:'FeatureCollection',features:[feature]},snappedDistanceMeters:result.snapped_distance_m,sourceDate:data.source_date.slice(0,10)};
}
