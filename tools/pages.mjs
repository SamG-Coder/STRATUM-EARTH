import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await fs.access(new URL('generated-earth/detailFarm.json',root));
await fs.access(new URL('vendor/earth/three.webgpu.js',root));
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','city.html','farm.html','style.css','src','earth','cities','kernels','vendor','generated-earth','EARTH_DATA_NOTICES.md','LICENSE','tests/browser.html','tests/browser.js','tests/probes.json'])await fs.cp(new URL(name,root),new URL(name,out),{recursive:true});
// Original city runtime retains its verified compile fallback.
try{await fs.cp(new URL('generated/',root),new URL('generated/',out),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(new URL('build.json',out),JSON.stringify({build:'stratum-earth-0.4.0',coordinates:'WGS84 ellipsoid / metres',entry:'earth/app.js',detailFarm:'earth/kernels/detail-farm.cu',legacyCity:'city.html',terrainElevation:false,publicDataMode:'manual bounded neighborhoods',builtAt:new Date().toISOString()},null,2));
console.log('Packaged Earth globe, local vendor dependencies, compiled detail farm and preserved city demo.');
