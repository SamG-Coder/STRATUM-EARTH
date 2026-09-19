import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {fixture} from '../tests/earth/fixture.js';

const root=fileURLToPath(new URL('../',import.meta.url)),reportDir=path.join(root,'reports');await fs.mkdir(reportDir,{recursive:true});
// Serve the repository beneath a project prefix, matching GitHub Pages path semantics.
const prefix='/STRATUM-EARTH',mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wgsl':'text/plain','.cu':'text/plain'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!p.startsWith(prefix+'/')){res.writeHead(404).end();return;}p=p.slice(prefix.length);const file=path.resolve(root,'.'+(p.endsWith('/')?p+'index.html':p));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}${prefix}/`;
const software=process.env.CW_SOFTWARE_GPU!=='0';
const args=software?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader']:[];
const options={headless:true,args};if(process.env.CHROMIUM_EXECUTABLE)options.executablePath=process.env.CHROMIUM_EXECUTABLE;
let browser;const errors=[],tests=[],network=[];
try{
 browser=await chromium.launch(options);const context=await browser.newContext({viewport:{width:1440,height:960}});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('BROWSER:',m.text());});
 // No CI test sends requests to community servers. Only explicit synthetic fixtures.
 let responseStatus=200,delay=0;
 await context.route('https://overpass-api.de/api/interpreter',async route=>{network.push(route.request().postData());if(delay)await new Promise(r=>setTimeout(r,delay));try{await route.fulfill({status:responseStatus,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Retry-After':'1'},body:responseStatus===200?JSON.stringify(fixture()):'Rate limited (synthetic test)'});}catch{/* cancelled request */}});
 await context.route(/https:\/\/(?!overpass-api\.de)/,route=>route.abort());
 await page.goto(base);await page.waitForFunction(()=>!!window.stratumEarth,{},{timeout:45000});
 await page.waitForFunction(()=>window.stratumEarth.renderer.drawCount>4,{},{timeout:45000});
 await page.screenshot({path:path.join(reportDir,'earth-globe.png')});tests.push('Globe initializes beneath /STRATUM-EARTH/ with local dependencies');
 await page.evaluate(()=>{stratumEarth.renderer.goTo(-37.814,144.964,430,{animate:false});});
 await page.click('#load-area');await page.waitForFunction(()=>stratumEarth.renderer.active?.userData.features.length===8,{},{timeout:45000});
 const stats=await page.evaluate(()=>stratumEarth.stats());assert.equal(stats.features,8);assert.equal(stats.tiles,1);assert.equal(network.length,1);tests.push('Bounded source fetch → real module worker → detail farm → mapped extrusion → render');
 const exact=await page.evaluate(async()=>{const {farmCPU}=await import('./earth/farm.js');const a=stratumEarth.renderer.active.userData;return JSON.stringify(farmCPU(a.features.filter(f=>f.kind==='building')))===JSON.stringify(a.details);});assert.ok(exact);tests.push('Every synthetic building GPU detail result matches the integer CPU reference exactly');
 if(software)assert.equal(stats.farm,'CUDA → WebGPU','Software WebGPU candidate kernel must execute in CI');
 const hasHoles=await page.evaluate(()=>stratumEarth.renderer.active.userData.features.find(f=>f.id==='osm/relation/2001').geometry.coordinates[0].length);assert.equal(hasHoles,2);
 await page.waitForTimeout(600);await page.screenshot({path:path.join(reportDir,'earth-mapped-fixture.png')});
 await page.click('#source-colors');await page.waitForTimeout(150);await page.screenshot({path:path.join(reportDir,'earth-provenance.png')});tests.push('Provenance overlay can distinguish tagged height from generated estimate');
 await page.click('#load-area');await page.waitForFunction(()=>stratumEarth.provider.stats.cacheHits>=1);assert.equal(network.length,1);tests.push('Reload of same source tile uses IndexedDB/RAM cache without network');
 const original=await page.evaluate(()=>stratumEarth.selection.current.tile.key);
 responseStatus=429;await page.evaluate(()=>{stratumEarth.provider.minInterval=0;stratumEarth.provider.nextAllowed=0;stratumEarth.renderer.goTo(-37.8,144.98,450,{animate:false});});
 await page.click('#load-area');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='ERROR');assert.equal(await page.evaluate(()=>stratumEarth.selection.current.tile.key),original);assert.equal(await page.evaluate(()=>stratumEarth.renderer.active.userData.features.length),8);tests.push('HTTP 429 keeps the previous area and surfaces provider cooldown');
 responseStatus=200;delay=80;await page.evaluate(()=>{stratumEarth.provider.nextAllowed=0;stratumEarth.provider.minInterval=0;});
 await page.click('#load-area');await page.click('#cancel-load');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>stratumEarth.selection.current.tile.key),original);tests.push('Cancel discards in-flight data rather than replacing the good scene');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.screenshot({path:path.join(reportDir,'earth-mobile.png')});assert.ok(await page.locator('footer').isVisible());tests.push('Attribution stays visible in a mobile viewport');
 assert.deepEqual(errors,[]);
 const adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return a?.info?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null;});
 const report={schema:'stratum.earth-browser-validation.v1',passed:true,browser:browser.version(),softwareAdapterRequested:software,adapter,stats,exactFarmMatch:exact,tests,pageErrors:errors,networkRequests:network.length,geography:'Explicitly synthetic fixture; no external service requests in regression tests.',notMeasured:['RTX hardware speed','full Earth reconstruction','terrain elevation']};
 await fs.writeFile(path.join(reportDir,'earth-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(path.join(reportDir,'earth-browser-failure.json'),JSON.stringify({error:e.stack,pageErrors:errors,tests},null,2));throw e;}
finally{await browser?.close();await new Promise(r=>server.close(r));}
