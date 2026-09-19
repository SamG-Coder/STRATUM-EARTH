/** WGS84 coordinates in metres. All absolute-coordinate arithmetic stays in JS f64. */
export const A=6378137, F=1/298.257223563, B=A*(1-F), E2=F*(2-F), DEG=Math.PI/180;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const wrapLon=v=>((v+180)%360+360)%360-180;
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const norm=a=>scale(a,1/Math.hypot(...a));
export function location(lat,lon,height=0){
 if(![lat,lon,height].every(Number.isFinite)||Math.abs(lat)>90||height< -12000||height>1e9)throw Error('Invalid latitude, longitude or height.');
 return {lat,lon:wrapLon(lon),height};
}
export function toECEF(lat,lon,h=0){
 location(lat,lon,h);const p=lat*DEG,l=lon*DEG,s=Math.sin(p),c=Math.cos(p),n=A/Math.sqrt(1-E2*s*s);
 return [(n+h)*c*Math.cos(l),(n+h)*c*Math.sin(l),(n*(1-E2)+h)*s];
}
export function fromECEF([x,y,z]){
 if(![x,y,z].every(Number.isFinite))throw Error('Invalid ECEF coordinate.');const r=Math.hypot(x,y);
 if(r<1e-8){if(Math.abs(z)<1)throw Error('Earth centre has no geodetic location.');return {lat:z>0?90:-90,lon:0,height:Math.abs(z)-B};}
 let p=Math.atan2(z,r*(1-E2));for(let i=0;i<8;i++){const n=A/Math.sqrt(1-E2*Math.sin(p)**2);p=Math.atan2(z+E2*n*Math.sin(p),r);}
 const n=A/Math.sqrt(1-E2*Math.sin(p)**2),h=Math.abs(Math.cos(p))>.01?r/Math.cos(p)-n:z/Math.sin(p)-n*(1-E2);
 return {lat:p/DEG,lon:wrapLon(Math.atan2(y,x)/DEG),height:h};
}
export function frameAt(lat,lon){
 const p=lat*DEG,l=lon*DEG;return {lat,lon:wrapLon(lon),origin:toECEF(lat,lon),east:[-Math.sin(l),Math.cos(l),0],up:[Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)],north:[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)]};
}
export function toLocal(f,lat,lon,h=0){const p=toECEF(lat,lon,h).map((v,i)=>v-f.origin[i]);return [dot(p,f.east),dot(p,f.up),dot(p,f.north)];}
export function localToECEF(f,[x,y,z]){return f.origin.map((v,i)=>v+f.east[i]*x+f.up[i]*y+f.north[i]*z);}
export const localToGeo=(f,p)=>fromECEF(localToECEF(f,p));
export const directionToECEF=(f,[x,y,z])=>f.east.map((v,i)=>v*x+f.up[i]*y+f.north[i]*z);
export function moveGeodetic(lat,lon,east,north){return localToGeo(frameAt(lat,lon),[east,0,north]);}
export function mercator(lat,lon,z){
 if(!Number.isInteger(z)||z<0||z>22)throw Error('Invalid geographic tile level.');const n=2**z,p=clamp(lat,-85.05112878,85.05112878)*DEG;
 return {x:(wrapLon(lon)+180)/360*n,y:clamp((1-Math.asinh(Math.tan(p))/Math.PI)/2*n,0,n-1e-9),z};
}
export function tileBounds(z,x,y){const n=2**z,lat=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/n)))/DEG;return {west:x/n*360-180,east:(x+1)/n*360-180,north:lat(y),south:lat(y+1)};}
export function queryBounds(lat,lon,radius){
 location(lat,lon);if(radius<10||radius>1500)throw Error('Vector preview radius must be 10..1500 metres.');
 const dlat=radius/110574,dlon=radius/(111320*Math.max(.01,Math.cos(lat*DEG))),s=clamp(lat-dlat,-90,90),n=clamp(lat+dlat,-90,90),w=wrapLon(lon)-dlon,e=wrapLon(lon)+dlon;
 if(w< -180)return [[s,w+360,n,180],[s,-180,n,e]];
 if(e>180)return [[s,w,n,180],[s,-180,n,e-360]];
 return [[s,w,n,e]];
}
/** Positive ray parameter against the ellipsoid. CPU picking only; no mesh generated. */
export function intersectEarth(ro,rd){
 const o=[ro[0]/A,ro[1]/A,ro[2]/B],d=[rd[0]/A,rd[1]/A,rd[2]/B],a=dot(d,d),b=dot(o,d),c=dot(o,o)-1,disc=b*b-a*c;
 if(disc<0)return null;const q=-b-Math.sign(b||1)*Math.sqrt(disc),roots=[q/a,c/q].filter(v=>v>0&&Number.isFinite(v));return roots.length?Math.min(...roots):null;
}
