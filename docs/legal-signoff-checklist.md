# Legal Sign-Off Checklist

## Scope
This checklist is used to complete `M0.1` and legal release gating in `MIGRATION.md`.

## Decision Log
- Decision owner:
- Legal reviewer:
- Date:
- Repository commit/tag reviewed:
- Update `docs/legal-attestation.json` after sign-off.

## 1. Derivative Distribution Permission (`M0.1.1`)
- [ ] Written permission exists to publish a derivative browser implementation.
- [ ] Permission scope includes public hosting and source distribution model used by this repository.
- [ ] Any attribution, notice, or branding requirements are documented.

Required evidence:
- [ ] Signed email/PDF/license text stored in project legal records.
- [ ] Link/reference recorded in release decision record.

## 2. Original Asset Shipping Permission (`M0.1.2`)
Assets in question include, at minimum:
- `C.FONT.bin`
- `C.CODIALS.bin`
- `C.COMUDAT.bin`
- `C.THEME.bin`
- `WORDS.bin`
- `IANTOK.bin`
- `SHIPS.bin`
- `SPRITE.bin`

For each asset class:
- [ ] Allowed to ship in production as-is.
- [ ] Allowed with constraints (if any constraints, document below).
- [ ] Not allowed to ship.

Constraints/notes:
- 

## 3. Replacement/Isolation Activation (`M0.1.3`, if needed)
- [ ] If any required asset is disallowed, replacement plan from `docs/proprietary-asset-isolation-plan.md` is accepted.
- [ ] Proprietary inputs are excluded from production build pipeline.
- [ ] Release artifacts are verified to contain only approved assets.

## 4. Release Gate
- [ ] `M0.1` can be marked complete.
- [ ] `Risk R1` can be marked mitigated/closed for the current release scope.
- [ ] `Definition of Done` legal requirement can be marked complete.
- [ ] `npm run legal:check` passes.
