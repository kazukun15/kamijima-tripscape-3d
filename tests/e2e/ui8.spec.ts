import {test,expect} from '@playwright/test';
for(const [width,height] of [[320,240],[851,393]])test(`compact landscape search and detail remain usable at ${width}x${height}`,async({page})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width,height});
  await page.goto('/?renderer=2d');await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await page.getByRole('button',{name:'探す',exact:true}).click();
  const panel=page.locator('.explorer');const filters=page.locator('#filter-controls');
  const toggle=page.getByRole('button',{name:'絞り込み',exact:true});await expect(toggle).toBeVisible();await expect(filters).toBeHidden();
  await toggle.click();await expect(filters).toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
  await toggle.click();await expect(filters).toBeHidden();
  const input=page.getByRole('textbox',{name:'観光スポットを検索',exact:true});await input.fill('ひょこたん池公園');
  const result=page.locator('.county-result').filter({hasText:'ひょこたん池公園'});await expect(result).toHaveCount(1);
  await result.click();const detail=page.getByRole('region',{name:'観光スポットの詳細'});
  const title=detail.getByRole('heading',{name:'ひょこたん池公園',exact:true});await expect(title).toBeVisible();
  const layout=await page.evaluate(()=>{const title=document.querySelector('.detail-panel h2')!.getBoundingClientRect();const panel=document.querySelector('.detail-panel')!.getBoundingClientRect();const credit=document.querySelector('.dock-attribution')!.getBoundingClientRect();return {titleInPanel:title.top>=panel.top&&title.bottom<=panel.bottom,creditOverlaps:credit.left<panel.right&&credit.right>panel.left&&credit.top<panel.bottom&&credit.bottom>panel.top};});
  expect(layout.titleInPanel).toBe(true);expect(layout.creditOverlaps).toBe(false);
});

for(const [width,height] of [[320,568],[393,851]])test(`portrait filters are discoverable and scrollable at ${width}x${height}`,async({page})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width,height});
  await page.goto('/?renderer=2d');await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect(page.locator('.journey-strip')).toBeHidden();
  await page.getByRole('button',{name:'検索とフィルターを開く',exact:true}).click();
  const toggle=page.getByRole('button',{name:'絞り込み',exact:true});const filters=page.locator('#filter-controls');
  await expect(toggle).toBeVisible();await expect(filters).toBeHidden();await toggle.click();
  await expect(filters).toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect.poll(()=>filters.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await filters.getByRole('button',{name:/^岩城島/}).click();
  await expect.poll(()=>new URLSearchParams(new URL(page.url()).hash.slice(1)).get('island')).toBe('岩城島');
});
