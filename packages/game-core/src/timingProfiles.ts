/**
 * Supported fixed-step timing profile ids.
 *
 * We keep only PAL/NTSC for this migration phase, matching the source
 * variants already available in the generated game-data packs.
 */
export type TimingProfileId = "ntsc" | "pal";

/**
 * Runtime timing profile consumed by the web fixed-step runner.
 */
export interface TimingProfile {
	id: TimingProfileId;
	label: string;
	hz: number;
	stepMs: number;
	maxCatchUpSteps: number;
}

/**
 * Canonical profile table used by both runtime and tests.
 *
 * Notes:
 * - step size is exact `1000 / hz` for deterministic scheduling.
 * - catch-up limits stay conservative to avoid large simulation bursts.
 */
const TIMING_PROFILE_TABLE: Record<TimingProfileId, TimingProfile> = {
	ntsc: {
		id: "ntsc",
		label: "NTSC (60 Hz)",
		hz: 60,
		stepMs: 1000 / 60,
		maxCatchUpSteps: 8,
	},
	pal: {
		id: "pal",
		label: "PAL (50 Hz)",
		hz: 50,
		stepMs: 1000 / 50,
		maxCatchUpSteps: 8,
	},
};

/**
 * Resolve one profile by id.
 *
 * We return a shallow copy so callers cannot accidentally mutate the canonical
 * table object shared across modules.
 */
export function getTimingProfile(profileId: TimingProfileId): TimingProfile {
	return {
		...TIMING_PROFILE_TABLE[profileId],
	};
}

/**
 * Infer profile id from variant naming convention.
 *
 * Current generated variants include `*-pal` and `*-ntsc`, so this gives us an
 * automatic default for URL `timing=auto` mode in the web runtime.
 */
export function inferTimingProfileIdFromVariantId(variantId: string): TimingProfileId {
	return variantId.toLowerCase().includes("pal") ? "pal" : "ntsc";
}

/**
 * Resolve final profile from user selection + variant id.
 */
export function resolveTimingProfile(
	requestedProfile: TimingProfileId | "auto",
	variantId: string,
): TimingProfile {
	const profileId =
		requestedProfile === "auto" ? inferTimingProfileIdFromVariantId(variantId) : requestedProfile;
	return getTimingProfile(profileId);
}
