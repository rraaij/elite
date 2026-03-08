export interface GamepadInputSnapshot {
	connected: boolean;
	gamepadId: string | null;
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

export interface GamepadInput {
	snapshot(): GamepadInputSnapshot;
	dispose(): void;
}

function clampAxis(value: number, deadzone = 0.16): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	if (Math.abs(value) < deadzone) {
		return 0;
	}
	return Math.min(1, Math.max(-1, value));
}

function isButtonPressed(gamepad: Gamepad, index: number): boolean {
	const button = gamepad.buttons[index];
	return Boolean(button?.pressed);
}

function emptySnapshot(): GamepadInputSnapshot {
	return {
		connected: false,
		gamepadId: null,
		rollAxis: 0,
		pitchAxis: 0,
		throttleAxis: 0,
		warpTogglePressed: false,
		escapePodPressed: false,
		fireLaserPressed: false,
		missileArmTogglePressed: false,
		missileFirePressed: false,
		ecmTogglePressed: false,
		dockAttemptPressed: false,
		launchPressed: false,
	};
}

export function createGamepadInput(target: Window): GamepadInput {
	let connectedGamepadId: string | null = null;

	const onGamepadConnected = (event: GamepadEvent): void => {
		connectedGamepadId = event.gamepad.id;
	};

	const onGamepadDisconnected = (event: GamepadEvent): void => {
		if (connectedGamepadId === event.gamepad.id) {
			connectedGamepadId = null;
		}
	};

	target.addEventListener("gamepadconnected", onGamepadConnected);
	target.addEventListener("gamepaddisconnected", onGamepadDisconnected);

	return {
		snapshot(): GamepadInputSnapshot {
			const gamepads = target.navigator.getGamepads?.() ?? [];
			const gamepad = gamepads.find((candidate) => candidate?.connected) ?? null;
			if (!gamepad) {
				return emptySnapshot();
			}

			connectedGamepadId = gamepad.id;

			const rollAxis = clampAxis(gamepad.axes[0] ?? 0);
			const pitchAxis = clampAxis(-(gamepad.axes[1] ?? 0));
			const accelerate = isButtonPressed(gamepad, 7) || isButtonPressed(gamepad, 13);
			const decelerate = isButtonPressed(gamepad, 6) || isButtonPressed(gamepad, 12);
			const throttleAxis = (accelerate ? 1 : 0) - (decelerate ? 1 : 0);

			return {
				connected: true,
				gamepadId: connectedGamepadId,
				rollAxis,
				pitchAxis,
				throttleAxis,
				fireLaserPressed: isButtonPressed(gamepad, 0),
				missileArmTogglePressed: isButtonPressed(gamepad, 1),
				missileFirePressed: isButtonPressed(gamepad, 2),
				ecmTogglePressed: isButtonPressed(gamepad, 3),
				warpTogglePressed: isButtonPressed(gamepad, 4),
				dockAttemptPressed: isButtonPressed(gamepad, 5),
				escapePodPressed: isButtonPressed(gamepad, 8),
				launchPressed: isButtonPressed(gamepad, 9),
			};
		},

		dispose(): void {
			target.removeEventListener("gamepadconnected", onGamepadConnected);
			target.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
		},
	};
}
