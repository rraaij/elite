// Constants for a tiny LCG with stable behavior in all JS engines.
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
/**
 * Force any numeric input into unsigned 32-bit range.
 * This keeps seed handling deterministic for all callers.
 */
function normalizeUint32(value) {
	return value >>> 0;
}
/**
 * Creates a reproducible RNG stream based on a 32-bit seed.
 * The sequence is deterministic across browser and Node runtimes.
 */
export function createDeterministicRng(seed) {
	let state = normalizeUint32(seed);
	return {
		nextUint32() {
			// Math.imul preserves 32-bit integer multiplication semantics.
			state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
			return state;
		},
		getState() {
			return state;
		},
		setState(nextState) {
			state = normalizeUint32(nextState);
		},
	};
}
