import {toLocal,toECEF,clamp} from './geodesy.js';
export const OBJECT_FLOATS=16, GENOME_FLOATS=8, GRID=64, MAX_OBJECTS=8192, MAX_EDGES=131072;
export function stableSeed(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)&0xffffff;}
export function metres(value){if(value===undefined||value===null)return null;const m=String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);if(!m)return null;const n=Number(m[1])*(/^(ft|feet|')$/i.test(m[2]||'')?.3048:1);return Number.isFinite(n)?n:null;}
const same=(a,b)=>a&&b&&a.lat===b.lat&&a.lon===b.lon;
function ring(raw){if(!Array.isArray(raw)||raw.length<4||!same(raw[0],raw.at(-1))||raw.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90))return null;return raw;}
/** Join complete OSM relation member ways. Never close an incomplete boundary by inventing an edge. */
export function joinRings(parts){
 const todo=parts.map(p=>p?.slice()).filter(p=>p?.length>=2),out=[];
 while(todo.length){let a=todo.pop();let changed=true;
  while(!same(a[0],a.at(-1))&&changed){changed=false;for(let i=0;i<todo.length;i++){let b=todo[i];if(same(a.at(-1),b[0]))a.push(...b.slice(1));else if(same(a.at(-1),b.at(-1)))a.push(...b.slice(0,-1).reverse());else if(same(a[0],b.at(-1)))a.unshift(...b.slice(0,-1));else if(same(a[0],b[0]))a.unshift(...b.slice(1).reverse());else continue;todo.splice(i,1);changed=true;break;}}
  const r=ring(a);if(!r)throw Error('Incomplete multipolygon');out.push(r);
 }return out;
}
function kind(tags){return tags.building&&tags.building!=='no'||tags['building:part']&&tags['building:part']!=='no'?1:tags.highway?2:tags.natural==='water'||tags.waterway==='riverbank'?3:tags.leisure==='park'||['forest','grass','meadow','recreation_ground'].includes(tags.landuse)||tags.natural==='wood'?4:0;}
/** Decode and reproject source geometry; this does not generate vertices, facades or meshes. */
export function normalizeOSM(json,frame,{radius=2000,heightAt=()=>0}={}){
 if(json?.remark)throw Error('The geographic provider returned incomplete data: '+json.remark);
 if(!Array.isArray(json?.elements))throw Error('Expected Overpass JSON elements.');
 const records=[],edges=[],objects=[],warnings={unsupported:0,incomplete:0,oversized:0,outside:0},consumed=new Set();
 const input=[];
 for(const el of json.elements.filter(e=>e.type==='relation')){const tags=el.tags||{};if(!kind(tags)||tags.type!=='multipolygon')continue;try{const members=(el.members||[]).filter(m=>m.type==='way'),outers=joinRings(members.filter(m=>m.role!=='inner').map(m=>m.geometry)),holes=joinRings(members.filter(m=>m.role==='inner').map(m=>m.geometry));if(!outers.length)throw Error('No outer ring');input.push({el,rings:[...outers,...holes]});members.forEach(m=>consumed.add(m.ref));}catch{warnings.incomplete++;}}
 for(const el of json.elements.filter(e=>e.type==='way'&&!consumed.has(e.id)))input.push({el,rings:el.geometry?[el.geometry]:[]});
 for(const {el,rings} of input){const tags=el.tags||{},type=kind(tags);if(!type)continue;
  if(tags.bridge==='yes'||tags.tunnel==='yes'||Number(tags.layer)<0){warnings.unsupported++;continue;}
  if(!rings.length||rings.some(r=>r.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)))){warnings.incomplete++;continue;}
  if(type!==2&&rings.some(r=>!ring(r))){warnings.incomplete++;continue;}
  const local=rings.map(r=>r.map(p=>toLocal(frame,p.lat,p.lon))),flat=local.flat();if(flat.length<2)continue;
  const xs=flat.map(p=>p[0]),zs=flat.map(p=>p[2]),bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
  if(bounds[2]<-radius||bounds[0]>radius||bounds[3]<-radius||bounds[1]>radius){warnings.outside++;continue;}
  const count=local.reduce((n,r)=>n+r.length-1,0);if(count>2048){warnings.oversized++;continue;}
  if(records.length>=MAX_OBJECTS||edges.length/4+count>MAX_EDGES)throw Error('Area exceeds the descriptor budget. Load a smaller area; data was not silently truncated.');
  let perimeter=0,area=0;for(const r of local)for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];perimeter+=Math.hypot(b[0]-a[0],b[2]-a[2]);area+=a[0]*b[2]-a[2]*b[0];}
  perimeter=0;for(const r of rings)for(let i=1;i<r.length;i++){const a=toECEF(r[i-1].lat,r[i-1].lon),b=toECEF(r[i].lat,r[i].lon);perimeter+=Math.hypot(...a.map((v,j)=>v-b[j]));}perimeter=Math.round(perimeter*100)/100;
  let height=metres(tags.height),heightSource='source height';const levels=Number(tags['building:levels']);
  if(!(height>0&&height<=1500)){height=Number.isFinite(levels)&&levels>0&&levels<400?levels*3.1:0;heightSource=height?'levels × assumed 3.1 m':'generated prior';}
  let minHeight=metres(tags.min_height)||0;minHeight=clamp(minHeight,0,Math.max(0,height-.1));
  const width=metres(tags.width);const roadWidth=width>0?clamp(width,.5,80):(['motorway','trunk'].includes(tags.highway)?14:['primary','secondary'].includes(tags.highway)?10:['footway','path','cycleway'].includes(tags.highway)?2:6);
  const ground=heightAt((bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2);
  const e0=edges.length/4;for(const r of local)for(let i=1;i<r.length;i++)edges.push(r[i-1][0],r[i-1][2],r[i][0],r[i][2]);
  let prior=['house','detached','residential'].includes(tags.building)?9:tags.building==='apartments'?24:tags.building==='commercial'?28:12;
  const id=el.type+'/'+el.id,seed=stableSeed('earth-v1/'+id),record=[...bounds,e0,count,height,minHeight,seed,type,Math.abs(area)/2,perimeter,prior,ground,roadWidth,Number.isFinite(levels)&&levels>0?levels:0];
  objects.push(...record);records.push({id,type,name:tags.name||id,tags:{...tags},heightSource,footprint:'OpenStreetMap source coordinates',generated:['facade','windows','materials',...(height?[]:['height'])],sourceTimestamp:json.osm3s?.timestamp_osm_base||null});
 }
 // Attribute/type priors are intrinsic to an object: changing the query window must not change its genome.
 const packed=new Float32Array(objects.length?objects:16),edgeBuffer=new Float32Array(edges.length?edges:4),index=buildIndex(packed,records.length,radius);
 return {objects:packed,edges:edgeBuffer,index,records,warnings,count:records.length,radius,frame,sourceTimestamp:json.osm3s?.timestamp_osm_base||null};
}
export function buildIndex(objects,count,radius){
 const cells=Array.from({length:GRID*GRID},()=>[]),size=2*radius/GRID;let total=0;
 for(let i=0;i<count;i++){const b=i*16,pad=objects[b+9]===2?objects[b+14]/2:0,loX=clamp(Math.floor((objects[b]-pad+radius)/size),0,GRID-1),hiX=clamp(Math.floor((objects[b+2]+pad+radius)/size),0,GRID-1),loZ=clamp(Math.floor((objects[b+1]-pad+radius)/size),0,GRID-1),hiZ=clamp(Math.floor((objects[b+3]+pad+radius)/size),0,GRID-1);
 for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){cells[z*GRID+x].push(i);if(++total>1048576)throw Error('Spatial index budget exceeded; reduce geographic area.');}}
 const a=new Uint32Array(4+cells.length*2+total);a[0]=GRID;a[1]=count;let p=4+cells.length*2;cells.forEach((c,i)=>{a[4+i*2]=p;a[5+i*2]=c.length;a.set(c,p);p+=c.length;});return a;
}
/** Latitude-binned raw coastline edges. The land mask is produced by CUDA, not JS. */
export function landEdges(geo,height=512){
 const edges=[],rows=Array.from({length:height},()=>[]);for(const f of geo.features||[]){const g=f.geometry;const ps=g?.type==='MultiPolygon'?g.coordinates:g?.type==='Polygon'?[g.coordinates]:[];for(const p of ps)for(const r of p)for(let i=1;i<r.length;i++){const [x0,y0]=r[i-1],[x1,y1]=r[i];if(y0===y1)continue;const id=edges.length/4;edges.push(x0,y0,x1,y1);const lo=clamp(Math.floor((90-Math.max(y0,y1))/180*height),0,height-1),hi=clamp(Math.floor((90-Math.min(y0,y1))/180*height),0,height-1);for(let y=lo;y<=hi;y++)rows[y].push(id);}}
 const index=new Uint32Array(height*2+rows.reduce((n,r)=>n+r.length,0));let at=height*2;rows.forEach((r,i)=>{index[i*2]=at;index[i*2+1]=r.length;index.set(r,at);at+=r.length;});return {edges:new Float32Array(edges),index};
}
