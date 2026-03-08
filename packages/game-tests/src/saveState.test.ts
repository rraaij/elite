import { describe, expect, it } from "vitest";
import {
	createEmptySimulation,
	deserializeSaveState,
	serializeSaveState,
} from "../../game-core/src";

describe("saveState checksum envelope", () => {
	it("serializes schema v2 envelopes with checksum", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 1337 });
		simulation.step(16.67);

		const raw = serializeSaveState(simulation.snapshot());
		const envelope = deserializeSaveState(raw);

		expect(envelope.schemaVersion).toBe(2);
		expect(envelope.checksumHex).toMatch(/^[0-9a-f]{8}$/);
		expect(envelope.snapshot.schemaVersion).toBe(2);
	});

	it("rejects tampered snapshot payloads with checksum mismatch", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 42 });
		const envelope = JSON.parse(serializeSaveState(simulation.snapshot()));
		envelope.snapshot.tick = 9999;

		expect(() => deserializeSaveState(JSON.stringify(envelope))).toThrowError(
			"Save payload checksum mismatch.",
		);
	});

	it("accepts legacy schema v1 envelopes and upgrades them to v2", () => {
		const simulation = createEmptySimulation({ scenarioId: "empty", seed: 7 });
		simulation.step(16.67);
		const snapshot = simulation.snapshot();

		const legacyRaw = JSON.stringify({
			schemaVersion: 1,
			capturedAtIso: "2026-01-01T00:00:00.000Z",
			snapshot,
		});
		const envelope = deserializeSaveState(legacyRaw);

		expect(envelope.schemaVersion).toBe(2);
		expect(envelope.snapshot.tick).toBe(snapshot.tick);
		expect(envelope.checksumHex).toMatch(/^[0-9a-f]{8}$/);
	});
});
