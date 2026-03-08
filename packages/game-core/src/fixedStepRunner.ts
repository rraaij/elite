import type { Simulation } from "./simulation";

/**
 * Metrics emitted from each animation frame to aid debugging and profiling.
 */
export interface FrameMetrics {
	elapsedMs: number;
	accumulatorMs: number;
	interpolationAlpha: number;
	simulatedSteps: number;
	wasClamped: boolean;
}

/**
 * Configures deterministic fixed-step progression.
 * `stepMs` controls simulation rate; `maxCatchUpSteps` prevents spiral-of-death.
 */
export interface FixedStepRunnerConfig {
	simulation: Simulation;
	stepMs: number;
	maxCatchUpSteps: number;
}

export interface FixedStepRunner {
	frame(frameTimeMs: number): FrameMetrics;
	reset(frameTimeMs?: number): void;
}

/**
 * Fixed-step scheduler decouples deterministic simulation from variable render cadence.
 */
export function createFixedStepRunner(config: FixedStepRunnerConfig): FixedStepRunner {
	let previousFrameTimeMs: number | null = null;
	let accumulatorMs = 0;

	return {
		frame(frameTimeMs: number): FrameMetrics {
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

		reset(frameTimeMs?: number): void {
			accumulatorMs = 0;
			previousFrameTimeMs = frameTimeMs ?? null;
		},
	};
}
