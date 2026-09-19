import {compile,serializableArtifact} from '../../vendor/cuda-webshader/compiler/compiler.js';
import {earthOptions} from './kernel-specs.js';
self.onmessage=({data:{id,source,spec}})=>{try{self.postMessage({id,artifact:serializableArtifact(compile(source,earthOptions(spec)))});}catch(e){self.postMessage({id,error:e.stack||String(e)});}};
