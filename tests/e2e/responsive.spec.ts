import {test,expect} from '@playwright/test';
import {openKamijima,openExplore,openMapSettings} from './ehime-helpers';
for(const [width,height] of [[320,568],[393,851],[851,393],[1280,720]])test(`usable lists, buffered names and selected map at ${width}x${height}`,async({page})=>{
  test.skip(test.info().project.name!=='desktop');test.setTimeout(90000);await page.setViewportSize({width,height});
  await page.goto('/');await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect(page.locator('.map-host')).toHaveAttribute('data-terrain-active','true');
  await openKamijima(page);
  await expect.poll(()=>page.locator('.poi-marker:not(.county-marker)[data-label-placed="true"]').count(),{timeout:30000}).toBe(18);
  // The initial fit-to-islands flight takes 500 ms; measure after that flight.
  await page.waitForTimeout(700);
  const collisions=await page.locator('.marker-name').evaluateAll(els=>{
    const rects=els.filter(el=>getComputedStyle(el).visibility==='visible').map(el=>el.getBoundingClientRect());let count=0;
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.left<b.right+6&&a.right>b.left-6&&a.top<b.bottom+6&&a.bottom>b.top-6)count++;}return count;
  });expect(collisions).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await page.screenshot({path:`work/ehime-qa/ui-${width}x${height}.png`});
  await openExplore(page);
  const list=await page.locator('.results').boundingBox();expect(list!.height).toBeGreaterThan(70);expect(list!.y).toBeLessThan(height-60);
  await page.locator('.results .result-item').last().click();await expect(page.locator('.detail-panel')).toBeVisible();
  await page.goto('/#poi=sekizen&deep=1');await page.reload();await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect(page.locator('.map-host')).toHaveAttribute('data-terrain-active','true');await expect.poll(async()=>Number(await page.locator('.map-host').getAttribute('data-map-pitch'))).toBeCloseTo(55,4);
  await expect.poll(()=>page.locator('.poi-marker.selected').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===el||el.contains(hit));})).toBe(true);
  await openMapSettings(page);
  const covered=await page.locator('.map-actions button').evaluateAll(els=>els.filter(el=>!el.hasAttribute('disabled')).some(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !hit||!(hit===el||el.contains(hit));}));expect(covered).toBe(false);
  await page.screenshot({path:`work/ehime-qa/ui-${width}x${height}-deep.png`});
});
