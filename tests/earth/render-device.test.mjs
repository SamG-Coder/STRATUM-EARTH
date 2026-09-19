import test from 'node:test';
import assert from 'node:assert/strict';
import {probeWebGPUPresentation} from '../../earth/render-device.js';
async function run({lose=false,stall=false,missing=false}={}){
 const oldDocument=globalThis.document,oldUsage=globalThis.GPUTextureUsage,events=[];let lost;
 const device={lost:new Promise(r=>lost=r),pushErrorScope(){},popErrorScope:async()=>null,destroy(){events.push('destroy');lost({reason:'destroyed'});},queue:{submit(){if(lose)lost({message:'No canvas backing'});},onSubmittedWorkDone:()=>stall?new Promise(()=>{}):Promise.resolve()},createCommandEncoder:()=>({beginRenderPass:()=>({end(){}}),finish:()=>({})})};
 const context={configure(){events.push('configure');},unconfigure(){events.push('unconfigure');},getCurrentTexture:()=>({createView:()=>({})})};
 const canvas={style:{},getContext:()=>context,remove(){events.push('remove');}};
 globalThis.document={body:{append(){}},createElement:()=>canvas};globalThis.GPUTextureUsage={RENDER_ATTACHMENT:1,COPY_SRC:2};
 try{return {result:await probeWebGPUPresentation({gpu:{requestAdapter:async()=>missing?null:{requestDevice:async()=>device},getPreferredCanvasFormat:()=> 'bgra8unorm'},timeout:stall?5:1000}),events};}
 finally{globalThis.document=oldDocument;globalThis.GPUTextureUsage=oldUsage;}
}
test('no WebGPU API selects an explicit rendering fallback',async()=>{assert.equal((await probeWebGPUPresentation({gpu:null})).ok,false);});
test('missing adapter leaves the visible canvas untouched',async()=>{const {result,events}=await run({missing:true});assert.equal(result.ok,false);assert.deepEqual(events,[]);});
test('lost canvas device is reported and probe resources cleaned',async()=>{const {result,events}=await run({lose:true});assert.equal(result.ok,false);assert.match(result.reason,/canvas backing/);assert.deepEqual(events,['configure','unconfigure','destroy','remove']);});
test('presentation timeout cannot leave startup waiting forever',async()=>{const {result,events}=await run({stall:true});assert.equal(result.ok,false);assert.match(result.reason,/timed out/);assert.ok(events.includes('remove'));});
test('successful presentation releases only the disposable probe',async()=>{const {result,events}=await run();assert.equal(result.ok,true);assert.deepEqual(events,['configure','unconfigure','destroy','remove']);});
