# Bug Triage and Patch Cadence

## Severity Model
- `S0`: data loss/corruption, boot failure, deterministic replay break in baseline scenarios.
- `S1`: major gameplay regression in core loop (combat/docking/trading/save-load).
- `S2`: feature degradation with workaround; non-core parity drift.
- `S3`: minor UX/cosmetic/documentation issues.

## Response Targets
- `S0`: acknowledge same day; fix or rollback within 24 hours.
- `S1`: acknowledge same day; patch target within 3 business days.
- `S2`: schedule in next planned patch train.
- `S3`: backlog; bundle with maintenance updates.

## Triage Checklist
1. Reproduce using latest `main` and current generated data packs.
2. Classify as parity regression, product UX issue, or platform compatibility issue.
3. Run `npm run check && npm run test && npm run test:replay`.
4. If replay digest changed, treat as `S0` until explicitly approved.
5. Link issue to milestone step(s) and update docs if behavior is accepted divergence.

## Patch Cadence
- Weekly maintenance patch window for non-critical fixes.
- Immediate hotfix path for `S0`/urgent `S1` defects.
- Each patch includes updated notes in `docs/known-issues.md` where applicable.
