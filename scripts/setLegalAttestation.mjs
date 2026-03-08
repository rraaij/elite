import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
	const args = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith("--")) {
			continue;
		}
		const key = token.slice(2);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			args.set(key, "true");
			continue;
		}
		args.set(key, value);
		index += 1;
	}
	return args;
}

function toBoolean(value, key) {
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	throw new Error(`Invalid boolean for --${key}: ${String(value)} (expected true|false)`);
}

const args = parseArgs(process.argv.slice(2));
const filePath = path.resolve(process.cwd(), "docs", "legal-attestation.json");
const current = JSON.parse(readFileSync(filePath, "utf8"));

const next = {
	...current,
	lastReviewedAtIso: args.get("last-reviewed-at") ?? new Date().toISOString(),
	reviewedBy: {
		name: args.get("reviewer-name") ?? current.reviewedBy?.name ?? "TBD",
		role: args.get("reviewer-role") ?? current.reviewedBy?.role ?? "TBD",
	},
	permissions: {
		derivativeDistributionApproved: args.has("derivative-approved")
			? toBoolean(args.get("derivative-approved"), "derivative-approved")
			: current.permissions?.derivativeDistributionApproved === true,
		originalAssetsProductionShippingApproved: args.has("assets-approved")
			? toBoolean(args.get("assets-approved"), "assets-approved")
			: current.permissions?.originalAssetsProductionShippingApproved === true,
	},
	notes: args.get("notes") ?? current.notes ?? "",
};

writeFileSync(filePath, `${JSON.stringify(next, null, "\t")}\n`, "utf8");
console.log(`updated ${path.relative(process.cwd(), filePath)}`);
