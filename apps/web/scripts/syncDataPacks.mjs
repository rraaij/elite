import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * This script copies generated data packs into the Vite public directory.
 * Keeping this as an explicit step avoids bundling very large JSON files and
 * lets the app load variant packs through stable `/game-data/*` URLs.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const sourceRoot = path.join(repoRoot, "packages", "game-data", "generated");
const targetRoot = path.join(repoRoot, "apps", "web", "public", "game-data");

async function syncDataPacks() {
	// Fail fast with a clear message when generator output is missing.
	try {
		await access(sourceRoot);
	} catch {
		throw new Error(
			[
				"Generated data packs not found.",
				`Expected source directory: ${sourceRoot}`,
				"Run `npm run generate:data` before syncing.",
			].join("\n"),
		);
	}

	// Ensure the parent public directory exists before replacing `game-data`.
	await mkdir(path.dirname(targetRoot), { recursive: true });

	// Replace prior sync output to avoid stale variant artifacts.
	await rm(targetRoot, { recursive: true, force: true });
	await cp(sourceRoot, targetRoot, { recursive: true, force: true });

	process.stdout.write(`Synced generated packs to ${targetRoot}\n`);
}

syncDataPacks().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	process.stderr.write(`${message}\n`);
	process.exitCode = 1;
});
