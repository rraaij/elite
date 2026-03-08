# Testing Strategy

## Objectives
- Catch deterministic regressions in simulation and replay behavior.
- Protect rendering/data/audio integration contracts.
- Keep web delivery pipeline buildable and reproducible.

## Layers

### 1. Unit + Subsystem Tests (`@elite/game-tests`)
- Framework: Vitest.
- Coverage areas include:
  - byte math / RNG parity helpers
  - canonical state-model transitions
  - fixed-step runner behavior
  - renderer model logic (HUD, color behavior, wireframe projection, raster primitives)
  - replay baseline digests
  - audio cue/music policy parsing

Command:

```bash
npm run test
```

### 2. Deterministic Replay Regression
- Dedicated script:

```bash
npm run test:replay
```

- Runs replay baseline suites only.
- CI workflow (`.github/workflows/replay-regression.yml`) enforces this on push/PR.

### 3. Static + Type Gates
- TypeScript project references + Biome checks:

```bash
npm run check
```

### 4. E2E Smoke
- Playwright smoke tests in web workspace.
- Browser matrix includes Chromium, Firefox, WebKit, and mobile emulation profiles.
- Includes perf smoke assertions based on frame-time sampling.

```bash
npm run test:e2e
```

CI workflow:
- `.github/workflows/browser-compatibility.yml`

## CI Expectations
- Replay regression workflow must pass.
- Web delivery workflow must build `apps/web/dist` successfully.

## Failure Triage Order
1. Replay digest mismatch (high severity).
2. Type/schema mismatches in generated/runtime data.
3. Rendering/HUD behavior regressions.
4. UX/polish regressions.

## Gaps / Planned Expansion
- Browser matrix determinism checks across engines.
- Perf-budget assertions as hard CI gates (currently runtime diagnostics only).
- Expanded end-to-end scenario matrix for trading/mission/save-load loops.
