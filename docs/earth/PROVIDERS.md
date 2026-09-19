# Geographic provider contract

## Grid and wire format

Tiles are `g/z/x/y`. At zoom z there are `2^(z+1)` columns and `2^z` rows. Origin is
west -180°, north +90°. `step = 180 / 2^z` degrees; west = -180 + x*step;
north = 90 - y*step. Longitude wraps; rows do not. Both poles are covered. This is
not slippy-map/Web-Mercator indexing and must not be plugged directly into an OSM,
PMTiles or XYZ raster endpoint.

Current detailed zoom is 15: a 0.0054931640625° cell. It is approximately 612 m
north/south; east/west metres vary with latitude. The globe coordinate system has
no Web-Mercator polar cutoff. Actual source data coverage is independent of that.

The configurable HTTPS `{z}/{x}/{y}.json` endpoint returns the same structure as
Overpass `out meta geom`: an `elements` array containing ways and multipolygon
relations, tags, optional version/timestamp and complete geometry. Geographic points
are `{lat,lon}`. Polygon way rings must be closed. Multipolygon members contain
`type:'way'`, `ref`, `role:'outer'|'inner'` and geometry, or reference a way present in
the same response. Never cut an edge and silently close it against a tile boundary.

Full source objects may overlap cells. Stable IDs (`osm/way/ID`, `osm/relation/ID`)
and revisions deduplicate objects. Do not mint a different ID for each tile fragment.
Malformed/incomplete features are reported as skipped; a response-level `remark`
means incomplete data and rejects the whole transaction. Source tags/coordinates
are not rounded by the normalizer or replaced with procedural footprints.

The provider must permit browser CORS. For POST public Overpass, requests use
standard URL-encoded `data`, no client-supplied secret and `credentials:'omit'`.
An owned tile provider uses GET. Do not paste private credentials into a public
static app URL. Production authentication and multi-user caching need a service
architecture, not committed browser tokens.

## Budgets and failure behaviour

Default public Overpass: explicit manual load, one request in flight, 3 s minimum
interval, 40 s client timeout, Overpass 25 s / 16 MiB query limit and 12 MiB download
cap. Retry-After and throttling responses establish a cooldown of at least 30 s.
There is no automatic retry/server rotation. Cancellation aborts network work and
superseded transactions cannot install geometry.

Defaults: 50,000 incoming elements, 12,000 normalized features, 250,000 source
vertices, 20,000 vertices per single feature, 20,000 resident features, 1.8 million
render vertices and at most nine resident geographic cells. Limits deliberately
reject overloaded areas instead of pretending a truncated response is complete.
Extremely complex multipolygons still require a more sophisticated topology budget.

Raw geographic responses are cached in IndexedDB, or bounded RAM on storage failure.
Defaults: 128 entries / 48 MiB / 7 days. Cache keys include endpoint identity, query
version, and tile ID. Cache entries carry acquisition time and original source
snapshot. Cached does not mean current or complete. Clear-cache is local only.

## Production continuation

Implement a real provider adapter rather than redirecting the public endpoint:
regional vector-tile/PMTiles archives, Overture geometry with its original licence
and attribution, or owned OSM extracts. The client contract will need source-specific
normalizers and stable IDs, not conversion that throws away holes or surveyed
attributes. Do not treat PMTiles or Overture support as already implemented.

Public Overpass policy:
https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
