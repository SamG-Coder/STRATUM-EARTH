# Earth foundation and next implementation sequence

## Implemented separation

```
Globe navigation (WGS84/ECEF, CPU doubles)
  -> geographic tile selection
  -> provider policy + bounded cache + request cancellation
  -> normalization worker
  -> immutable source-feature descriptor
  -> CUDA/WebGPU appearance candidates + deterministic CPU reference
  -> CPU footprint triangulation/extrusion, retaining holes
  -> GPU facade shading + camera-relative rendering
```

The original city renderer stays at `city.html`; none of its `.cu` grammar files
are modified. It cannot become coordinate-accurate Earth merely by writing real
coordinates into its old fixed-lot plan buffer. The Earth renderer is separate and
uses mapped polygon geometry; sharing compiler/runtime is different from forcing
all world content into the city grammar.

`earth/geodesy.js` and `tiles.js` define the coordinate contract. `osm.js` keeps
source geometry separate from unknown attributes. `provider.js` owns network
backoff and last-request-wins transactions. `cache.js` never stores unbounded Earth
data. `normalize-worker.js` keeps source normalization away from the render thread.

`earth/kernels/detail-farm.cu` is a small integer candidate scorer, separately
compiled once. It is not the original giant city shader. Each source building's
stable ID, source revision and grammar version determine its seed. Both backends
use identical u32 operations, integer fitness and first-minimum tie breaking.
Known heights/footprints are not optimizer parameters. Candidate appearance
parameters are window bay size, storey spacing and palette tone. The present priors
are deliberately simple, with tagged building type and footprint perimeter.

The GPU computes candidate scores, CPU reduction chooses a winner, and the visual
genome drives a Three.js node material. Tagged levels only constrain an estimated
height; they are not a measured height. Tagged colour is used when supported. All
unknown-height output remains explicitly labelled. No made-up confidence percentage
or asset-equivalent gigabyte claim is displayed.

The renderer keeps ECEF positions in CPU doubles and generates each resident batch
in a local metre frame. It computes the frame-to-camera transform before uploading
float matrices. The WGS84 overview has coarse global geometry, replaced nearby by
a tessellated reference-ellipsoid patch. There is **no terrain elevation provider**.
The patch is not fabricated terrain and is identified as a reference surface.

## Safety and regression boundaries

A new area is prepared before a scene swap. Failed HTTP/parse/farm/geometry operations
leave the old area available. Old requests cannot commit after a newer selection.
Nearby tile sets deduplicate complete source objects; partial multipolygon rings
are skipped with warnings. Export retains those warnings and source attribution.

Tagged height matching, holes, dateline/pole coordinates, cache bounds, provider
restrictions, cancellation and duplicate revisions are tested. Browser tests execute
the actual worker and WebGPU scoring kernel on a labelled software adapter and
compare results against the CPU implementation. These are not full visual equivalence
or RTX performance benchmarks. The original city native tests remain separate.

## Next gates (not implemented in this slice)

1. **Production data backend + stable incremental tiles.** Choose owned or licensed
   open vector archives. Add request-priority/SSE scheduling, persistent normalized
   descriptors and per-object mesh updates instead of rebuilding a resident batch.
   Preserve source update epochs and cross-tile identities. Prove a continuous route
   across at least twenty cell boundaries with no missing/duplicated geometry.
2. **Real elevation and vertical datums.** Add a COG/terrain-tile reader, no-data masks,
   source resolution/error metadata and ellipsoid/geoid conversion. Terrain quadtree,
   skirts/shared edge samples, shoreline alignment and collision must pass independent
   numeric checks before claiming mountains, altitude or sea-level correctness.
3. **Mapped 3D structure.** Building parts, roof types, roof heights, min levels,
   bridges/tunnels/road grades, ground-contact rules and landmark exception data.
   No architecture prior is allowed to overwrite sourced geometry.
4. **Advanced hierarchical seed farming.** Region priors are data with provenance,
   not country stereotypes. Add neighbourhood consistency and explicit shared edge
   constraints. Benchmark deterministic multi-object optimization with no source
   displacement. Separate inference uncertainty from source accuracy; calibrate any
   future confidence score rather than inventing a percentage.
5. **GPU geometry and progressive detail.** Move bounded extrusion/instance expansion
   to CUDA/WebGPU compute with reference comparisons. Introduce footprint-derived
   facade grammar, vegetation constrained by landcover, horizon/frustum culling,
   generation queues and measured memory/compile/frame budgets. Add device-loss
   recovery and worker-side triangulation before scaling to dense megacities.
6. **Global verification.** Repeated routes through dense cities, rural Australia,
   mountains, coastlines, polar regions and the antimeridian, using held-out source
   snapshots. Measure source bytes, generated bytes and CPU/GPU times independently.

The target is 1:1 Earth geography. These gates distinguish that target from a complete
surveyed visual reconstruction, which the first implementation does not claim.
