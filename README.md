# STRATUM EARTH

**Geography in. World out.** A browser Earth renderer authored in CUDA and translated to WebGPU compute. There is no Three.js scene graph, globe mesh, terrain mesh, GLTF loader, satellite colour texture or raster draw pipeline in the Earth path.

The default page is now the Earth explorer. The original Stratum City experiment is retained at **`city.html`**; its original CUDA kernels have not been changed.

## Run

```sh
npm start
# http://localhost:8089
```

Node 20+ is sufficient to build and serve. The browser needs WebGPU and HTTPS or localhost. `START.bat` still builds and launches the local server. Open the Explorer, pick a destination or enter latitude/longitude, and select **Explore this location**. Drag to orbit or look, scroll to change altitude, WASD to move, Q/E to climb or descend, and Shift to boost. Click a building to inspect its source and generated properties.

## What runs

```
Browser fetch / decode / cache geographic descriptors
                 |
WGS84 ECEF doubles -> camera-relative ENU floats
                 |
CUDA -> WebShader -> four compute programs
    earthLandMask   Source coastline edges -> geographic coverage
    earthFarm       Known constraints + 192 candidate evaluations/object
    earthGlobe      Analytic WGS84 ellipsoid and procedural appearance
    earthSurface    Source DEM + polygon walls/roofs + generated facades
                 |
GPU RGBA buffer -> copyBufferToTexture -> canvas
```

The host transforms coordinates, indexes raw edges and uploads descriptors. It does not build a scene graph, triangles, facades or meshes. The only 2D canvas use is decoding numerical Terrarium PNG height data. Those pixels are elevations, not appearance textures.

**1:1 refers to geodetic coordinates and metre scale, not complete or survey-accurate coverage.** Absolute positions use WGS84 ellipsoid radii and JavaScript double precision. Near the ground, local ENU coordinates avoid subtracting Earth-sized f32 positions. Available source building rings (including complete multipolygon holes) are intersected directly. Explicit source heights are fixed. Levels without heights use a labelled 3.1 m-per-level assumption. Missing heights and facade parameters are generated and labelled as such.

## Live data and provider responsibility

- **Natural Earth 1:110m land polygons:** fetched in the browser from a pinned upstream revision, cached, and converted to a 1024 × 512 coverage grid by CUDA. This is coarse globe context, not a high-resolution coastline or imagery layer.
- **Terrain Tiles / Terrarium:** a bounded nearby 3 × 3 tile working set, two downloads in flight, 129 × 129 sampled ENU patch, with geographic caching. Data is fetched as the camera settles near the ground. The provider is Web Mercator and does not cover the polar caps.
- **OpenStreetMap via Overpass:** user-triggered, bounded 1.2 km-wide area queries for footprints, roads, water and parks. One request at a time; response budgets, caching and 429/503/504 backoff. No rotation between public endpoints or planet scraping.

**Public Overpass is not a production Earth-streaming backend.** Continuous vectors are disabled for the default public endpoint. The Explorer accepts an HTTPS Overpass-compatible endpoint; only enable continuous mode on infrastructure that permits your application's load. Terrain and source data are still fetched directly by the browser; the local Node server is a static server, not an upstream proxy.

No API keys are required for the bounded public preview. Provider outages and incomplete responses remain visible. If elevation is unavailable, the UI labels an ellipsoid-datum preview; it does not invent mountains. Missing building data does not trigger a fabricated city. Downloaded data may be historical even though it is fetched live.

## Constrained seed farming

`kernels/earth/farm.cu` performs three candidate generations (64 each) per object. The loss targets integer-like floor/bay counts and plausible intrinsic type-based height priors. Object IDs seed detail independently of the render frame and query order. Known footprints, source heights and positions are not variables in the search. This is a bounded visual-detail optimizer, **not** recovery of the true unknown architecture, a global metro solver or a confidence estimator.

A change in source attributes or generator version can change generated detail. Neighbour-dependent regional architectural priors, vegetation geometry, roof-shape interpretation and interiors are not implemented in this milestone.

## Streaming and resource lifetime

The latest requested location supersedes old downloads. Rendering, GPU uploads, seed farming and buffer swaps share an ordered host queue. A new scene is committed only after generation completes and the request is still current. Previous buffers are retained until the swap succeeds. Location changes do not rebuild the four shader pipelines. The geographic cache is bounded to 64 MiB / 160 entries; the decoded DEM cache is bounded to 64 tiles.

## Validation

```sh
npm run build
npm run test:source
node tools/native-test.mjs
# Direct reference checks using exactly the new CUDA source:
g++ -std=c++17 -O2 tests/earth/native.cpp -o earth-native && ./earth-native
# Optional actual browser regression (Python Playwright, Chromium installed):
python tools/earth/browser-test.py
```

Node tests cover geodesy, antimeridian queries, source geometry, missing attributes, multipolygons, cache/response budgets, backoff, latest-wins cancellation, module syntax, generated artifacts and absence of a mesh renderer. The browser regression executes all four pipelines on explicitly selected software WebGPU, checks known-height preservation, deterministic farming, footprint picking, globe rendering, UI loading and rapid location changes. Synthetic network fixtures are explicit; they are not a live-provider test or an RTX performance benchmark.

See [architecture and limitations](docs/earth/architecture.md) and [source attribution](docs/earth/sources.md). The UI retains visible source credits.

## Software-adapter presentation

World generation, intersection, shading and seed farming run in the CUDA-authored compute kernels on both paths. Hardware adapters present the GPU color buffer directly to a WebGPU canvas. Software adapters (SwiftShader/lavapipe/llvmpipe) use an explicit compatibility path: read back the already-computed RGBA image and display it with `putImageData`. This does not generate geometry or shade the world in JavaScript; it is slower image transport around headless/software canvas interop. The renderer reports `presentation: 'readback'` or `'gpu-copy'` in its stats. Software browser results are not evidence of hardware presentation speed.
