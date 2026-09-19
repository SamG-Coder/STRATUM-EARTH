import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','farm.html','style.css','src','cities','kernels','vendor','tests/browser.html','tests/browser.js','tests/probes.json'])await fs.cp(new URL(name,root),new URL(name,out),{recursive:true});
// Optional accelerators only: runtime verifies source + compiler hashes before accepting them.
try{await fs.cp(new URL('generated/',root),new URL('generated/',out),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(new URL('build.json',out),JSON.stringify({build:'stratum-city-seed-farm-1',city:'finite-manhattan-study',shaderSource:'kernels/*.cu',generatedShaderDependency:false,builtAt:new Date().toISOString()},null,2));
console.log('Packaged finite city, genome, plan, local GPU seed farmer and runtime CUDA fallback.');
