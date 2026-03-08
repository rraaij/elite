# Release Operations

## Purpose
Define how to publish a versioned web release and what gates must pass before shipping.

## Release Inputs
- A semantic version tag in the form `vX.Y.Z` (example: `v0.2.0`).
- Green CI for replay regression and web build pipelines on `main`.

## Standard Release Flow
1. Ensure local branch is up to date with `main`.
2. Run release gates locally:
   - `npm run check`
   - `npm run test`
   - `npm run test:replay`
   - `npm run build:prod`
3. Create and push an annotated tag:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

4. GitHub Actions `Release Web` workflow runs automatically for the tag and publishes:
   - GitHub Release with auto-generated notes.
   - Versioned artifact `web-dist-vX.Y.Z.tar.gz` containing `apps/web/dist`.

## Manual Release Option
- Use `Release Web` via `workflow_dispatch` and provide:
  - `release_tag` (required)
  - `prerelease` (`true` for RC/beta streams)

## Rollback and Hotfix
1. Create `vX.Y.Z+hotfix` equivalent semantic tag sequence (for example `v0.2.1`).
2. Run the same gates.
3. Publish via tag push.
4. Update `docs/known-issues.md` with incident summary and resolution.

## Ownership
- Release manager: repository maintainer on duty.
- Triage policy and severity response targets are defined in `docs/triage-policy.md`.
