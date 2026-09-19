import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {browserOptions} from './earth-browser-options.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['server.mjs','8098'],{cwd:root,stdio:'ignore'});
let browser;const messages=[];
try{
 await fs.mkdir(new URL('../reports/',import.meta.url),{recursive:true});
 browser=await chromium.launch(browserOptions());
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('console',m=>messages.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>messages.push({type:'exception',text:e.message}));
 await page.route('https://**',r=>r.abort());await page.goto('http://127.0.0.1:8098/');
 await page.waitForFunction(()=>!!window.stratumEarth||document.querySelector('#phase')?.textContent==='ERROR',{},{timeout:45000});
 assert.ok(await page.evaluate(()=>!!window.stratumEarth),await page.locator('#status').textContent());await page.waitForTimeout(800);
 const report=await page.evaluate(async()=>{
  const e=stratumEarth.renderer,r=e.renderer,T=await import('three');await r.setAnimationLoop(null);
  if(e.renderFailure)throw e.renderFailure;
  const rt=new T.RenderTarget(128,128,{type:T.UnsignedByteType});r.setRenderTarget(rt);await r.renderAsync(e.scene,e.camera);
  const pixels=await r.readRenderTargetPixelsAsync(rt,0,0,128,128);const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
  r.setRenderTarget(null);rt.dispose();await r.renderAsync(e.scene,e.camera);await r.waitForGPU();
  const c=e.canvas,s=getComputedStyle(c);return {backend:e.backend,colors:colors.size,sample:Array.from(pixels.slice(0,32)),info:r.info.render,canvas:{width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight,rect:c.getBoundingClientRect().toJSON(),display:s.display,opacity:s.opacity,zIndex:s.zIndex},camera:{position:e.camera.position.toArray(),projection:e.camera.projectionMatrix.toArray(),world:e.camera.matrixWorld.toArray()},globe:{visible:e.globe.visible,vertices:e.globe.geometry.attributes.position.count,matrix:e.globe.matrixWorld.toArray()},atCentre:document.elementsFromPoint(720,480).map(n=>n.tagName+'#'+n.id)};
 });
 await page.waitForTimeout(200);await page.screenshot({path:new URL('../reports/earth-pixel-globe.png',import.meta.url).pathname});
 await fs.writeFile(new URL('../reports/earth-pixels.json',import.meta.url),JSON.stringify({...report,messages},null,2));console.log(JSON.stringify(report,null,2));
 assert.ok(report.colors>20,'The globe must produce visible non-uniform image pixels');
}catch(e){await fs.writeFile(new URL('../reports/earth-pixel-failure.json',import.meta.url),JSON.stringify({error:e.stack,messages},null,2));throw e;}
finally{await browser?.close();child.kill();}
