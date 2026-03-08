# Asset Rights Matrix

Status legend:
- `pending`: legal status not yet confirmed.
- `approved`: explicit permission confirmed for production distribution.
- `restricted`: not approved for production distribution.
- `conditional`: approved with constraints.

## Runtime Asset Families

| Asset Family | Source Location | Runtime Use | Current Status | Notes |
| --- | --- | --- | --- | --- |
| Font | `sourcecode/1-source-files/images/C.FONT.bin` | Cockpit/text glyph rendering | `pending` | |
| Dashboard image data | `sourcecode/1-source-files/images/C.CODIALS.bin` | Cockpit panel visuals | `pending` | |
| Docking music data | `sourcecode/1-source-files/music/**/C.COMUDAT.bin` | Music playback | `pending` | |
| Title music data | `sourcecode/1-source-files/music/**/C.THEME.bin` | Music playback | `pending` | |
| Token tables | `sourcecode/4-reference-binaries/*/WORDS.bin` and `IANTOK.bin` | Text/token expansion | `pending` | |
| Ship blueprints | `sourcecode/4-reference-binaries/*/SHIPS.bin` | Wireframe/ship stats | `pending` | |
| Sprite payloads | `sourcecode/4-reference-binaries/*/SPRITE.bin` | Scanner/cockpit sprite use | `pending` | |

## Variant Binary Sets (Reference/Oracle)

| Variant | Source Path | Purpose | Current Status | Notes |
| --- | --- | --- | --- | --- |
| `gma85-ntsc` | `sourcecode/4-reference-binaries/gma85-ntsc` | Build oracle + data extraction input | `pending` | |
| `gma86-pal` | `sourcecode/4-reference-binaries/gma86-pal` | Build oracle + data extraction input | `pending` | |
| `source-disk-build` | `sourcecode/4-reference-binaries/source-disk-build` | Build oracle + data extraction input | `pending` | |
| `source-disk-files` | `sourcecode/4-reference-binaries/source-disk-files` | Build oracle + data extraction input | `pending` | |

## Review Instructions
- Update `Current Status` once legal review is complete.
- If any entry is `restricted` or `conditional`, apply `docs/proprietary-asset-isolation-plan.md` before release.
