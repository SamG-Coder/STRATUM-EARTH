# STRATUM CITY validation

## Basis

The fork's CUDA blobs were checked against the mounted STRATUM Infinite source before changes. The original architecture grammar is retained as `authoredGroup`; new families use `cityGroup`, which shares the exact feature sink with bounds and ray queries. The shape plan is art-directed from the user's desired Manhattan visual identity, not geospatial ground truth.

## Executed checks

- `npm run build`: 13 CUDA entries translated; each stays within eight storage buffers and a 16 KiB portable workgroup-memory budget.
- `npm test`: six Node tests passed, followed by native geometry/plan checks. The Node device double checks API/buffer/dispatch contracts, not shader arithmetic.
- Original geometry regression: 13,857 reference feature records matched (position, extent, shape, material, turn and seed). Maximum original group count: 56.
- New families: 960 BVH-vs-exhaustive rays, 960 hits, maximum distance difference 0. Maximum new group count: 279, below the 512 feature-ID stride.
- Finite island: 954 buildings, 451 park-designated lots, 14,314 water lots; four building families in the selected genome; maximum body height 394.2 m. Piers/streets occupy additional lots. The numbers are for this artificial plan.
- Native `-fsanitize=address,undefined` run passed.
- CPU references rendered primary visibility, one-bounce reflections, parallax interiors and final image resolve; all output lighting values were finite.
- Browser attempt: Chromium navigation to the local test page failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Browser WGSL execution, GPU performance and driver stability remain unverified here.

## Actual seed search

Search seed: 20260919. Candidates evaluated: 8,192. Population: 128. Retained elite set: up to 16 nonduplicate genomes.

- Baseline training objective: 0.129157.
- Selected winner training objective: 0.007335.
- Fresh audit objective: 0.090065.
- Training and audit each evaluate 512 deterministic spatial samples, excluding non-building samples. They are different sampled sets, not a proof of generalization to arbitrary shapes.

The audit loss is notably higher than the training loss. This is why both are exported and displayed. These are engineering fitness numbers against art-directed constraints; they are not a similarity percentage, a measured New York error or a claim that the seed reproduces the reference photograph.

## Real-device checks

Open `tests/browser.html` and run the checks. The page creates actual WebGPU pipelines, tests 48 CPU-reference feature/query fixtures (including new families), and evaluates the selected genome with the GPU fitness kernel. It reports real adapter details and exceptions. It does not replace failed GPU arithmetic with a CPU fallback.

The viewer exposes startup load/translation and native pipeline creation times separately through `window.stratum.inspect()`. Runtime frame timings use WebGPU timestamps when supported. Compile time and frame time must not be conflated.
