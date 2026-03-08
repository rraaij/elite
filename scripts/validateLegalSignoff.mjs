import { readFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
	console.error(`legal:check failed: ${message}`);
	process.exit(1);
}

const root = process.cwd();
const filePath = path.resolve(root, "docs", "legal-attestation.json");
let payload;
try {
	payload = JSON.parse(readFileSync(filePath, "utf8"));
} catch (error) {
	fail(`could not read/parse ${filePath}: ${String(error)}`);
}

if (payload.schemaVersion !== 1) {
	fail(`unsupported schemaVersion: ${String(payload.schemaVersion)}`);
}

if (!payload.lastReviewedAtIso || Number.isNaN(Date.parse(payload.lastReviewedAtIso))) {
	fail("lastReviewedAtIso must be a valid ISO timestamp");
}

const reviewerName = payload.reviewedBy?.name;
const reviewerRole = payload.reviewedBy?.role;
if (typeof reviewerName !== "string" || reviewerName.trim().length < 2) {
	fail("reviewedBy.name must be set");
}
if (typeof reviewerRole !== "string" || reviewerRole.trim().length < 2) {
	fail("reviewedBy.role must be set");
}

const derivativeApproved = payload.permissions?.derivativeDistributionApproved === true;
const assetsApproved = payload.permissions?.originalAssetsProductionShippingApproved === true;

if (!derivativeApproved) {
	fail("derivativeDistributionApproved must be true before release");
}
if (!assetsApproved) {
	fail("originalAssetsProductionShippingApproved must be true before release");
}

console.log("legal:check passed");
