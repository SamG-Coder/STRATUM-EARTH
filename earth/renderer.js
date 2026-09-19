import * as THREE from 'three';
import {attribute,uniform,vec3,vec2,float,fract,abs,smoothstep,mix,fwidth} from 'three/tsl';
import {localFrame,toECEF,fromECEF,WGS84,B,intersectEllipsoid,moveOnSurface,clamp} from './geodesy.js';
import {makeGeometry,mergeTiles} from './geometry.js';
import {neighbors} from './tiles.js';
import {overviewCanvas} from './overview.js';
import {throwIfAborted} from './provider.js';
import {probeWebGPUPresentation} from './render-device.js';
const rad=Math.PI/180;
const v3=a=>new THREE.Vector3(...a);
function frameMatrix(from,to){const r=to.axes.map(a=>from.axes.map(b=>a.reduce((n,v,i)=>n+v*b[i],0))),p=to.projectECEF(from.origin);return new THREE.Matrix4().set(r[0][0],r[0][1],r[0][2],p[0],r[1][0],r[1][1],r[1][2],p[1],r[2][0],r[2][1],r[2][2],p[2],0,0,0,1);}
function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data,3));g.computeVertexNormals();g.computeBoundingSphere();return g;}
function disposeObject(root){root?.traverse(o=>{o.geometry?.dispose();});root?.removeFromParent();}
export class EarthRenderer {
 constructor(canvas,{onView=()=>{},onPick=()=>{},onError=console.error}={}){
  Object.assign(this,{canvas,onView,onPick,onError});this.view={lat:-22,lon:130,distance:14000000,bearing:0,pitch:80};this.targetView=null;this.frame=localFrame(this.view.lat,this.view.lon);this.tiles=new Map();this.active=null;this.controls=new Set();this.drag=null;this.last=0;this.flightSpeed=1;this.motion={east:0,north:0};this.needsSurface=true;this.disposed=false;this.provenance=uniform(0);this.drawCount=0;
 }
 async init(){
  const options={canvas:this.canvas,antialias:true,alpha:false};
  this.presentation=await probeWebGPUPresentation();
  if(!this.presentation.ok){options.forceWebGL=true;console.warn('WebGPU canvas unavailable; using WebGL2 rendering. CUDA compute is checked separately.',this.presentation.reason);}
  else try{this.gpu=navigator.gpu;this.adapter=await this.gpu.requestAdapter({powerPreference:'high-performance'});if(!this.adapter)throw new Error('No WebGPU adapter');this.device=await this.adapter.requestDevice();options.device=this.device;}catch(error){options.forceWebGL=true;this.presentation={ok:false,reason:error.message};}
  this.renderer=new THREE.WebGPURenderer(options);await this.renderer.init();this.backend=this.renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2 fallback';
  const lost=this.renderer.onDeviceLost.bind(this.renderer);this.renderer.onDeviceLost=info=>{lost(info);if(!this.disposed){this.renderFailure=new Error('Render device lost: '+info.message);this.onError(this.renderFailure);}};
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.toneMapping=THREE.AgXToneMapping;this.renderer.toneMappingExposure=1.35;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#08121c');this.camera=new THREE.PerspectiveCamera(48,1,1,50000000);
  this.scene.add(new THREE.HemisphereLight('#c4e5ee','#273628',3));this.sun=new THREE.DirectionalLight('#fff0d3',3);this.sun.position.set(-5000,8000,4000);this.scene.add(this.sun);
  this.buildingMaterial=this.facadeMaterial();
  this.materials={roads:new THREE.MeshStandardMaterial({color:'#b7b7a5',roughness:1,side:THREE.DoubleSide}),water:new THREE.MeshStandardMaterial({color:'#33718a',roughness:.35,metalness:.25,side:THREE.DoubleSide}),green:new THREE.MeshStandardMaterial({color:'#517452',roughness:1,side:THREE.DoubleSide})};
  const p=[],normals=[],uvs=[],indices=[],w=192,h=96;
  for(let y=0;y<=h;y++)for(let x=0;x<=w;x++){const lat=90-y/h*180,lon=x/w*360-180;p.push(...toECEF(lat,lon).map(v=>v/WGS84.a));normals.push(Math.cos(lat*rad)*Math.cos(lon*rad),Math.cos(lat*rad)*Math.sin(lon*rad),Math.sin(lat*rad));uvs.push(x/w,1-y/h);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=y*(w+1)+x,b=a+w+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);
  const mat=new THREE.MeshStandardMaterial({color:'#a4bcbb',roughness:.95,side:THREE.DoubleSide});this.globe=new THREE.Mesh(g,mat);this.globe.matrixAutoUpdate=false;this.globe.frustumCulled=false;this.scene.add(this.globe);
  try{this.map=new THREE.CanvasTexture(await overviewCanvas());this.map.colorSpace=THREE.SRGBColorSpace;mat.map=this.map;mat.needsUpdate=true;}catch(e){this.onError(e);}
  this.marker=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),new THREE.MeshBasicMaterial({color:'#a1f0d4'}));this.scene.add(this.marker);
  this.bindControls();this.resize();this.updateView();this.renderer.render(this.scene,this.camera);await this.renderer.waitForGPU();if(this.renderFailure)throw this.renderFailure;this.renderer.setAnimationLoop(now=>this.tick(now));return this;
 }
 facadeMaterial(){
  const material=new THREE.MeshStandardNodeMaterial({roughness:.78,side:THREE.DoubleSide});
  const spacing=attribute('detail','vec2'),uv=attribute('uv','vec2').div(spacing),aa=fwidth(uv).mul(.75).add(.002),cell=abs(fract(uv).sub(.5));
  const window=float(1).sub(smoothstep(float(.28).sub(aa.x),float(.28).add(aa.x),cell.x)).mul(float(1).sub(smoothstep(float(.31).sub(aa.y),float(.31).add(aa.y),cell.y))).mul(attribute('faceKind','float'));
  const base=attribute('color','vec3'),facade=mix(base,vec3(.055,.16,.2),window);
  const source=mix(vec3(.7,.37,.09),vec3(.12,.68,.55),attribute('known','float'));
  material.colorNode=mix(facade,source,this.provenance);material.roughnessNode=mix(float(.82),float(.23),window);material.metalnessNode=window.mul(.18);return material;
 }
 resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
 bindControls(){
  const c=this.canvas;this.abortListeners=new AbortController();const options={signal:this.abortListeners.signal};
  c.addEventListener('contextmenu',e=>e.preventDefault(),options);
  c.addEventListener('pointerdown',e=>{if(e.button>2)return;c.focus();c.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button};this.targetView=null;},options);
  c.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;
    if(e.shiftKey||this.drag.button===2||this.view.distance>100000){this.pan(-dx*this.view.distance*.0015,dy*this.view.distance*.0015);}
    else{this.view.bearing-=dx*.35;this.view.pitch=clamp(this.view.pitch+dy*.25,7,89.9);this.updateView();}
  },options);
  c.addEventListener('pointerup',e=>{if(this.drag&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<5)this.pick(e);this.drag=null;},options);
  c.addEventListener('pointercancel',()=>this.drag=null,options);
  c.addEventListener('wheel',e=>{e.preventDefault();this.targetView=null;
    if(this.controls.has('ShiftLeft')||this.controls.has('ShiftRight'))this.flightSpeed=clamp(this.flightSpeed*Math.exp(-e.deltaY*.002),.1,64);
    else{this.view.distance=clamp(this.view.distance*Math.exp(e.deltaY*.0015),8,26000000);this.updateView();}
  },{...options,passive:false});
  c.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();this.controls.add(e.code);this.targetView=null;}},options);
  c.addEventListener('keyup',e=>this.controls.delete(e.code),options);c.addEventListener('blur',()=>this.controls.clear(),options);
  window.addEventListener('resize',()=>this.resize(),options);
 }
 pan(east,north){const b=this.view.bearing*rad,p=moveOnSurface(this.view.lat,this.view.lon,east*Math.cos(b)+north*Math.sin(b),north*Math.cos(b)-east*Math.sin(b));this.view.lat=p.lat;this.view.lon=p.lon;this.updateView();}
 goTo(lat,lon,distance=1600,{animate=true}={}){const p=localFrame(lat,lon);this.targetView=animate?{lat:p.lat,lon:p.lon,distance,pitch:distance>100000?80:53,bearing:-25}:null;if(!animate){Object.assign(this.view,{lat:p.lat,lon:p.lon,distance,pitch:distance>100000?80:53,bearing:-25});this.updateView();}}
 updateView(){
  this.frame=localFrame(this.view.lat,this.view.lon);const {distance:d,bearing,pitch}=this.view,b=bearing*rad,p=pitch*rad;
  this.camera.position.set(Math.sin(b)*Math.cos(p)*d,Math.sin(p)*d,Math.cos(b)*Math.cos(p)*d);this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);this.camera.near=clamp(d/10000,.15,3000);this.camera.far=d>18000?d+WGS84.a*3:Math.max(20000,d*12);this.camera.updateProjectionMatrix();
  const axes=this.frame.axes,o=this.frame.projectECEF([0,0,0]),a=WGS84.a;
  this.globe.matrix.set(axes[0][0]*a,axes[0][1]*a,axes[0][2]*a,o[0],axes[1][0]*a,axes[1][1]*a,axes[1][2]*a,o[1],axes[2][0]*a,axes[2][1]*a,axes[2][2]*a,o[2],0,0,0,1);this.globe.matrixWorldNeedsUpdate=true;this.globe.visible=d>18000;
  if(this.active){this.active.matrix.copy(frameMatrix(this.active.userData.frame,this.frame));this.active.matrixWorldNeedsUpdate=true;this.active.visible=d<200000;}
  this.marker.position.set(0,Math.max(.3,d*.0002),0);this.marker.scale.setScalar(Math.max(.4,d*.003));this.marker.visible=d>3000;
  this.updateSurface();this.onView({...this.view});
 }
 updateSurface(){
  const d=this.view.distance;if(d>40000){if(this.surface)this.surface.visible=false;return;}
  const extent=2**Math.ceil(Math.log2(Math.max(10000,d*6))),step=extent/24;
  if(this.surface && this.surface.userData.frame && this.surface.userData.extent===extent && Math.hypot(...this.frame.projectECEF(this.surface.userData.frame.origin))<250){this.surface.visible=true;this.surface.matrix.copy(frameMatrix(this.surface.userData.frame,this.frame));this.surface.matrixWorldNeedsUpdate=true;return;}
  disposeObject(this.surface);const points=[],n=48;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const quad=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([i,j])=>{const g=this.frame.unproject([(i-n/2)*step,0,(j-n/2)*step]);return this.frame.project(g.lat,g.lon,-.5);});points.push(...quad[0],...quad[2],...quad[1],...quad[0],...quad[3],...quad[2]);
  }
  this.surfaceMaterial??=new THREE.MeshStandardMaterial({color:'#283b3e',roughness:1,side:THREE.DoubleSide});this.surface=new THREE.Mesh(geometry(new Float32Array(points)),this.surfaceMaterial);this.surface.userData={frame:this.frame,extent};this.surface.matrixAutoUpdate=false;this.surface.frustumCulled=false;this.scene.add(this.surface);
 }
 tick(now){if(this.disposed||this.renderFailure)return;const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.targetView){const t=this.targetView,k=1-Math.exp(-dt*5),diff=((t.lon-this.view.lon+540)%360)-180;this.view.lat+=(t.lat-this.view.lat)*k;this.view.lon+=diff*k;this.view.distance=Math.exp(Math.log(this.view.distance)+(Math.log(t.distance)-Math.log(this.view.distance))*k);this.view.pitch+=(t.pitch-this.view.pitch)*k;this.view.bearing+=(t.bearing-this.view.bearing)*k;
    if(Math.abs(diff)<1e-6&&Math.abs(t.lat-this.view.lat)<1e-6&&Math.abs(t.distance-this.view.distance)<.5){Object.assign(this.view,t);this.targetView=null;}this.updateView();}
  if(this.controls.size){const boost=this.controls.has('ShiftLeft')||this.controls.has('ShiftRight')?4:1,base=Math.max(12,Math.pow(Math.max(8,this.view.distance),.82)*1.45),speed=base*dt*boost*this.flightSpeed,has=k=>Number(this.controls.has(k));const east=(has('KeyD')-has('KeyA'))*speed,north=(has('KeyW')-has('KeyS'))*speed;this.motion={east:east/Math.max(dt,.001),north:north/Math.max(dt,.001)};if(east||north)this.pan(east,north);const vertical=has('KeyE')+has('Space')-has('KeyQ')-has('ControlLeft')-has('ControlRight');if(vertical){this.view.distance=clamp(this.view.distance+vertical*speed,8,26000000);this.updateView();}}else this.motion={east:0,north:0};
  try{this.renderer.render(this.scene,this.camera);this.drawCount++;}catch(e){this.renderer.setAnimationLoop(null);this.onError(e);}
 }
 async prepare(areas,{signal,focus:requestedFocus}={}){
  throwIfAborted(signal);const tiles=new Map(this.tiles);for(const a of areas)tiles.set(a.descriptor.tile.key,a);
  const focus=requestedFocus||areas.at(-1)?.descriptor.tile;if(!focus)throw new Error('No geographic areas to display');
  const origin=toECEF(focus.lat,focus.lon);const distance=a=>Math.hypot(...toECEF(a.descriptor.tile.lat,a.descriptor.tile.lon).map((v,i)=>v-origin[i]));
  const localKeys=new Set(neighbors(focus).map(t=>t.key));
  const kept=[...tiles.values()].filter(a=>localKeys.has(a.descriptor.tile.key)).sort((a,b)=>distance(a)-distance(b)).slice(0,9);const merged=mergeTiles(kept),frame=localFrame(focus.lat,focus.lon);
  if(merged.features.length>20000)throw new Error('Resident feature budget exceeded; load fewer adjacent tiles.');
  await new Promise(r=>setTimeout(r,0));throwIfAborted(signal);
  const data=makeGeometry(merged.features,merged.details,frame),root=new THREE.Group();root.matrixAutoUpdate=false;root.userData={frame,tiles:new Map(kept.map(a=>[a.descriptor.tile.key,a])),...merged,areas:kept};
  try{
    if(data.buildings.position.length){const b=data.buildings,g=new THREE.BufferGeometry();for(const [name,size] of [['position',3],['normal',3],['uv',2],['color',3],['detail',2],['known',1]])g.setAttribute(name,new THREE.BufferAttribute(b[name],size));g.setAttribute('faceKind',new THREE.BufferAttribute(b.face,1));g.computeBoundingSphere();const mesh=new THREE.Mesh(g,this.buildingMaterial);mesh.userData.ranges=b.ranges;root.add(mesh);}
    for(const name of ['roads','water','green'])if(data[name].length)root.add(new THREE.Mesh(geometry(data[name]),this.materials[name]));
    throwIfAborted(signal);return root;
  }catch(e){disposeObject(root);throw e;}
 }
 commit(root){const old=this.active;this.tiles=root.userData.tiles;this.active=root;this.scene.add(root);this.updateView();disposeObject(old);}
 discard(root){disposeObject(root);}
 pick(event){const rect=this.canvas.getBoundingClientRect(),p=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(p,this.camera);
  if(this.active){const hits=ray.intersectObject(this.active,true);for(const hit of hits){const range=hit.object.userData.ranges?.find(r=>hit.faceIndex>=r.first&&hit.faceIndex<r.first+r.count);if(range){this.onPick(range);return;}}}
  const o=this.frame.origin.map((v,i)=>v+this.frame.directionToECEF(ray.ray.origin.toArray())[i]),dir=this.frame.directionToECEF(ray.ray.direction.toArray()),hit=intersectEllipsoid(o,dir);
  if(hit){const g=fromECEF(hit);this.onPick({location:g});}
 }
 setProvenance(on){this.provenance.value=on?1:0;}
 dispose(){this.disposed=true;this.renderer.setAnimationLoop(null);this.abortListeners.abort();disposeObject(this.active);disposeObject(this.surface);this.globe.geometry.dispose();this.globe.material.dispose();this.marker.geometry.dispose();this.marker.material.dispose();this.map?.dispose();this.buildingMaterial.dispose();this.surfaceMaterial?.dispose();Object.values(this.materials).forEach(m=>m.dispose());this.renderer.dispose();this.device?.destroy();}
}
