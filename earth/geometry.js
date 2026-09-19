import earcut from 'earcut';
import {meters} from './osm.js';
import {localFrame} from './geodesy.js';
const named={brick:'#9e715b',concrete:'#adb4ac',glass:'#779ea5',stone:'#bbb29f',wood:'#917b60',metal:'#91a5ad',white:'#ddddcf',red:'#ab6660',brown:'#967b61',grey:'#9b9b98',gray:'#9b9b98',beige:'#c6b68e',black:'#494e50',yellow:'#caba82'};
function rgb(hex){return [1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});}
function surfaceColor(feature,detail){let v=feature.tags['building:colour'];if(v && /^#[0-9a-f]{3}$/i.test(v))v='#'+[...v.slice(1)].map(c=>c+c).join('');if(v&&!/^#[0-9a-f]{6}$/i.test(v))v=named[v.toLowerCase()];v=v||named[feature.tags['building:material']];return v?rgb(v):[.26+.3*detail.tone,.25+.28*detail.tone,.22+.26*detail.tone];}
class Writer {
 constructor(){this.position=[];this.normal=[];this.uv=[];this.color=[];this.detail=[];this.known=[];this.face=[];this.ranges=[];}
 vertex(p,n,uv,col,d,known,face){this.position.push(...p);this.normal.push(...n);this.uv.push(...uv);this.color.push(...col);this.detail.push(d.bay,d.storey);this.known.push(known);this.face.push(face);}
 tri(points,n,uv,col,d,known,face){for(let i=0;i<3;i++)this.vertex(points[i],n,uv[i],col,d,known,face);}
 finish(){return Object.fromEntries(Object.entries(this).map(([k,v])=>[k,k==='ranges'?v:new Float32Array(v)]));}
}
export function makeGeometry(features,details,frame,{maxVertices=1800000}={}) {
 const w=new Writer(),detailMap=new Map(details.map(d=>[d.id,d]));
 const areas={water:{positions:[]},green:{positions:[]}},roads=[];
 for(const f of features){
  if(f.geometry.type==='LineString') {
   const pts=f.geometry.coordinates.map(p=>frame.project(p[1],p[0],.15));
   for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=Math.hypot(b[0]-a[0],b[2]-a[2]);if(len<.001)continue;const width=meters(f.tags.width)??(f.kind==='road'?(['motorway','trunk','primary'].includes(f.tags.highway)?7:['footway','path','steps'].includes(f.tags.highway)?1.5:4):2);const dx=(b[2]-a[2])/len*width/2,dz=-(b[0]-a[0])/len*width/2;roads.push(a[0]-dx,a[1],a[2]-dz,b[0]-dx,b[1],b[2]-dz,b[0]+dx,b[1],b[2]+dz,a[0]-dx,a[1],a[2]-dz,b[0]+dx,b[1],b[2]+dz,a[0]+dx,a[1],a[2]+dz);}
   if(roads.length/3+w.position.length/3>maxVertices)throw new Error('Rendered geometry budget exceeded; load a smaller area.');
   continue;
  }
  const d=detailMap.get(f.id),start=w.position.length/9;
  if(f.kind==='building'&&!d)throw new Error('Missing building detail '+f.id);
  for(const poly of f.geometry.coordinates){
   const rings=poly.map(r=>r.slice(0,-1).map(p=>frame.project(p[1],p[0]))),flat=rings.flat(),holes=[];let offset=rings[0].length;
   for(let i=1;i<rings.length;i++){holes.push(offset);offset+=rings[i].length;}
   const indices=earcut(flat.flatMap(p=>[p[0],p[2]]),holes,2);
   const roof=f.kind==='building'?d.height:.06;
   for(let i=0;i<indices.length;i+=3){let tri=[flat[indices[i]],flat[indices[i+1]],flat[indices[i+2]]].map(p=>[p[0],p[1]+roof,p[2]]);
    const cross=(tri[1][2]-tri[0][2])*(tri[2][0]-tri[0][0])-(tri[1][0]-tri[0][0])*(tri[2][2]-tri[0][2]);if(cross<0)[tri[1],tri[2]]=[tri[2],tri[1]];
    if(f.kind==='building')w.tri(tri,[0,1,0],tri.map(p=>[p[0],p[2]]),surfaceColor(f,d),d,f.height>0?1:0,0);
    else if(areas[f.kind])areas[f.kind].positions.push(...tri.flat());
   }
   if(f.kind!=='building')continue;
   if(d.minHeight>=d.height)continue;
   for(let k=0;k<rings.length;k++){
    const ring=rings[k];let area=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];area+=p[0]*q[2]-q[0]*p[2];}
    const sign=(area>0?1:-1)*(k===0?1:-1);
    for(let i=0;i<ring.length;i++){
     const p=ring[i],q=ring[(i+1)%ring.length],len=Math.hypot(q[0]-p[0],q[2]-p[2]);if(len<1e-4)continue;
     const a=[p[0],p[1]+d.minHeight,p[2]],b=[q[0],q[1]+d.minHeight,q[2]],c=[q[0],q[1]+d.height,q[2]],e=[p[0],p[1]+d.height,p[2]],n=[sign*(q[2]-p[2])/len,0,-sign*(q[0]-p[0])/len],col=surfaceColor(f,d);
     w.tri([a,b,c],n,[[0,d.minHeight],[len,d.minHeight],[len,d.height]],col,d,f.height>0?1:0,1);w.tri([a,c,e],n,[[0,d.minHeight],[len,d.height],[0,d.height]],col,d,f.height>0?1:0,1);
    }
   }
  }
  if(f.kind==='building')w.ranges.push({first:start,count:w.position.length/9-start,feature:f,detail:d});
  if((w.position.length+roads.length+areas.water.positions.length+areas.green.positions.length)/3>maxVertices)throw new Error('Rendered geometry budget exceeded; load a smaller area.');
 }
 return {buildings:w.finish(),roads:new Float32Array(roads),water:new Float32Array(areas.water.positions),green:new Float32Array(areas.green.positions)};
}
/** Source identity, not arrival order, controls deduplication across tile edges. */
export function mergeTiles(tiles){
 const features=new Map(),details=new Map();
 for(const t of [...tiles].sort((a,b)=>a.descriptor.tile.key.localeCompare(b.descriptor.tile.key))){
  const byId=new Map(t.details.map(d=>[d.id,d]));
  for(const f of t.descriptor.features){const old=features.get(f.id);if(!old||(f.source.version||0)>(old.source.version||0)){features.set(f.id,f);const d=byId.get(f.id);if(d)details.set(f.id,d);else details.delete(f.id);}}
 }
 return {features:[...features.values()].sort((a,b)=>a.id.localeCompare(b.id)),details:[...details.values()]};
}
export function tileFrame(descriptor){return localFrame(descriptor.tile.lat,descriptor.tile.lon);}
