import { describe, expect, it } from "vitest";
import { deserializeLegacyCommanderFile } from "../../game-core/src";

const DEFAULT_LEGACY_COMMANDER_BYTES = Uint8Array.from([
	0x00, 0x14, 0xad, 0x4a, 0x5a, 0x48, 0x02, 0x53, 0xb7, 0x00, 0x00, 0x03, 0xe8, 0x46, 0x00, 0x00,
	0x0f, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x03, 0x00, 0x10, 0x0f, 0x11, 0x00, 0x03, 0x1c, 0x0e, 0x00, 0x00, 0x0a, 0x00,
	0x11, 0x3a, 0x07, 0x09, 0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xaa, 0x27, 0x03,
]);
describe("legacy commander import", () => {
	it("imports valid raw commander payload", () => {
		const parsed = deserializeLegacyCommanderFile(DEFAULT_LEGACY_COMMANDER_BYTES);
		expect(parsed.sourceFormat).toBe("c64-commander-raw");
		expect(parsed.commander.creditsCenticredits).toBe(10_000);
		expect(parsed.commander.fuelTenths).toBe(70);
		expect(parsed.commander.legalStatus).toBe(0);
		expect(parsed.commander.combatRankPoints).toBe(0);
		expect(parsed.flight.missileCount).toBe(3);
	});
	it("imports valid PRG commander payload", () => {
		const prgPayload = Uint8Array.from([0xb3, 0x25, ...DEFAULT_LEGACY_COMMANDER_BYTES]);
		const parsed = deserializeLegacyCommanderFile(prgPayload);
		expect(parsed.sourceFormat).toBe("c64-commander-prg");
		expect(parsed.commander.creditsCenticredits).toBe(10_000);
	});
	it("rejects payload with invalid checksum bytes", () => {
		const corrupted = DEFAULT_LEGACY_COMMANDER_BYTES.slice();
		const checksumByte = corrupted[76] ?? 0;
		corrupted[76] = checksumByte ^ 0x01;
		expect(() => deserializeLegacyCommanderFile(corrupted)).toThrowError(
			"Legacy commander checksum validation failed.",
		);
	});
});
