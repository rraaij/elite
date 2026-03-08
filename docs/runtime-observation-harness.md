# Runtime Observation Harness

## Purpose
Provide deterministic scenario scripts and per-frame golden captures that can be compared in CI for parity drift.

## Scripted Scenarios
Defined in:
- `packages/game-tests/src/oracleHarness.ts`

Current seeded playthroughs:
- `seed-12345678-flight-combat-cycle`
- `seed-0badc0de-docked-market-ops`

Each scenario defines:
- fixed seed
- fixed frame count / timestep
- frame-indexed control updates

## Per-Frame Golden Outputs
Captured artifacts:
- `packages/game-tests/oracle/seed-12345678-flight-combat-cycle.json`
- `packages/game-tests/oracle/seed-0badc0de-docked-market-ops.json`

Each frame includes key state fields such as:
- heading/speed
- dock/phase status
- station distance
- ship count
- energy/shields
- missile/ECM state
- commander credits

## Selected Reference Visuals
- Chromium-gated reference visual assertions:
  - `apps/web/e2e/reference-visuals.spec.ts`
- Deterministic scene probe exposed by the app runtime:
  - `window.__ELITE_REFERENCE_VISUAL_PROBE__`
- Scene set:
  - `title`
  - `cockpit`
  - `charts`
  - `combat`

## Commands
Generate oracle captures:

```bash
npm run oracle:generate --workspace @elite/game-tests
```

Verify against committed golden captures:

```bash
npm run test --workspace @elite/game-tests -- src/oracleHarness.test.ts src/oracleHarness.test.js
```
