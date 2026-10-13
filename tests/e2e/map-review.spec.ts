import {test,expect,type Page} from '@playwright/test';

async function selectedIsUncovered(page:Page){
  return page.locator('.poi-marker.selected').evaluate(el=>{
    const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&!!hit&&(hit===el||el.contains(hit));
  });
}

test('2D fallback uses the shared zoom buttons and keeps its destination above the sheet',async({page})=>{
  await page.goto('/?renderer=2d#poi=sekizen');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect(page.locator('.poi-marker.selected')).toHaveCount(1);
  await expect.poll(()=>selectedIsUncovered(page)).toBe(true);
  const host=page.locator('.map-host');
  const before=Number(await host.getAttribute('data-map-zoom'));
  await page.getByRole('button',{name:'拡大',exact:true}).click();
  await expect.poll(async()=>Number(await host.getAttribute('data-map-zoom'))).toBe(before+1);
  await page.getByRole('button',{name:'縮小',exact:true}).click();
  await expect.poll(async()=>Number(await host.getAttribute('data-map-zoom'))).toBe(before);
  await page.getByRole('button',{name:/深掘り/}).click();
  await expect.poll(()=>selectedIsUncovered(page)).toBe(true);
  await page.getByRole('button',{name:'地点詳細を閉じる',exact:true}).click();
  await page.getByRole('button',{name:'上島町の地図を全域表示',exact:true}).click();
  await expect.poll(()=>page.locator('[data-label-placed="true"]').count()).toBe(18);
});

for(const renderer of ['3d','2d'])test(`a place can be opened directly from its buffered name (${renderer})`,async({page})=>{
  await page.goto(renderer==='2d'?'/?renderer=2d':'/');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect.poll(()=>page.locator('[data-label-placed="true"]').count()).toBe(18);
  await page.locator('[data-poi-id="sanshuen"] .marker-name').click();
  await expect(page.locator('.detail-heading h2')).toHaveText('三秀園');
  await expect.poll(()=>selectedIsUncovered(page)).toBe(true);
});

test('a 2D view cannot be tilted by the 3D pitch control',async({page})=>{
  await page.goto('/#terrain=0');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
  await expect(page.getByRole('slider',{name:'地図の傾斜'})).toBeDisabled();
  await expect(page.locator('.map-host')).toHaveAttribute('data-map-pitch','0');
});
