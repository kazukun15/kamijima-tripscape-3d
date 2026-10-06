import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['scripts/serve-dist.mjs'],{env:{...process.env,PORT:'4174',BASE_PATH:'/tripscape/'},stdio:['ignore','pipe','inherit']});
let browser;
try{
 await new Promise((ok,bad)=>{server.stdout.once('data',ok);server.once('error',bad);});
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:4174/tripscape/#poi=sekizen&deep=1');await page.locator('[data-map-ready="true"]').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('.map-host')?.getAttribute('data-terrain-active')==='true');
 assert.equal(await page.locator('.detail-heading h2').innerText(),'積善山');
 const response=await page.request.get('http://127.0.0.1:4174/tripscape/data/pois.geojson');assert.equal(response.status(),200);assert.equal((await response.json()).features.length,18);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const notFound=await page.goto('http://127.0.0.1:4174/tripscape/missing/nested');assert.equal(notFound.status(),404);assert.equal(await page.locator('#home').getAttribute('href'),'/tripscape/');
 await page.locator('#home').click();await page.locator('[data-map-ready="true"]').waitFor({state:'visible'});
 await writeFile('outputs/qa/subpath.json',JSON.stringify({checked_at:new Date().toISOString(),result:'PASS',mount:'/tripscape/',geojson_count:18,asset_errors:0,runtime_errors:0,not_found_status:404,recovery:true},null,2));
 console.log('PASS: subdirectory assets, selected place, local terrain, GeoJSON, nested 404 and recovery.');
}finally{await browser?.close();server.kill();}
