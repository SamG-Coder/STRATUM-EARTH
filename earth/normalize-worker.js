import {normalizeOSM} from './osm.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,descriptor:normalizeOSM(data.payload,data.tile,data.options)});}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
