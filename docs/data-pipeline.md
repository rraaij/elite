# Data Conversion Pipeline

## Purpose
Document how source binaries are converted into typed runtime data packs and how to regenerate them.

## Inputs
- Reference variant binaries under `sourcecode/4-reference-binaries/<variant>/`.
- Shared assets under `sourcecode/1-source-files/` (fonts, codials, music payloads).

## Variants
- `gma85-ntsc`
- `gma86-pal`
- `source-disk-build`
- `source-disk-files`

## Generator Entry Point
- Script: `packages/game-data/src/generateDataPacks.ts`
- Workspace command:
  - `npm run generate:data`

## Output
- `packages/game-data/generated/manifest.json`
- `packages/game-data/generated/<variant>/data-pack.json`
- App-synced copy under `apps/web/public/game-data/*` (via web sync script).

## Regeneration Commands
From repository root:

```bash
npm run generate:data
npm run build:prod
```

Web package direct command:

```bash
npm run sync:data --workspace @elite/web
```

## Validation Expectations
- `manifest.json` lists all generated variants and counts.
- `data-pack.json` includes typed sections:
  - `words`, `iantok`, `ships`, `visuals`, `audio`
- CI and local checks should pass after regeneration:

```bash
npm run check
npm run test
```

## Common Failure Modes
- Missing source binaries or moved source paths.
- Variant not listed in parser/generator variant map.
- Generated packs out of sync with app public folder (fix via `sync:data`).

## Change Management
When changing data-pack schema:
1. Update parser/generator types.
2. Regenerate all variant packs.
3. Update app/runtime consumers.
4. Update tests and migration notes.
