# Viewer Certification Truth

Date: March 16, 2026

Status: Current viewer-only certification truth for the `codex/viewer-cert-only` lane.

## Scope

This update reran the viewer certification surfaces without changing runtime contracts:

- standalone loaded-scene viewer certification
- 5M benchmark certification
- shell capability probe for a WebGL2-capable browser lane
- local-stack packet rerun for current combined-packet truth

## Current Truth

| Lane | Environment | Result | Current truth | Evidence |
| --- | --- | --- | --- | --- |
| Loaded-scene preview viewer | Default Playwright Chromium headless on this host | Passed | This host is still `no_webgl`, so the truthful certified lane is `interactive_fallback`. Loaded-scene fallback is certified; premium live is not claimable here. | `/Users/amirboz/gauset-app/artifacts/local-viewer/viewer-host-preview-2026-03-16/viewer-certification.json` |
| Loaded-scene preview viewer | Chrome headless on this host | Passed | A WebGL2-capable environment is available here through Chrome headless. The loaded-scene preview lane certifies as `webgl_live`, and premium live is claimable for this preview scenario. | `/Users/amirboz/gauset-app/artifacts/local-viewer/viewer-chrome-preview-2026-03-16/viewer-certification.json` |
| 5M benchmark | Default Playwright Chromium headless on this host | Failed | This host does not expose a WebGL2-capable live lane for the 5M benchmark. The failure is truthful `host_not_webgl2_capable`, not a runtime-contract change. | `/Users/amirboz/gauset-app/artifacts/viewer-benchmark-5m/viewer-cert-5m-host-2026-03-16/report.json` |
| 5M benchmark | Chrome headless on this host | Failed | Chrome headless is `webgl2_capable`, but the loaded 5M scene still fell back with `environment_render_failed` and `WebGL context was lost while rendering the viewer.` The 5M live lane is still not certified. | `/Users/amirboz/gauset-app/artifacts/viewer-benchmark-5m/viewer-cert-5m-chrome-2026-03-16/report.json` |
| Shell capability probe | Chrome headless on this host | Passed | Chrome headless exposes `webgl2_capable` at the shell level on this machine, so a WebGL2-capable environment is available for certification work here. | `/Users/amirboz/gauset-app/artifacts/viewer-webgl2-probe/viewer-cert-chrome-2026-03-16/viewer-diag.json` |
| Combined local-stack packet | Default Playwright Chromium headless on this host | Failed | The combined packet is not green right now. Viewer shell stayed shell-only and the loaded-scene packet failed inside the broader local-stack run, so this combined packet must not be used as proof of current viewer health. | `/Users/amirboz/gauset-app/artifacts/mvp-local-stack/viewer-cert-host-2026-03-16/certification-summary.json` |

## Product Honesty

- Preview truth:
  - Single-image preview viewer certification is current.
  - On the default host lane, that truth is interactive fallback only.
  - On Chrome headless, that truth is WebGL2 live for the loaded-scene preview packet.

- Reconstruction / large-scene truth:
  - The 5M benchmark is still not certified.
  - A WebGL2-capable browser lane exists on this host, but the large-scene viewer still loses context under Chrome headless before it can certify `webgl_live`.

- Production-readiness truth:
  - Nothing in this packet upgrades the 5M lane to production-ready.
  - Preview certification remains separate from reconstruction fidelity and separate from production-readiness claims.

## Certification Surface Changes

- `scripts/mvp_benchmark_5m.mjs` now writes durable timestamped artifacts under `artifacts/viewer-benchmark-5m/<run-label>`.
- `scripts/mvp_benchmark_5m.mjs` now records explicit failure classifications for:
  - `browser_launch_blocked`
  - `host_not_webgl2_capable`
  - `viewer_live_not_proven`
  - `runtime_regression`
  - `hydration_mismatch`
- Browser-launch failures in the benchmark lane now write a report instead of crashing before artifact serialization.

## Follow-up Boundary

The 5M Chrome failure is current runtime truth, not something this certification-only lane should patch around. Any fix for the `environment_render_failed` / context-loss path still belongs to the viewer/runtime owner, not this lane.
