import {test,expect,type Page} from '@playwright/test';

async function ready(page:Page,url='/'){await page.goto(url);await expect(page.locator('[data-map-ready="true"]')).toBeVisible();}
async function browse(page:Page){if(test.info().project.name==='mobile')await page.getByRole('button',{name:'検索とフィルターを開く',exact:true}).click();}

test('Back and Forward restore island, place and Deep Dive without losing filter context',async({page})=>{
  await ready(page);await browse(page);await page.locator('.island-grid').getByRole('button',{name:/^岩城島/}).click();
  await browse(page);await page.locator('.results').getByRole('button').filter({hasText:'岩城郷土館'}).click();
  await expect(page.locator('.detail-heading h2')).toHaveText('岩城郷土館');await expect(page.locator('.map-breadcrumb>b')).toHaveText('岩城島');
  await page.locator('.detail-tabs').getByRole('button',{name:/深掘り/}).click();await expect(page.locator('.deep-heading')).toBeVisible();
  await page.goBack();await expect(page.locator('.detail-heading h2')).toHaveText('岩城郷土館');await expect(page.locator('.deep-heading')).toHaveCount(0);
  await page.goBack();await expect(page.locator('.detail-panel')).toHaveCount(0);await expect(page.locator('.map-breadcrumb>b')).toHaveText('岩城島');
  await page.goForward();await expect(page.locator('.detail-heading h2')).toHaveText('岩城郷土館');await expect(page.locator('.map-breadcrumb>b')).toHaveText('岩城島');
});

test('skip search preserves the shared map and focuses the usable search field',async({page})=>{
  await ready(page,'/#poi=sekizen&deep=1&season=春');const before=page.url();const link=page.getByRole('link',{name:'検索へ移動',exact:true});await link.focus();await link.click();
  await expect(page.getByRole('textbox',{name:'観光スポットを検索',exact:true})).toBeFocused();expect(page.url()).toBe(before);
  await expect(page.locator('.detail-heading h2')).toHaveText('積善山');
});

test('search changes close obsolete detail and expose individual filter recovery',async({page})=>{
  await ready(page,'/#poi=sekizen');await browse(page);await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('条件に合わないxyz');
  await expect(page.locator('.detail-panel')).toHaveCount(0);await expect(page.locator('.poi-marker')).toHaveCount(0);await expect(page.locator('.filter-chips')).toContainText('条件に合わないxyz');
  await page.getByRole('button',{name:'検索語の絞り込みを解除',exact:true}).click();await expect(page.locator('.results .result-item')).toHaveCount(18);
});

test('bookmarks are a visible saved list and selecting an island returns to all its places',async({page})=>{
  await ready(page,'/#poi=iwagi-museum');await page.getByRole('button',{name:'岩城郷土館をしおりに保存',exact:true}).click();
  await page.getByRole('button',{name:'旅のしおり 1件',exact:true}).click();await expect(page.locator('.results .result-item')).toHaveCount(1);await expect(page.locator('.explorer')).toBeVisible();
  await page.locator('.island-grid').getByRole('button',{name:/^弓削島/}).click();await browse(page);await expect(page.locator('.results .result-item')).toHaveCount(8);await expect(page.getByRole('button',{name:'旅のしおり 1件',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('an empty bookmark list explains how to save and recovers to the map',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'旅のしおり 0件',exact:true}).click();await expect(page.getByRole('heading',{name:'旅のしおりは、まだ空です',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'観光スポットを探す',exact:true}).click();await expect(page.locator('.poi-marker')).toHaveCount(18);
});

test('duplicated or damaged saved data cannot inflate the bookmark count',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('tripscape-saved','["iwagi-museum","iwagi-museum","not-a-place",42]'));await ready(page);
  await expect(page.getByRole('button',{name:'旅のしおり 1件',exact:true})).toBeVisible();
});

test('sharing immediately after typing includes the latest query',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await ready(page);await browse(page);await page.getByRole('textbox',{name:'観光スポットを検索',exact:true}).fill('桜');
  await page.getByRole('button',{name:'地図のURLをコピー',exact:true}).click();await expect(page.getByText('この地図のURLをコピーしました。')).toBeVisible();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(new URLSearchParams(new URL(copied).hash.slice(1)).get('q')).toBe('桜');
});
