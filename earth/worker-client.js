import {normalizeOSM} from './osm.js';
import {throwIfAborted,aborted} from './provider.js';
export class Normalizer {
  constructor(){this.id=0;this.pending=new Map();this.worker=null;}
  normalize(payload,tile,options={},signal){
    throwIfAborted(signal);
    if(typeof Worker==='undefined')return Promise.resolve(normalizeOSM(payload,tile,options));
    if(!this.worker){this.worker=new Worker(new URL('./normalize-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);p.cleanup();data.error?p.reject(new Error(data.error)):p.resolve(data.descriptor);};this.worker.onerror=e=>{for(const p of this.pending.values()){p.cleanup();p.reject(new Error(e.message||'Geographic worker failed'));}this.pending.clear();this.worker.terminate();this.worker=null;};}
    return new Promise((resolve,reject)=>{const id=++this.id;const abort=()=>{this.pending.delete(id);cleanup();reject(signal.reason||aborted());};const timer=setTimeout(()=>{this.pending.delete(id);cleanup();reject(new Error('Geographic normalization timed out'));},15000);const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});this.worker.postMessage({id,payload,tile,options});});
  }
  dispose(){this.worker?.terminate();for(const p of this.pending.values()){p.cleanup();p.reject(aborted());}this.pending.clear();this.worker=null;}
}
