import {location, longitude} from './geodesy.js';
/** Geographic quadtree: 2 x 1 roots, covers poles and dateline. NOT Web Mercator.
 * z=15 cells span 0.005493 degrees, at most ~612 m wide at the equator.
 */
export const DETAIL_ZOOM = 15;
export function tile(z, x, y) {
  if (!Number.isInteger(z) || z < 0 || z > 20) throw new RangeError('Tile zoom must be 0..20.');
  const ny=2**z, nx=ny*2;
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= ny) throw new RangeError('Invalid tile coordinates.');
  x=((x%nx)+nx)%nx;
  const step=180/ny, west=-180+x*step, north=90-y*step;
  return Object.freeze({z,x,y,key:`g/${z}/${x}/${y}`,west,east:west+step,south:north-step,north,lat:north-step/2,lon:west+step/2});
}
export function tileAt(lat, lon, z=DETAIL_ZOOM) {
  const p=location(lat,lon), ny=2**z, step=180/ny;
  return tile(z, Math.floor((longitude(p.lon)+180)/step), Math.min(ny-1,Math.floor((90-p.lat)/step)));
}
export function neighbors(t, radius=1) {
  if (!Number.isInteger(radius) || radius<0 || radius>2) throw new RangeError('Neighborhood radius must be 0..2.');
  const result=new Map();
  for(let y=t.y-radius;y<=t.y+radius;y++) for(let x=t.x-radius;x<=t.x+radius;x++) {
    if(y<0 || y>=2**t.z) continue;
    const n=tile(t.z,x,y);result.set(n.key,n);
  }
  return [...result.values()].sort((a,b)=>(a.key===t.key?-1:b.key===t.key?1:Math.abs(a.y-t.y)-Math.abs(b.y-t.y)));
}
export function children(t) { return [tile(t.z+1,t.x*2,t.y*2),tile(t.z+1,t.x*2+1,t.y*2),tile(t.z+1,t.x*2,t.y*2+1),tile(t.z+1,t.x*2+1,t.y*2+1)]; }
export function validateTile(t) {
  const expected=tile(t.z,t.x,t.y);
  for(const k of ['key','west','east','south','north']) if(t[k]!==expected[k]) throw new Error('Tile bounds do not match its key.');
  return expected;
}
