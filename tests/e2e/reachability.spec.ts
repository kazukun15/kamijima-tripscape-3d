import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Every polygon in these tests is a synthetic rectangle, never a real reachability result.
type Spot={id:string;name:string;lat:number;lng:number};
type Mode='walking'|'cycling'|'driving';
const spots=JSON.parse(readFileSync('data/ehime-pois.json','utf8')) as Spot[];
const first=spots.find(s=>s.id==='382019-001')!;
const second=spots.find(s=>s.id==='iyokannet-663')!;
const islandData=JSON.parse(readFileSync('data/poi/verified.json','utf8')) as Array<{id:string;name:string;coordinates:{lat:number;lng:number}}>;
const modes:Mode[]=['walking','cycling','driving'];
const minutes=[10,20,30,60];
function makeSyntheticFixture(spot:Spot){
  const results=Object.fromEntries(modes.map((mode,index)=>{
    const contours=Object.fromEntries(minutes.map(n=>{
      const dx=(index+1)*n*0.0001,dy=(4-index)*n*0.00006,x=spot.lng,y=spot.lat;
      return [String(n),{type:'Feature',properties:{fixture:true,mode,minutes:n},geometry:{type:'Polygon',coordinates:[[[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy],[x-dx,y-dy]]]}}];
    }));
    return [mode,{status:'ok',snapped_distance_m:12,contours}];
  }));
  return {version:1,id:spot.id,lat:spot.lat,lng:spot.lng,source_date:'2026-11-16',results};
}
async function openReachPanel(page:Page,spot:Spot,renderer:'2d'|'3d',kind:'county'|'poi'='county'){
  await page.goto(`/${renderer==='2d'?'?renderer=2d':''}#${kind}=${spot.id}`);
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({timeout:60000});
  await expect(page.locator(`[data-renderer="${renderer==='2d'?'leaflet':'maplibre'}"]`)).toBeVisible();
  await expect(page.getByRole('heading',{name:spot.name,exact:true})).toBeVisible();
  const panel=page.locator('.reachability-panel');await panel.locator('summary').click();return panel;
}

for(const renderer of ['2d','3d'] as const)test(`${renderer} draws synthetic contours for walking, cycling and driving on request`,async({page})=>{
  const requested:string[]=[];
  await page.route('**/data/reachability/*.json',async route=>{requested.push(new URL(route.request().url()).pathname);await route.fulfill({json:makeSyntheticFixture(first),headers:{'cache-control':'no-store'}});});
  const panel=await openReachPanel(page,first,renderer);const host=page.locator('.map-host');
  await expect(host).toHaveAttribute('data-reachability','none');expect(requested).toHaveLength(0);
  const method=panel.getByRole('combobox',{name:'到達圏の移動手段'}),duration=panel.getByRole('combobox',{name:'到達圏の所要時間'});
  let previousPath:string|null=null;
  for(const [mode,minute,label] of [['walking','10','徒歩 10分'],['cycling','20','自転車 20分'],['driving','60','車 60分']] as const){
    await method.selectOption(mode);await duration.selectOption(minute);
    await expect(host).toHaveAttribute('data-reachability','none');
    await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();
    await expect(host).toHaveAttribute('data-reachability','shown',{timeout:30000});
    await expect(panel.locator('.reachability-legend')).toContainText(label);
    if(renderer==='2d'){
      const path=page.locator('.leaflet-overlay-pane path[fill="#007a78"]');await expect(path).toHaveCount(1);
      if(previousPath!==null)await expect.poll(()=>path.getAttribute('d')).not.toBe(previousPath);
      previousPath=await path.getAttribute('d');expect(previousPath).toBeTruthy();
    }else await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  }
  expect(requested.length).toBeGreaterThanOrEqual(1);expect(requested.length).toBeLessThanOrEqual(3);expect(requested.every(path=>path.endsWith(`/data/reachability/${first.id}.json`))).toBe(true);
  await expect(panel).toContainText('道路データ: 2026-11-16');
  await panel.getByRole('button',{name:'到達圏を消す',exact:true}).click();await expect(host).toHaveAttribute('data-reachability','none');
  if(renderer==='2d')await expect(page.locator('.leaflet-overlay-pane path[fill="#007a78"]')).toHaveCount(0);
});

test('missing road and server errors clear any previous synthetic contour',async({page})=>{
  let count=0;
  await page.route('**/data/reachability/*.json',async route=>{
    count++;
    if(count===1)return route.fulfill({json:makeSyntheticFixture(first),headers:{'cache-control':'no-store'}});
    if(count===2){const data=makeSyntheticFixture(first);data.results.cycling={status:'no_road',snapped_distance_m:0,contours:{}};return route.fulfill({json:data,headers:{'cache-control':'no-store'}});}
    return route.fulfill({status:503,body:'Unavailable'});
  });
  const panel=await openReachPanel(page,first,'2d'),host=page.locator('.map-host');
  await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();await expect(host).toHaveAttribute('data-reachability','shown');
  await panel.getByRole('combobox',{name:'到達圏の移動手段'}).selectOption('cycling');await expect(host).toHaveAttribute('data-reachability','none');
  await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();await expect(panel.locator('.reachability-status')).toContainText('道路が見つかりません');await expect(host).toHaveAttribute('data-reachability','none');
  await panel.getByRole('combobox',{name:'到達圏の移動手段'}).selectOption('driving');await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();
  await expect(panel.locator('.reachability-status')).toContainText('読み込めません');await expect(host).toHaveAttribute('data-reachability','none');
  await expect(page.locator('.leaflet-overlay-pane path[fill="#007a78"]')).toHaveCount(0);
});

test('changing the selected place discards a delayed synthetic result',async({page})=>{
  let signalStarted!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{signalStarted=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/data/reachability/*.json',async route=>{
    signalStarted();await gate;
    try{await route.fulfill({json:makeSyntheticFixture(first),headers:{'cache-control':'no-store'}});}catch{/* The request may have been aborted after changing place. */}
  });
  const panel=await openReachPanel(page,first,'2d');await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();await started;
  await page.evaluate(id=>{location.hash=`county=${id}`;},second.id);
  await expect(page.getByRole('heading',{name:second.name,exact:true})).toBeVisible();release();
  await expect(page.locator('.map-host')).toHaveAttribute('data-reachability','none');
  await page.waitForTimeout(500);await expect(page.locator('.map-host')).toHaveAttribute('data-reachability','none');
  await expect(page.locator('.leaflet-overlay-pane path[fill="#007a78"]')).toHaveCount(0);
});

test('reachability controls are usable in 320x240 landscape',async({page})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width:320,height:240});
  await page.route('**/data/reachability/*.json',route=>route.fulfill({json:makeSyntheticFixture(first)}));
  const panel=await openReachPanel(page,first,'2d');
  await panel.getByRole('combobox',{name:'到達圏の移動手段'}).selectOption('cycling');
  await panel.getByRole('combobox',{name:'到達圏の所要時間'}).selectOption('20');
  const button=panel.getByRole('button',{name:'到達圏を表示',exact:true});await button.scrollIntoViewIfNeeded();await button.click();
  await expect(page.locator('.map-host')).toHaveAttribute('data-reachability','shown');await expect(panel.locator('.reachability-legend')).toContainText('自転車 20分');
  const credit=page.locator('.reachability-attribution');await expect(credit).toBeVisible();await expect(credit).toHaveAttribute('href','https://www.openstreetmap.org/copyright');
  expect(await credit.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el||!!hit&&el.contains(hit);})).toBe(true);
});

test('a Kamijima place can display and remove a synthetic contour',async({page})=>{
  const record=islandData.find(p=>p.id==='sekizen')!;const island:Spot={id:record.id,name:record.name,lat:record.coordinates.lat,lng:record.coordinates.lng};
  await page.route('**/data/reachability/*.json',route=>route.fulfill({json:makeSyntheticFixture(island)}));
  const panel=await openReachPanel(page,island,'2d','poi');await panel.getByRole('button',{name:'到達圏を表示',exact:true}).click();
  await expect(page.locator('.map-host')).toHaveAttribute('data-reachability','shown');await expect(page.locator('.leaflet-overlay-pane path[fill="#007a78"]')).toHaveCount(1);
  await panel.getByRole('button',{name:'到達圏を消す',exact:true}).click();await expect(page.locator('.map-host')).toHaveAttribute('data-reachability','none');
});
