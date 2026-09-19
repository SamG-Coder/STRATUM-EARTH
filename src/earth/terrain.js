import {frameAt,localToGeo,toLocal,clamp} from './geodesy.js';
export const TERRAIN_SIZE=129,TERRAIN_HEADER=16;
export function createTerrain(lat,lon,radius,sample,{valid=true,zoom=-1}={}){
 const frame=frameAt(lat,lon),n=TERRAIN_SIZE,a=new Float32Array(TERRAIN_HEADER+n*n);a[0]=n;a[1]=radius;a[2]=2*radius/(n-1);a[3]=valid?1:0;let lo=Infinity,hi=-Infinity,missing=0;
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){const east=(x/(n-1)*2-1)*radius,north=(z/(n-1)*2-1)*radius,g=localToGeo(frame,[east,0,north]),raw=sample(g.lat,g.lon);if(raw===null||!Number.isFinite(raw)){missing++;a[TERRAIN_HEADER+z*n+x]=NaN;continue;}const h=toLocal(frame,g.lat,g.lon,raw)[1];a[TERRAIN_HEADER+z*n+x]=h;lo=Math.min(lo,h);hi=Math.max(hi,h);}
 if(missing)throw Error(`Terrain coverage incomplete (${missing} samples); the previous patch was retained.`);a[4]=lo;a[5]=hi;a[6]=lat;a[7]=lon;a[8]=zoom;
 return {buffer:a,frame,radius,zoom,heightAt:(x,z)=>sampleTerrain(a,x,z),valid};
}
export function sampleTerrain(a,x,z){const n=a[0],r=a[1],u=clamp((x+r)/(2*r)*(n-1),0,n-1),v=clamp((z+r)/(2*r)*(n-1),0,n-1),ix=Math.min(n-2,Math.floor(u)),iz=Math.min(n-2,Math.floor(v)),fx=u-ix,fz=v-iz,b=16+iz*n+ix;return (a[b]*(1-fx)+a[b+1]*fx)*(1-fz)+(a[b+n]*(1-fx)+a[b+n+1]*fx)*fz;}
