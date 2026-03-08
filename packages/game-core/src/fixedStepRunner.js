/**
 * Fixed-step scheduler decouples deterministic simulation from variable render cadence.
 */
export function createFixedStepRunner(config) {
	let previousFrameTimeMs = null;
	let accumulatorMs = 0;
	return {
		frame(frameTimeMs) {
			// First frame only seeds timing state; we do not step simulation yet.
			if (previousFrameTimeMs === null) {
				previousFrameTimeMs = frameTimeMs;
				return {
					elapsedMs: 0,
					accumulatorMs: 0,
					interpolationAlpha: 0,
					simulatedSteps: 0,
					wasClamped: false,
				};
			}
			let elapsedMs = frameTimeMs - previousFrameTimeMs;
			previousFrameTimeMs = frameTimeMs;
			// Guard against clock jitter or visibility-change anomalies.
			if (elapsedMs < 0) {
				elapsedMs = 0;
			}
			const maxAllowedElapsedMs = config.stepMs * config.maxCatchUpSteps;
			const wasClamped = elapsedMs > maxAllowedElapsedMs;
			if (wasClamped) {
				elapsedMs = maxAllowedElapsedMs;
			}
			accumulatorMs += elapsedMs;
			let simulatedSteps = 0;
			while (accumulatorMs >= config.stepMs && simulatedSteps < config.maxCatchUpSteps) {
				config.simulation.step(config.stepMs);
				accumulatorMs -= config.stepMs;
				simulatedSteps += 1;
			}
			return {
				elapsedMs,
				accumulatorMs,
				interpolationAlpha: accumulatorMs / config.stepMs,
				simulatedSteps,
				wasClamped,
			};
		},
		reset(frameTimeMs) {
			accumulatorMs = 0;
			previousFrameTimeMs = frameTimeMs ?? null;
		},
	};
}
