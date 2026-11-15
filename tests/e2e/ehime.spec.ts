import {test,expect,type Page} from '@playwright/test';

async function ready(page:Page,path='/'){
  await page.goto(path);await expect(page.locator('[data-map-ready="true"]')).toBeVisible({timeout:45000});
}
async function explore(page:Page){
  const landscape=await page.evaluate(()=>matchMedia('(orientation:landscape)').matches);
  await (landscape?page.locator('.landscape-explore'):page.getByRole('button',{name:'検索とフィルターを開く',exact:true})).click();
}
test('county map covers the prefecture and keeps landscape navigation on screen',async({page})=>{
  await page.setViewportSize({width:851,height:393});await ready(page);
  const host=page.locator('.map-host');const box=await host.boundingBox();expect(box).toMatchObject({x:0,y:0,width:851,height:393});
  await expect(page.locator('.landscape-dock')).toBeVisible();await expect(page.locator('.topbar')).toBeHidden();
  await expect.poll(async()=>{
    const value=await host.getAttribute('data-map-bounds');if(!value)return false;
    const [west,south,east,north]=value.split(',').map(Number);
    return west<=132.05&&south<=32.75&&east>=133.75&&north>=34.30;
  },{timeout:45000}).toBe(true);
  await page.getByRole('button',{name:'地図設定',exact:true}).click();await expect(page.getByRole('button',{name:'拡大',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'地図設定',exact:true}).click();await expect(page.getByRole('button',{name:'拡大',exact:true})).toBeHidden();
});
test('the landscape dock remains entirely on screen on a compact device',async({page})=>{
  await page.setViewportSize({width:320,height:240});await ready(page);
  const dock=page.locator('.landscape-dock');await expect(dock).toBeVisible();
  const result=await dock.evaluate(el=>{
    const box=el.getBoundingClientRect();const buttons=Array.from(el.querySelectorAll('button')).map(button=>button.getBoundingClientRect());
    return {count:buttons.length,visible:buttons.every(r=>r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom),scroll:el.scrollWidth>el.clientWidth};
  });
  expect(result).toEqual({count:6,visible:true,scroll:false});
});
test('a prefecture location opens from search, keeps source and can be shared',async({page})=>{
  await ready(page);await explore(page);
  await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('宇和島城');
  await page.locator('.results .county-result').filter({hasText:'宇和島城'}).click();
  const detail=page.getByRole('region',{name:'観光スポットの詳細'});await expect(detail.getByRole('heading',{name:'宇和島城',exact:true})).toBeVisible();
  await expect(detail).toContainText('宇和島市');await expect(detail.getByRole('link',{name:'掲載元のページ'})).toHaveAttribute('href','https://www.iyokannet.jp/spot/663');
  await expect.poll(()=>new URL(page.url()).hash).toContain('county=iyokannet-663');await page.reload();
  await expect(page.getByRole('heading',{name:'宇和島城',exact:true})).toBeVisible();
});
test('a municipality name finds its sourced destination',async({page})=>{
  await ready(page);await explore(page);await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('愛南町');
  const result=page.locator('.results .county-result');await expect(result).toHaveCount(1);await expect(result).toContainText('高茂岬');
  await result.click();await expect(page.getByRole('heading',{name:'高茂岬',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'掲載元のページ'})).toHaveAttribute('href','https://www.iyokannet.jp/spot/725');
});
test('2D fallback retains access to existing Kamijima place and its source',async({page})=>{
  await ready(page,'/?renderer=2d#poi=sekizen');
  await expect(page.locator('[data-renderer="leaflet"]')).toBeVisible();
  await expect(page.getByRole('heading',{name:'積善山',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'観光スポットの詳細'})).toContainText('岩城島');
});
test('coincident places open an accessible list in the 2D map',async({page})=>{
  test.skip(test.info().project.name!=='desktop');await page.setViewportSize({width:851,height:393});
  await ready(page,'/?renderer=2d#county=382019-016');
  await expect(page.getByRole('heading',{name:'椿の湯',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'地点詳細を閉じる',exact:true}).click();
  for(let i=0;i<4;i++){
    if(await page.getByRole('dialog',{name:'重なっている観光地点'}).isVisible())break;
    const clusters=page.locator('.county-cluster:not([aria-label^="上島町"])');
    await expect.poll(()=>clusters.count()).toBeGreaterThan(0);
    const candidates=await clusters.all();let best=candidates[0],bestDistance=Infinity;
    for(const candidate of candidates){const r=await candidate.boundingBox();if(!r)continue;const d=Math.hypot(r.x+r.width/2-425.5,r.y+r.height/2-174);if(d<bestDistance){best=candidate;bestDistance=d;}}
    await best.click();await page.waitForTimeout(900);
  }
  const dialog=page.getByRole('dialog',{name:'重なっている観光地点'});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('椿の湯');await expect(dialog).toContainText('飛鳥乃湯泉');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.locator('.county-cluster:focus')).toHaveCount(1);
});
