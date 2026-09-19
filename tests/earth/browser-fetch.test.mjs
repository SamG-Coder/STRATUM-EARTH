import test from 'node:test';
import assert from 'node:assert/strict';
import {EarthProvider} from '../../earth/provider.js';
import {tileAt} from '../../earth/tiles.js';
test('default provider calls browser fetch with its required global receiver',async()=>{
 const original=globalThis.fetch;let called=0;
 globalThis.fetch=function(url,options){assert.equal(this,globalThis);assert.equal(options.method,'POST');called++;return Promise.resolve(new Response('{"elements":[]}'));};
 try{const p=new EarthProvider({minInterval:0});const a=await p.load(tileAt(-37.814,144.964),{manual:true});assert.equal(a.cache,'miss');assert.equal(called,1);}finally{globalThis.fetch=original;}
});
