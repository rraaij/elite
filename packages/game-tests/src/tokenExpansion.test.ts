import { describe, expect, it } from "vitest";
import type { TokenExpansionTables } from "../../game-data/src";
import { expandIantokTokenText, expandWordsTokenText } from "../../game-data/src";

describe("token expansion", () => {
	it("expands recursive standard token references", () => {
		const tables = {
			words: {
				tokenCount: 3,
				tokenEntries: [
					{
						index: 0,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [
							{ kind: "char", value: 65, hex: "0x41", text: "A" },
							{ kind: "standardRef", value: 160, hex: "0xa0", referenceId: 1 },
							{ kind: "char", value: 90, hex: "0x5a", text: "Z" },
						],
					},
					{
						index: 1,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [{ kind: "twoLetter", value: 128, hex: "0x80", text: "AL" }],
					},
					{ index: 2, rawBytes: [], decodedBytes: [], opcodes: [] },
				],
				trailingPaddingBytes: [],
				sineTable: [],
				arctanTable: [],
			},
			iantok: {
				tokenCount: 1,
				tokenEntries: [{ index: 0, rawBytes: [], decodedBytes: [], opcodes: [] }],
				trailingPayloadBytes: [],
			},
		} as unknown as TokenExpansionTables;

		expect(expandWordsTokenText(0, tables)).toBe("AALZ");
	});

	it("expands extended tokens that include standard references", () => {
		const tables = {
			words: {
				tokenCount: 1,
				tokenEntries: [
					{
						index: 0,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [{ kind: "char", value: 88, hex: "0x58", text: "X" }],
					},
				],
				trailingPaddingBytes: [],
				sineTable: [],
				arctanTable: [],
			},
			iantok: {
				tokenCount: 2,
				tokenEntries: [
					{
						index: 0,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [
							{ kind: "char", value: 72, hex: "0x48", text: "H" },
							{ kind: "extendedRef", value: 129, hex: "0x81", referenceId: 1 },
						],
					},
					{
						index: 1,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [
							{ kind: "standardRef", value: 160, hex: "0xa0", referenceId: 0 },
							{ kind: "char", value: 73, hex: "0x49", text: "I" },
						],
					},
				],
				trailingPayloadBytes: [],
			},
		} as unknown as TokenExpansionTables;

		expect(expandIantokTokenText(0, tables)).toBe("HXI");
	});

	it("guards against runaway recursion", () => {
		const tables = {
			words: {
				tokenCount: 1,
				tokenEntries: [
					{
						index: 0,
						rawBytes: [],
						decodedBytes: [],
						opcodes: [{ kind: "standardRef", value: 160, hex: "0xa0", referenceId: 0 }],
					},
				],
				trailingPaddingBytes: [],
				sineTable: [],
				arctanTable: [],
			},
			iantok: {
				tokenCount: 1,
				tokenEntries: [{ index: 0, rawBytes: [], decodedBytes: [], opcodes: [] }],
				trailingPayloadBytes: [],
			},
		} as unknown as TokenExpansionTables;

		expect(expandWordsTokenText(0, tables, { maxDepth: 3 })).toContain("<DEPTH>");
	});
});
