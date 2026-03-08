import { describe, expect, it } from "vitest";
import { parseLegacyMusicTrack } from "../../game-audio/src/index.js";

describe("legacy music parser", () => {
	it("parses title theme frames after header bytes", () => {
		const header = new Array(16).fill(0);
		header[4] = 21;
		const frameBytes = [
			11,
			22,
			33,
			44,
			55, // frame 1
			66,
			77,
			88,
			99,
			111, // frame 2
		];
		const parsed = parseLegacyMusicTrack("title", [...header, ...frameBytes]);
		expect(parsed.frameOffset).toBe(16);
		expect(parsed.frames).toHaveLength(2);
		expect(parsed.frames[0]?.voiceBytes).toEqual([11, 22, 33]);
		expect(parsed.frames[1]?.gateByte).toBe(99);
		expect(parsed.tickMs).toBe(84);
	});
	it("parses docking music from byte zero", () => {
		const bytes = [
			40,
			12,
			13,
			14,
			15, // frame 1 (also provides tempo seed at byte[4])
			1,
			2,
			3,
			4,
			5, // frame 2
		];
		const parsed = parseLegacyMusicTrack("docking", bytes);
		expect(parsed.frameOffset).toBe(0);
		expect(parsed.frames).toHaveLength(2);
		expect(parsed.frames[0]?.mixByte).toBe(15);
		expect(parsed.frames[1]?.voiceBytes).toEqual([1, 2, 3]);
		expect(parsed.tickMs).toBe(60);
	});
});
