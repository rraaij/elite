import type {
	ParsedIantokBinary,
	ParsedTokenEntry,
	ParsedWordsBinary,
	TokenOpcode,
} from "./binaryParsers";

export interface TokenExpansionTables {
	words: ParsedWordsBinary;
	iantok: ParsedIantokBinary;
}

export interface TokenExpansionOptions {
	maxDepth?: number;
	maxOutputLength?: number;
}

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_MAX_OUTPUT_LENGTH = 2048;

function appendLimited(output: string[], value: string, limit: number): void {
	if (!value.length) {
		return;
	}
	const currentLength = output.join("").length;
	if (currentLength >= limit) {
		return;
	}
	const remaining = limit - currentLength;
	output.push(value.slice(0, remaining));
}

function resolveWordsEntry(tables: TokenExpansionTables, tokenId: number): ParsedTokenEntry | null {
	return tables.words.tokenEntries[tokenId] ?? null;
}

function resolveIantokEntry(
	tables: TokenExpansionTables,
	tokenId: number,
): ParsedTokenEntry | null {
	return tables.iantok.tokenEntries[tokenId] ?? null;
}

function expandOpcode(
	opcode: TokenOpcode,
	tables: TokenExpansionTables,
	output: string[],
	depth: number,
	options: Required<TokenExpansionOptions>,
	mode: "words" | "iantok",
): void {
	switch (opcode.kind) {
		case "char":
		case "twoLetter":
			appendLimited(output, opcode.text ?? "", options.maxOutputLength);
			return;
		case "control":
			// Preserve common "newline" control; ignore others for now.
			if (opcode.value === 13) {
				appendLimited(output, "\n", options.maxOutputLength);
			}
			return;
		case "standardRef":
			if (opcode.referenceId !== undefined) {
				expandWordsToken(opcode.referenceId, tables, output, depth + 1, options);
			}
			return;
		case "extendedRef":
		case "randomRef":
		case "jump":
			if (opcode.referenceId !== undefined) {
				expandIantokToken(opcode.referenceId, tables, output, depth + 1, options);
			}
			return;
		case "raw":
			// Keep unknown raw bytes visible in diagnostics-friendly form.
			appendLimited(output, `<${opcode.hex}>`, options.maxOutputLength);
			return;
		default:
			appendLimited(output, mode === "words" ? "<W?>" : "<I?>", options.maxOutputLength);
	}
}

function expandWordsToken(
	tokenId: number,
	tables: TokenExpansionTables,
	output: string[],
	depth: number,
	options: Required<TokenExpansionOptions>,
): void {
	if (depth > options.maxDepth) {
		appendLimited(output, "<DEPTH>", options.maxOutputLength);
		return;
	}

	const entry = resolveWordsEntry(tables, tokenId);
	if (!entry) {
		appendLimited(output, `<W${tokenId}>`, options.maxOutputLength);
		return;
	}

	for (const opcode of entry.opcodes) {
		expandOpcode(opcode, tables, output, depth, options, "words");
	}
}

function expandIantokToken(
	tokenId: number,
	tables: TokenExpansionTables,
	output: string[],
	depth: number,
	options: Required<TokenExpansionOptions>,
): void {
	if (depth > options.maxDepth) {
		appendLimited(output, "<DEPTH>", options.maxOutputLength);
		return;
	}

	const entry = resolveIantokEntry(tables, tokenId);
	if (!entry) {
		appendLimited(output, `<I${tokenId}>`, options.maxOutputLength);
		return;
	}

	for (const opcode of entry.opcodes) {
		expandOpcode(opcode, tables, output, depth, options, "iantok");
	}
}

function toRequiredOptions(options?: TokenExpansionOptions): Required<TokenExpansionOptions> {
	return {
		maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
		maxOutputLength: options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH,
	};
}

export function expandWordsTokenText(
	tokenId: number,
	tables: TokenExpansionTables,
	options?: TokenExpansionOptions,
): string {
	const required = toRequiredOptions(options);
	const output: string[] = [];
	expandWordsToken(tokenId, tables, output, 0, required);
	return output.join("");
}

export function expandIantokTokenText(
	tokenId: number,
	tables: TokenExpansionTables,
	options?: TokenExpansionOptions,
): string {
	const required = toRequiredOptions(options);
	const output: string[] = [];
	expandIantokToken(tokenId, tables, output, 0, required);
	return output.join("");
}
