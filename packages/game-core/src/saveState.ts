import type { LegacySimulationSnapshot, SimulationSnapshot } from "./simulation";

export type AnySupportedSimulationSnapshot = SimulationSnapshot | LegacySimulationSnapshot;

/**
 * Envelope around snapshots so we can add metadata and future migrations.
 */
export interface SaveStateEnvelope {
	schemaVersion: 1;
	capturedAtIso: string;
	snapshot: AnySupportedSimulationSnapshot;
}

/**
 * Converts simulation state into a stable string payload.
 * Browser app code can store this in localStorage or IndexedDB.
 */
export function serializeSaveState(snapshot: SimulationSnapshot): string {
	const envelope: SaveStateEnvelope = {
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
export function deserializeSaveState(raw: string): SaveStateEnvelope {
	const parsed: unknown = JSON.parse(raw);

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Save payload is not an object.");
	}

	const envelope = parsed as Partial<SaveStateEnvelope>;
	if (envelope.schemaVersion !== 1) {
		throw new Error(`Unsupported save schema: ${String(envelope.schemaVersion)}`);
	}

	if (!envelope.snapshot || typeof envelope.snapshot !== "object") {
		throw new Error("Save payload is missing snapshot data.");
	}

	const snapshot = envelope.snapshot as Partial<AnySupportedSimulationSnapshot>;
	if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) {
		throw new Error(`Unsupported simulation snapshot schema: ${String(snapshot.schemaVersion)}`);
	}

	return envelope as SaveStateEnvelope;
}
