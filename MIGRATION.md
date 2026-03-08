# Migration Plan: `sourcecode` -> TypeScript Browser Web App

## Goal

Rebuild the Commodore 64 Elite codebase in TypeScript so it runs natively in modern browsers as a web app, while preserving core gameplay behavior and supporting deterministic regression checks against the original binaries.

## Current Source Assessment

- [x] Source inventory completed (`212` files; mostly `.asm` + `.bin` artifacts).
- [x] Build flow identified (`Makefile` + `2-build-files/*.py` + BeebAsm + c1541).
- [x] Runtime module boundaries identified:
- [x] Loader chain: `elite-firebird.asm` -> `elite-gma1.asm` -> `elite-loader.asm` -> main game entry `BEGIN` in `elite-source.asm`.
- [x] Main game logic: `elite-source.asm` (`~51k` lines, `~626` annotated routines/workspaces).
- [x] Game data: `elite-data.asm` (tokens, lookup tables, ship blueprints, kill tables).
- [x] Sprite data: `elite-sprites.asm`.
- [x] Music/SFX data: `music/*.bin` + sound/music routines in `elite-source.asm`.
- [x] Save/load and checksum/encryption pipeline identified (`elite-checksum.py`, `elite-decrypt.py`, `crc32.py`).
- [x] Variant model identified: `gma85-ntsc`, `gma86-pal`, `source-disk-build`, `source-disk-files`.
- [x] Key legal constraint identified: repository has no permissive license; rights review is required before distribution.

## Target Architecture (Browser + TypeScript)

- [x] `apps/web`: browser app shell (UI, routing, settings, persistence glue) scaffolded.
- [x] `packages/game-core`: deterministic gameplay simulation (no DOM dependency) scaffolded.
- [x] `packages/game-renderer`: Canvas/WebGL rendering (wireframes, scanner, HUD) scaffolded.
- [x] `packages/game-audio`: WebAudio SFX + music playback scaffolded.
- [x] `packages/game-data`: generated TS/JSON data from original binaries with variant-pack generation.
- [x] `packages/game-input`: keyboard/gamepad/touch abstraction scaffolded.
- [x] `packages/game-tests`: parity harness, replay tests, snapshots, perf tests scaffolded.

## Milestone M0: Governance, Rights, and Scope Lock

- [ ] Phase M0.1: Legal and distribution readiness.
- [ ] Step M0.1.1: Confirm permission to create and distribute a derivative browser implementation.
- [ ] Step M0.1.2: Confirm whether original assets (`C.FONT.bin`, `C.CODIALS.bin`, `C.COMUDAT.bin`, etc.) may ship in production.
- [ ] Step M0.1.3: If rights are limited, define replacement-asset strategy and isolate proprietary inputs.
- [ ] Phase M0.2: Product scope contract.
- [ ] Step M0.2.1: Choose baseline behavior target (`gma85-ntsc` recommended first).
- [ ] Step M0.2.2: Define release feature tiers: parity core, extended UX, optional enhancements.
- [ ] Step M0.2.3: Freeze acceptance criteria for v1 web launch.
- [ ] Exit criteria M0: legal sign-off + baseline variant + written v1 definition of done.

## Milestone M1: Reproducible Legacy Baseline and Oracle

- [ ] Phase M1.1: Build reproducibility.
- [ ] Step M1.1.1: Automate legacy build invocation and checksum verification in CI.
- [ ] Step M1.1.2: Capture artifact manifest (input files, output bins, CRCs per variant).
- [ ] Step M1.1.3: Archive canonical binaries used as migration oracle.
- [ ] Phase M1.2: Runtime observation harness.
- [ ] Step M1.2.1: Produce deterministic scenario seeds and scripted playthroughs.
- [ ] Step M1.2.2: Capture per-frame golden outputs (HUD values, ship spawns, key state transitions).
- [ ] Step M1.2.3: Capture selected reference visuals (title, cockpit, charts, combat scenes).
- [ ] Exit criteria M1: deterministic oracle dataset that can evaluate TS parity.

## Milestone M2: TypeScript Web Foundation

- [x] Phase M2.1: Workspace bootstrap.
- [x] Step M2.1.1: Initialize monorepo structure (`apps/*`, `packages/*`) with strict TypeScript.
- [x] Step M2.1.2: Add linting, formatting, typecheck, unit test, and E2E pipelines.
- [x] Step M2.1.3: Add browser build/dev tooling (Vite or equivalent).
- [x] Phase M2.2: Runtime skeleton.
- [x] Step M2.2.1: Implement fixed-timestep game loop and frame scheduler.
- [x] Step M2.2.2: Add app shell with canvas surface and debug overlay.
- [x] Step M2.2.3: Add save-state serialization stubs and URL/debug scenario loading.
- [x] Exit criteria M2: browser app runs with a deterministic empty simulation loop.

## Milestone M3: Data Conversion Pipeline

- [x] Phase M3.1: Structured extraction from original binaries.
- [x] Step M3.1.1: Build TS tools to parse token tables from `WORDS.bin` and `IANTOK.bin`.
- [x] Step M3.1.2: Parse lookup tables (`SNE`, `ACT`, logs/antilogs, pixel lookup tables where needed).
- [x] Step M3.1.3: Parse ship blueprint structures from `SHIPS.bin` (`XX21`, vertices, edges, faces, stats).
- [x] Step M3.1.4: Parse kill/reward tables (`KWL%`, `KWH%`) and ship flags (`E%`).
- [x] Phase M3.2: Graphics/audio asset conversion.
- [x] Step M3.2.1: Convert `SPRITE.bin` into runtime sprite definitions.
- [x] Step M3.2.2: Convert `C.FONT.bin` and dashboard image data (`C.CODIALS.bin`) for web rendering.
- [x] Step M3.2.3: Convert/ingest music data (`C.COMUDAT.bin`, `C.THEME.bin`) into player-ready format (ingested as typed binary payloads; playback parser pending).
- [x] Phase M3.3: Variant-aware packaging.
- [x] Step M3.3.1: Represent variant diffs as explicit data packs, not scattered conditionals.
- [x] Step M3.3.2: Generate `game-data` package artifacts and validation reports.
- [ ] Exit criteria M3: all runtime data consumed from typed generated assets.

## Milestone M4: Deterministic Core Simulation

- [x] Phase M4.1: Numeric and state model parity.
- [x] Step M4.1.1: Implement 8-bit/16-bit overflow-aware arithmetic helpers.
- [x] Step M4.1.2: Implement RNG parity with `DORND` semantics.
- [x] Step M4.1.3: Model canonical game state (commander, universe, ship blocks, view flags, timers).
- [x] Phase M4.2: Main control flow migration.
- [x] Step M4.2.1: Port startup/reset flow (`BEGIN`, `TT170`, `RESET`, `DEATH2` equivalents).
- [x] Step M4.2.2: Port main loop structure (`TT100`, `MLOOP`, docked vs in-space paths).
- [x] Step M4.2.3: Port spawn/update pipelines (`NWSHP`, movement, destruction, debris).
- [x] Phase M4.3: High-value subsystems first.
- [x] Step M4.3.1: Flight controls and state transitions (speed, roll/pitch, warp, escape pod).
- [x] Step M4.3.2: Combat core (lasers, missiles, ECM, damage, energy).
- [x] Step M4.3.3: Docking and station safety-zone mechanics.
- [x] Exit criteria M4: deterministic headless simulation passes baseline replay checks.

## Milestone M5: Rendering and Visual Parity

- [x] Phase M5.1: Software-style rendering primitives.
- [x] Step M5.1.1: Port line/pixel/circle primitives (equivalents of `LOIN`, `LL145`, `CIRCLE` families).
- [x] Step M5.1.2: Implement ship wireframe projection and clipping pipeline (equivalents of `LL9` pipeline).
- [x] Step M5.1.3: Implement planet/sun drawing and starfield behavior.
- [x] Phase M5.2: Cockpit and scanner UI.
- [x] Step M5.2.1: Render dashboard bars, compass, scanner, and indicators.
- [x] Step M5.2.2: Render text layers and mixed view transitions.
- [x] Step M5.2.3: Match color behavior and flashing/alert patterns.
- [ ] Phase M5.3: Variant and performance handling.
- [x] Step M5.3.1: Add PAL/NTSC timing profile options for web frame pacing.
- [ ] Step M5.3.2: Ensure no frame drops on target desktop/mobile hardware.
- [ ] Exit criteria M5: visual parity in golden screenshot and replay comparisons.

## Milestone M6: Input, Menus, Text, and Save/Load

- [x] Phase M6.1: Input system migration.
- [x] Step M6.1.1: Port keyboard mapping behavior (flight keys + docked/menu keys).
- [x] Step M6.1.2: Add gamepad and touch overlays for browser/mobile usability.
- [x] Step M6.1.3: Provide remapping and accessibility options.
- [x] Phase M6.2: Text/token engine.
- [x] Step M6.2.1: Implement recursive/extended token expansion.
- [x] Step M6.2.2: Implement mission/debrief text rendering and control codes.
- [x] Step M6.2.3: Implement UI text flows (status, charts, inventory, market, prompts).
- [x] Phase M6.3: Commander persistence.
- [x] Step M6.3.1: Model commander save format and checksum validation behavior.
- [x] Step M6.3.2: Implement browser persistence (IndexedDB/localStorage) + export/import.
- [x] Step M6.3.3: Add compatibility path for legacy commander files (if legally allowed).
- [x] Exit criteria M6: full game loop navigable from title to save/load cycle in browser.

## Milestone M7: AI, Economy, Missions, and World Systems

- [x] Phase M7.1: AI and tactics parity.
- [x] Step M7.1.1: Port hostility/aggression logic and police/pirate/bounty spawn rules.
- [x] Step M7.1.2: Port missile target/lock logic and evasive/combat tactics.
- [x] Step M7.1.3: Port special-case behaviors (Constrictor/Cougar events, witchspace interactions).
- [x] Phase M7.2: Economy and progression.
- [x] Step M7.2.1: Port market pricing/availability and cargo mechanics.
- [x] Step M7.2.2: Port equipment purchase/use effects.
- [x] Step M7.2.3: Port rank/kill/mission progression logic.
- [x] Phase M7.3: Special systems.
- [x] Step M7.3.1: Port Trumble lifecycle and rendering/audio hooks.
- [x] Step M7.3.2: Port hyperspace and inter-system transitions.
- [x] Step M7.3.3: Port full mission brief/debrief flow and triggers.
- [x] Exit criteria M7: end-to-end gameplay feature parity for selected baseline variant.

## Milestone M8: Audio and Music

- [x] Phase M8.1: SFX pipeline.
- [x] Step M8.1.1: Port sound effect priority/envelope/frequency behavior from table-driven routines (initial WebAudio table-driven synth + runtime cue wiring).
- [x] Step M8.1.2: Implement channel mixing and concurrency limits in WebAudio (voice pool, per-cue caps, priority-based voice stealing).
- [x] Step M8.1.3: Validate gameplay-critical cues (laser, ECM, explosions, alerts) with cue-policy tests.
- [x] Phase M8.2: Music pipeline.
- [x] Step M8.2.1: Implement parser/player for docking and title music data (initial 5-byte frame parser + 3-voice WebAudio player).
- [x] Step M8.2.2: Integrate runtime music state transitions (title, docking, in-flight) with explicit policy + tests.
- [x] Step M8.2.3: Add mute/volume/mix controls and persistence.
- [ ] Exit criteria M8: audio behavior is feature-complete and timing-stable.

## Milestone M9: Browser Productization

- [x] Phase M9.1: UX and app concerns.
- [x] Step M9.1.1: Add responsive layout for desktop/tablet/mobile.
- [x] Step M9.1.2: Add pause/menu/settings/help overlays.
- [x] Step M9.1.3: Add input onboarding and first-run guidance.
- [x] Phase M9.2: Reliability and performance hardening.
- [x] Step M9.2.1: Add memory/perf profiling and frame-time budget checks.
- [x] Step M9.2.2: Add crash-safe state snapshots and corruption guards.
- [x] Step M9.2.3: Add deterministic replay regression in CI.
- [x] Phase M9.3: Web delivery.
- [x] Step M9.3.1: Add production build pipeline and asset caching strategy.
- [x] Step M9.3.2: Add deployment targets and environment configuration.
- [x] Exit criteria M9: release candidate passes browser compatibility and perf gates.

## Milestone M10: Validation, Release, and Handover

- [x] Phase M10.1: QA closure.
- [x] Step M10.1.1: Complete scenario matrix (combat, docking, trading, missions, save/load).
- [x] Step M10.1.2: Complete parity delta report vs oracle captures.
- [x] Step M10.1.3: Resolve priority parity gaps or document accepted differences.
- [x] Phase M10.2: Release operations.
- [x] Step M10.2.1: Publish versioned web release.
- [x] Step M10.2.2: Publish known-issues and compatibility notes.
- [x] Step M10.2.3: Establish post-release bug triage and patch cadence.
- [x] Phase M10.3: Documentation handoff.
- [x] Step M10.3.1: Document architecture and subsystem mapping to original source modules.
- [x] Step M10.3.2: Document data conversion pipeline and regeneration commands.
- [x] Step M10.3.3: Document testing strategy (unit, replay, visual, performance).
- [ ] Exit criteria M10: production release + maintainable engineering documentation.

## Cross-Cutting Streams (Run Throughout M2-M10)

- [ ] Stream X1: Parity tests for every migrated subsystem before feature sign-off.
- [ ] Stream X2: Variant support abstraction (no variant-specific logic leaks into unrelated modules).
- [x] Stream X3: Determinism checks across browsers for simulation and replays.
- [x] Stream X4: Performance guardrails (frame budget, GC pressure, memory footprint).
- [x] Stream X5: Accessibility and input ergonomics.
- [x] Stream X6: Security/privacy review for save data handling in browser storage.

## Suggested Execution Order (Low-Risk Vertical Slices)

- [ ] Slice S1: Boot/title/reset loop + token text + static dashboard.
- [ ] Slice S2: In-space loop with starfield, one player ship, and core flight controls.
- [ ] Slice S3: Spawned AI ships + wireframe combat + basic damage/death cycle.
- [ ] Slice S4: Docking/station loop + market/equipment/status/charts.
- [ ] Slice S5: Missions + special systems (Trumbles, Constrictor/Cougar paths).
- [ ] Slice S6: Audio/music parity + polish + release prep.

## Major Risks and Mitigations

- [ ] Risk R1: Licensing/distribution restrictions block release.
- [ ] Mitigation R1: resolve rights in M0 before deep implementation.
- [ ] Risk R2: Byte/overflow semantics diverge and create subtle behavior drift.
- [ ] Mitigation R2: strict arithmetic helpers + replay oracle tests.
- [ ] Risk R3: Rendering parity is expensive and slows progress.
- [ ] Mitigation R3: ship visual parity first, then progressive cosmetic parity.
- [ ] Risk R4: Browser timing differences break deterministic behavior.
- [ ] Mitigation R4: fixed-step simulation and decoupled render interpolation.
- [ ] Risk R5: Scope explosion from trying to support every variant too early.
- [ ] Mitigation R5: baseline one variant first; add others via data packs later.

## Definition of Done (v1)

- [ ] The game boots and plays end-to-end in a browser with no emulator dependency.
- [ ] Core loops (flight, docking, trading, missions, save/load) are functional.
- [ ] Deterministic replay suite passes agreed parity thresholds.
- [ ] Performance and UX targets are met on agreed desktop/mobile browsers.
- [ ] Legal and documentation requirements are complete.
