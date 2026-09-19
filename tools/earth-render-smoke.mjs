import {chromium} from 'playwright';
import {browserOptions} from './earth-browser-options.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),reports=path.join(root,'reports');await fs.mkdir(reports,{recursive:true});
const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<script type="importmap">{"imports":{"three":"/vendor/earth/three.webgpu.js","three/tsl":"/vendor/earth/three.tsl.js"}}</script><canvas id="c" width="128" height="128"></canvas>');return;}const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'application/json');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
let browser;const results=[];
try{
 browser=await chromium.launch(browserOptions());
 for(const mode of ['native','basic','standard','msaa','textured']){
  const page=await browser.newPage({viewport:{width:256,height:256}}),messages=[];page.on('console',m=>messages.push(m.type()+': '+m.text()));page.on('pageerror',e=>messages.push(e.stack));await page.goto(base);
  const result=await page.evaluate(async mode=>{
   const lost=[],errors=[],c=document.querySelector('canvas'),gpu=navigator.gpu,a=await gpu.requestAdapter(),d=await a.requestDevice();window.keep={gpu,a,d};d.lost.then(i=>lost.push({message:i.message,reason:i.reason}));d.addEventListener('uncapturederror',e=>errors.push(e.error.message));
   const summarize=p=>{const colors=new Set();let nonzero=0;for(let i=0;i<p.length;i+=4){colors.add([p[i],p[i+1],p[i+2]].join(','));if(p[i]||p[i+1]||p[i+2])nonzero++;}return {colors:colors.size,nonzero,sample:Array.from(p.slice(0,16)),lost,errors};};
   try{
    if(mode==='native'){
     const module=d.createShaderModule({code:'@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {var p=array<vec2f,3>(vec2f(-.8,-.8),vec2f(.8,-.8),vec2f(0.,.8));return vec4f(p[i],0.,1.);}@fragment fn f()->@location(0) vec4f{return vec4f(1.,.3,.1,1.);}'});
     const tex=d.createTexture({size:[128,128],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
     const pipe=await d.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'v'},fragment:{module,entryPoint:'f',targets:[{format:'rgba8unorm'}]}});
     const buffer=d.createBuffer({size:128*128*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=d.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:tex.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});pass.setPipeline(pipe);pass.draw(3);pass.end();enc.copyTextureToBuffer({texture:tex},{buffer,bytesPerRow:512},[128,128]);d.queue.submit([enc.finish()]);await buffer.mapAsync(GPUMapMode.READ);const result=summarize(new Uint8Array(buffer.getMappedRange()));buffer.unmap();return result;
    }
    const T=await import('three'),r=new T.WebGPURenderer({canvas:c,device:d,antialias:mode==='msaa'});await r.init();r.setSize(128,128,false);const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,100);camera.position.z=4;scene.add(new T.HemisphereLight(0xffffff,0x333333,2));const material=mode==='basic'?new T.MeshBasicMaterial({color:0x00ff00}):new T.MeshStandardMaterial({color:0x66ccaa});
    if(mode==='textured'){const tc=document.createElement('canvas');tc.width=2048;tc.height=1024;const ctx=tc.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,2048,1024);material.map=new T.CanvasTexture(tc);}
    scene.add(new T.Mesh(new T.SphereGeometry(1,32,16),material));const rt=new T.RenderTarget(128,128,{type:T.UnsignedByteType});r.setRenderTarget(rt);await r.renderAsync(scene,camera);await r.waitForGPU();const pixels=await r.readRenderTargetPixelsAsync(rt,0,0,128,128);const out=summarize(pixels);r.setRenderTarget(null);r.render(scene,camera);await r.waitForGPU();return out;
   }catch(e){return {error:String(e.stack||e),lost,errors};}
  },mode);
  results.push({mode,...result,messages});await page.screenshot({path:path.join(reports,'earth-smoke-'+mode+'.png')});await page.close();
 }
 console.log(JSON.stringify(results,null,2));await fs.writeFile(path.join(reports,'earth-render-smoke.json'),JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
