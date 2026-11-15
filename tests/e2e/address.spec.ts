import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const county=JSON.parse(readFileSync('data/ehime-pois.json','utf8')) as Array<{id:string;name:string;lat:number;lng:number;address?:string}>;
const kamijima=JSON.parse(readFileSync('data/poi/verified.json','utf8')) as Array<{id:string;name:string;coordinates:{lat:number;lng:number}}>;
const withAddress=county.find(p=>p.id==='382019-001')!;
const noAddress=county.find(p=>p.id==='iyokannet-663')!;
const island=kamijima.find(p=>p.id==='sekizen')!;
for(const spot of [
  {id:withAddress.id,name:withAddress.name,lat:withAddress.lat,lng:withAddress.lng,address:withAddress.address,kind:'county'},
  {id:noAddress.id,name:noAddress.name,lat:noAddress.lat,lng:noAddress.lng,address:noAddress.address,kind:'county'},
  {id:island.id,name:island.name,lat:island.coordinates.lat,lng:island.coordinates.lng,address:undefined,kind:'poi'},
])test(`Google Maps opens the recorded location for ${spot.name}`,async({page,context})=>{
  await context.route('https://www.google.com/maps/search/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Map location</title>'}));
  await page.goto(`/?renderer=2d#${spot.kind}=${spot.id}`);
  const detail=page.getByRole('region',{name:'観光スポットの詳細'});await expect(detail.getByRole('heading',{name:spot.name,exact:true})).toBeVisible();
  const link=detail.locator('.location-map-link');await expect(link).toBeVisible();
  if(spot.address){await expect(link).toContainText(spot.address);await expect(link).toContainText('Google マップで開く');}
  else await expect(link).toContainText('Google マップで場所を開く');
  await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
  const destination=new URL((await link.getAttribute('href'))!);expect(destination.origin).toBe('https://www.google.com');expect(destination.pathname).toBe('/maps/search/');expect(destination.searchParams.get('api')).toBe('1');expect(destination.searchParams.get('query')).toBe(`${spot.lat},${spot.lng}`);
  await expect.poll(()=>link.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
  const [popup]=await Promise.all([context.waitForEvent('page'),link.click()]);await popup.waitForLoadState('domcontentloaded');
  expect(new URL(popup.url()).searchParams.get('query')).toBe(`${spot.lat},${spot.lng}`);await popup.close();
});

test('the address link is reachable on a small landscape screen',async({page,context})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width:320,height:240});
  await context.route('https://www.google.com/maps/search/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Map location</title>'}));
  await page.goto('/?renderer=2d#county=382019-001');const link=page.locator('.detail-panel .location-map-link');await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();const [popup]=await Promise.all([context.waitForEvent('page'),link.click()]);await popup.waitForLoadState('domcontentloaded');
  expect(new URL(popup.url()).searchParams.get('query')).toBe(`${withAddress.lat},${withAddress.lng}`);await popup.close();
});
