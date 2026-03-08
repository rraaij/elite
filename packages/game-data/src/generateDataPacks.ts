import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFontBinary,
  parseIantokBinary,
  parseRawBinaryAsset,
  parseShipsBinary,
  parseSpriteBinary,
  parseWordsBinary,
  VARIANT_IDS,
  type VariantId,
} from "./binaryParsers.js";

/**
 * Schema marker for generated game-data artifacts.
 * Increment when JSON shape changes in a non-backward-compatible way.
 */
const DATA_PACK_SCHEMA_VERSION = 1;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_FROM_MODULE = path.resolve(MODULE_DIR, "..", "..", "..");

interface DataPackPaths {
  wordsPath: string;
  iantokPath: string;
  shipsPath: string;
  spritePath: string;
  fontPath: string;
  codialsPath: string;
  comudatPath: string;
  themePath: string;
}

interface VariantDataPack {
  schemaVersion: number;
  variantId: VariantId;
  generatedAtIso: string;
  sources: DataPackPaths;
  words: ReturnType<typeof parseWordsBinary>;
  iantok: ReturnType<typeof parseIantokBinary>;
  ships: ReturnType<typeof parseShipsBinary>;
  visuals: {
    sprites: ReturnType<typeof parseSpriteBinary>;
    font: ReturnType<typeof parseFontBinary>;
    codials: ReturnType<typeof parseRawBinaryAsset>;
  };
  audio: {
    comudat: ReturnType<typeof parseRawBinaryAsset>;
    theme: ReturnType<typeof parseRawBinaryAsset>;
  };
}

interface VariantSummary {
  variantId: VariantId;
  wordsTokenCount: number;
  wordsPaddingBytes: number;
  iantokTokenCount: number;
  iantokTrailingPayloadBytes: number;
  shipBlueprintCount: number;
  spriteCount: number;
  fontGlyphCount: number;
  codialsBytes: number;
  comudatBytes: number;
  themeBytes: number;
}

interface DataPackManifest {
  schemaVersion: number;
  generatedAtIso: string;
  sourceRoot: string;
  outputRoot: string;
  variants: VariantSummary[];
}

interface CliOptions {
  sourceRoot: string;
  outputRoot: string;
  variants: VariantId[];
}

/**
 * Parses command-line options with explicit flags to keep automation stable.
 *
 * Supported flags:
 * - --source-root <path>
 * - --output-root <path>
 * - --variants <comma-separated-list>
 */
function parseCliOptions(argv: readonly string[]): CliOptions {
  let sourceRoot = path.resolve(REPO_ROOT_FROM_MODULE, "sourcecode/4-reference-binaries");
  let outputRoot = path.resolve(REPO_ROOT_FROM_MODULE, "packages/game-data/generated");
  let variants: VariantId[] = [...VARIANT_IDS];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--source-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --source-root.");
      }
      sourceRoot = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }

    if (arg === "--output-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --output-root.");
      }
      outputRoot = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }

    if (arg === "--variants") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --variants.");
      }

      const requested = value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      const invalid = requested.filter(
        (entry): entry is string => !VARIANT_IDS.includes(entry as VariantId),
      );
      if (invalid.length > 0) {
        throw new Error(`Unknown variant id(s): ${invalid.join(", ")}.`);
      }

      variants = requested as VariantId[];
      index += 1;
      continue;
    }
  }

  return {
    sourceRoot,
    outputRoot,
    variants,
  };
}

/**
 * Reads all required binary inputs for a single variant.
 */
function loadVariantBinaries(sourceRoot: string, variantId: VariantId): DataPackPaths {
  const variantRoot = path.join(sourceRoot, variantId);
  const sharedRoot = path.resolve(REPO_ROOT_FROM_MODULE, "sourcecode/1-source-files");

  // Music assets are organized differently by build family.
  const comudatPathByVariant: Record<VariantId, string> = {
    "gma85-ntsc": path.join(sharedRoot, "music/gma/C.COMUDAT.bin"),
    "gma86-pal": path.join(sharedRoot, "music/gma/C.COMUDAT.bin"),
    "source-disk-build": path.join(sharedRoot, "music/source-disk-build/C.COMUDAT.bin"),
    "source-disk-files": path.join(sharedRoot, "music/source-disk-files/C.COMUDAT.bin"),
  };

  const themePathByVariant: Record<VariantId, string> = {
    "gma85-ntsc": path.join(sharedRoot, "music/gma/C.THEME.bin"),
    "gma86-pal": path.join(sharedRoot, "music/gma/C.THEME.bin"),
    "source-disk-build": path.join(sharedRoot, "music/source-disk/C.THEME.bin"),
    "source-disk-files": path.join(sharedRoot, "music/source-disk/C.THEME.bin"),
  };

  return {
    wordsPath: path.join(variantRoot, "WORDS.bin"),
    iantokPath: path.join(variantRoot, "IANTOK.bin"),
    shipsPath: path.join(variantRoot, "SHIPS.bin"),
    spritePath: path.join(variantRoot, "SPRITE.bin"),
    fontPath: path.join(sharedRoot, "fonts/C.FONT.bin"),
    codialsPath: path.join(sharedRoot, "images/C.CODIALS.bin"),
    comudatPath: comudatPathByVariant[variantId],
    themePath: themePathByVariant[variantId],
  };
}

/**
 * Writes a JSON file with normalized formatting so diffs stay readable.
 */
async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, json, "utf8");
}

/**
 * Generates one complete variant pack from binary inputs.
 */
async function generateVariantDataPack(
  sourceRoot: string,
  outputRoot: string,
  variantId: VariantId,
): Promise<VariantSummary> {
  const sourcePaths = loadVariantBinaries(sourceRoot, variantId);
  const [wordsRaw, iantokRaw, shipsRaw, spriteRaw, fontRaw, codialsRaw, comudatRaw, themeRaw] =
    await Promise.all([
      readFile(sourcePaths.wordsPath),
      readFile(sourcePaths.iantokPath),
      readFile(sourcePaths.shipsPath),
      readFile(sourcePaths.spritePath),
      readFile(sourcePaths.fontPath),
      readFile(sourcePaths.codialsPath),
      readFile(sourcePaths.comudatPath),
      readFile(sourcePaths.themePath),
    ]);

  // Parse each binary into typed structures that application code can consume.
  const words = parseWordsBinary(wordsRaw);
  const iantok = parseIantokBinary(iantokRaw);
  const ships = parseShipsBinary(shipsRaw);
  const sprites = parseSpriteBinary(spriteRaw);
  const font = parseFontBinary(fontRaw);
  const codials = parseRawBinaryAsset(codialsRaw);
  const comudat = parseRawBinaryAsset(comudatRaw);
  const theme = parseRawBinaryAsset(themeRaw);

  const variantDataPack: VariantDataPack = {
    schemaVersion: DATA_PACK_SCHEMA_VERSION,
    variantId,
    generatedAtIso: new Date().toISOString(),
    sources: sourcePaths,
    words,
    iantok,
    ships,
    visuals: {
      sprites,
      font,
      codials,
    },
    audio: {
      comudat,
      theme,
    },
  };

  const variantOutputRoot = path.join(outputRoot, variantId);
  await mkdir(variantOutputRoot, { recursive: true });
  await writeJsonFile(path.join(variantOutputRoot, "data-pack.json"), variantDataPack);

  return {
    variantId,
    wordsTokenCount: words.tokenCount,
    wordsPaddingBytes: words.trailingPaddingBytes.length,
    iantokTokenCount: iantok.tokenCount,
    iantokTrailingPayloadBytes: iantok.trailingPayloadBytes.length,
    shipBlueprintCount: ships.blueprints.length,
    spriteCount: sprites.spriteCount,
    fontGlyphCount: font.glyphCount,
    codialsBytes: codials.byteLength,
    comudatBytes: comudat.byteLength,
    themeBytes: theme.byteLength,
  };
}

/**
 * Main generator entry point used by `npm run generate` in @elite/game-data.
 */
export async function generateDataPacks(argv: readonly string[]): Promise<void> {
  const options = parseCliOptions(argv);
  await mkdir(options.outputRoot, { recursive: true });

  const summaries: VariantSummary[] = [];
  for (const variantId of options.variants) {
    // Generate sequentially to keep console output and failure handling simple.
    const summary = await generateVariantDataPack(
      options.sourceRoot,
      options.outputRoot,
      variantId,
    );
    summaries.push(summary);
  }

  const manifest: DataPackManifest = {
    schemaVersion: DATA_PACK_SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    sourceRoot: options.sourceRoot,
    outputRoot: options.outputRoot,
    variants: summaries,
  };

  await writeJsonFile(path.join(options.outputRoot, "manifest.json"), manifest);
}

/**
 * CLI bridge.
 *
 * We keep process exit behavior explicit so CI surfaces parser failures clearly.
 */
const invokedScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (modulePath === invokedScriptPath) {
  generateDataPacks(process.argv.slice(2))
    .then(() => {
      process.stdout.write("Generated game-data packs successfully.\n");
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
