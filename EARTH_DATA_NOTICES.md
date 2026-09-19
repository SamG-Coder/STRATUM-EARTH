# STRATUM EARTH — data and dependency notices

## Mapped geography: OpenStreetMap

© OpenStreetMap contributors. OpenStreetMap is made available under the Open Data
Commons Open Database License (ODbL) 1.0. Attribution must remain visible. Application
MIT licensing does not replace source database terms. Exported areas retain source
IDs, snapshot timestamps, attribution and a clear separation between source geometry
and generated detail. Do not represent generated heights, facades or interiors as
surveyed facts. Consult source terms for public use/distribution of derived databases.

https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

The default public Overpass endpoint is only used after an explicit neighborhood
load. Public operators do not offer this as an unlimited backend for a globe app.

https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

## Globe overview: Natural Earth / world-atlas

Natural Earth data is public domain. `world-atlas@2.0.2` redistributes Natural Earth
4.1.0 at 1:110m for the coarse overview. This low-resolution generalized layer is
not appropriate as authoritative neighbourhood coastline geometry or elevation.
The world-atlas package code/license is retained alongside the copied data.

https://www.naturalearthdata.com/about/terms-of-use/
https://github.com/topojson/world-atlas/tree/v2.0.2

## Rendering and polygon triangulation

Three.js 0.180.0 — MIT. Earcut 3.0.2 — ISC. The build copies each package's complete
licence into `vendor/earth/` alongside its browser module. Runtime modules are served
locally rather than using unpinned remote JavaScript. Playwright 1.56.1 is a development
test dependency (Apache-2.0) and is not served as application content.

https://github.com/mrdoob/three.js/tree/r180
https://github.com/mapbox/earcut/tree/v3.0.2

## Coordinates

WGS84 ellipsoid, semi-major axis 6378137 m and inverse flattening 298.257223563.
ECEF/ENU conversion references:
https://proj.org/en/stable/operations/conversions/cart.html

The present zero-height surface is the ellipsoid, NOT mean sea level. A future DEM
adapter must identify its vertical datum and convert orthometric heights through
an appropriate geoid model. Current renderer output is not navigation/survey data.

## Tests

`tests/earth/fixture.js` is hand-authored SYNTHETIC geometry, not copied mapped
objects. Browser CI serves these fixtures without making community-server requests.
