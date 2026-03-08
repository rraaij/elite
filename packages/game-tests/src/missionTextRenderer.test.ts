import { describe, expect, it } from "vitest";
import { parseMissionTextTokens, renderMissionTextPages } from "../../game-renderer/src";

describe("mission text renderer", () => {
	it("parses inline control tags and control chars", () => {
		const tokens = parseMissionTextTokens("ALPHA<BR>BETA<PAUSE>\fGAMMA");
		expect(tokens.some((token) => token.kind === "control" && token.value === "newline")).toBe(
			true,
		);
		expect(tokens.some((token) => token.kind === "control" && token.value === "pause")).toBe(true);
		expect(tokens.some((token) => token.kind === "control" && token.value === "clear")).toBe(true);
	});

	it("renders pages with pause and clear semantics", () => {
		const pages = renderMissionTextPages("FIRST<BR>PAGE<PAUSE>SECOND<CLS>THIRD", {
			lineWidth: 16,
			maxLinesPerPage: 4,
		});

		expect(pages).toHaveLength(3);
		expect(pages[0]?.lines.join("|")).toBe("FIRST|PAGE");
		expect(pages[0]?.pausedAfter).toBe(true);
		expect(pages[1]?.lines.join("|")).toBe("SECOND");
		expect(pages[2]?.clearedBefore).toBe(true);
		expect(pages[2]?.lines.join("|")).toBe("THIRD");
	});

	it("wraps long lines by width", () => {
		const pages = renderMissionTextPages("THIS IS A LONG MISSION LINE", {
			lineWidth: 10,
			maxLinesPerPage: 8,
		});
		expect(pages[0]?.lines).toEqual(["THIS IS A", "LONG", "MISSION", "LINE"]);
	});
});
