import {test,expect,type Page} from '@playwright/test';
import {openKamijima,openMapSettings,resetEhime} from './ehime-helpers';
async function layout(page:Page){return page.evaluate(()=>{
  const names=Array.from(document.querySelectorAll<HTMLElement>('.marker-name')).filter(el=>getComputedStyle(el).visibility==='visible');
  const rects=names.map(el=>el.getBoundingClientRect());let overlaps=0;
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j];if(a.left<b.right+6&&a.right>b.left-6&&a.top<b.bottom+6&&a.bottom>b.top-6)overlaps++;
  }
  return {count:names.length,oldCount:names.filter(el=>!el.closest('.county-marker')).length,overlaps};
});}
for(const renderer of ['3d','2d'])test(`place names have space after expanding Kamijima, zoom and reset (${renderer})`,async({page})=>{
  await page.goto(renderer==='2d'?'/?renderer=2d':'/');await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await openKamijima(page);await expect.poll(async()=>{const r=await layout(page);return r.oldCount===18&&r.overlaps===0;},{timeout:30000}).toBe(true);
  await openMapSettings(page);
  await page.getByRole('button',{name:'拡大',exact:true}).click();
  // Both renderers animate camera changes. Check the settled screen geometry, not only DOM presence.
  await page.waitForTimeout(800);await expect.poll(async()=>{const r=await layout(page);return r.count>0&&r.overlaps===0;}).toBe(true);
  await resetEhime(page);
});
