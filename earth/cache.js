/** Bounded raw-data/descriptor cache. IndexedDB failure degrades to bounded RAM. */
export class TileCache {
  constructor({name='stratum-earth-v1',maxEntries=128,maxBytes=48*1024*1024,ttl=7*86400000,now=Date.now,indexedDB=globalThis.indexedDB}={}) {
    this.name=name;this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.ttl=ttl;this.now=now;this.idb=indexedDB;this.memory=new Map();this.bytes=0;this.mode=indexedDB?'IndexedDB':'memory';this.dbPromise=null;this.tail=Promise.resolve();
  }
  async db() {
    if(!this.idb)return null;
    if(!this.dbPromise)this.dbPromise=new Promise(resolve=>{
      try{const r=this.idb.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('tiles',{keyPath:'key'});r.onerror=()=>{this.mode='memory';resolve(null);};r.onblocked=()=>{this.mode='memory';resolve(null);};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};}catch{this.mode='memory';resolve(null);}
    });
    return this.dbPromise;
  }
  async transaction(mode, action) {
    const db=await this.db();if(!db)return null;
    return new Promise((resolve,reject)=>{
      try{const tx=db.transaction('tiles',mode),request=action(tx.objectStore('tiles'));let result;
        if(request)request.onsuccess=()=>{result=request.result;};
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Cache transaction failed'));tx.onabort=()=>reject(tx.error||new Error('Cache transaction aborted'));
      }catch(e){reject(e);}
    });
  }
  remember(entry) {
    const old=this.memory.get(entry.key);if(old)this.bytes-=old.bytes;
    this.memory.delete(entry.key);this.memory.set(entry.key,entry);this.bytes+=entry.bytes;
    while(this.memory.size>this.maxEntries||this.bytes>this.maxBytes){const [key,e]=this.memory.entries().next().value;this.memory.delete(key);this.bytes-=e.bytes;}
  }
  async get(key) {
    let e=this.memory.get(key);
    if(!e){try{e=await this.transaction('readonly',s=>s.get(key));}catch{this.mode='memory';}}
    if(!e || e.schema!==1 || !Number.isFinite(e.storedAt) || this.now()-e.storedAt>this.ttl || e.bytes>this.maxBytes)return null;
    e.lastUsed=this.now();this.remember(e);
    // Access timestamps are opportunistic; never block rendering for a cache write.
    this.tail=this.tail.then(()=>this.transaction('readwrite',s=>s.put(e))).catch(()=>{this.mode='memory';});
    return {data:structuredClone(e.data),storedAt:e.storedAt,ageMs:Math.max(0,this.now()-e.storedAt)};
  }
  async put(key,data) {
    const bytes=new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if(bytes>this.maxBytes)return false;
    const e={schema:1,key,data:structuredClone(data),bytes,storedAt:this.now(),lastUsed:this.now()};this.remember(e);
    const task=this.tail.then(async()=>{
      try{await this.transaction('readwrite',s=>s.put(e));let all=await this.transaction('readonly',s=>s.getAll());if(!all)return;
        all.sort((a,b)=>b.lastUsed-a.lastUsed);let used=0,count=0;const dead=[];
        for(const row of all){used+=row.bytes;count++;if(count>this.maxEntries||used>this.maxBytes||this.now()-row.storedAt>this.ttl)dead.push(row.key);}
        if(dead.length)await this.transaction('readwrite',s=>{for(const k of dead)s.delete(k);});
      }catch{this.mode='memory';}
    });this.tail=task.catch(()=>{});await task;return true;
  }
  async clear(){this.memory.clear();this.bytes=0;await this.tail;try{await this.transaction('readwrite',s=>s.clear());}catch{this.mode='memory';}}
  async close(){await this.tail;const db=await this.db();db?.close();}
}
