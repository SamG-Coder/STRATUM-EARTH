# STRATUM CITY
## Farm the seed. Keep the city.

[**City viewer**](https://samg-coder.github.io/stratum-city/) · [**GPU Seed Farm**](https://samg-coder.github.io/stratum-city/farm.html) · [**Real-device checks**](https://samg-coder.github.io/stratum-city/tests/browser.html)

A **finite, Manhattan-inspired** continuation of STRATUM. A shape plan fixes the island, parks, street exclusions, waterfront and skyline anchors. An offline search selects a compact genome against district-height and architecture-mixture targets. CUDA source reconstructs the detailed city; WebGPU renders it.

This is **not a surveyed reconstruction of New York**. The plan is an art-directed, compressed island inspired by the aerial reference. Its coordinates, targets and landmarks are design choices, not GIS data, measured NYC statistics or identifications of actual buildings. No image, mesh or city texture pack is used as a scene asset.

## Run

Use Node.js 20 or later. No npm install, API account, model download or paid service is required.

```sh
npm start
```

Or double-click `START.bat`; on macOS/Linux run `./start.sh`. Open the local URL printed in the terminal. Do not open `index.html` using `file://`.

Generated WGSL and the combined `Stratum.cu` are build outputs, not checked-in sources. The ZIP includes current outputs for convenience; `npm run build` regenerates them. The launchers build the optional shader accelerators before starting. At boot the browser checks the **exact CUDA source + kernel configuration + compiler fingerprint** before accepting a generated artifact or browser-cache entry. If those do not match, it compiles from `.cu` in a worker. The driver still creates a WebGPU pipeline; compiled WGSL is not a precompiled native GPU binary. Startup reports these phases separately. The geometry and fitness probe kernels are not compiled during normal viewer startup.

High defaults to 1600 pixels wide on desktop, 768 on coarse-pointer devices. Reflections can be turned off separately without replacing the buildings. Pipeline startup cost, hardware frame rate and cross-driver behaviour still need testing on the target GPU.

## What this version adds

- Finite island/coastline, Battery-like garden, uptown park, regular street exclusions, a diagonal lower-city avenue, waterfront and piers.
- Glass towers, stepped masonry high-rises, lower-rise loft buildings and retained detailed STRATUM architecture. Storefront glazing, awnings, rooftop mechanical boxes, water tanks, fire escapes, benches and street lamps are analytic geometry.
- A real seed-farming evaluator and two search front ends: native offline CLI and browser WebGPU. Both use `describeCityLot()` and `measureGenome()` from the same CUDA files.
- View-dependent box-room interiors behind glass: seeded room depth, walls/ceiling/floor, furniture solids, lights and blinds.
- Half-resolution **one-bounce city reflections** using the same exact ray-query function as primary visibility. Glass and water can reflect offscreen architecture, not only the current screen image. Full-resolution reconstruction rejects incompatible depth/normal/material samples and uses the sky where no suitable sample exists.

The supplied genome was selected from **8,192 evaluated candidates**. At this seed the finite plan contains **954 buildings and 451 park-designated lots**, plus water, streets and piers. These are results for this plan/genome, not claims about actual Manhattan.

## Seed farming

`cities/manhattan.plan.json` is the human-readable shape plan. `cities/manhattan.genome.json` is the saved winner, with genes, plan hash, descriptor hash, training/audit metrics, search history and finalists.

A genome contains twelve scalar entries: seed, base height, downtown rise, midtown rise, glass mixture, coverage, height variation, setback amount, palette, facade seed, interior seed and format version. Coastline/park/landmark constraints are explicit rather than something a random seed is expected to discover accidentally.

The fitness evaluates district mean heights, tall-building fractions, glass-family fractions, footprint coverage and height variation. Candidate mutation/crossover changes controllable parameters; seed replacement changes the deterministic realization. An elite set retains strong, nonduplicate candidates. A different sample set audits the finalists before choosing the exported winner. This is a procedural parameter search, not neural training or proof of photographic similarity.

### Native offline search

Requires a C++17 compiler (`g++` by default; set `CXX` for a different compiler). It compiles the same descriptor/fitness CUDA as native C++:

```sh
npm run farm -- --candidates 8192 --seed 20260919
npm run farm -- --plan cities/manhattan.plan.json --out cities/my-city.genome.json --candidates 16384
```

The search writes a genome, not a large generated city file. Stop changing code to try a result: **Field notes → Import farmed genome** accepts the exported JSON, checks the plan hash and rebuilds the bounds. Export current genome saves it again.

### Browser GPU search

Open `farm.html`, choose the budget and search seed, then click **Farm seeds**. This runs locally, separately from the viewer, in 128-candidate batches. Stop retains the best completed search state. Export the winner and import it into the viewer. The CPU and browser search algorithms differ, and GPU floating-point differences can alter rankings; they are not claimed to select identical winners.

The 48-byte gene vector and 1,280-byte packed plan are only parameters. The CUDA program, compiler, GPU bounds and frame buffers are still required.

## Rendering architecture

```text
Shape plan + selected genome
            ↓
Deterministic finite lot descriptors
            ↓
One shared family/feature definition
          ↙   ↘
Conservative   Exact feature intersections
 group bounds  for primary AND reflected rays
          ↘   ↙
Materials · parallax rooms · glass/water reflection
            ↓
Footprint filtering · stationary accumulation · display
```

There is **no near/far building model swap**, no page-residency-dependent detailed island, and no per-building primitive-page allocation. The same analytical feature set is queried throughout the finite plan. Bounds reject groups a ray cannot intersect; they are not rendered as replacement buildings. Fine material/relief frequencies filter with footprint. Finite stationary sampling stops changing after 64 samples and restarts for camera/light/settings changes.

The grid holds 128 × 128 descriptors and a **64 MiB bounds hierarchy**. Only the island's occupied lots produce buildings. Frame buffers are additional. Primary visibility and reflections use bounded row dispatches. Bounds rebuild on initial load/genome replacement, **not every camera frame**.

The original detailed definitions in `kernels/assets.cu` are retained. `kernels/city-assets.cu` adds city families and dispatches to the original definition where appropriate. The shared `emitFeature()` sink supplies bounds, enumeration, normals, materials and exact query geometry. There is no manually reimplemented low-detail roof/facade substitute.

## Controls

WASD/arrows fly; drag to look; Q/E change height; Shift boosts; Ctrl slows; wheel changes speed. Keys 1–6 select the six views. P orbits, R toggles city reflections, I toggles interiors, J toggles building shadows, V cycles debug views, [ / ] rotate the sun, + / − change exposure, F enters fullscreen, H/Tab opens notes, C hides the interface and K captures the computed frame.

Touch supports dragging/view buttons, not a full mobile flight controller. Movement is free flight rather than collision-constrained walking.

## Validation

```sh
npm run build
npm run test:source
node tools/native-test.mjs
npm run pages
```

Performed for this version: all 13 entries translated with the bundled compiler; six Node tests passed, including source-hash validation and runtime compilation without `generated/`; 13,857 original feature records matched the frozen reference; 960 rays through new families matched exhaustive intersections with zero distance error. Native address/undefined-behaviour sanitizer tests passed. CPU references exercised the primary, interior and reflection lighting paths.

**Browser execution could not be verified here:** Chromium navigation to localhost was blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). No RTX 5080, mobile FPS, native driver compile time or hardware stability claim is made. `tests/browser.html` compiles real-device pipelines, checks 48 native reference fixtures and compares GPU seed fitness with the native result.

See `docs/city/VALIDATION.md` for the measured search numbers and limitations. GitHub Pages requires **Settings → Pages → Source: GitHub Actions** to be enabled in this repository. The workflow compiles/tests before packaging; the test job does not itself execute a hardware GPU.

## Limits

This is a renderer/tooling prototype, not photogrammetry, a production game, a literal NYC map or an infinite world. Roads/blocks are stylized. Shadows use building masses rather than tracing every small feature. Reflections are one bounce at half resolution, not multiple-bounce GI; rough-surface, disocclusion and tiny-pane errors remain possible. Interior rooms are procedural cuboids, not walkable apartments. The shader cache cannot eliminate the graphics driver's pipeline compilation cost. Performance must be measured on the target GPU.

Legacy infinite-renderer documentation and unused experimental kernels are retained for provenance; the current entry-point registry is `src/kernel-specs.js`. The active renderer has no neural component. Existing vendor notices and MIT licenses are preserved.
