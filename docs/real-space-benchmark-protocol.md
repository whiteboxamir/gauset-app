# Real-Space Benchmark Protocol

Use this protocol to measure whether Gauset is closing the gap with Polycam Space Mode and Niantic Spatial Capture / Scaniverse on real spaces.

## Locked Suite

Maintain 12 named benchmark scenes:

- daylight interior
- mixed window light interior
- neon / night storefront
- reflective retail frontage
- cluttered production room
- foliage-heavy exterior
- indoor / outdoor threshold
- long corridor / low-texture wall set
- cafe / restaurant seating
- warehouse / industrial bay
- residential living room
- mixed signage and small text scene

For each scene, store:

- prescribed capture path
- holdout viewpoints
- reference still crops for signage, wall edges, and occlusion-heavy areas
- operator notes about lighting, motion, and hard surfaces

## Per-Tool Run

Run Gauset, Polycam, and Scaniverse on the same capture set and log:

- capture friction
- registered image count
- holdout render quality
- signage legibility
- wall and ceiling straightness
- floaters / curtains / cards
- color stability
- artifact size
- runtime at desktop and mobile review settings

## Gauset Pass Criteria

A scene is not promotable unless all are true:

- truthful lane label is present
- native multiview training was used
- no synthetic camera priors were used
- holdout metrics are available and pass threshold
- viewer budgets are verified
- benchmark comparison is recorded

## Output Format

Write one JSON report per benchmark wave using the schema in [benchmark.real-space-world-class-v1.json](/Users/amirboz/gauset-app/contracts/schemas/benchmark.real-space-world-class-v1.json).
