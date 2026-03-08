# Architecture Mapping

## Goal
Map the TypeScript runtime modules to the original C64 Elite source areas so future maintainers can reason about parity work.

## High-Level Mapping
- `packages/game-core` -> core game loop/state routines from `elite-source.asm` (`BEGIN`, `TT170`, `RESET`, `DEATH2`, `TT100`, `MLOOP`) and deterministic arithmetic/RNG semantics.
- `packages/game-data` -> binary extraction from reference artifacts (`WORDS.bin`, `IANTOK.bin`, `SHIPS.bin`, `SPRITE.bin`, `C.FONT.bin`, `C.CODIALS.bin`, `C.COMUDAT.bin`, `C.THEME.bin`).
- `packages/game-renderer` -> software-style raster primitives, wireframe projection/clipping pipeline, cockpit/scanner/HUD visual model.
- `packages/game-input` -> browser input abstraction for deterministic pilot control snapshots.
- `packages/game-audio` -> table-driven SFX and parsed title/docking music playback in WebAudio.
- `packages/game-tests` -> deterministic replay baselines, subsystem regression tests, parity-oriented checks.
- `apps/web` -> browser shell, runtime menus/settings/help, persistence glue, variant/timing controls, production delivery hooks.

## Detailed Mapping

### Core Simulation (`packages/game-core`)
- `stateModel.ts`: canonical game state domains and per-step transitions.
  - Startup/reset/death flow mirrors symbolic entrypoints used by original assembly labels.
  - Flight/combat/missile/ECM/docking behavior currently modeled with deterministic placeholders where full parity remains pending.
- `simulation.ts`: simulation wrapper with edge-triggered control handling and snapshot restore paths.
- `byteMath.ts`: 8/16-bit overflow behavior helpers for parity-sensitive math.
- `dorndRng.ts`: `DORND`-style deterministic RNG stepping.
- `timingProfiles.ts`: PAL/NTSC profile mapping.
- `saveState.ts`: strict envelope format and schema validation for runtime save persistence.

### Data Conversion (`packages/game-data`)
- `binaryParsers.ts`: typed decoding of words/tokens, ships, sprites, raw assets.
- `generateDataPacks.ts`: variant-aware generation of JSON data packs + manifest.
- `generated/*`: produced artifacts consumed by browser runtime and tests.

### Rendering (`packages/game-renderer`)
- `rasterPrimitives.ts`: line/circle/pixel primitives.
- `wireframeProjection.ts`: model-space to screen projection and clipping.
- `celestialScene.ts`: stars/planet/sun scene modeling.
- `cockpitHud.ts`, `cockpitColorBehavior.ts`, `viewTextOverlay.ts`: HUD composition, flashing/alert palette behavior, view text transitions.
- `canvasRenderer.ts`: top-level draw orchestration using simulation snapshot.

### Audio (`packages/game-audio`)
- SFX: table-driven cue definitions with priority, per-cue concurrency caps, and voice stealing.
- Music: parser/player for title/docking data streams with explicit track transition policy.
- Runtime policy helpers: cue edge detection and music-state resolution consumed by `apps/web`.

### Browser Runtime (`apps/web`)
- Runtime bootstrap, URL-configured scenario/variant/timing, and fixed-step loop.
- Overlay UX: menu/help/settings, onboarding guidance, pause/resume controls.
- Persistence: rotating primary/backup save slots + autosave and corruption fallback handling.
- Delivery integration: env-driven data paths and optional service-worker registration.

## Boundaries and Contracts
- Deterministic simulation must remain independent of DOM/WebAudio APIs.
- `apps/web` may consume only stable package interfaces; package internals should not be imported from app code in new work.
- Variant-specific behavior should remain data-driven through generated packs rather than hard-coded branches.

## Current Parity Notes
- Core deterministic replay baselines are enforced in CI.
- Full mission/economy/text/token parity remains incomplete and tracked in `MIGRATION.md` milestones M6/M7.
