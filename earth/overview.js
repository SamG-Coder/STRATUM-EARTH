/** Minimal TopoJSON polygon decoder for the pinned world-atlas Natural Earth land.
 * This small-scale overview is NEVER used as a building/road constraint.
 */
export function landPolygons(topology) {
 const tr=topology.transform,decoded=topology.arcs.map(a=>{let x=0,y=0;return a.map(p=>{x+=p[0];y+=p[1];return tr?[x*tr.scale[0]+tr.translate[0],y*tr.scale[1]+tr.translate[1]]:p;});});
 const ring=ids=>{const result=[];for(const id of ids){const a=id<0?[...decoded[~id]].reverse():decoded[id];if(result.length)result.pop();result.push(...a);}return result;};
 const result=[];
 function visit(g){if(g.type==='GeometryCollection')g.geometries.forEach(visit);else if(g.type==='Polygon')result.push(g.arcs.map(ring));else if(g.type==='MultiPolygon')for(const p of g.arcs)result.push(p.map(ring));}
 visit(topology.objects.land);return result;
}
export async function overviewCanvas(){
 const response=await fetch(new URL('../vendor/earth/land-110m.json',import.meta.url));if(!response.ok)throw new Error('Missing Natural Earth overview; run npm run build.');
 const polygons=landPolygons(await response.json()),canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const c=canvas.getContext('2d');
 c.fillStyle='#0c293b';c.fillRect(0,0,2048,1024);
 for(const poly of polygons){for(const shift of [-2048,0,2048]){c.beginPath();for(const r of poly){let prev=null;for(let i=0;i<r.length;i++){let x=(r[i][0]+180)/360*2048+shift;const y=(90-r[i][1])/180*1024;if(prev!==null){while(x-prev>1024)x-=2048;while(x-prev< -1024)x+=2048;}prev=x;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();}c.fillStyle='#54725f';c.fill('evenodd');c.strokeStyle='#8ea78b';c.lineWidth=.7;c.stroke();}}
 c.strokeStyle='#b9e0d61a';c.lineWidth=.8;
 for(let x=0;x<=2048;x+=2048/24){c.beginPath();c.moveTo(x,0);c.lineTo(x,1024);c.stroke();}
 for(let y=0;y<=1024;y+=1024/12){c.beginPath();c.moveTo(0,y);c.lineTo(2048,y);c.stroke();}
 return canvas;
}
