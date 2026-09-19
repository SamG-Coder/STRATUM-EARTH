# Compute Earth: architecture and current limits

## Source path and invariants

`src/earth/providers.js` owns fetch, budgets, IndexedDB/memory cache and cancellation. `geodesy.js` handles absolute ECEF doubles, ENU frames, wrapping, geographic bounding boxes and globe picking. `data.js` preserves source polygon edge loops, handles complete multipolygon relations, removes consumed member duplicates and builds a bounded broad-phase index. `terrain.js` resamples supplied elevations into a local height descriptor. None of these generates a render mesh.

`kernels/earth/` contains every Earth geometry/intersection/appearance program. The build uses the vendored CUDA WebShader compiler; runtime fallback translates the same source in a module worker. Generated artifacts are keyed by compiler implementation, CUDA units and compiler options. `src/earth/renderer.js` copies the compute-produced RGBA image directly to the browser canvas. Provenance IDs are written beside pixels; picking reads one ID and one eight-float genome record rather than reading the whole frame.

The UI does not silently swallow a selection because a frame is busy. GPU operations are ordered; geographic results carry a generation token checked again immediately before swapping live buffers. Geometry, descriptors and pointer bindings are swapped together. The old city experiment is intentionally separate from the new renderer.

## Coordinate contract

Absolute WGS84 positions use `a=6378137 m`, `f=1/298.257223563`. CPU conversions retain double precision. The ellipsoid pass uses normalized Earth-centred f32 coordinates only at far altitude. The local surface pass uses metre-scale ENU float coordinates. The local terrain is a finite regular sample grid, not a globally resident triangle planet. Pixel-dependent geometric detail is intersected at render time.

This is geodetically placed, not a surveyed digital twin. OSM source accuracy varies. Terrarium source vertical datums vary and are **not converted with a geoid model** here; elevation is used as an approximation to ellipsoidal height. ENU height-grid resampling introduces approximation, especially toward the edge of the patch. No buildings are source-accurate in their unknown facade, roof decoration or interior.

## Terrain and polygon traversal

Terrain traversal steps through regular heightfield cells. Within a cell, the bilinear surface along a ray is quadratic; the nearest interval root is tested instead of arbitrary-distance sphere tracing. Feature traversal uses a 64 × 64 descriptor grid and tests actual polygon side edges and roof inclusion. Complete inner rings produce holes through even/odd inclusion. Footprint data itself is not simplified, expanded to rectangles or replaced with a random lot. Object bounds are rejection volumes only.

GPU ceilings are explicit: 8,192 objects, 131,072 source edges, at most 2,048 edges in one object, and 1,048,576 index references. Excess whole-area data fails with an actionable message. Unsupported/incomplete individual shapes are counted. Partially reconstructed relation boundaries are not closed by inventing an edge.

## Current omissions / limitations

- Global context is generalized Natural Earth land, not live cadastral coastlines or global high-resolution terrain. Globe land colours and atmospheric rim are generated visualization, not remote sensing.
- The near camera has one bounded terrain/vector patch at a time, with cached neighbouring elevation tiles. There is no full planetary multi-resolution clipmap or crack-free global high-resolution LOD tree yet. Local/far transitions can be visible.
- Full arbitrary roof geometry, collision/physics, bridge and tunnel levels, terrain-cut infrastructure, stacked parts and overlapping multipolygon union repair are not implemented. Explicit bridge/tunnel/below-ground sources are skipped and counted rather than painted as correct surface geometry.
- Water and parks are source-driven surface materials. There is no volumetric water, tide model, dynamic weather, terrain erosion or procedural 3D vegetation in this milestone. Bathymetry remains source-height terrain, not a physical sea-surface simulation.
- OSM area downloads occur within a bounded query. A missing footprint is not proof the building does not exist. No complete real-world coverage claim is made.
- The 192-candidate GPU search optimizes generic visual parameters with fixed source constraints. It is not a joint regional genome optimization, semantic architecture classifier or reconstruction method.
- A real-data request may fail because of provider outage, CORS or rate limits. Production needs a permitted vector provider, not a public Overpass dependency.

These boundaries are intentional and visible; the implementation is an executable globe-to-source-geometry path, not a claim that all Earth detail is complete.

## Software-adapter presentation

World generation, intersection, shading and seed farming run in the CUDA-authored compute kernels on both paths. Hardware adapters present the GPU color buffer directly to a WebGPU canvas. Software adapters (SwiftShader/lavapipe/llvmpipe) use an explicit compatibility path: read back the already-computed RGBA image and display it with `putImageData`. This does not generate geometry or shade the world in JavaScript; it is slower image transport around headless/software canvas interop. The renderer reports `presentation: 'readback'` or `'gpu-copy'` in its stats. Software browser results are not evidence of hardware presentation speed.
