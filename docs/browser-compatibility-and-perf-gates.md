# Browser Compatibility and Performance Gates

## Purpose
Define CI gates used to reduce regression risk for cross-browser behavior and runtime frame pacing.

## Compatibility Gate
- Workflow: `.github/workflows/browser-compatibility.yml`
- Trigger: push to `main`/`master` and pull requests.
- Browsers/projects:
  - Chromium
  - Firefox
  - WebKit
  - Mobile Chrome emulation (`Pixel 7`)
  - Mobile Safari emulation (`iPhone 14`)
- Test command:
  - `pnpm run test:e2e --workspace @elite/web`
- Determinism signal:
  - `apps/web/e2e/determinism.spec.ts` asserts a stable deterministic probe hash across browser projects.

## Performance Smoke Gate
- Test file: `apps/web/e2e/perf.spec.ts`
- Method:
  - collect `requestAnimationFrame` deltas over 180 frames
  - assert average frame delta and p95 remain under conservative thresholds
- Scope:
  - enforced in Chromium project
  - skipped in non-Chromium projects to avoid cross-engine timing noise
- Current thresholds:
  - average `< 34ms`
  - p95 `< 50ms`

## Notes
- Mobile projects are device emulation on CI hardware, not physical-device certification.
- This gate is intended as early warning; deeper hardware profiling still belongs in milestone M5.3.2.
