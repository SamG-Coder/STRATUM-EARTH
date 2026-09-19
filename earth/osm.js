import {longitude, localFrame} from './geodesy.js';
export const DESCRIPTOR_VERSION='stratum.earth-tile.v1';
export const OSM_ATTRIBUTION='© OpenStreetMap contributors · ODbL';
const same=(a,b)=>a && b && a[0]===b[0] && a[1]===b[1];
const valid=p=>p && Number.isFinite(p.lat) && Math.abs(p.lat)<=90 && Number.isFinite(p.lon) && Math.abs(p.lon)<=180;
const coord=p=>[p.lon,p.lat];
export function meters(value) {
  if(typeof value!=='string' && typeof value!=='number') return null;
  const s=String(value).trim(); let n;
  const feet=/^(\d+(?:\.\d+)?)'(?:(\d+(?:\.\d+)?)")?$/.exec(s);
  if(feet) n=Number(feet[1])*0.3048+Number(feet[2]||0)*0.0254;
  else {const m=/^(\d+(?:\.\d+)?)\s*(m|metres|meters|ft|feet)?$/.exec(s);if(!m)return null;n=Number(m[1])*(['ft','feet'].includes(m[2])?0.3048:1);}
  return Number.isFinite(n) && n>=0 && n<=10000 ? n : null;
}
export function levels(value) {const s=String(value??'').trim();if(!/^\d+(?:\.\d+)?$/.test(s))return null;const n=Number(s);return n>0 && n<=250?n:null;}
function ring(points) {
  if (!points || points.length<4 || !same(points[0],points.at(-1))) return null;
  const clean=[]; for(const p of points) if(!same(clean.at(-1),p))clean.push(p);
  if(clean.length<4 || new Set(clean.slice(0,-1).map(p=>p.join(','))).size<3)return null;
  return clean;
}
/** Assemble relation member ways in either direction; never close missing segments. */
export function stitch(fragments) {
  const remaining=fragments.map(f=>f.slice()), rings=[];
  while(remaining.length) {
    let chain=remaining.shift(); let progress=true;
    while(!same(chain[0],chain.at(-1)) && progress) {
      progress=false;
      for(let i=0;i<remaining.length;i++) {
        let f=remaining[i];
        if(same(chain.at(-1),f[0]))chain.push(...f.slice(1));
        else if(same(chain.at(-1),f.at(-1)))chain.push(...f.slice(0,-1).reverse());
        else if(same(chain[0],f.at(-1)))chain.unshift(...f.slice(0,-1));
        else if(same(chain[0],f[0]))chain.unshift(...f.slice(1).reverse());
        else continue;
        remaining.splice(i,1);progress=true;break;
      }
    }
    const r=ring(chain);if(!r)throw new Error('Incomplete polygon ring');rings.push(r);
  }
  return rings;
}
export function contains(r, p) {
  // Unwrap around the tested point, including polygons crossing ±180 degrees.
  const px=p[0],py=p[1];let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++) {
    const xi=px+longitude(r[i][0]-px),xj=px+longitude(r[j][0]-px),yi=r[i][1],yj=r[j][1];
    if((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function classify(tags) {
  if(tags.building && tags.building!=='no')return 'building';
  if(tags.highway && tags.area!=='yes')return 'road';
  if(tags.natural==='water' || tags.waterway==='riverbank')return 'water';
  if(tags.leisure==='park'||['forest','grass','meadow','recreation_ground','orchard'].includes(tags.landuse)||['wood','scrub','grassland'].includes(tags.natural))return 'green';
  return null;
}
function geometryOf(el, ways) {
  if(el.type==='way') {
    if(!el.geometry?.every(valid))throw new Error('Missing or invalid way geometry');
    const points=el.geometry.map(coord);
    if(!el.tags?.building && el.tags?.highway && el.tags.area!=='yes')return {type:'LineString',coordinates:points};
    const r=ring(points);if(!r)throw new Error('Open area way');return {type:'MultiPolygon',coordinates:[[r]]};
  }
  if(el.type!=='relation'||el.tags?.type!=='multipolygon')throw new Error('Unsupported relation');
  const outers=[],inners=[];
  for(const m of el.members||[]) {
    if(m.type!=='way' || !['','outer','inner'].includes(m.role||''))continue;
    const g=m.geometry||ways.get(m.ref)?.geometry;
    if(!g?.every(valid)||g.length<2)throw new Error('Missing relation member geometry');
    (m.role==='inner'?inners:outers).push(g.map(coord));
  }
  const outer=stitch(outers),inner=stitch(inners);
  if(!outer.length)throw new Error('No outer rings');
  const result=outer.map(r=>[r]);
  for(const hole of inner){const idx=outer.findIndex(r=>contains(r,hole[0]));if(idx<0)throw new Error('Orphan inner ring');result[idx].push(hole);}
  return {type:'MultiPolygon',coordinates:result};
}
export function normalizeOSM(payload, t, {provider='overpass', fetchedAt=Date.now(), maxFeatures=12000,maxVertices=250000}={}) {
  if(!payload || !Array.isArray(payload.elements))throw new Error('Provider did not return Overpass JSON.');
  if(payload.remark)throw new Error('Incomplete Overpass response: '+String(payload.remark).slice(0,240));
  if(payload.elements.length>50000)throw new Error('Area response exceeds element budget.');
  const unique=new Map();for(const el of payload.elements){const k=el.type+'/'+el.id,old=unique.get(k);if(!old||(el.version||0)>(old.version||0))unique.set(k,el);}
  const elements=[...unique.values()];
  const ways=new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const features=[],warnings=[],claimed=new Set();let vertices=0;
  const ordered=[...elements.filter(e=>e.type==='relation'),...elements.filter(e=>e.type==='way')];
  for(const el of ordered) {
    const kind=classify(el.tags||{});if(!kind||claimed.has(el.id)&&el.type==='way')continue;
    if(!Number.isSafeInteger(el.id)||el.id<1)continue;
    try {
      const geometry=geometryOf(el,ways);
      const count=geometry.type==='LineString'?geometry.coordinates.length:geometry.coordinates.flat().reduce((n,r)=>n+r.length,0);
      if(count>20000)throw new Error('Feature exceeds vertex budget');
      if(features.length>=maxFeatures || vertices+count>maxVertices)throw new RangeError('Area geometry budget exceeded. Narrow the request.');
      vertices+=count;
      // A bounded whitelist avoids retaining user names / changeset metadata.
      const tags={};for(const key of ['name','building','highway','height','min_height','building:levels','building:min_level','building:material','building:colour','roof:shape','roof:height','roof:colour','width','lanes','surface','natural','landuse','leisure','waterway','layer','bridge','tunnel','source:height','height:accuracy','ele'])if(typeof el.tags?.[key]==='string')tags[key]=el.tags[key].slice(0,512);
      features.push({id:`osm/${el.type}/${el.id}`,kind,geometry,tags,source:{provider,osmType:el.type,osmId:el.id,version:el.version??null,timestamp:el.timestamp??null},height:meters(tags.height),levels:levels(tags['building:levels']),minHeight:meters(tags.min_height)});
      if(el.type==='relation')for(const m of el.members||[])if(m.type==='way')claimed.add(m.ref);
    } catch(e) {if(e instanceof RangeError)throw e;warnings.push(`${el.type}/${el.id}: ${e.message}`);}
  }
  features.sort((a,b)=>a.id.localeCompare(b.id));
  // No seed, inferred height or material can change these source coordinates.
  return {schema:DESCRIPTOR_VERSION,tile:{...t},source:{provider,fetchedAt,snapshot:payload.osm3s?.timestamp_osm_base??null,license:'ODbL-1.0',attribution:OSM_ATTRIBUTION},features,warnings,vertices};
}
export function footprintMetrics(feature) {
  if(feature.geometry.type!=='MultiPolygon')return {area:0,perimeter:0};
  const p=feature.geometry.coordinates[0][0][0],frame=localFrame(p[1],p[0]);let area=0,perimeter=0;
  for(const poly of feature.geometry.coordinates)for(let k=0;k<poly.length;k++) {
    const r=poly[k].map(v=>frame.project(v[1],v[0]));let a=0;
    for(let i=1;i<r.length;i++){a+=r[i-1][0]*r[i][2]-r[i][0]*r[i-1][2];if(!k)perimeter+=Math.hypot(r[i][0]-r[i-1][0],r[i][2]-r[i-1][2]);}
    area+=(k?-1:1)*Math.abs(a)/2;
  }
  return {area:Math.max(0,area),perimeter};
}
