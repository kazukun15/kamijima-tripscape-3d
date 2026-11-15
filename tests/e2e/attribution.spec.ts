import {test,expect} from '@playwright/test';
for(const [width,height] of [[320,240],[640,360],[851,393]])test(`landscape map attribution remains visible and clickable at ${width}x${height}`,async({page})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width,height});
  await page.goto('/');await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  const credit=page.getByRole('link',{name:'地理院タイル / U.S. NIMA VMAP0'});await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute('href','https://maps.gsi.go.jp/development/ichiran.html');
  const isClickable=()=>credit.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(el===hit||el.contains(hit));});
  expect(await isClickable()).toBe(true);
  await page.goto('/#county=iyokannet-663');await expect(page.getByRole('heading',{name:'宇和島城',exact:true})).toBeVisible();
  await expect.poll(isClickable).toBe(true);
});
