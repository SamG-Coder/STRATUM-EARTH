# Geographic sources and attribution

Provider policies checked 19 September 2026. Availability is not guaranteed; data retrieved today may describe an earlier survey or map state.

## OpenStreetMap

OpenStreetMap contributors; Open Database Licence (ODbL).

- Copyright and credit: https://www.openstreetmap.org/copyright
- Public Overpass resource guidance: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

The UI displays attribution and links to the licence. Cached source responses retain OSM IDs and source timestamps when supplied. Source-derived database exports require respecting ODbL; the code's MIT licence does not relicense source data. The application exports only diagnostics by default, not an unlabelled proprietary derived geographic database.

The public Overpass operator explicitly discourages globe scraping and using its shared instances as a general app backend. Hence public access here is a manual bounded preview with no endpoint hopping. A custom endpoint is needed for automatic vector streaming.

## Terrain Tiles

Mapzen / Tilezen Terrain Tiles, AWS Open Data registry:

- https://registry.opendata.aws/terrain-tiles/
- https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- https://github.com/tilezen/joerd/blob/master/docs/formats.md
- Endpoint: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`

The Terrarium numeric encoding is `(R * 256 + G + B / 256) - 32768` metres. The PNG is used as numerical elevation input only. This project does not claim Tilezen owns or relicenses all constituent surveys: source-specific attribution/licences are linked from the permanently visible Terrain Tiles credit. Sources include government elevation surveys and SRTM-family datasets with differing coverage and vertical datums; no geoid conversion is applied here.

## Natural Earth

Natural Earth public-domain generalized land polygons, 1:110m, pinned upstream GeoJSON revision `693f11422f4e08d2da4566b854dda53eb7c39fb3`.

- https://www.naturalearthdata.com/about/terms-of-use/
- https://github.com/nvkelso/natural-earth-vector/blob/693f11422f4e08d2da4566b854dda53eb7c39fb3/geojson/ne_110m_land.geojson

The source is fetched live and cached; it is deliberately pinned for reproducibility, not described as a continuously updated coastline survey. CUDA converts source edge loops to a coarse 1024 × 512 globe coverage field. No raster earth appearance image is downloaded.

## Geometry and provenance

Building positions/rings come from source coordinates; explicit heights are preserved. Heights inferred from levels use a visible 3.1 m-per-level assumption. All facades/windows/materials and heights without source constraints are generated, with no percentage-confidence label. No remote imagery, commercial map assets or private property records are used.
