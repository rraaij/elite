import { readFileSync } from "node:fs";
import path from "node:path";

const filePath = path.resolve(process.cwd(), "docs", "legal-attestation.json");
const payload = JSON.parse(readFileSync(filePath, "utf8"));

const derivative = payload.permissions?.derivativeDistributionApproved === true;
const assets = payload.permissions?.originalAssetsProductionShippingApproved === true;
const ready = derivative && assets;

console.log("Legal Attestation Status");
console.log(`- reviewedAt: ${payload.lastReviewedAtIso ?? "-"}`);
console.log(`- reviewer: ${payload.reviewedBy?.name ?? "-"} (${payload.reviewedBy?.role ?? "-"})`);
console.log(`- derivativeDistributionApproved: ${String(derivative)}`);
console.log(`- originalAssetsProductionShippingApproved: ${String(assets)}`);
console.log(`- releaseLegalGateReady: ${String(ready)}`);
