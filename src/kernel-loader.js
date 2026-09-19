import {SPECS} from './kernel-specs.js';import {COMPILER_STAMP} from './compiler-stamp.js';
export class KernelLoader{
 constructor(runtime,onProgress=()=>{}){this.runtime=runtime;this.onProgress=onProgress;this.sources=new Map();this.loaded=new Map();this.timings=[];this.worker=null;this.nextId=0;this.pending=new Map();}
 async text(name){if(!this.sources.has(name))this.sources.set(name,(async()=>{const r=await fetch(new URL('../kernels/'+name+'.cu',import.meta.url),{cache:'no-cache'});if(!r.ok)throw Error('Missing CUDA source '+name);return r.text();})());return this.sources.get(name);}
 async compile(source,spec){
  if(typeof Worker==='undefined'){const {compile}=await import('../vendor/cuda-webshader/compiler/compiler.js');const {ast,kernel,...a}=compile(source,{entry:spec.entry,workgroupSize:spec.workgroupSize});return a;}
  if(!this.worker){this.worker=new Worker(new URL('./compiler-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.artifact);};this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(Error(e.message||'Compiler worker failed'));this.pending.clear();this.worker?.terminate();this.worker=null;};}
  return new Promise((resolve,reject)=>{const id=++this.nextId;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,source,spec});});
 }
 async load(entry,progress=0){
  if(this.loaded.has(entry))return this.loaded.get(entry);
  const spec=SPECS.find(s=>s.entry===entry);if(!spec)throw Error('Unknown kernel '+entry);
  const begun=performance.now(),source=(await Promise.all(spec.dependencies.map(n=>this.text(n)))).join('\n');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(COMPILER_STAMP+'|'+entry+'|'+spec.workgroupSize.join(',')+'|'+source)));
  const hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),cacheURL=new URL('../.city-shader-cache/'+hash+'.json',import.meta.url);let artifact,origin='runtime',cache=null;
  try{if(globalThis.caches)cache=await caches.open('stratum-city-shaders-v1');const hit=await cache?.match(cacheURL);if(hit){const a=await hit.json();if(a.stratumHash===hash){artifact=a;origin='browser cache';}}}catch{/* Private-mode/quota failures cannot block startup. */}
  if(!artifact){try{const r=await fetch(new URL('../generated/'+entry+'.json',import.meta.url),{cache:'no-cache'});if(r.ok){const a=await r.json();if(a.stratumHash===hash&&a.compilerStamp===COMPILER_STAMP){artifact=a;origin='verified build';}}}catch{/* generated/ is an optional boot accelerator, not a dependency. */}}
  if(!artifact){this.onProgress('CUDA → WGSL: '+entry,progress);artifact=await this.compile(source,spec);artifact.stratumHash=hash;artifact.compilerStamp=COMPILER_STAMP;}
  if(!artifact.metadata||artifact.metadata.bindings.length>8||artifact.metadata.workgroupStorageBytes>16384)throw Error('Invalid portable shader budget for '+entry);
  try{await cache?.put(cacheURL,new Response(JSON.stringify(artifact),{headers:{'Content-Type':'application/json'}}));}catch{}
  const translated=performance.now();this.onProgress('GPU pipeline: '+entry+' · '+origin,progress);
  const kernel=await this.runtime.kernel(artifact);this.loaded.set(entry,kernel);this.timings.push({entry,source:origin,loadOrTranslateMs:translated-begun,pipelineMs:performance.now()-translated});return kernel;
 }
 dispose(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values())p.reject(Error('Compiler disposed'));this.pending.clear();}
}
