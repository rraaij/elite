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
- Browser-side determinism probe is covered in Playwright E2E (`apps/web/e2e/determinism.spec.ts`) and runs across browser projects.

### 2.1 Runtime Observation Harness
- Deterministic seeded scripted playthroughs are defined in `packages/game-tests/src/oracleHarness.ts`.
- Per-frame golden captures are stored under `packages/game-tests/oracle/*.json`.
- Capture generation command:

```bash
npm run oracle:generate --workspace @elite/game-tests
```

### 3. Static + Type Gates
- TypeScript project references + Biome checks:

```bash
npm run check
```

### 4. E2E Smoke
- Playwright smoke tests in web workspace.
- Browser matrix includes Chromium, Firefox, WebKit, and mobile emulation profiles.
- Includes desktop/mobile perf smoke assertions based on frame-time sampling.
- Includes deterministic visual golden assertions through `apps/web/e2e/visual-golden.spec.ts`.

```bash
npm run test:e2e
```

CI workflow:
- `.github/workflows/browser-compatibility.yml`

### 5. Cross-Cutting Stream Guards
- `packages/game-tests/src/crossCuttingStreams.test.ts` enforces:
  - X1: required parity test suites exist for all migrated subsystems.
  - X2: variant ids remain confined to variant-aware modules (no literal leaks into unrelated packages).

## CI Expectations
- Replay regression workflow must pass.
- Web delivery workflow must build `apps/web/dist` successfully.

## Failure Triage Order
1. Replay digest mismatch (high severity).
2. Type/schema mismatches in generated/runtime data.
3. Rendering/HUD behavior regressions.
4. UX/polish regressions.

## Gaps / Planned Expansion
- Expanded end-to-end scenario matrix for trading/mission/save-load loops.
