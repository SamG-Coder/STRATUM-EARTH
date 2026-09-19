import {queryBounds,mercator,clamp} from './geodesy.js';
export const SOURCES=Object.freeze({
 land:'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/693f11422f4e08d2da4566b854dda53eb7c39fb3/geojson/ne_110m_land.geojson',
 terrain:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
 overpass:'https://overpass-api.de/api/interpreter'
});
const abortError=()=>new DOMException('Superseded geographic request','AbortError');
export const checkAbort=s=>{if(s?.aborted)throw s.reason||abortError();};
export class DataCache{
 constructor({maxBytes=64*1024*1024,maxEntries=160}={}){this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.memory=new Map();this.db=null;this.disabled=false;}
 async open(){if(this.db||this.disabled||!globalThis.indexedDB)return this.db;try{this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('stratum-earth-descriptors-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('entries',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cache blocked'));});}catch{this.disabled=true;}return this.db;}
 async get(key){const cached=this.memory.get(key);if(cached&&cached.expires>Date.now()){this.memory.delete(key);this.memory.set(key,cached);return cached;}
 const db=await this.open();if(!db)return null;try{const row=await new Promise((resolve,reject)=>{const r=db.transaction('entries').objectStore('entries').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(row&&row.expires>Date.now()){this.memory.set(key,row);this.trimMemory();return row;}}catch{}return null;}
 trimMemory(){let n=[...this.memory.values()].reduce((s,r)=>s+r.bytes,0);while(this.memory.size>this.maxEntries||n>this.maxBytes){const k=this.memory.keys().next().value;n-=this.memory.get(k).bytes;this.memory.delete(k);}}
 async put(key,body,ttl,meta={}){const bytes=typeof body==='string'?new TextEncoder().encode(body).length:body.byteLength;if(bytes>this.maxBytes)return;const row={key,body,bytes,meta,time:Date.now(),expires:Date.now()+ttl};this.memory.set(key,row);this.trimMemory();const db=await this.open();if(!db)return;
 try{await new Promise((resolve,reject)=>{const t=db.transaction('entries','readwrite'),s=t.objectStore('entries');s.put(row);const req=s.getAll();req.onsuccess=()=>{const all=req.result.sort((a,b)=>b.time-a.time);let sum=0;all.forEach((r,i)=>{sum+=r.bytes;if(i>=this.maxEntries||sum>this.maxBytes||r.expires<Date.now())s.delete(r.key);});};t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}catch{this.disabled=true;}}
 async clear(){this.memory.clear();const db=await this.open();if(db)await new Promise((resolve,reject)=>{const t=db.transaction('entries','readwrite');t.objectStore('entries').clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
}
export class Network{
 constructor({cache=new DataCache(),fetcher=(...a)=>fetch(...a),onStatus=()=>{}}={}){this.cache=cache;this.fetcher=fetcher;this.onStatus=onStatus;this.bytes=0;this.requests=0;this.hits=0;}
 async read(url,{signal,ttl=86400000,maxBytes=4*1024*1024,body,timeout=25000}={}){
  checkAbort(signal);const key=url+(body?'|'+body:''),hit=await this.cache.get(key);checkAbort(signal);if(hit){this.hits++;return {data:hit.body,cached:true,...hit.meta};}
  const controller=new AbortController(),cancel=()=>controller.abort(signal.reason||abortError());signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>controller.abort(new DOMException('Geographic provider timed out','TimeoutError')),timeout);
  try{this.requests++;this.onStatus('Downloading '+new URL(url).hostname);const r=await this.fetcher(url,{signal:controller.signal,mode:'cors',credentials:'omit',...(body?{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}:{} )});
   if(!r.ok){const e=Error('Provider HTTP '+r.status);e.status=r.status;const raw=r.headers?.get('retry-after');e.retryAfter=raw?Math.max(0,Number(raw)*1000||Date.parse(raw)-Date.now()):0;throw e;}
   if(Number(r.headers?.get('content-length'))>maxBytes)throw Error('Provider response exceeds the download budget.');
   let data;if(r.body?.getReader){const reader=r.body.getReader(),chunks=[];let n=0;try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>maxBytes){await reader.cancel();throw Error('Provider response exceeds the download budget.');}chunks.push(value);}const bytes=new Uint8Array(n);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}data=bytes.buffer;}finally{reader.releaseLock();}}else data=await r.arrayBuffer();
   if(data.byteLength>maxBytes)throw Error('Provider response exceeds the download budget.');checkAbort(signal);this.bytes+=data.byteLength;const meta={fetchedAt:Date.now(),url,etag:r.headers?.get('etag')||null,lastModified:r.headers?.get('last-modified')||null};await this.cache.put(key,data,ttl,meta);return {data,cached:false,...meta};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 async json(url,options){const r=await this.read(url,options);return {...r,json:JSON.parse(new TextDecoder().decode(r.data))};}
}
/** Public Overpass is manual preview only, never an automatic planet/tile crawler. */
export class GeographyProvider{
 constructor(network,{endpoint=SOURCES.overpass,allowAutomatic=false}={}){
  const u=new URL(endpoint);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Use HTTPS (or a localhost development provider).');
  this.network=network;this.endpoint=u.href;this.public=u.hostname==='overpass-api.de'||u.hostname.endsWith('.overpass-api.de');this.allowAutomatic=!!allowAutomatic&&!this.public;this.next=0;this.active=false;this.sessionRequests=0;this.tail=Promise.resolve();
 }
 area(lat,lon,options={}){const pending=this.tail.then(()=>{checkAbort(options.signal);return this._area(lat,lon,options);});this.tail=pending.catch(()=>{});return pending;}
 async _area(lat,lon,{radius=600,signal,automatic=false}={}){
  if(automatic&&!this.allowAutomatic)throw Error('Automatic vectors require your own permitted Overpass-compatible endpoint.');
  if(this.active)throw Error('A geographic request is already in flight.');if(this.public&&this.sessionRequests>=40)throw Error('Public preview session budget reached. Use your own provider for continuous streaming.');
  // A single bounded union handles antimeridian views without duplicate feature requests.
  const boxes=queryBounds(lat,lon,radius).map(b=>b.map(x=>x.toFixed(7)).join(','));
  const clauses=[];for(const b of boxes)for(const filter of ['[building]','["building:part"]','[highway]','[natural=water]','[waterway=riverbank]','[leisure=park]','[landuse~"^(forest|grass|meadow)$"]']){clauses.push(`way${filter}(${b});`);if(!filter.includes('highway'))clauses.push(`relation${filter}[type=multipolygon](${b});`);}
  const q='[out:json][timeout:20][maxsize:33554432];('+clauses.join('')+');out body geom;',body='data='+encodeURIComponent(q);
  const cached=await this.network.cache.get(this.endpoint+'|'+body);checkAbort(signal);if(cached){this.network.hits++;return {json:JSON.parse(new TextDecoder().decode(cached.body)),cached:true,...cached.meta};}
  if(Date.now()<this.next)throw Error('Provider cooldown: retry in '+Math.ceil((this.next-Date.now())/1000)+' seconds.');this.active=true;this.sessionRequests++;this.next=Date.now()+(this.public?15000:2500);
  try{return await this.network.json(this.endpoint,{signal,body,maxBytes:6*1024*1024,ttl:86400000});}
  catch(e){if(e.status===429||e.status===503||e.status===504)this.next=Date.now()+Math.max(60000,e.retryAfter||0);throw e;}
  finally{this.active=false;}
 }
}
/** Latest-wins downloads; replacement is committed only after a complete result exists. */
export class LatestTask{
 constructor(){this.generation=0;this.controller=null;}
 cancel(){this.generation++;this.controller?.abort();}
 async run(work,commit){this.cancel();const generation=this.generation,c=this.controller=new AbortController();try{const value=await work(c.signal);if(generation!==this.generation||c.signal.aborted)return false;await commit(value);return true;}catch(e){if(generation!==this.generation||c.signal.aborted)return false;throw e;}}
}
export function decodeTerrarium(rgba){if(rgba.length%4)throw Error('Invalid Terrarium bytes');const out=new Float32Array(rgba.length/4);for(let i=0;i<out.length;i++)out[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;return out;}
export async function pngHeights(data){
 const image=await createImageBitmap(new Blob([data],{type:'image/png'}),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
 try{if(image.width!==256||image.height!==256)throw Error('Terrain provider did not return a 256 × 256 tile.');const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return decodeTerrarium(ctx.getImageData(0,0,256,256).data);}finally{image.close();}
}
export class ElevationProvider{
 constructor(network,{template=SOURCES.terrain}={}){this.network=network;this.template=template;this.tiles=new Map();}
 async tile(z,x,y,signal){const n=2**z;x=((x%n)+n)%n;if(y<0||y>=n)return null;const key=`${z}/${x}/${y}`;if(this.tiles.has(key))return this.tiles.get(key);const url=this.template.replace('{z}',z).replace('{x}',x).replace('{y}',y),r=await this.network.read(url,{signal,ttl:30*86400000,maxBytes:600000}),h=await pngHeights(r.data);checkAbort(signal);this.tiles.set(key,h);while(this.tiles.size>64)this.tiles.delete(this.tiles.keys().next().value);return h;}
 async prepare(lat,lon,radius,signal){if(Math.abs(lat)>84.9)throw Error('This terrain provider stops at the Web Mercator polar limit. Globe navigation remains available.');const z=clamp(Math.floor(Math.log2(40075016.686*Math.cos(lat*Math.PI/180)/(radius*1.4))),0,14),c=mercator(lat,lon,z),x=Math.floor(c.x),y=Math.floor(c.y),tiles=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)tiles.push([x+dx,y+dy]);
 // Two downloads at once, bounded 3×3 working set; no whole-world prefetch.
 let next=0;const local=new Map();await Promise.all([0,1].map(async()=>{while(next<tiles.length){const [tx,ty]=tiles[next++];checkAbort(signal);const h=await this.tile(z,tx,ty,signal);if(h)local.set(((tx%(2**z)+2**z)%(2**z))+'/'+ty,h);}}));
 return {z,sample:(p,l)=>{const t=mercator(p,l,z),tx=Math.floor(t.x),ty=Math.floor(t.y),h=local.get(tx+'/'+ty);if(!h)return null;const u=clamp((t.x-tx)*256-.5,0,255),v=clamp((t.y-ty)*256-.5,0,255),ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;const a=h[iz*256+ix],b=h[iz*256+Math.min(255,ix+1)],d=h[Math.min(255,iz+1)*256+ix],e=h[Math.min(255,iz+1)*256+Math.min(255,ix+1)];return (a+(b-a)*fx)*(1-fz)+(d+(e-d)*fx)*fz;}};
 }
}
