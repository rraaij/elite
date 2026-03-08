import { adc8, rol8, toUint8 } from "./byteMath";

/**
 * Normalize an incoming seed object to unsigned byte values.
 */
function normalizeSeed(seed) {
	return {
		rand0: toUint8(seed.rand0),
		rand1: toUint8(seed.rand1),
		rand2: toUint8(seed.rand2),
		rand3: toUint8(seed.rand3),
	};
}
/**
 * Executes one DORND step on a seed + carry input and returns updated state.
 *
 * This matches the assembly flow:
 * - `ROL RAND`
 * - `ADC RAND+2`
 * - `ADC RAND+3` using carry from feeder calculation
 */
export function dorndStep(seed, carryIn) {
	const s = normalizeSeed(seed);
	// Feeder sequence update: computes f2 and f3.
	const feederRol = rol8(s.rand0, carryIn);
	const feederSum = adc8(feederRol.result, s.rand2, feederRol.carryOut);
	const nextRand0 = feederSum.result;
	const nextRand2 = feederRol.result;
	// Main sequence update: computes m2, with carry from feeder stage.
	const mainSum = adc8(s.rand1, s.rand3, feederSum.carryOut);
	const nextRand1 = mainSum.result;
	const nextRand3 = s.rand1;
	return {
		a: nextRand1,
		x: s.rand1,
		carryOut: mainSum.carryOut,
		overflow: mainSum.overflow,
		seed: {
			rand0: nextRand0,
			rand1: nextRand1,
			rand2: nextRand2,
			rand3: nextRand3,
		},
	};
}
/**
 * Builds a mutable DORND generator state machine.
 */
export function createDorndGenerator(initialSeed, initialCarry = false) {
	let seed = normalizeSeed(initialSeed);
	let carryFlag = initialCarry;
	/**
	 * Applies one DORND step and stores resulting seed/carry state.
	 */
	const applyStep = (carryInput) => {
		const step = dorndStep(seed, carryInput);
		seed = step.seed;
		carryFlag = step.carryOut;
		return step;
	};
	return {
		dornd() {
			// DORND uses incoming carry as part of feeder update.
			return applyStep(carryFlag);
		},
		dornd2() {
			// DORND2 clears carry before entering DORND.
			return applyStep(false);
		},
		getSeed() {
			return { ...seed };
		},
		setSeed(nextSeed) {
			seed = normalizeSeed(nextSeed);
		},
		getCarryFlag() {
			return carryFlag;
		},
		setCarryFlag(value) {
			carryFlag = value;
		},
	};
}
