import {DETAIL_ZOOM,validateTile} from './tiles.js';
export const OVERPASS_ENDPOINT='https://overpass-api.de/api/interpreter';
export const QUERY_VERSION=1;
export class ProviderError extends Error {constructor(message,{status=0,retryAt=0}={}){super(message);this.name='ProviderError';this.status=status;this.retryAt=retryAt;}}
export const aborted=()=>new DOMException('Request superseded.','AbortError');
export function throwIfAborted(signal){if(signal?.aborted)throw signal.reason||aborted();}
export function pause(ms,signal){return new Promise((resolve,reject)=>{throwIfAborted(signal);const finish=()=>{signal?.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(finish,ms);const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(signal.reason||aborted());};signal?.addEventListener('abort',cancel,{once:true});});}
export function overpassQuery(t) {
  validateTile(t);if(t.z<DETAIL_ZOOM)throw new RangeError('Live detail requests require neighborhood-sized tiles.');
  const b=[t.south,t.west,t.north,t.east].map(n=>n.toFixed(8)).join(',');
  const areas=['["building"]','["natural"="water"]','["waterway"="riverbank"]','["landuse"]','["leisure"="park"]','["natural"="wood"]'];
  return `[out:json][timeout:25][maxsize:16777216];(${areas.map(f=>`way${f}(${b});relation["type"="multipolygon"]${f}(${b});`).join('')}way["highway"](${b}););out meta geom;`;
}
function safeURL(value) {
  const u=new URL(value,globalThis.location?.href||'http://localhost/');
  if(u.username||u.password || !(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('Data endpoints require HTTPS (or localhost).');
  return u;
}
/** One in-flight request, interval/backoff, no endpoint rotation and no bulk world scraping. */
export class EarthProvider {
  constructor({endpoint=OVERPASS_ENDPOINT,kind='overpass',cache,fetchFn=(...args)=>globalThis.fetch(...args),minInterval=3000,timeout=40000,maxBytes=12*1024*1024,now=Date.now}={}) {
    if(!['overpass','tiles'].includes(kind))throw new Error('Unknown provider type');
    safeURL(endpoint);if(kind==='tiles'&&!['{z}','{x}','{y}'].every(k=>endpoint.includes(k)))throw new Error('Tile URL must contain {z}, {x}, {y}.');
    this.endpoint=endpoint;this.kind=kind;this.cache=cache;this.fetchFn=fetchFn;this.minInterval=minInterval;this.timeout=timeout;this.maxBytes=maxBytes;this.now=now;this.nextAllowed=0;this.tail=Promise.resolve();this.stats={requests:0,cacheHits:0,bytes:0};
    this.namespace=`osm-geom-v${QUERY_VERSION}:${kind}:${endpoint}`;
    this.publicDemo=kind==='overpass';this.automaticAllowed=kind==='tiles';
  }
  load(t,{signal,manual=false}={}) {
    validateTile(t);
    if(this.publicDemo&&!manual)return Promise.reject(new ProviderError('Public Overpass is manual-only. Configure your own tile endpoint for automatic streaming.'));
    const run=()=>this._load(t,signal);const result=this.tail.then(run,run);this.tail=result.catch(()=>{});return result;
  }
  async _load(t,signal) {
    throwIfAborted(signal);const key=this.namespace+':'+t.key,hit=await this.cache?.get(key);throwIfAborted(signal);
    if(hit){this.stats.cacheHits++;return {...hit.data,cache:'hit',ageMs:hit.ageMs};}
    if(this.nextAllowed>this.now())await pause(this.nextAllowed-this.now(),signal);
    throwIfAborted(signal);
    const controller=new AbortController(),relay=()=>controller.abort(signal.reason||aborted());signal?.addEventListener('abort',relay,{once:true});
    const timer=setTimeout(()=>controller.abort(new ProviderError('Geographic request timed out; the previous area is still available.')),this.timeout);
    try{
      const url=this.kind==='overpass'?this.endpoint:this.endpoint.replace('{z}',t.z).replace('{x}',t.x).replace('{y}',t.y);
      const options={signal:controller.signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'};
      if(this.kind==='overpass'){options.method='POST';options.body=new URLSearchParams({data:overpassQuery(t)});}
      this.stats.requests++;const response=await this.fetchFn(url,options);
      this.nextAllowed=this.now()+this.minInterval;
      if(!response.ok){const ra=response.headers?.get('Retry-After');const delay=ra&&/^\d+$/.test(ra)?Number(ra)*1000:ra?Math.max(0,Date.parse(ra)-this.now()):0;
        if(response.status===429||response.status===503||response.status===504)this.nextAllowed=this.now()+Math.max(30000,Number.isFinite(delay)?delay:0);
        throw new ProviderError(`Geographic provider returned HTTP ${response.status}. No automatic retries or server hopping.`,{status:response.status,retryAt:this.nextAllowed});}
      const declared=Number(response.headers?.get('Content-Length'));
      if(declared>this.maxBytes)throw new ProviderError('Area response exceeds the download budget.');
      let text,bytes=0;
      if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder(),parts=[];try{while(true){throwIfAborted(controller.signal);const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>this.maxBytes){await reader.cancel();throw new ProviderError('Area response exceeds the download budget.');}parts.push(decoder.decode(r.value,{stream:true}));}parts.push(decoder.decode());text=parts.join('');}finally{reader.releaseLock();}}
      else{text=await response.text();bytes=new TextEncoder().encode(text).length;if(bytes>this.maxBytes)throw new ProviderError('Area response exceeds the download budget.');}
      this.stats.bytes+=bytes;const payload=JSON.parse(text);if(!Array.isArray(payload.elements)||payload.remark)throw new ProviderError(payload.remark?'Incomplete geographic response: '+String(payload.remark).slice(0,180):'Expected Overpass geometry JSON.');
      const data={payload,provider:this.namespace,fetchedAt:this.now(),bytes};throwIfAborted(signal);await this.cache?.put(key,data);throwIfAborted(signal);
      return {...data,cache:'miss',ageMs:0};
    }catch(e){if(controller.signal.aborted)throw controller.signal.reason||aborted();throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',relay);this.nextAllowed=Math.max(this.nextAllowed,this.now()+this.minInterval);}
  }
}
/** Last-request-wins transaction. Old scene survives fetch/normalization/GPU errors. */
export class SelectionController {
  constructor({load,prepare,commit,discard=()=>{},onState=()=>{}}){Object.assign(this,{load,prepare,commit,discard,onState});this.revision=0;this.controller=null;this.current=null;}
  async select(key,options={}) {
    const revision=++this.revision;this.controller?.abort(aborted());const controller=new AbortController();this.controller=controller;let prepared;
    this.onState({phase:'loading',key});
    try{const value=await this.load(key,{...options,signal:controller.signal});throwIfAborted(controller.signal);this.onState({phase:'generating',key});prepared=await this.prepare(value,{signal:controller.signal});throwIfAborted(controller.signal);
      if(revision!==this.revision)throw aborted();
      this.commit(prepared,value);this.current=key;prepared=null;this.onState({phase:'ready',key});return {status:'ready',value};
    }catch(error){if(prepared)this.discard(prepared);if(revision!==this.revision || error.name==='AbortError')return {status:'superseded'};this.onState({phase:'error',key,error});return {status:'error',error};}
  }
  cancel(){this.revision++;this.controller?.abort(aborted());this.onState({phase:'idle',key:this.current});}
}
