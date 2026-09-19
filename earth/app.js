import {EarthRenderer} from './renderer.js';
import {TileCache} from './cache.js';
import {EarthProvider,SelectionController,throwIfAborted,OVERPASS_ENDPOINT} from './provider.js';
import {Normalizer} from './worker-client.js';
import {DetailFarmer} from './gpu-farm.js';
import {tileAt,neighbors} from './tiles.js';
const $=id=>document.getElementById(id),cache=new TileCache(),normalizer=new Normalizer(),farmer=new DetailFarmer();
let provider=new EarthProvider({cache}),renderer,selection,view,selectedLocation=null,ready=false,autoTimer,activeKey=null;
const fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
const size=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
const places={melbourne:[-37.8136,144.9631],newyork:[40.7484,-73.9857],tokyo:[35.6812,139.7671],paris:[48.8584,2.2945],rural:[-36.613,143.255]};
function log(message,type='info') {const row=document.createElement('div'),time=document.createElement('time'),text=document.createElement('span');row.className=type;time.textContent=new Date().toLocaleTimeString([], {hour12:false});text.textContent=message;row.append(time,text);$('events').prepend(row);while($('events').children.length>35)$('events').lastChild.remove();}
function status(phase,message){$('phase').textContent=phase.toUpperCase();$('status').textContent=message;$('status-light').className=phase==='error'?'error':phase==='ready'?'ready':'working';}
function updateView(v){view=v;document.body.classList.toggle('local-view',v.distance<20000);$('latitude').textContent=v.lat.toFixed(5)+'°';$('longitude').textContent=v.lon.toFixed(5)+'°';$('distance').textContent=v.distance>1000?(v.distance/1000).toFixed(1)+' km':v.distance.toFixed(0)+' m';const t=tileAt(v.lat,v.lon);$('tile-id').textContent=t.key;$('scale-name').textContent=v.distance>500000?'PLANETARY':v.distance>20000?'REGIONAL':v.distance>1200?'NEIGHBORHOOD':'LOCAL';
  clearTimeout(autoTimer);if(ready && $('automatic').checked && provider.automaticAllowed && v.distance<10000 && t.key!==activeKey)autoTimer=setTimeout(()=>loadArea(false),1100);
}
function navigate(lat,lon,distance=1600){selection?.cancel();selectedLocation=null;renderer.goTo(lat,lon,distance);$('coord-lat').value=Number(lat).toFixed(6);$('coord-lon').value=Number(lon).toFixed(6);log('Navigating to '+lat.toFixed(4)+', '+lon.toFixed(4)+'. Geography is not fabricated while waiting.');}
function showFeature(pick){
 if(pick.location){selectedLocation=pick.location;$('coord-lat').value=pick.location.lat.toFixed(6);$('coord-lon').value=pick.location.lon.toFixed(6);$('inspect-name').textContent='Selected globe position';$('inspect-id').textContent=`${pick.location.lat.toFixed(6)}, ${pick.location.lon.toFixed(6)}`;$('inspection').textContent='Use Go to descend to this location, then Load mapped area. Click a rendered building to inspect its source.';return;}
 const {feature:f,detail:d}=pick;$('inspect-name').textContent=f.tags.name||f.tags.building||'Mapped building';$('inspect-id').textContent=f.id;
 const rows=[['Footprint','OSM way/relation geometry'],['Height',d.height.toFixed(2)+' m · '+d.provenance.height],['Elevation','Not loaded · ellipsoid reference'],['Appearance',d.provenance.facade],['Roof',d.provenance.roof],['Source revision',String(f.source.version??'not supplied')],['Seed',String(d.seed)],['Candidates',String(d.candidates)],['Fitness',String(d.score)+' (lower is better)']];
 $('inspection').replaceChildren(...rows.map(([k,v])=>{const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('strong');a.textContent=k;b.textContent=v;row.append(a,b);return row;}));
 const link=document.createElement('a');link.href=`https://www.openstreetmap.org/${f.source.osmType}/${f.source.osmId}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View source object ↗';$('inspection').append(link);
}
function updateStats(){const a=renderer.active?.userData,buildings=a?.features.filter(f=>f.kind==='building')||[],known=buildings.filter(f=>f.height>0).length;$('building-count').textContent=fmt(buildings.length);$('known-count').textContent=fmt(known)+' / '+fmt(buildings.length);$('active-count').textContent=String(renderer.tiles.size)+' / 9';$('download-count').textContent=size(provider.stats.bytes);$('cache-count').textContent=fmt(provider.stats.cacheHits)+' · '+cache.mode;$('farm-mode').textContent=farmer.mode;$('candidate-count').textContent=fmt(buildings.length*64);$('renderer-mode').textContent=renderer.backend;
 $('provenance-note').textContent=buildings.length?`${known} buildings have tagged heights. ${buildings.length-known} use explicitly estimated heights. Footprints are never seed-farmed.`:'No local geometry loaded. The globe is a generalized Natural Earth overview, not detailed terrain.';
}
async function loadArea(manual=true){
 if(!ready)return;
 if(!manual && !provider.automaticAllowed)return;
 if(view.distance>20000){status('ready','Descend to a neighborhood before loading detailed geography.');log('Detail load paused at regional/orbit scale.','warn');return;}
 const t=tileAt(view.lat,view.lon);if(!manual&&t.key===activeKey)return;const batch=provider.automaticAllowed?neighbors(t):[t];
 const result=await selection.select({tile:t,tiles:batch,provider},{manual});
 if(result.status==='ready'){activeKey=t.key;updateStats();const source=result.value.areas[0].descriptor.source;$('source-time').textContent=source.snapshot||'snapshot timestamp not supplied';log(`Ready: ${renderer.active.userData.features.length} mapped features. Detail-farm pipeline reused.`,'success');}
 else if(result.status==='error')log(result.error.message,'error');
}
function download(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function start(){try{
 status('starting','Initializing the globe renderer…');
 renderer=new EarthRenderer($('earth-canvas'),{onView:updateView,onPick:showFeature,onError:e=>{status('error',e.message);log(e.message,'error');}});await renderer.init();
 selection=new SelectionController({
  async load(request,{signal,manual}){const areas=[];
   for(let i=0;i<request.tiles.length;i++){
    const tile=request.tiles[i];status('loading',`Geographic data ${i+1}/${request.tiles.length} · ${tile.key}`);
    const raw=await request.provider.load(tile,{signal,manual});throwIfAborted(signal);log(`${tile.key} · ${raw.cache==='hit'?'cache':'network'} · ${size(raw.bytes)}`);
    const descriptor=await normalizer.normalize(raw.payload,tile,{provider:raw.provider,fetchedAt:raw.fetchedAt},signal);throwIfAborted(signal);
    const buildings=descriptor.features.filter(f=>f.kind==='building');status('generating',`Seed-farming visual detail for ${fmt(buildings.length)} mapped footprints…`);
    const started=performance.now(),details=await farmer.farm(buildings,{signal});throwIfAborted(signal);
    log(`${fmt(buildings.length*64)} candidates · ${farmer.mode} · ${(performance.now()-started).toFixed(0)} ms`);
    if(descriptor.warnings.length)log(`${descriptor.warnings.length} unsupported/incomplete features skipped; see descriptor export.`,'warn');
    areas.push({descriptor,details});
   }return {areas,focus:request.tile};
  },
  prepare:(value,{signal})=>renderer.prepare(value.areas,{signal,focus:value.focus}),
  commit:root=>renderer.commit(root),discard:root=>renderer.discard(root),
  onState:s=>{ $('cancel-load').hidden=!['loading','generating'].includes(s.phase);if(s.phase==='ready')status('ready','Mapped geometry loaded. Generated appearance is labelled.');if(s.phase==='error')status('error',s.error.message+' Previous area retained.');if(s.phase==='idle')status('ready','Request cancelled; previous area retained.');}
 });
 ready=true;$('load-area').disabled=false;$('go').disabled=false;status('ready','Choose a location, descend, and load its mapped geography.');updateStats();log('Earth coordinate system ready · WGS84 ellipsoid · metres.','success');
 window.stratumEarth={renderer,farmer,cache,normalizer,get provider(){return provider;},selection,loadArea,navigate,stats:()=>({backend:renderer.backend,farm:farmer.mode,frames:renderer.drawCount,tiles:renderer.tiles.size,features:renderer.active?.userData.features.length||0,network:{...provider.stats}})};
 const query=new URLSearchParams(location.search);if(query.has('lat')&&query.has('lon')){const lat=Number(query.get('lat')),lon=Number(query.get('lon'));if(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon))navigate(lat,lon,1600);}
}catch(e){status('error',e.message);log(e.stack||e.message,'error');$('startup-help').hidden=false;}}
for(const b of document.querySelectorAll('[data-place]'))b.onclick=()=>{if(ready)navigate(...places[b.dataset.place]);};
$('globe').onclick=()=>{if(ready){selection.cancel();renderer.goTo(view.lat,view.lon,14000000);}};
$('coordinates').onsubmit=e=>{e.preventDefault();if(!ready)return;try{const lat=Number($('coord-lat').value),lon=Number($('coord-lon').value);if(!$('coord-lat').value.trim()||!$('coord-lon').value.trim()||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw new Error('Latitude must be -90..90 and longitude -180..180.');navigate(lat,lon);const url=new URL(location.href);url.searchParams.set('lat',lat);url.searchParams.set('lon',lon);history.replaceState(null,'',url);}catch(e){status('error',e.message);}};
$('load-area').onclick=()=>loadArea(true);$('cancel-load').onclick=()=>selection?.cancel();
$('provider-form').onsubmit=e=>{e.preventDefault();try{selection?.cancel();const endpoint=$('provider-url').value.trim(),kind=$('provider-kind').value;const next=new EarthProvider({endpoint,kind,cache,minInterval:kind==='tiles'?100:3000});provider=next;activeKey=null;$('automatic').checked=false;$('automatic').disabled=!next.automaticAllowed;$('provider-note').textContent=next.automaticAllowed?'Your tile endpoint must serve Overpass geometry JSON on the geographic g/z/x/y grid. Automatic visible-neighborhood streaming is available.':'Public Overpass: explicit neighborhood requests only. No bulk download, background crawl, endpoint hopping or unlimited streaming.';status('ready','Provider updated.');log('Provider set to '+kind+' · '+new URL(endpoint).host);}catch(error){status('error',error.message);}};
$('provider-url').value=OVERPASS_ENDPOINT;
$('automatic').onchange=()=>{if($('automatic').checked)loadArea(false);};
$('source-colors').onchange=e=>renderer?.setProvenance(e.target.checked);
$('clear-cache').onclick=async()=>{await cache.clear();log('Local geographic cache cleared.');updateStats();};
$('export-area').onclick=()=>{if(renderer?.active)download({schema:'stratum.earth-export.v1',license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',notice:'Source geometry and generated details are separate. No terrain elevation or landmark reconstruction.',areas:renderer.active.userData.areas},'stratum-earth-area.json');};
$('toggle-panel').onclick=()=>$('panel').classList.toggle('closed');
start();
