import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
	console.error(`legal:close failed: ${message}`);
	process.exit(1);
}

const root = process.cwd();
const attestationPath = path.resolve(root, "docs", "legal-attestation.json");
const migrationPath = path.resolve(root, "MIGRATION.md");

let attestation;
try {
	attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
} catch (error) {
	fail(`could not read/parse ${attestationPath}: ${String(error)}`);
}

if (attestation.permissions?.derivativeDistributionApproved !== true) {
	fail("derivativeDistributionApproved must be true");
}
if (attestation.permissions?.originalAssetsProductionShippingApproved !== true) {
	fail("originalAssetsProductionShippingApproved must be true");
}

const requiredLines = [
	"- [ ] Phase M0.1: Legal and distribution readiness.",
	"- [ ] Step M0.1.1: Confirm permission to create and distribute a derivative browser implementation.",
	"- [ ] Step M0.1.2: Confirm whether original assets (`C.FONT.bin`, `C.CODIALS.bin`, `C.COMUDAT.bin`, etc.) may ship in production.",
	"- [ ] Exit criteria M0: legal sign-off + baseline variant + written v1 definition of done.",
	"- [ ] Risk R1: Licensing/distribution restrictions block release.",
	"- [ ] Mitigation R1: resolve rights in M0 before deep implementation.",
	"- [ ] Legal and documentation requirements are complete.",
];

const replacements = [
	[requiredLines[0], "- [x] Phase M0.1: Legal and distribution readiness."],
	[
		requiredLines[1],
		"- [x] Step M0.1.1: Confirm permission to create and distribute a derivative browser implementation.",
	],
	[
		requiredLines[2],
		"- [x] Step M0.1.2: Confirm whether original assets (`C.FONT.bin`, `C.CODIALS.bin`, `C.COMUDAT.bin`, etc.) may ship in production.",
	],
	[
		requiredLines[3],
		"- [x] Exit criteria M0: legal sign-off + baseline variant + written v1 definition of done.",
	],
	[requiredLines[4], "- [x] Risk R1: Licensing/distribution restrictions block release."],
	[requiredLines[5], "- [x] Mitigation R1: resolve rights in M0 before deep implementation."],
	[requiredLines[6], "- [x] Legal and documentation requirements are complete."],
];

let migration = readFileSync(migrationPath, "utf8");
for (const [from, to] of replacements) {
	if (migration.includes(to)) {
		continue;
	}
	if (!migration.includes(from)) {
		fail(`could not find expected checklist line: ${from}`);
	}
	migration = migration.replace(from, to);
}

writeFileSync(migrationPath, migration, "utf8");
console.log("updated legal checklist entries in MIGRATION.md");
