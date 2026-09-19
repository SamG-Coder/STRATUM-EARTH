/** A compute adapter is not proof that this browser can present WebGPU canvases.
 * Probe a disposable canvas before acquiring a context on the visible canvas.
 * A failed presentation path may still support the separate CUDA compute farmer.
 */
export async function probeWebGPUPresentation({gpu=globalThis.navigator?.gpu,timeout=6000}={}) {
 if(!gpu) return {ok:false,reason:'WebGPU is not available.'};
 let device,context,canvas,timer;
 try {
  const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter) return {ok:false,reason:'No WebGPU rendering adapter.'};
  device=await adapter.requestDevice();
  canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  canvas.style.cssText='position:fixed;left:-128px;top:0;width:64px;height:64px;pointer-events:none';
  document.body.append(canvas);context=canvas.getContext('webgpu');
  if(!context) throw new Error('WebGPU canvas context is unavailable.');
  const lost=device.lost.then(info=>{throw new Error(info.message||'WebGPU device lost while testing canvas presentation.');});
  const work=(async()=>{
   device.pushErrorScope('validation');
   context.configure({device,format:gpu.getPreferredCanvasFormat(),usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC,alphaMode:'opaque'});
   const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:.1,g:.2,b:.3,a:1}}]});
   pass.end();device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();
   const error=await device.popErrorScope();if(error)throw new Error(error.message);
   // Allow device loss from the browser's shared-image/compositor path to arrive.
   await new Promise(resolve=>setTimeout(resolve,80));
  })();
  await Promise.race([work,lost,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('WebGPU presentation probe timed out.')),timeout);})]);
  return {ok:true};
 } catch(error) {return {ok:false,reason:String(error?.message||error)};}
 finally {clearTimeout(timer);try{context?.unconfigure();}catch{}device?.destroy();canvas?.remove();}
}
