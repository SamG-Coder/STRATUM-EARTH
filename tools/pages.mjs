import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','city.html','earth.css','farm.html','style.css','src','cities','kernels','vendor','tests/browser.html','tests/browser.js','tests/probes.json'])await fs.cp(new URL(name,root),new URL(name,out),{recursive:true});
// Optional accelerators only: runtime verifies source + compiler hashes before accepting them.
try{await fs.cp(new URL('generated/',root),new URL('generated/',out),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(new URL('build.json',out),JSON.stringify({build:'stratum-earth-compute-1',coordinateSystem:'WGS84 ECEF / local ENU',shaderSource:'kernels/earth/*.cu',generatedShaderDependency:false,builtAt:new Date().toISOString()},null,2));
console.log('Packaged compute Earth, live-data providers, and preserved city laboratory.');
