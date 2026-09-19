/** WGS84 metres, double precision on the CPU; camera-local metres on the GPU.
 * Axis convention: geocentric X at (0,0), Y at (0,90), Z at north pole.
 * Render frame: +X east, +Y geodetic up, -Z north. No fictitious spherical radius.
 */
export const WGS84 = Object.freeze({a: 6378137, f: 1 / 298.257223563});
export const B = WGS84.a * (1 - WGS84.f);
export const E2 = WGS84.f * (2 - WGS84.f);
const R = Math.PI / 180;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function longitude(lon) {
  if (!Number.isFinite(lon)) throw new TypeError('Longitude must be finite.');
  return ((lon + 180) % 360 + 360) % 360 - 180;
}
export function location(lat, lon, height = 0) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(height)) throw new RangeError('Invalid WGS84 location.');
  return {lat, lon: longitude(lon), height};
}
export function toECEF(lat, lon, height = 0) {
  const p = location(lat, lon, height), phi = p.lat * R, lam = p.lon * R;
  const s = Math.sin(phi), c = Math.cos(phi), n = WGS84.a / Math.sqrt(1 - E2 * s * s);
  return [(n + height) * c * Math.cos(lam), (n + height) * c * Math.sin(lam), (n * (1 - E2) + height) * s];
}
export function fromECEF([x, y, z]) {
  if (![x, y, z].every(Number.isFinite)) throw new TypeError('Invalid ECEF vector.');
  const p = Math.hypot(x, y);
  if (p < 1e-8) {
    if (Math.abs(z) < 1e-8) throw new RangeError('Earth centre has no geodetic location.');
    return {lat: Math.sign(z) * 90, lon: 0, height: Math.abs(z) - B};
  }
  let phi = Math.atan2(z, p * (1 - E2));
  for (let i = 0; i < 12; i++) {
    const n = WGS84.a / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
    const next = Math.atan2(z + E2 * n * Math.sin(phi), p);
    if (Math.abs(next - phi) < 1e-14) { phi = next; break; }
    phi = next;
  }
  const s = Math.sin(phi), c = Math.cos(phi), n = WGS84.a / Math.sqrt(1 - E2 * s * s);
  return {lat: phi / R, lon: longitude(Math.atan2(y, x) / R), height: p * c + z * s - n * (1 - E2 * s * s)};
}
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export function localFrame(lat, lon, height = 0) {
  const origin = toECEF(lat, lon, height), p = lat * R, l = longitude(lon) * R;
  const east = [-Math.sin(l), Math.cos(l), 0];
  const up = [Math.cos(p)*Math.cos(l), Math.cos(p)*Math.sin(l), Math.sin(p)];
  const south = [Math.sin(p)*Math.cos(l), Math.sin(p)*Math.sin(l), -Math.cos(p)];
  const axes = [east, up, south];
  return {
    lat, lon: longitude(lon), height, origin, axes,
    projectECEF(v) { const d = v.map((x,i) => x-origin[i]); return axes.map(a => dot(a,d)); },
    project(lat, lon, h = 0) { return this.projectECEF(toECEF(lat,lon,h)); },
    unproject(v) { return fromECEF(origin.map((o,i) => o + east[i]*v[0] + up[i]*v[1] + south[i]*v[2])); },
    directionToECEF(v) { return origin.map((_,i) => east[i]*v[0] + up[i]*v[1] + south[i]*v[2]); }
  };
}
/** Analytic ray/ellipsoid picking; input direction need not be normalized. */
export function intersectEllipsoid(origin, direction) {
  const radii = [WGS84.a, WGS84.a, B];
  const o = origin.map((v,i)=>v/radii[i]), d = direction.map((v,i)=>v/radii[i]);
  const a=dot(d,d), b=dot(o,d), c=dot(o,o)-1, disc=b*b-a*c;
  if (!a || disc < 0) return null;
  const near=(-b-Math.sqrt(disc))/a, far=(-b+Math.sqrt(disc))/a;
  const t=near >= 0 ? near : far;
  return t < 0 ? null : origin.map((v,i)=>v+t*direction[i]);
}
/** Small camera movement; converts a local offset back onto the same ellipsoid. */
export function moveOnSurface(lat, lon, east, north) {
  const p=localFrame(lat,lon).unproject([east,0,-north]);
  return location(p.lat,p.lon);
}
