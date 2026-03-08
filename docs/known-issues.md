# Known Issues and Compatibility Notes

## Functional
- Mission/debrief flow is partial; some advanced mission triggers are not yet wired end-to-end.
- Economy/progression mechanics are still being completed for full parity.
- Token expansion/control-code handling is not complete for all legacy text cases.

## Platform/Compatibility
- Determinism is validated primarily in core replay suites; full browser-engine matrix checks are still planned.
- Mobile performance can vary on lower-end devices; current diagnostics are informative but not strict fail gates.
- Audio autoplay restrictions may require an initial user gesture before playback on some browsers.

## Reliability
- Save snapshot corruption fallback is implemented, but compatibility import for legacy commander files is not finalized.

## Workarounds
- Use latest stable desktop browser versions for parity-sensitive verification.
- If audio does not start automatically, interact with the page (button/key/tap) to unlock audio context.
- If state appears invalid after a crash, use backup snapshot restore path.

## Tracking
Open issues should reference milestone step IDs in `MIGRATION.md` for clear closure ownership.
