import {compile} from '../vendor/cuda-webshader/compiler/compiler.js';
self.onmessage=event=>{const {id,source,spec}=event.data;try{const {ast,kernel,...artifact}=compile(source,{entry:spec.entry,workgroupSize:spec.workgroupSize});self.postMessage({id,artifact});}catch(e){self.postMessage({id,error:String(e.stack||e)});}};
