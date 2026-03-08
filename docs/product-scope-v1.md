# Product Scope Contract (v1)

## Baseline Behavior Target
- Baseline runtime variant: `gma85-ntsc`.
- Default runtime URL behavior continues to resolve to `gma85-ntsc` unless overridden via query parameter.
- PAL and source-disk variants remain supported through generated data packs and variant selection UI.

## Release Feature Tiers

### Tier 1: Parity Core
- Deterministic fixed-step simulation loop.
- Core flight, combat, docking, market, equipment, missions, and save/load loops.
- Deterministic replay baseline and browser determinism probe checks.
- Core rendering stack (wireframe projection, scanner/HUD, cockpit overlays, celestial scene).
- Core audio stack (gameplay cues + title/docking music state policy).

### Tier 2: Extended UX
- Responsive runtime UI for desktop and mobile layouts.
- Pause/menu/settings/help overlays.
- Input remapping and accessibility toggles.
- Touch and gamepad input paths.
- Persistent audio/settings/save-state behavior with corruption fallback.

### Tier 3: Optional Enhancements
- Additional parity-hardening captures and deltas vs legacy oracle assets.
- Expanded scenario automation beyond current smoke/replay/determinism coverage.
- Further platform-specific perf tuning and visual matching refinements.

## v1 Acceptance Criteria
- `npm run check` passes.
- `npm run test` passes.
- `npm run test:replay` passes.
- Browser E2E passes for Chromium baseline and mobile-chrome perf profile (`playwright` project-gated tests may skip by design).
- Visual golden and determinism probes remain stable in Chromium.
- Known issues, release operations, architecture mapping, and testing strategy docs are present and maintained.
