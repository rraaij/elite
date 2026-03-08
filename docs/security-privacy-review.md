# Security and Privacy Review (Browser Save Data)

## Scope
Review of client-side save persistence and related runtime data handling for the web app.

## Data Stored in Browser
- Save snapshots in `localStorage`:
  - `elite.migration.save-slot-primary`
  - `elite.migration.save-slot-backup`
- Audio/settings and onboarding flags:
  - `elite.migration.audio-settings-v1`
  - `elite.migration.first-run-guide-v1`

## Privacy Posture
- No user account, identity, analytics, or remote persistence is required for core gameplay.
- Stored data is gameplay state/preferences on the local device only.
- No sensitive personal data is intentionally collected by this runtime.

## Security Considerations
- Save payload parsing uses structured deserialize/validation paths before restore.
- Backup slot fallback reduces corruption impact and protects availability.
- Main risk remains same-origin script compromise (XSS) reading localStorage content.

## Mitigations in Place
- Strict typed serialization/deserialization path for save envelopes.
- Corruption-safe restore behavior (primary -> backup fallback).
- No credential/token storage in app local storage keys.

## Residual Risks
- `localStorage` is readable by any injected script in same origin.
- Browser storage is user/device scoped; shared devices may expose game state.
- Legacy commander-file compatibility import path is not yet finalized.

## Recommendations
1. Keep CSP headers strict in deployment to reduce script-injection surface.
2. Keep dependency and supply-chain hygiene in CI (lockfile + audit policy).
3. Document local-data behavior in release notes/user docs.
4. Consider optional user-triggered export/import encryption only if future scope requires it.
