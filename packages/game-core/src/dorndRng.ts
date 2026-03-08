import { adc8, rol8, toUint8 } from "./byteMath";

/**
 * 4-byte RNG seed layout used by Elite's DORND routine.
 *
 * The naming follows the memory layout in `RAND` through `RAND+3`:
 * - rand0: feeder sequence current value (f1 / f3 progression)
 * - rand1: main sequence current value (m0 / m2 progression)
 * - rand2: feeder sequence lag value (f0 / f2 progression)
 * - rand3: main sequence lag value (m1)
 */
export interface DorndSeed {
	rand0: number;
	rand1: number;
	rand2: number;
	rand3: number;
}

export interface DorndStepResult {
	a: number;
	x: number;
	carryOut: boolean;
	overflow: boolean;
	seed: DorndSeed;
}

export interface DorndGenerator {
	dornd(): DorndStepResult;
	dornd2(): DorndStepResult;
	getSeed(): DorndSeed;
	setSeed(nextSeed: DorndSeed): void;
	getCarryFlag(): boolean;
	setCarryFlag(value: boolean): void;
}

/**
 * Normalize an incoming seed object to unsigned byte values.
 */
function normalizeSeed(seed: DorndSeed): DorndSeed {
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
export function dorndStep(seed: DorndSeed, carryIn: boolean): DorndStepResult {
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
export function createDorndGenerator(initialSeed: DorndSeed, initialCarry = false): DorndGenerator {
	let seed = normalizeSeed(initialSeed);
	let carryFlag = initialCarry;

	/**
	 * Applies one DORND step and stores resulting seed/carry state.
	 */
	const applyStep = (carryInput: boolean): DorndStepResult => {
		const step = dorndStep(seed, carryInput);
		seed = step.seed;
		carryFlag = step.carryOut;
		return step;
	};

	return {
		dornd(): DorndStepResult {
			// DORND uses incoming carry as part of feeder update.
			return applyStep(carryFlag);
		},

		dornd2(): DorndStepResult {
			// DORND2 clears carry before entering DORND.
			return applyStep(false);
		},

		getSeed(): DorndSeed {
			return { ...seed };
		},

		setSeed(nextSeed: DorndSeed): void {
			seed = normalizeSeed(nextSeed);
		},

		getCarryFlag(): boolean {
			return carryFlag;
		},

		setCarryFlag(value: boolean): void {
			carryFlag = value;
		},
	};
}
