# Accepted Differences (Current)

## Purpose
Document intentional or currently tolerated differences versus original behavior until full parity milestones are complete.

## Accepted Differences
- WebAudio synthesis approximates original SFX/music characteristics rather than cycle-accurate SID emulation.
- Menu/help/settings overlays and onboarding UX are additive browser product features not present in the original runtime.
- Persistence uses browser storage snapshots (primary/backup) rather than original disk I/O model.
- Production delivery includes service-worker based asset caching strategy aligned with web deployment.

## Temporary (To Be Closed)
- Mission/event edge cases (Constrictor/Cougar paths, witchspace special behavior) are incomplete.
- Full economy/equipment progression parity and exact text token/control-code compatibility are incomplete.
- Browser-engine determinism matrix and strict performance gates are not yet enforced as release blockers in CI.

## Guardrails
- Differences above must not undermine deterministic replay baselines already covered by tests.
- Any new intentional divergence must be added to this document with rationale and rollback/closure plan.
