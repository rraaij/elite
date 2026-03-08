/**
 * Deterministic random number interface used by the simulation and tests.
 * The explicit get/set API allows snapshots to restore exact RNG continuity.
 */
export interface DeterministicRng {
	nextUint32(): number;
	getState(): number;
	setState(nextState: number): void;
}

// Constants for a tiny LCG with stable behavior in all JS engines.
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;

/**
 * Force any numeric input into unsigned 32-bit range.
 * This keeps seed handling deterministic for all callers.
 */
function normalizeUint32(value: number): number {
	return value >>> 0;
}

/**
 * Creates a reproducible RNG stream based on a 32-bit seed.
 * The sequence is deterministic across browser and Node runtimes.
 */
export function createDeterministicRng(seed: number): DeterministicRng {
	let state = normalizeUint32(seed);

	return {
		nextUint32(): number {
			// Math.imul preserves 32-bit integer multiplication semantics.
			state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
			return state;
		},

		getState(): number {
			return state;
		},

		setState(nextState: number): void {
			state = normalizeUint32(nextState);
		},
	};
}
