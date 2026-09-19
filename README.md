# STRATUM EARTH

**A 1:1-coordinate Earth experiment: geography is data, missing appearance is generated.**

This repository starts from Stratum City but no longer treats a fixed procedural
48 m city grid as geographic truth. The default page is now a WGS84 globe and a
browser geographic-data pipeline. The original city remains at **`city.html`**.

## What this implementation does

- Navigates a WGS84 ellipsoid in real metres, including the poles and dateline.
  Double-precision Earth-centred coordinates are converted to camera-relative
  east/up/south frames before sending geometry to the GPU.
- Loads a bounded area of OpenStreetMap geometry directly in the browser: building
  footprints, road centre lines, mapped water and green areas. Multipolygon holes
  and relation fragments are preserved; incomplete areas are reported, not closed
  with invented edges. Stable source IDs deduplicate adjacent tile responses.
- Preserves source footprints and tagged heights. A separately compiled
  **CUDA-authored WebGPU detail farm** scores 64 deterministic appearance candidates
  per building. Missing height can be estimated from mapped levels or labelled
  procedural defaults. The farm cannot move a footprint or overwrite a tagged height.
- Extrudes mapped polygons on the CPU, renders them with Three.js WebGPU, and uses
  GPU procedural facade windows driven by the winning detail parameters. There is
  a labelled WebGL2 render fallback and a deterministic CPU farm fallback.
- Normalizes responses in a module worker; uses a bounded IndexedDB/RAM cache;
  serializes provider requests; enforces byte/feature/vertex budgets and backoff;
  cancels superseded work. A failed load leaves the previously rendered area intact.
- Exposes tagged-versus-estimated height colouring, source-object inspection,
  actual request/candidate counters, provider errors and source snapshots. Exported
  descriptors keep mapped facts separate from generated detail.

**This is the first working geographic vertical slice, not a finished digital twin
of the entire planet.** Coordinate scale is 1:1; source completeness and accuracy
are not guaranteed. There is no claim of 1:1 reconstructed visual detail everywhere.

## Run

```sh
npm ci
npm run build
npm start
```

Open the localhost URL printed in the terminal. The build copies pinned renderer
modules locally and precompiles the separate Earth detail-farm kernel. No API key
is required for a small explicit public-Overpass request. HTTPS or localhost is
required for WebGPU. Browser and GPU support vary.

Choose a location preset or enter latitude/longitude, press **Go**, then **Load
mapped area**. Drag rotates locally; right-drag or Shift-drag pans. At globe scale,
drag pans across Earth. Scroll changes range; WASD moves the local frame; Q/E changes
range; Shift boosts movement. Click the globe to populate coordinates, or a rendered
building to inspect its provenance. The displayed distance is camera-to-target range,
not a claimed terrain altitude.

## Data-provider behaviour

The default public Overpass provider is intentionally **manual-neighborhood only**:
no continuous background flight scraping, unlimited prefetch, retry storms, or
endpoint hopping. One request is in flight at a time, with a minimum interval and
explicit rate-limit backoff. No OpenStreetMap raster tile server is used.

For continuous visible-neighborhood streaming, configure an endpoint you operate
or have permission to use. Select **Geographic tile JSON** and enter a HTTPS URL
containing `{z}`, `{x}`, `{y}`. It must return Overpass-style `elements` with complete
`geometry` for the requested geographic cell, support CORS, and have an appropriate
capacity/licensing agreement. The client can retain up to nine nearby cells. It
never crawls the rest of Earth.

**These tiles are a geographic 2×1-root quadtree, NOT Web Mercator tiles.** See
[provider contract](docs/earth/PROVIDERS.md). No hosted production tile backend is
bundled or implied. Overture/PMTiles and a terrain provider are planned adapters,
not hidden dependencies or implemented integrations.

## Present limits

The overview uses generalized Natural Earth 1:110m land data via pinned
`world-atlas@2.0.2`; it is not a high-resolution coastline or terrain survey. Local
source geometry is placed on the **reference ellipsoid**. A real elevation model,
vertical-datum conversion, mountains, terrain LOD and terrain collision are still
needed. The UI shows this limitation instead of silently generating fake terrain.

Buildings are footprint extrusions with flat roofs. Roof tags are retained for
future reconstruction; exact landmarks, interiors, arbitrary building parts,
bridges, road grades and tunnels are not reconstructed. Road widths are tagged
values where parsed, otherwise display estimates. Building levels are not a measured
height. Generated facades are not evidence of what a real building looks like.

The seed farmer is currently a **bounded visual-detail scorer**, not a trained
architecture model or a city-wide/neighbour-aware optimizer. Regional priors,
boundary constraints, calibrated material models and progressive detail grammars
are subsequent work. Large polygon extrusion currently runs on the CPU; it is not
being advertised as CUDA-generated mapped geometry.

## Validation

```sh
npm run build
npm run test:source
node tools/native-test.mjs
# after: npx playwright install --with-deps chromium
CW_SOFTWARE_GPU=1 npm run test:browser
npm run pages
```

Windows PowerShell: `$env:CW_SOFTWARE_GPU='1'; npm run test:browser`.

The browser regression uses explicitly synthetic OSM-shaped fixtures and does not
send requests to community servers. It executes the actual normalization worker,
compares WebGPU farm outputs with the CPU reference, exercises cancellation/cache/
HTTP-error recovery, and serves beneath `/STRATUM-EARTH/` to test project-page URLs.
JSON reports identify the browser/adapter and do not imply RTX hardware performance.

CI also retains the original city shader/artifact and native exact-geometry tests.
Original `kernels/*.cu` and vendored CUDA-WebShader implementation remain unchanged.
Earth-specific CUDA is under `earth/kernels/`. See
[architecture and implementation sequence](docs/earth/ARCHITECTURE.md).

## Licensing and sources

Application code is MIT. **OpenStreetMap data is not relicensed as MIT**; attribution
and ODbL obligations apply to downloaded/derived data and exported descriptors.
Natural Earth overview data is public domain; packaged library licences are retained.
See [Earth data notices](EARTH_DATA_NOTICES.md). The earlier procedural city's notes
are preserved in [legacy documentation](docs/city/LEGACY_README.md).
