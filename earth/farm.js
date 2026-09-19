import {footprintMetrics} from './osm.js';
export const GRAMMAR_VERSION='earth-details-v1';
export const CANDIDATES=64;
export function hash32(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h;}
const step=x=>(Math.imul(x,1664525)+1013904223)>>>0;
export function targetsFor(feature){
  const m=footprintMetrics(feature),industrial=['industrial','warehouse','retail'].includes(feature.tags.building);
  const knownFloor=feature.height>0&&feature.levels>0?Math.round(feature.height/feature.levels*1000):null;
  return [industrial?5000:3400,Math.max(2700,Math.min(4200,knownFloor||3100)),industrial?140:170,Math.min(1000000,Math.max(2200,Math.round(m.perimeter/4*1000)))];
}
export function featureSeed(feature){return hash32(`${GRAMMAR_VERSION}|${feature.id}|${feature.source.version??0}`);}
/** Integer-only fitness, identical u32 arithmetic on CPU and in the CUDA kernel. */
export function candidate(seed,target,index){
  let s=step((seed^Math.imul(index+1,747796405))>>>0);
  let bay=2200+(s%39)*100;s=step(s);let storey=2700+(s%16)*100;s=step(s);let tone=70+(s%16)*10;
  if(index===0){bay=3400;storey=3100;tone=160;}
  const db=Math.trunc(Math.abs(bay-target[0])/100),dh=Math.trunc(Math.abs(storey-target[1])/100),dc=Math.trunc(Math.abs(tone-target[2])/4);
  const rem=target[3]%bay,edge=Math.trunc(Math.min(rem,bay-rem)/100);
  return [3*db*db+4*dh*dh+dc*dc+edge*edge,bay,storey,tone];
}
export function farmCPU(features,candidates=CANDIDATES){
  if(!Number.isInteger(candidates)||candidates<1||candidates>256)throw new RangeError('Candidate budget must be 1..256');
  return features.map(f=>{const t=targetsFor(f),seed=featureSeed(f);let best=candidate(seed,t,0),winner=0;for(let c=1;c<candidates;c++){const row=candidate(seed,t,c);if(row[0]<best[0]){best=row;winner=c;}}return detailFor(f,best,winner,candidates);});
}
export function detailFor(feature,row,winner,candidates){
  const taggedHeight=feature.height>0,storey=row[2]/1000;
  // Known height is copied EXACTLY. Levels-to-metres is explicitly estimated.
  const estimatedLevels=feature.levels||(['house','detached','bungalow'].includes(feature.tags.building)?2:feature.tags.building==='garage'?1:4);
  const height=taggedHeight?feature.height:estimatedLevels*storey;
  return {id:feature.id,seed:featureSeed(feature),grammar:GRAMMAR_VERSION,candidates,winner,score:row[0],bay:row[1]/1000,storey:feature.levels?height/feature.levels:storey,tone:row[3]/255,height,minHeight:feature.minHeight??0,
    provenance:{footprint:'source geometry',height:taggedHeight?'OSM height tag':feature.levels?'estimated from OSM levels':'procedural estimate (no height/levels)',facade:feature.tags['building:colour']?'tagged colour; generated windows':'procedural detail',roof:'flat extrusion; source roof tags retained, not reconstructed',ground:'WGS84 ellipsoid reference; terrain not loaded'}};
}
