# Proprietary Asset Isolation Plan

Use this plan if legal review marks any runtime assets as `restricted` (or partially restricted).

## Objectives
- Keep production artifacts free of disallowed proprietary inputs.
- Preserve deterministic testability for approved assets and replacement assets.
- Avoid scattering legal-condition logic across gameplay modules.

## Strategy

### 1. Isolate Inputs at Data-Pipeline Boundary
- Keep proprietary source blobs isolated to `sourcecode/`.
- Ensure generated runtime packs (`packages/game-data/generated/*`) are produced from:
  - approved original assets, or
  - replacement assets with equivalent schema.

### 2. Replacement Asset Contracts
- Maintain binary parser contracts and output schemas unchanged where possible.
- Replacement assets must satisfy existing parser invariants (length/structure checks).
- For text/audio/graphics replacements, preserve deterministic decoding paths.

### 3. Build/Release Guardrails
- Release workflow must fail if disallowed assets are referenced in production bundle inputs.
- Keep legal status matrix current in `docs/asset-rights-matrix.md`.
- Require legal checklist completion (`docs/legal-signoff-checklist.md`) before tagging releases.

### 4. Runtime Fallback Policy
- If a replacement asset is unavailable for a restricted family:
  - disable that feature behind explicit capability flags, or
  - provide non-infringing placeholder behavior.
- Fallback behavior must be deterministic and covered by tests.

## Suggested Implementation Tasks (Activation Checklist)
- [ ] Add a machine-readable rights policy file consumed by data generation.
- [ ] Teach `game-data` generation to reject restricted assets in production mode.
- [ ] Add CI check for restricted asset references in web build inputs.
- [ ] Add tests for replacement/fallback asset behavior.
- [ ] Update known issues/release notes with any intentionally degraded features.
