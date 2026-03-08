import { describe, expect, it } from "vitest";
import {
	getTimingProfile,
	inferTimingProfileIdFromVariantId,
	resolveTimingProfile,
} from "../../game-core/src/index";

describe("timing profiles", () => {
	it("resolves canonical NTSC/PAL step rates", () => {
		const ntsc = getTimingProfile("ntsc");
		const pal = getTimingProfile("pal");
		expect(ntsc.hz).toBe(60);
		expect(ntsc.stepMs).toBeCloseTo(16.6667, 4);
		expect(pal.hz).toBe(50);
		expect(pal.stepMs).toBeCloseTo(20, 5);
	});
	it("infers profile id from variant naming", () => {
		expect(inferTimingProfileIdFromVariantId("gma86-pal")).toBe("pal");
		expect(inferTimingProfileIdFromVariantId("gma85-ntsc")).toBe("ntsc");
		expect(inferTimingProfileIdFromVariantId("source-disk-build")).toBe("ntsc");
	});
	it("supports explicit and auto timing profile resolution", () => {
		const explicit = resolveTimingProfile("ntsc", "gma86-pal");
		const autoPal = resolveTimingProfile("auto", "gma86-pal");
		expect(explicit.id).toBe("ntsc");
		expect(autoPal.id).toBe("pal");
	});
});
