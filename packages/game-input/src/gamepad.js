function clampAxis(value, deadzone = 0.16) {
	if (!Number.isFinite(value)) {
		return 0;
	}
	if (Math.abs(value) < deadzone) {
		return 0;
	}
	return Math.min(1, Math.max(-1, value));
}
function isButtonPressed(gamepad, index) {
	const button = gamepad.buttons[index];
	return Boolean(button?.pressed);
}
function emptySnapshot() {
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
export function createGamepadInput(target) {
	let connectedGamepadId = null;
	const onGamepadConnected = (event) => {
		connectedGamepadId = event.gamepad.id;
	};
	const onGamepadDisconnected = (event) => {
		if (connectedGamepadId === event.gamepad.id) {
			connectedGamepadId = null;
		}
	};
	target.addEventListener("gamepadconnected", onGamepadConnected);
	target.addEventListener("gamepaddisconnected", onGamepadDisconnected);
	return {
		snapshot() {
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
		dispose() {
			target.removeEventListener("gamepadconnected", onGamepadConnected);
			target.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
		},
	};
}
