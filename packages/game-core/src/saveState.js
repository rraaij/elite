/**
 * Converts simulation state into a stable string payload.
 * Browser app code can store this in localStorage or IndexedDB.
 */
export function serializeSaveState(snapshot) {
	const envelope = {
		schemaVersion: 1,
		capturedAtIso: new Date().toISOString(),
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
	if (envelope.schemaVersion !== 1) {
		throw new Error(`Unsupported save schema: ${String(envelope.schemaVersion)}`);
	}
	if (!envelope.snapshot || typeof envelope.snapshot !== "object") {
		throw new Error("Save payload is missing snapshot data.");
	}
	const snapshot = envelope.snapshot;
	if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) {
		throw new Error(`Unsupported simulation snapshot schema: ${String(snapshot.schemaVersion)}`);
	}
	return envelope;
}
