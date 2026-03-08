export interface KeyboardInputSnapshot {
	pressedKeys: readonly string[];
	rollAxis: number;
	pitchAxis: number;
	throttleAxis: number;
	warpTogglePressed: boolean;
	escapePodPressed: boolean;
	fireLaserPressed: boolean;
	missileArmTogglePressed: boolean;
	missileFirePressed: boolean;
	ecmTogglePressed: boolean;
	dockAttemptPressed: boolean;
	launchPressed: boolean;
}

export interface KeyboardInput {
	snapshot(): KeyboardInputSnapshot;
	dispose(): void;
}

/**
 * Creates a tiny keyboard abstraction layer for the browser shell.
 * This package is intentionally isolated so later gamepad/touch input
 * can share a single normalized control model.
 */
export function createKeyboardInput(target: Window): KeyboardInput {
	const pressed = new Set<string>();

	const onKeyDown = (event: KeyboardEvent): void => {
		// Ignore auto-repeat to keep snapshots stable and low-noise.
		if (!event.repeat) {
			pressed.add(event.code);
		}
	};

	const onKeyUp = (event: KeyboardEvent): void => {
		pressed.delete(event.code);
	};

	target.addEventListener("keydown", onKeyDown);
	target.addEventListener("keyup", onKeyUp);

	return {
		snapshot(): KeyboardInputSnapshot {
			const keyList = [...pressed].sort();

			// Roll axis: A/Left = -1, D/Right = +1.
			const rollLeft = pressed.has("KeyA") || pressed.has("ArrowLeft");
			const rollRight = pressed.has("KeyD") || pressed.has("ArrowRight");
			const rollAxis = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);

			// Pitch axis: W/Up = +1, S/Down = -1.
			const pitchUp = pressed.has("KeyW") || pressed.has("ArrowUp");
			const pitchDown = pressed.has("KeyS") || pressed.has("ArrowDown");
			const pitchAxis = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);

			// Throttle axis: Shift accelerates, Ctrl decelerates.
			const accelerate = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
			const decelerate = pressed.has("ControlLeft") || pressed.has("ControlRight");
			const throttleAxis = (accelerate ? 1 : 0) - (decelerate ? 1 : 0);

			// Transition keys from M4.3.1 flow controls.
			// H toggles warp and E triggers the escape pod.
			const warpTogglePressed = pressed.has("KeyH");
			const escapePodPressed = pressed.has("KeyE");

			// Combat controls for M4.3.2:
			// Space = fire laser, M = arm/disarm missile, N = fire missile, X = toggle ECM.
			const fireLaserPressed = pressed.has("Space");
			const missileArmTogglePressed = pressed.has("KeyM");
			const missileFirePressed = pressed.has("KeyN");
			const ecmTogglePressed = pressed.has("KeyX");

			// Docking controls for M4.3.3:
			// L = request dock, P = launch from dock.
			const dockAttemptPressed = pressed.has("KeyL");
			const launchPressed = pressed.has("KeyP");

			return {
				pressedKeys: keyList,
				rollAxis,
				pitchAxis,
				throttleAxis,
				warpTogglePressed,
				escapePodPressed,
				fireLaserPressed,
				missileArmTogglePressed,
				missileFirePressed,
				ecmTogglePressed,
				dockAttemptPressed,
				launchPressed,
			};
		},

		dispose(): void {
			target.removeEventListener("keydown", onKeyDown);
			target.removeEventListener("keyup", onKeyUp);
			pressed.clear();
		},
	};
}
