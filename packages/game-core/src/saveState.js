function fnv1a32Hex(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}
function computeSnapshotChecksum(snapshot) {
	return fnv1a32Hex(JSON.stringify(snapshot));
}
function clampByte(value) {
	return Math.min(255, Math.max(0, value & 0xff));
}
function readByte(data, index) {
	const value = data[index];
	if (value === undefined) {
		throw new Error(`Legacy commander payload read out of bounds at index ${index}.`);
	}
	return value;
}
function computeLegacyCommanderChecksum(data) {
	let checksum = 0x49;
	let carry = 0;
	for (let x = 0x49; x > 0; x -= 1) {
		const sum = checksum + carry + readByte(data, x - 1);
		carry = sum > 0xff ? 1 : 0;
		checksum = (sum & 0xff) ^ readByte(data, x);
	}
	return checksum;
}
function computeLegacyCommanderChecksum3(data) {
	let checksum = 0x49;
	let carry = 0;
	for (let x = 0x49; x > 0; x -= 1) {
		checksum ^= x;
		const nextCarry = checksum & 1;
		checksum = ((checksum >>> 1) | (carry << 7)) & 0xff;
		carry = nextCarry;
		const sum = checksum + carry + readByte(data, x - 1);
		carry = sum > 0xff ? 1 : 0;
		checksum = (sum & 0xff) ^ readByte(data, x);
	}
	return checksum;
}
function readUint32Be(data, offset) {
	return (
		((readByte(data, offset) << 24) |
			(readByte(data, offset + 1) << 16) |
			(readByte(data, offset + 2) << 8) |
			readByte(data, offset + 3)) >>>
		0
	);
}
/**
 * Converts simulation state into a stable string payload.
 * Browser app code can store this in localStorage or IndexedDB.
 */
export function serializeSaveState(snapshot) {
	const envelope = {
		schemaVersion: 2,
		capturedAtIso: new Date().toISOString(),
		checksumHex: computeSnapshotChecksum(snapshot),
		snapshot,
	};
	return JSON.stringify(envelope);
}
/**
 * Parses and validates save payloads from storage/import.
 * This is intentionally strict to avoid silent corruption.
 */
export function deserializeSaveState(raw) {
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Save payload is not an object.");
	}
	const envelope = parsed;
	if (envelope.schemaVersion !== 1 && envelope.schemaVersion !== 2) {
		throw new Error(`Unsupported save schema: ${String(envelope.schemaVersion)}`);
	}
	if (!envelope.snapshot || typeof envelope.snapshot !== "object") {
		throw new Error("Save payload is missing snapshot data.");
	}
	const snapshot = envelope.snapshot;
	if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) {
		throw new Error(`Unsupported simulation snapshot schema: ${String(snapshot.schemaVersion)}`);
	}
	const normalizedSnapshot = snapshot;
	const computedChecksumHex = computeSnapshotChecksum(normalizedSnapshot);
	if (envelope.schemaVersion === 2) {
		if (typeof envelope.checksumHex !== "string" || envelope.checksumHex.length !== 8) {
			throw new Error("Save payload is missing checksum.");
		}
		if (envelope.checksumHex !== computedChecksumHex) {
			throw new Error("Save payload checksum mismatch.");
		}
	}
	return {
		schemaVersion: 2,
		capturedAtIso:
			typeof envelope.capturedAtIso === "string"
				? envelope.capturedAtIso
				: new Date(0).toISOString(),
		checksumHex: computedChecksumHex,
		snapshot: normalizedSnapshot,
	};
}
/**
 * Parse C64 legacy commander file payloads (raw 77-byte block or PRG-wrapped 79-byte payload).
 *
 * This importer validates the original dual-checksum scheme before exposing
 * mapped commander fields, so corrupted/invalid binaries are rejected.
 */
export function deserializeLegacyCommanderFile(rawBytes) {
	let sourceFormat = "c64-commander-raw";
	let data = rawBytes;
	if (rawBytes.length === 79) {
		// PRG files include little-endian load address bytes (&25B3).
		if (rawBytes[0] !== 0xb3 || rawBytes[1] !== 0x25) {
			throw new Error("Legacy commander PRG has unexpected load address.");
		}
		data = rawBytes.slice(2);
		sourceFormat = "c64-commander-prg";
	}
	if (data.length !== 77) {
		throw new Error("Legacy commander payload must be 77 bytes (or 79-byte PRG).");
	}
	const checksum = computeLegacyCommanderChecksum(data);
	const checksum3 = computeLegacyCommanderChecksum3(data);
	const encodedChecksum = clampByte(checksum ^ 0xa9);
	if (
		readByte(data, 76) !== checksum ||
		readByte(data, 75) !== checksum3 ||
		readByte(data, 74) !== encodedChecksum
	) {
		throw new Error("Legacy commander checksum validation failed.");
	}
	const creditsDecicredits = readUint32Be(data, 9);
	const creditsCenticredits = Math.min(0x7fff_ffff, creditsDecicredits * 10);
	return {
		sourceFormat,
		commander: {
			creditsCenticredits,
			fuelTenths: clampByte(readByte(data, 13)),
			legalStatus: clampByte(readByte(data, 14)),
			combatRankPoints: clampByte(readByte(data, 15)),
		},
		flight: {
			missileCount: Math.min(7, clampByte(readByte(data, 51))),
		},
	};
}
