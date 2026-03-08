const DEFAULT_LINE_WIDTH = 32;
const DEFAULT_MAX_LINES_PER_PAGE = 8;
function normalizeOptions(options) {
	return {
		lineWidth: Math.max(8, Math.floor(options?.lineWidth ?? DEFAULT_LINE_WIDTH)),
		maxLinesPerPage: Math.max(
			2,
			Math.floor(options?.maxLinesPerPage ?? DEFAULT_MAX_LINES_PER_PAGE),
		),
	};
}
function flushLine(currentLine, pageLines) {
	if (currentLine.length || pageLines.length === 0) {
		pageLines.push(currentLine);
	}
	return "";
}
export function parseMissionTextTokens(raw) {
	const normalized = raw
		.replace(/<BR>/gi, "\n")
		.replace(/<PAUSE>/gi, "\t")
		.replace(/<CLS>/gi, "\f");
	const tokens = [];
	for (let index = 0; index < normalized.length; index += 1) {
		const char = normalized[index];
		if (char === undefined) {
			continue;
		}
		if (char === "\n" || char === String.fromCharCode(13)) {
			tokens.push({ kind: "control", value: "newline" });
			continue;
		}
		if (char === "\t" || char === String.fromCharCode(9)) {
			tokens.push({ kind: "control", value: "pause" });
			continue;
		}
		if (char === "\f" || char === String.fromCharCode(12)) {
			tokens.push({ kind: "control", value: "clear" });
			continue;
		}
		tokens.push({ kind: "text", value: char });
	}
	return tokens;
}
function pushPage(pages, lines, flags) {
	if (lines.length === 0) {
		lines.push("");
	}
	pages.push({
		lines: [...lines],
		pausedAfter: flags.pausedAfter,
		clearedBefore: flags.clearedBefore,
	});
}
export function renderMissionTextPages(raw, options) {
	const config = normalizeOptions(options);
	const tokens = parseMissionTextTokens(raw);
	const pages = [];
	let currentLine = "";
	let pageLines = [];
	let nextPageClearedBefore = false;
	const finalizePage = (pausedAfter) => {
		currentLine = flushLine(currentLine, pageLines);
		pushPage(pages, pageLines, { pausedAfter, clearedBefore: nextPageClearedBefore });
		pageLines = [];
		nextPageClearedBefore = false;
	};
	for (const token of tokens) {
		if (token.kind === "control") {
			if (token.value === "newline") {
				currentLine = flushLine(currentLine, pageLines);
				if (pageLines.length >= config.maxLinesPerPage) {
					finalizePage(false);
				}
			}
			if (token.value === "pause") {
				finalizePage(true);
			}
			if (token.value === "clear") {
				if (currentLine.length || pageLines.length) {
					finalizePage(false);
				}
				nextPageClearedBefore = true;
			}
			continue;
		}
		currentLine += token.value;
		if (currentLine.length >= config.lineWidth) {
			const breakAt = currentLine.lastIndexOf(" ");
			if (breakAt > 0) {
				pageLines.push(currentLine.slice(0, breakAt));
				currentLine = currentLine.slice(breakAt + 1);
			} else {
				pageLines.push(currentLine.slice(0, config.lineWidth));
				currentLine = currentLine.slice(config.lineWidth);
			}
		}
		if (pageLines.length >= config.maxLinesPerPage) {
			finalizePage(false);
		}
	}
	if (currentLine.length || pageLines.length === 0) {
		currentLine = flushLine(currentLine, pageLines);
	}
	if (pageLines.length) {
		pushPage(pages, pageLines, { pausedAfter: false, clearedBefore: nextPageClearedBefore });
	}
	return pages.length ? pages : [{ lines: [""], pausedAfter: false, clearedBefore: false }];
}
