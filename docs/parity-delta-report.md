# Parity Delta Report

## Baseline
- Legacy oracle basis: reference binaries and replay digest fixtures in `packages/game-tests`.
- Web baseline: current TypeScript runtime on `gma85-ntsc` first, with additional variant packs generated in `packages/game-data`.

## Delta Summary

### Areas with strong parity confidence
- Deterministic arithmetic helpers (`8/16-bit` overflow behavior) and RNG stepping (`DORND` model).
- Core loop skeleton and replay baseline stability in CI (`npm run test:replay`).
- Wireframe/cockpit renderer primitives and state-driven HUD composition.
- Audio cue policy and basic title/docking music playback transitions.

### Known parity gaps
- Full mission scripting/debrief progression remains incomplete.
- Economy/trading/equipment and long-tail progression rules are not yet fully ported.
- Recursive token/control-code text behavior is partial.
- Browser-matrix determinism checks are not yet hard-gated in CI.
- Mobile performance guardrails are measured diagnostically, not as mandatory CI thresholds.

## Evidence
- Local/CI verification commands:
  - `npm run check`
  - `npm run test`
  - `npm run test:replay`
  - `npm run build:prod`
- Replay regression workflow: `.github/workflows/replay-regression.yml`.
- Web build workflow: `.github/workflows/web-delivery.yml`.

## Decision
Current status is acceptable for an engineering release-candidate track, but not final feature-parity release. Remaining deltas are tracked in milestones M6, M7, M8 exit criteria, and M9 exit criteria in `MIGRATION.md`.
