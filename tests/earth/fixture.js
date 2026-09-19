/** Hand-authored SYNTHETIC fixtures. OSM-like syntax; NOT real mapped objects. */
export function fixture(lat=-37.814,lon=144.964){
 const point=([e,n])=>({lat:lat+n/111320,lon:lon+e/(111320*Math.cos(lat*Math.PI/180))});
 const way=(id,points,tags)=>({type:'way',id,version:3,timestamp:'2026-01-01T00:00:00Z',user:'MUST_NOT_COPY_USER',uid:999,tags,geometry:points.map(point)});
 const square=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
 const elements=[
  way(1001,square(-100,-90,40,35),{building:'commercial',name:'SYNTHETIC tagged height',height:'40.25','building:levels':'10','building:colour':'#ac9980'}),
  way(1002,[[-35,-90],[15,-90],[15,-70],[-10,-70],[-10,-35],[-35,-35],[-35,-90]],{building:'apartments',name:'SYNTHETIC concave levels','building:levels':'5'}),
  way(1003,square(55,-90,35,28),{building:'house',name:'SYNTHETIC unknown height'}),
  way(1004,square(-100,0,38,30),{building:'industrial',height:'60 ft',min_height:'3m','building:material':'brick'}),
  way(1005,[[-130,-110],[120,-110],[130,100]],{highway:'residential',width:'8',name:'SYNTHETIC road'}),
  way(1006,square(40,0,65,45),{leisure:'park',name:'SYNTHETIC park'}),
  way(1007,square(-120,75,100,24),{natural:'water',name:'SYNTHETIC water'})
 ];
 const outer=square(-25,0,50,55),hole=square(-10,15,20,20);
 elements.push({type:'relation',id:2001,version:2,timestamp:'2026-01-01T00:00:00Z',tags:{type:'multipolygon',building:'yes',height:'25',name:'SYNTHETIC courtyard'},members:[
  {type:'way',ref:2002,role:'outer',geometry:outer.slice(0,3).map(point)},
  {type:'way',ref:2003,role:'outer',geometry:outer.slice(2).reverse().map(point)},
  {type:'way',ref:2004,role:'inner',geometry:hole.map(point)}
 ]});
 return {version:0.6,generator:'STRATUM-EARTH synthetic test fixture',osm3s:{timestamp_osm_base:'2026-01-01T00:00:00Z'},elements};
}
