/**
 * Canonical profile table used by both runtime and tests.
 *
 * Notes:
 * - step size is exact `1000 / hz` for deterministic scheduling.
 * - catch-up limits stay conservative to avoid large simulation bursts.
 */
const TIMING_PROFILE_TABLE = {
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
export function getTimingProfile(profileId) {
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
export function inferTimingProfileIdFromVariantId(variantId) {
	return variantId.toLowerCase().includes("pal") ? "pal" : "ntsc";
}
/**
 * Resolve final profile from user selection + variant id.
 */
export function resolveTimingProfile(requestedProfile, variantId) {
	const profileId =
		requestedProfile === "auto" ? inferTimingProfileIdFromVariantId(variantId) : requestedProfile;
	return getTimingProfile(profileId);
}
