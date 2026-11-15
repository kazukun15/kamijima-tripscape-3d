import {expect,type Page} from '@playwright/test';

export async function openMapSettings(page:Page){
  const dock=page.locator('.landscape-dock');
  if(await dock.isVisible())await dock.getByRole('button',{name:'地図設定',exact:true}).click();
  else if(await page.locator('.mobile-map-settings').isVisible())await page.getByRole('button',{name:'地図の表示設定を開く',exact:true}).click();
}
export async function openExplore(page:Page){
  if(await page.locator('.landscape-dock').isVisible())await page.locator('.landscape-dock').getByRole('button',{name:'探す',exact:true}).click();
  else if(await page.getByRole('button',{name:'検索とフィルターを開く',exact:true}).isVisible())await page.getByRole('button',{name:'検索とフィルターを開く',exact:true}).click();
}
export async function openKamijima(page:Page){
  const cluster=page.getByRole('button',{name:'上島町の観光地点 18件を拡大',exact:true});await expect(cluster).toBeVisible();await cluster.click();
  await expect.poll(()=>page.locator('.poi-marker:not(.county-marker)').count(),{timeout:30000}).toBe(18);
}
export async function resetEhime(page:Page){
  await page.getByRole('button',{name:'愛媛県の地図を全域表示',exact:true}).click();
  await expect(page.getByRole('button',{name:'上島町の観光地点 18件を拡大',exact:true})).toBeVisible();
}
