# Legacy Oracle CI

## Purpose
Automate legacy C64 source builds and checksum verification in CI, and archive canonical oracle artifacts per variant.

Workflow:
- `.github/workflows/legacy-build-oracle.yml`

## What It Does
- Builds each variant from `sourcecode/Makefile`:
  - `gma85-ntsc`
  - `gma86-pal`
  - `source-disk-build`
  - `source-disk-files`
- Runs default Makefile verification (`crc32.py` check against `4-reference-binaries/<variant>`).
- Produces a machine-readable manifest for each variant via:
  - `sourcecode/2-build-files/generate-artifact-manifest.py`
- Uploads per-variant artifacts:
  - build log (`legacy-build-<variant>.log`)
  - manifest (`legacy-manifest-<variant>.json`)
  - canonical references (`sourcecode/4-reference-binaries/<variant>`)
  - assembled output binaries (`sourcecode/3-assembled-output/*.bin`)

## Local Reproduction
```bash
cd sourcecode
make variant=gma85-ntsc
python3 2-build-files/generate-artifact-manifest.py \
  --variant gma85-ntsc \
  --output ../legacy-manifest-gma85-ntsc.json
```
