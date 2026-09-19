import {farmCPU,targetsFor,featureSeed,detailFor,CANDIDATES} from './farm.js';
import {GpuRuntime} from '../vendor/cuda-webshader/runtime/runtime.js';
import {throwIfAborted} from './provider.js';
export class DetailFarmer {
  constructor(){this.initPromise=null;this.runtime=null;this.kernel=null;this.mode='not initialized';this.tail=Promise.resolve();this.reason='';}
  async init(){
    if(!this.initPromise)this.initPromise=(async()=>{
      try{
        if(!navigator.gpu)throw new Error('WebGPU unavailable');
        const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter');
        const device=await adapter.requestDevice();this.runtime=new GpuRuntime(device,{adapter,ownsDevice:true});
        const response=await fetch(new URL('../generated-earth/detailFarm.json',import.meta.url));if(!response.ok)throw new Error('Run npm run build to compile the Earth detail farm');
        this.kernel=await this.runtime.kernel(await response.json());this.mode='CUDA → WebGPU';
        device.lost.then(info=>{this.reason=info.message||'Device lost';this.mode='CPU fallback';this.kernel=null;});
      }catch(e){this.reason=e.message;this.mode='CPU fallback';this.runtime?.dispose();this.runtime=null;}
    })();return this.initPromise;
  }
  farm(features,{signal,candidates=CANDIDATES}={}) {
    const task=()=>this._farm(features,{signal,candidates});const result=this.tail.then(task,task);this.tail=result.catch(()=>{});return result;
  }
  async _farm(features,{signal,candidates}) {
    throwIfAborted(signal);if(!features.length)return [];
    await this.init();throwIfAborted(signal);
    if(!this.kernel)return farmCPU(features,candidates);
    if(!Number.isInteger(candidates)||candidates<1||candidates>256)throw new RangeError('Invalid candidate budget');
    const details=[];
    // Bounded buffers and dispatch sizes regardless of provider response size.
    for(let base=0;base<features.length;base+=2048){
      throwIfAborted(signal);const rows=features.slice(base,base+2048),n=rows.length,buffers=[];
      try{
        const make=(bytes,label)=>{const b=this.runtime.createBuffer(bytes,{label});buffers.push(b);return b;};
        const targets=make(n*16,'Earth constraints'),seeds=make(n*4,'Stable object seeds'),results=make(n*candidates*16,'Detail candidate scores');
        this.runtime.write(targets,new Uint32Array(rows.flatMap(targetsFor)));this.runtime.write(seeds,new Uint32Array(rows.map(featureSeed)));
        this.runtime.batch().dispatch(this.kernel.bind({Targets:targets,Seeds:seeds,Results:results},{featureCount:n,candidateCount:candidates}),[Math.ceil(n*candidates/64)]).submit();
        const out=await this.runtime.read(results,Uint32Array);throwIfAborted(signal);
        for(let f=0;f<n;f++){let win=0;for(let c=1;c<candidates;c++)if(out[(f*candidates+c)*4]<out[(f*candidates+win)*4])win=c;details.push(detailFor(rows[f],Array.from(out.subarray((f*candidates+win)*4,(f*candidates+win)*4+4)),win,candidates));}
      }finally{for(const b of buffers)this.runtime.destroyBuffer(b);}
    }
    return details;
  }
  async dispose(){await this.tail;this.runtime?.dispose();}
}
