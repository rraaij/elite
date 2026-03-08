# Legal Attestation Guide

Current date context: this guide was prepared on **March 8, 2026**.

## File to Complete
- `docs/legal-attestation.json`

## Required Edits Before Release
1. Set `lastReviewedAtIso` to the actual legal review timestamp (ISO-8601 UTC).
2. Set `reviewedBy.name` and `reviewedBy.role` to the real reviewer identity.
3. Set both permission flags to `true` only if legal has approved:
   - `permissions.derivativeDistributionApproved`
   - `permissions.originalAssetsProductionShippingApproved`
4. Add supporting notes/references in `notes`.

## Validation Command
```bash
npm run legal:check
```

## Helper Commands
Show current legal gate status:

```bash
npm run legal:status
```

Update attestation fields (example):

```bash
npm run legal:attest -- \
  --reviewer-name "Jane Doe" \
  --reviewer-role "Legal Counsel" \
  --derivative-approved true \
  --assets-approved true \
  --notes "Approved for v1 web distribution"
```

## Expected Outcomes
- Fails if metadata is missing/invalid.
- Fails if either permission flag is `false`.
- Passes only when legal sign-off is fully recorded.

## Closing Migration Legal Items
After `npm run legal:check` passes, update legal checklist entries in `MIGRATION.md`:

```bash
npm run legal:close-migration
```
