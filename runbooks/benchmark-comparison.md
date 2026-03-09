# Benchmark Comparison

## Goal

Run the locked real-space suite weekly and compare Gauset against Polycam and Scaniverse using the same capture sets and review viewpoints.

## Inputs

- the locked benchmark capture set
- the report schema at [benchmark.real-space-world-class-v1.json](/Users/amirboz/gauset-app/contracts/schemas/benchmark.real-space-world-class-v1.json)
- saved review crops for text, corners, thin structures, and reflective zones

## Minimum Weekly Output

- one JSON report for the full suite
- one short summary of where Gauset is better, equal, or worse
- the top 3 blockers preventing world-class promotion

## Stop Conditions

- missing holdout metrics
- missing competitor comparison on any core scene
- any scene marked world-class without a recorded benchmark report
