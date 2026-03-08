# Scenario Matrix

## Scope
This matrix defines validation scenarios for milestone M10.1.1 across combat, docking, trading, missions, and save/load loops.

## Environments
- Desktop: latest Chromium-based browser, latest Firefox, latest Safari.
- Mobile: iOS Safari and Android Chrome on representative mid-tier hardware.
- Timing profiles: `ntsc` and `pal` where available.

## Matrix

| ID | Domain | Preconditions | Action Sequence | Expected Result |
|---|---|---|---|---|
| COM-01 | Combat | In-space, hostile target spawned | Acquire target, fire primary laser, sustain fire for 5s | Target shield/energy drops deterministically; SFX cues trigger; no runtime errors |
| COM-02 | Combat | Missile equipped, target in lock range | Lock target, launch missile, evade | Lock indicator/state transitions valid; missile state resolves (hit/miss) without desync |
| COM-03 | Combat | ECM-equipped scenario | Trigger inbound missile, activate ECM | Missile threat cleared when rules permit; energy drain behavior consistent |
| DOC-01 | Docking | Station in front arc | Approach and dock in normal speed profile | Dock transition succeeds, docking music state applies, in-station UI shown |
| DOC-02 | Docking | Unsafe approach | Enter station zone with bad alignment/speed | Safety/alert behavior appears; failure mode stable and recoverable |
| TRD-01 | Trading | Docked with starter commander | Buy legal commodity, launch, redock, sell | Cargo/money updates are internally consistent across round trip |
| TRD-02 | Trading | Docked, limited credits | Attempt purchase above credits | Purchase blocked with correct UI status/feedback |
| MIS-01 | Missions | Mission-capable save/profile | Trigger mission briefing path | Mission text path renders expected flow without crashes |
| MIS-02 | Missions | Mid-mission state | Complete mission objective path | Debrief/award transitions execute and persist |
| SAV-01 | Save/Load | Active commander state | Save snapshot, restart app, load snapshot | State restored with matching commander + ship status |
| SAV-02 | Save/Load | Corrupted primary snapshot | Start app with corrupted primary + valid backup | Backup recovery path restores valid state and logs fallback |
| REG-01 | Replay | Baseline fixtures available | Run replay regression suite | Baseline digest matches expected CI oracle |

## Exit Criteria Mapping
- M10.1.1 is considered complete when all scenarios above are documented and each has at least one passing execution record per target profile.

## Reporting Format
For each run, record:
- Date/time (UTC)
- Browser + version
- Variant/profile
- Scenario IDs executed
- Pass/fail with short defect references
