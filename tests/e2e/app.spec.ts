import {test,expect,type Page} from '@playwright/test';
async function ready(page:Page,url='/'){await page.goto(url);await expect(page.locator('[data-map-ready="true"]')).toBeVisible();}
async function browse(page:Page){if(test.info().project.name==='mobile')await page.getByRole('button',{name:'検索とフィルターを開く'}).click();}
async function select(page:Page,name:string){await browse(page);await page.locator('.results').getByRole('button').filter({hasText:name}).first().click();await expect(page.getByRole('region',{name:'観光スポットの詳細'}).getByRole('heading',{name,exact:true})).toBeVisible();}
test('real 3D terrain, eight islands, camera, and explicit 2D',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);const host=page.locator('.map-host');
  await expect(page.locator('[data-renderer="maplibre"]')).toBeVisible();
  await expect(host).toHaveAttribute('data-terrain-active','true');
  await expect.poll(async()=>Number(await host.getAttribute('data-terrain-elevation'))).toBeGreaterThan(20);
  await expect(page.getByRole('button',{name:/^地図から.*を選択$/})).toHaveCount(8);
  for(const marker of await page.getByRole('button',{name:/^地図から.*を選択$/}).all())await expect(marker).toBeInViewport();
  await expect(page.locator('.poi-marker')).toHaveCount(18);
  await page.screenshot({path:`outputs/qa/${test.info().project.name}-overview.png`});
  await page.getByRole('slider',{name:'地図の傾斜'}).fill('75');
  await expect(host).toHaveAttribute('data-map-pitch','75');
  await page.getByRole('button',{name:'北を上に戻す'}).click();await expect(host).toHaveAttribute('data-map-bearing','0');
  await page.getByRole('button',{name:'3D 地形',exact:true}).click();await expect(host).toHaveAttribute('data-terrain-active','false');await expect(host).toHaveAttribute('data-map-pitch','0');
  await page.getByRole('button',{name:'2D 地図',exact:true}).click();await expect(host).toHaveAttribute('data-terrain-active','true');
  expect(errors).toEqual([]);
});
test('island, category, Japanese search and empty result recovery',async({page})=>{
  await ready(page);await browse(page);await page.locator('.island-grid').getByRole('button',{name:/^魚島/}).click();
  await expect(page.locator('.results .result-item')).toHaveCount(1);await expect(page.locator('.results')).toContainText('亀居八幡神社');
  await browse(page);await page.locator('.island-grid').getByRole('button',{name:'すべての島',exact:true}).click();await browse(page);
  await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('レモン');await expect(page.locator('.results')).toContainText('岩城観光センター');
  await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('この場所は存在しませんxyz');await expect(page.getByText('条件に合う場所はありません')).toBeVisible();await expect(page.locator('.poi-marker')).toHaveCount(0);
  await page.getByRole('button',{name:'条件をリセット',exact:true}).click();await expect(page.locator('.results .result-item')).toHaveCount(18);
  await browse(page);await page.locator('.category-grid').getByRole('button',{name:'アート',exact:true}).click();await expect(page.locator('.results .result-item')).toHaveCount(1);await expect(page.locator('.results')).toContainText('14枚のガラス');
  await page.getByRole('combobox',{name:'すべての観光カテゴリ'}).selectOption('キャンプ');await expect(page.locator('.results .result-item')).toHaveCount(1);await expect(page.locator('.results')).toContainText('津波島');
});
test('all eight islands can be selected directly on the map',async({page})=>{
  test.setTimeout(120000);await ready(page);
  const counts:Record<string,number>={'弓削島':8,'佐島':1,'生名島':2,'岩城島':3,'魚島':1,'高井神島':1,'豊島':1,'津波島':1};
  for(const [name,count] of Object.entries(counts)){
    await page.getByRole('button',{name:'上島町の地図を全域表示',exact:true}).click();
    await page.getByRole('button',{name:`地図から${name}を選択`,exact:true}).click();
    await expect(page.locator('.map-breadcrumb>b')).toHaveText(name);await expect(page.locator('.results .result-item')).toHaveCount(count);
  }
});
test('manga search finds the sourced island, keeps unverified murals off the map',async({page})=>{
  await ready(page);await browse(page);await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('漫画');
  const results=page.getByRole('region',{name:'検索に関連する島'});await expect(results).toContainText('高井神島');await expect(results).toContainText('壁画の個別地点は未確認');await expect(results.getByRole('link')).toHaveAttribute('href','https://kamijima.info/takaikamijima/');await expect(page.locator('.poi-marker')).toHaveCount(0);
  await results.getByRole('button').click();await expect(page.locator('.map-breadcrumb>b')).toHaveText('高井神島');await expect(page.locator('.poi-marker')).toHaveCount(1);
});
test('details, Deep Dive, sourced themes, access and bookmarks persist',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await select(page,'岩城郷土館');
  const panel=page.getByRole('region',{name:'観光スポットの詳細'});
  await panel.getByRole('button',{name:'岩城郷土館をしおりに保存',exact:true}).click();
  await panel.getByRole('button',{name:/深掘り/}).click();await expect(panel.getByText('若山牧水、吉井勇の資料を展示',{exact:false})).toBeVisible();
  await expect(panel.locator('.deep-section a').first()).toHaveAttribute('href',/^https:\/\/kamijima.info\//);
  await expect(panel.locator('.sources')).toContainText('2026-10-05');await expect(panel.locator('.sources')).toContainText('位置の出典');
  await expect(panel.getByRole('link',{name:'公式の航路・アクセス'})).toHaveAttribute('href','https://kamijima.info/accessmap/');
  await page.screenshot({path:`outputs/qa/${test.info().project.name}-deep.png`});
  await page.reload();await expect(panel.getByRole('button',{name:'岩城郷土館をしおりから削除',exact:true})).toBeVisible();await expect(panel.locator('.deep-section')).toHaveCount(3);
  await panel.locator('.graph-branches').getByRole('button',{name:'文学',exact:true}).click();await browse(page);await expect(page.locator('.topic-banner')).toContainText('文学');await expect(page.locator('.results')).toContainText('岩城郷土館');
  expect(errors).toEqual([]);
});
test('shared URL restores selected place and copies current URL',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await ready(page,'/#poi=sekizen&deep=1&terrain=0');
  await expect(page.locator('.detail-heading h2')).toHaveText('積善山');await expect(page.locator('.deep-heading')).toBeVisible();await expect(page.locator('.map-host')).toHaveAttribute('data-terrain-active','false');
  await page.getByRole('button',{name:'地図のURLをコピー',exact:true}).click();await expect(page.getByText('この地図のURLをコピーしました。')).toBeVisible();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(page.url());
});
test('shared travel context and theme restore without inventing ferry routes',async({page})=>{
  await ready(page,'/#topic=塩&season=春&mode=cycling');await browse(page);await expect(page.locator('.topic-banner')).toContainText('塩');await expect(page.getByRole('combobox',{name:'旅の季節'})).toHaveValue('春');await expect(page.getByRole('button',{name:'自転車',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.results')).toContainText('ログハウス弓削');
  await page.goto('/#poi=tsuba&mode=ferry');await expect(page.locator('.detail-heading h2')).toHaveText('津波島');await expect(page.locator('.access-card')).toContainText('予約した渡船');await expect(page.locator('.access-links a')).toHaveCount(1);await expect(page.locator('.access-links a')).toHaveAttribute('href','https://kamijima.info/accessmap/');
  await page.goto('/#poi=tsuba&mode=walking');await expect(page.locator('.access-links a')).toHaveCount(1);await expect(page.locator('.coordinate-note')).toContainText('受付位置ではありません');
});
test('WebGL unavailable automatically loads usable raster map',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return original.apply(this,[type,...args] as never);} as typeof original;});
  await ready(page);await expect(page.locator('[data-renderer="leaflet"]')).toBeVisible();await expect(page.locator('.poi-marker')).toHaveCount(18);await expect(page.getByRole('button',{name:'2D 地図',exact:true})).toBeDisabled();await select(page,'三秀園');await expect(page.locator('.detail-heading')).toContainText('三秀園');
  await page.screenshot({path:`outputs/qa/${test.info().project.name}-fallback.png`});
});
test('DEM failure retains the map and switches to 2D',async({page})=>{
  await page.route('**/terrain/**',route=>route.abort());await ready(page);await expect(page.locator('.map-host')).toHaveAttribute('data-terrain-active','false');await expect(page.getByRole('button',{name:'2D 地図',exact:true})).toBeDisabled();await expect(page.locator('.map-status')).toContainText('標高を読み込めないため2D表示');await expect(page.locator('.poi-marker')).toHaveCount(18);
});
test('permission denied and successful current position have useful outcomes',async({page,context})=>{
  await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=(_ok,error)=>error?.({code:1,message:'denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});});await ready(page);await page.getByRole('button',{name:'現在地を表示',exact:true}).click();await expect(page.getByText('現在地を取得できませんでした。位置情報の許可や端末の設定を確認してください。')).toBeVisible();
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:34.258,longitude:133.147});
  // Override denial only on this page to exercise the success path deterministically.
  await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=ok=>ok({coords:{latitude:34.258,longitude:133.147,accuracy:10,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()} as GeolocationPosition);});
  await page.getByRole('button',{name:'現在地を表示',exact:true}).click();await expect(page.getByText('現在地を表示しました。位置は保存しません。')).toBeVisible();
  await select(page,'積善山');const u=await page.getByRole('link',{name:'徒歩ルートを外部地図で確認'}).getAttribute('href');expect(new URL(u!).searchParams.get('origin')).toBe('34.258,133.147');expect(await page.evaluate(()=>localStorage.getItem('tripscape-origin'))).toBeNull();
});
test('source/download information and real static 404 recovery',async({page,request})=>{
  await ready(page);await page.getByRole('button',{name:'この地図について',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('133');
  const data=await request.get('/data/pois.geojson');expect(data.ok()).toBe(true);expect((await data.json()).features).toHaveLength(18);
  await page.getByRole('button',{name:'地図の説明を閉じる'}).click();const response=await page.goto('/missing/deeper-page');expect(response?.status()).toBe(404);await expect(page.getByRole('heading')).toContainText('見つかりません');await page.getByRole('link',{name:'観光地図に戻る'}).click();await expect(page.locator('[data-map-ready="true"]')).toBeVisible();
});
test('mobile bottom sheet retains a visible map and changes height',async({page})=>{
  test.skip(test.info().project.name!=='mobile');await ready(page);await select(page,'積善山');const panel=page.locator('.detail-panel');
  const full=(await panel.boundingBox())!;expect(full.y).toBeGreaterThan(200);expect(full.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button',{name:'詳細パネルの高さを切り替え'}).click();const compact=(await panel.boundingBox())!;expect(compact.height).toBeLessThan(full.height);
  await page.getByRole('button',{name:'詳細パネルの高さを切り替え'}).click();await panel.getByRole('button',{name:/深掘り/}).click();const deep=(await panel.boundingBox())!;expect(deep.height).toBeGreaterThan(full.height);expect(deep.y).toBeGreaterThan(120);
  await expect.poll(async()=>{const box=await page.locator('.poi-marker.selected').boundingBox();return !!box&&box.y+box.height<deep.y;}).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
