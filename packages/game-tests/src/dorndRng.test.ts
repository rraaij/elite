import { describe, expect, it } from "vitest";
import { createDorndGenerator, dorndStep } from "../../game-core/src/index";

describe("DORND RNG parity", () => {
	it("produces a stable byte sequence for a known seed with cleared carry", () => {
		const rng = createDorndGenerator(
			{
				rand0: 0x01,
				rand1: 0x02,
				rand2: 0x03,
				rand3: 0x04,
			},
			false,
		);

		// The first sequence is hand-verified from the 6502 arithmetic flow.
		const s1 = rng.dornd2();
		const s2 = rng.dornd2();
		const s3 = rng.dornd2();
		const s4 = rng.dornd2();

		expect([s1.a, s2.a, s3.a, s4.a]).toEqual([0x06, 0x08, 0x0e, 0x16]);
		expect([s1.x, s2.x, s3.x, s4.x]).toEqual([0x02, 0x06, 0x08, 0x0e]);
		expect(rng.getSeed()).toEqual({
			rand0: 0x5c,
			rand1: 0x16,
			rand2: 0x44,
			rand3: 0x0e,
		});
	});

	it("uses incoming carry for DORND and clears it for DORND2", () => {
		const seed = {
			rand0: 0x80,
			rand1: 0x10,
			rand2: 0x20,
			rand3: 0x30,
		};

		// First call honors incoming carry=true, so ROL inserts bit 0 = 1.
		const withCarry = dorndStep(seed, true);
		// DORND2 behavior is equivalent to running with carry=false input.
		const withoutCarry = dorndStep(seed, false);

		expect(withCarry.seed.rand2).toBe(0x01);
		expect(withoutCarry.seed.rand2).toBe(0x00);
		expect(withCarry.seed.rand0).toBe(0x22);
		expect(withoutCarry.seed.rand0).toBe(0x21);
		expect(withCarry.a).toBe(0x40);
		expect(withoutCarry.a).toBe(0x40);
	});

	it("propagates resulting carry flag across successive DORND calls", () => {
		const rng = createDorndGenerator(
			{
				rand0: 0xff,
				rand1: 0xff,
				rand2: 0xff,
				rand3: 0xff,
			},
			true,
		);

		const first = rng.dornd();
		const carryAfterFirst = rng.getCarryFlag();
		const second = rng.dornd();

		expect(first.carryOut).toBe(carryAfterFirst);
		// The second call should not throw and should keep byte-range outputs.
		expect(second.a).toBeGreaterThanOrEqual(0);
		expect(second.a).toBeLessThanOrEqual(255);
		expect(second.x).toBeGreaterThanOrEqual(0);
		expect(second.x).toBeLessThanOrEqual(255);
	});
});
