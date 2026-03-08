/**
 * This file contains parsers for the legacy binary data blocks that we need
 * during the TypeScript migration. The goal is to convert opaque byte arrays
 * into typed structures that the browser runtime can consume deterministically.
 */
/**
 * Supported build variants mirrored from `sourcecode/4-reference-binaries/*`.
 * We keep this explicit so generation is deterministic and reviewable.
 */
export const VARIANT_IDS = ["gma85-ntsc", "gma86-pal", "source-disk-build", "source-disk-files"];
/**
 * WORDS.bin stores recursive token stream bytes obfuscated with XOR 0x23.
 * Token separators are raw zero bytes and are not obfuscated.
 */
export const WORDS_XOR_KEY = 0x23;
/**
 * IANTOK.bin stores extended token stream bytes obfuscated with XOR 0x57.
 * Token separators are raw byte 0x57, which is the obfuscation key itself.
 */
export const IANTOK_XOR_KEY = 0x57;
/**
 * The recursive token table currently defines tokens 0..146.
 * We parse this fixed count to avoid spilling into non-token lookup tables.
 */
export const WORDS_TOKEN_COUNT = 147;
/**
 * The extended token table defines token entries 0..255.
 */
export const IANTOK_TOKEN_COUNT = 256;
/**
 * SHIPS.bin starts at in-memory base address $D000 in the original game.
 * Pointer values in the lookup table are absolute addresses within this region.
 */
export const SHIPS_MEMORY_BASE = 0xd000;
/**
 * XX21 contains exactly 33 ship blueprint pointers.
 */
export const SHIP_BLUEPRINT_COUNT = 33;
/**
 * Canonical ship names in XX21 order. The order is part of game semantics.
 */
export const SHIP_NAMES = [
	"Missile",
	"Coriolis Space Station",
	"Escape Pod",
	"Alloy Plate",
	"Cargo Canister",
	"Boulder",
	"Asteroid",
	"Splinter",
	"Shuttle",
	"Transporter",
	"Cobra Mk III",
	"Python",
	"Boa",
	"Anaconda",
	"Rock Hermit",
	"Viper",
	"Sidewinder",
	"Mamba",
	"Krait",
	"Adder",
	"Gecko",
	"Cobra Mk I",
	"Worm",
	"Cobra Mk III (Pirate)",
	"Asp Mk II",
	"Python (Pirate)",
	"Fer-de-lance",
	"Moray",
	"Thargoid",
	"Thargon",
	"Constrictor",
	"Cougar",
	"Dodecahedron Space Station",
];
/**
 * Two-letter token lookup table for standard recursive tokens (codes 128..159).
 * The mapping is transcribed from the `TWOK` macro in `elite-data.asm`.
 */
const STANDARD_TWO_LETTER_BY_CODE = {
	128: "AL",
	129: "LE",
	130: "XE",
	131: "GE",
	132: "ZA",
	133: "CE",
	134: "BI",
	135: "SO",
	136: "US",
	137: "ES",
	138: "AR",
	139: "MA",
	140: "IN",
	141: "DI",
	142: "RE",
	143: "A?",
	144: "ER",
	145: "AT",
	146: "EN",
	147: "BE",
	148: "RA",
	149: "LA",
	150: "VE",
	151: "TI",
	152: "ED",
	153: "OR",
	154: "QU",
	155: "AN",
	156: "TE",
	157: "IS",
	158: "RI",
	159: "ON",
};
/**
 * Two-letter token lookup table for extended tokens (codes 215..255).
 * The mapping is transcribed from the `ETWO` macro in `elite-data.asm`.
 */
const EXTENDED_TWO_LETTER_BY_CODE = {
	215: "--",
	216: "AB",
	217: "OU",
	218: "SE",
	219: "IT",
	220: "IL",
	221: "ET",
	222: "ST",
	223: "ON",
	224: "LO",
	225: "NU",
	226: "TH",
	227: "NO",
	228: "AL",
	229: "LE",
	230: "XE",
	231: "GE",
	232: "ZA",
	233: "CE",
	234: "BI",
	235: "SO",
	236: "US",
	237: "ES",
	238: "AR",
	239: "MA",
	240: "IN",
	241: "DI",
	242: "RE",
	243: "A?",
	244: "ER",
	245: "AT",
	246: "EN",
	247: "BE",
	248: "RA",
	249: "LA",
	250: "VE",
	251: "TI",
	252: "ED",
	253: "OR",
	254: "QU",
	255: "AN",
};
/**
 * Standard recursive token encoding packs token IDs into disjoint byte ranges.
 * This function inverts that packing. Returns null when byte is not a token ref.
 */
function decodeStandardTokenReference(encodedByte) {
	if (encodedByte >= 160 && encodedByte <= 255) {
		return encodedByte - 160;
	}
	if (encodedByte >= 96 && encodedByte <= 127) {
		return encodedByte;
	}
	if (encodedByte >= 14 && encodedByte <= 31) {
		return encodedByte + 114;
	}
	return null;
}
/**
 * Formats a byte as hexadecimal, used in debug metadata and diagnostics.
 */
function hexByte(value) {
	return `0x${value.toString(16).padStart(2, "0")}`;
}
/**
 * Reads little-endian unsigned 16-bit integer from a binary blob.
 */
function readUint16LE(bytes, offset) {
	const lo = bytes[offset];
	const hi = bytes[offset + 1];
	if (lo === undefined || hi === undefined) {
		throw new Error(`Out-of-range u16 read at offset ${offset}.`);
	}
	return lo | (hi << 8);
}
/**
 * Reads signed coordinate packed in "sign bits + absolute magnitude" encoding.
 */
function unpackSignedComponent(magnitude, signFlag) {
	return signFlag ? -magnitude : magnitude;
}
/**
 * Converts a decoded standard recursive token stream byte into a typed opcode.
 */
function decodeWordsOpcode(decodedByte) {
	if (decodedByte >= 128 && decodedByte <= 159) {
		const twoLetterText = STANDARD_TWO_LETTER_BY_CODE[decodedByte] ?? "";
		return {
			kind: "twoLetter",
			value: decodedByte,
			hex: hexByte(decodedByte),
			text: twoLetterText,
		};
	}
	const standardReference = decodeStandardTokenReference(decodedByte);
	if (standardReference !== null) {
		return {
			kind: "standardRef",
			value: decodedByte,
			hex: hexByte(decodedByte),
			referenceId: standardReference,
		};
	}
	if (decodedByte >= 1 && decodedByte <= 13) {
		return {
			kind: "control",
			value: decodedByte,
			hex: hexByte(decodedByte),
		};
	}
	if (decodedByte >= 32 && decodedByte <= 126) {
		return {
			kind: "char",
			value: decodedByte,
			hex: hexByte(decodedByte),
			text: String.fromCharCode(decodedByte),
		};
	}
	return {
		kind: "raw",
		value: decodedByte,
		hex: hexByte(decodedByte),
	};
}
/**
 * Converts a decoded extended token stream byte into a typed opcode.
 */
function decodeIantokOpcode(decodedByte) {
	if (decodedByte >= 215 && decodedByte <= 255) {
		const twoLetterText = EXTENDED_TWO_LETTER_BY_CODE[decodedByte] ?? "";
		return {
			kind: "twoLetter",
			value: decodedByte,
			hex: hexByte(decodedByte),
			text: twoLetterText,
		};
	}
	if (decodedByte >= 129 && decodedByte <= 214) {
		return {
			kind: "extendedRef",
			value: decodedByte,
			hex: hexByte(decodedByte),
			referenceId: decodedByte,
		};
	}
	if (decodedByte >= 91 && decodedByte <= 128) {
		return {
			kind: "randomRef",
			value: decodedByte,
			hex: hexByte(decodedByte),
			referenceId: decodedByte - 91,
		};
	}
	if (decodedByte >= 1 && decodedByte <= 31) {
		return {
			kind: "jump",
			value: decodedByte,
			hex: hexByte(decodedByte),
			referenceId: decodedByte,
		};
	}
	// In extended token streams, TOKN can still embed standard recursive tokens.
	const standardReference = decodeStandardTokenReference(decodedByte);
	if (standardReference !== null && decodedByte >= 96) {
		return {
			kind: "standardRef",
			value: decodedByte,
			hex: hexByte(decodedByte),
			referenceId: standardReference,
		};
	}
	if (decodedByte >= 32 && decodedByte <= 126) {
		return {
			kind: "char",
			value: decodedByte,
			hex: hexByte(decodedByte),
			text: String.fromCharCode(decodedByte),
		};
	}
	return {
		kind: "raw",
		value: decodedByte,
		hex: hexByte(decodedByte),
	};
}
/**
 * Parses WORDS.bin into recursive token entries plus SNE/ACT lookup tables.
 */
export function parseWordsBinary(bytes) {
	const tokenEntries = [];
	let offset = 0;
	for (let tokenIndex = 0; tokenIndex < WORDS_TOKEN_COUNT; tokenIndex += 1) {
		const rawBytes = [];
		while (true) {
			const next = bytes[offset];
			if (next === undefined) {
				throw new Error(`WORDS.bin ended early while parsing token ${tokenIndex}.`);
			}
			offset += 1;
			if (next === 0) {
				break;
			}
			rawBytes.push(next);
		}
		const decodedBytes = rawBytes.map((rawByte) => rawByte ^ WORDS_XOR_KEY);
		const opcodes = decodedBytes.map((decodedByte) => decodeWordsOpcode(decodedByte));
		tokenEntries.push({
			index: tokenIndex,
			rawBytes,
			decodedBytes,
			opcodes,
		});
	}
	// SNE and ACT each contain 32 bytes and are always at the end of WORDS.bin.
	const lookupTablesLength = 64;
	const lookupStart = bytes.length - lookupTablesLength;
	if (lookupStart < offset) {
		throw new Error("WORDS.bin layout error: lookup tables overlap token region.");
	}
	const trailingPaddingBytes = Array.from(bytes.slice(offset, lookupStart));
	const sineTable = Array.from(bytes.slice(lookupStart, lookupStart + 32));
	const arctanTable = Array.from(bytes.slice(lookupStart + 32, lookupStart + 64));
	return {
		tokenCount: tokenEntries.length,
		tokenEntries,
		trailingPaddingBytes,
		sineTable,
		arctanTable,
	};
}
/**
 * Parses IANTOK.bin into the first 256 extended token entries.
 * Any remaining bytes are preserved as trailing payload for future decoders.
 */
export function parseIantokBinary(bytes) {
	const tokenEntries = [];
	let offset = 0;
	for (let tokenIndex = 0; tokenIndex < IANTOK_TOKEN_COUNT; tokenIndex += 1) {
		const rawBytes = [];
		while (true) {
			const next = bytes[offset];
			if (next === undefined) {
				throw new Error(`IANTOK.bin ended early while parsing token ${tokenIndex}.`);
			}
			offset += 1;
			if (next === IANTOK_XOR_KEY) {
				break;
			}
			rawBytes.push(next);
		}
		const decodedBytes = rawBytes.map((rawByte) => rawByte ^ IANTOK_XOR_KEY);
		const opcodes = decodedBytes.map((decodedByte) => decodeIantokOpcode(decodedByte));
		tokenEntries.push({
			index: tokenIndex,
			rawBytes,
			decodedBytes,
			opcodes,
		});
	}
	const trailingPayloadBytes = Array.from(bytes.slice(offset));
	return {
		tokenCount: tokenEntries.length,
		tokenEntries,
		trailingPayloadBytes,
	};
}
/**
 * Parses one ship blueprint payload from SHIPS.bin.
 */
function parseShipBlueprint(bytes, shipId, shipName, startOffset, endOffset) {
	if (endOffset <= startOffset) {
		throw new Error(`Invalid blueprint bounds for ship ${shipName} (${shipId}).`);
	}
	const byteLength = endOffset - startOffset;
	if (byteLength < 20) {
		throw new Error(`Blueprint too short for ship ${shipName} (${shipId}).`);
	}
	const headerOffset = startOffset;
	const maxCanistersOnDemise = bytes[headerOffset] ?? 0;
	const targetableArea = readUint16LE(bytes, headerOffset + 1);
	const edgesDataOffsetLo = bytes[headerOffset + 3] ?? 0;
	const facesDataOffsetLo = bytes[headerOffset + 4] ?? 0;
	const maxEdgeCountRaw = bytes[headerOffset + 5] ?? 0;
	const gunVertex = bytes[headerOffset + 6] ?? 0;
	const explosionCountRaw = bytes[headerOffset + 7] ?? 0;
	const verticesByteCount = bytes[headerOffset + 8] ?? 0;
	const numberOfEdges = bytes[headerOffset + 9] ?? 0;
	const bounty = readUint16LE(bytes, headerOffset + 10);
	const facesByteCount = bytes[headerOffset + 12] ?? 0;
	const visibilityDistance = bytes[headerOffset + 13] ?? 0;
	const maxEnergy = bytes[headerOffset + 14] ?? 0;
	const maxSpeed = bytes[headerOffset + 15] ?? 0;
	const edgesDataOffsetHi = bytes[headerOffset + 16] ?? 0;
	const facesDataOffsetHi = bytes[headerOffset + 17] ?? 0;
	const normalsScaleExponent = bytes[headerOffset + 18] ?? 0;
	const armamentByte = bytes[headerOffset + 19] ?? 0;
	const edgesDataOffset = edgesDataOffsetLo | (edgesDataOffsetHi << 8);
	const facesDataOffset = facesDataOffsetLo | (facesDataOffsetHi << 8);
	const normalsScaleMultiplier = 1 << normalsScaleExponent;
	const laserPower = armamentByte >> 3;
	const missiles = armamentByte & 0b0000_0111;
	const verticesStart = startOffset + 20;
	const edgesStart = startOffset + edgesDataOffset;
	const facesStart = startOffset + facesDataOffset;
	const expectedVertexCount = Math.floor(verticesByteCount / 6);
	const expectedEdgeCount = numberOfEdges;
	const expectedFaceCount = Math.floor(facesByteCount / 4);
	const vertices = [];
	for (let vertexIndex = 0; vertexIndex < expectedVertexCount; vertexIndex += 1) {
		const base = verticesStart + vertexIndex * 6;
		const ax = bytes[base] ?? 0;
		const ay = bytes[base + 1] ?? 0;
		const az = bytes[base + 2] ?? 0;
		const packedSignsAndVisibility = bytes[base + 3] ?? 0;
		const packedFaces1 = bytes[base + 4] ?? 0;
		const packedFaces2 = bytes[base + 5] ?? 0;
		const visibility = packedSignsAndVisibility & 0b0001_1111;
		const x = unpackSignedComponent(ax, (packedSignsAndVisibility & 0b1000_0000) !== 0);
		const y = unpackSignedComponent(ay, (packedSignsAndVisibility & 0b0100_0000) !== 0);
		const z = unpackSignedComponent(az, (packedSignsAndVisibility & 0b0010_0000) !== 0);
		const face1 = packedFaces1 & 0x0f;
		const face2 = (packedFaces1 >> 4) & 0x0f;
		const face3 = packedFaces2 & 0x0f;
		const face4 = (packedFaces2 >> 4) & 0x0f;
		vertices.push({
			x,
			y,
			z,
			visibility,
			faces: [face1, face2, face3, face4],
		});
	}
	const edges = [];
	for (let edgeIndex = 0; edgeIndex < expectedEdgeCount; edgeIndex += 1) {
		const base = edgesStart + edgeIndex * 4;
		const visibility = bytes[base] ?? 0;
		const packedFaces = bytes[base + 1] ?? 0;
		const vertex1Times4 = bytes[base + 2] ?? 0;
		const vertex2Times4 = bytes[base + 3] ?? 0;
		const face1 = packedFaces & 0x0f;
		const face2 = (packedFaces >> 4) & 0x0f;
		edges.push({
			vertex1: vertex1Times4 >> 2,
			vertex2: vertex2Times4 >> 2,
			visibility,
			faces: [face1, face2],
		});
	}
	const faces = [];
	for (let faceIndex = 0; faceIndex < expectedFaceCount; faceIndex += 1) {
		const base = facesStart + faceIndex * 4;
		const packedSignsAndVisibility = bytes[base] ?? 0;
		const ax = bytes[base + 1] ?? 0;
		const ay = bytes[base + 2] ?? 0;
		const az = bytes[base + 3] ?? 0;
		const visibility = packedSignsAndVisibility & 0b0001_1111;
		const normalX = unpackSignedComponent(ax, (packedSignsAndVisibility & 0b1000_0000) !== 0);
		const normalY = unpackSignedComponent(ay, (packedSignsAndVisibility & 0b0100_0000) !== 0);
		const normalZ = unpackSignedComponent(az, (packedSignsAndVisibility & 0b0010_0000) !== 0);
		faces.push({
			normalX,
			normalY,
			normalZ,
			visibility,
		});
	}
	const expectedEdgesStart = verticesStart + expectedVertexCount * 6;
	const expectedFacesStart = edgesStart + expectedEdgeCount * 4;
	return {
		shipId,
		shipName,
		startOffset,
		endOffset,
		byteLength,
		header: {
			maxCanistersOnDemise,
			targetableArea,
			edgesDataOffset,
			facesDataOffset,
			maxEdgeCountRaw,
			gunVertex,
			explosionCountRaw,
			verticesByteCount,
			numberOfEdges,
			bounty,
			facesByteCount,
			visibilityDistance,
			maxEnergy,
			maxSpeed,
			normalsScaleExponent,
			normalsScaleMultiplier,
			armamentByte,
			laserPower,
			missiles,
		},
		vertices,
		edges,
		faces,
		validation: {
			expectedVertexCount,
			expectedEdgeCount,
			expectedFaceCount,
			edgesOffsetMatchesVertexLength: edgesStart === expectedEdgesStart,
			facesOffsetMatchesEdgeLength: facesStart === expectedFacesStart,
		},
	};
}
/**
 * Parses SHIPS.bin including:
 * - XX21 ship pointer table
 * - E% default flags
 * - KWL/KWH kill reward tables
 * - each blueprint's vertices/edges/faces
 */
export function parseShipsBinary(bytes) {
	const pointerTable = [];
	const pointerOffsets = [];
	for (let shipIndex = 0; shipIndex < SHIP_BLUEPRINT_COUNT; shipIndex += 1) {
		const absoluteAddress = readUint16LE(bytes, shipIndex * 2);
		const relativeOffset = absoluteAddress - SHIPS_MEMORY_BASE;
		pointerTable.push({
			shipId: shipIndex + 1,
			shipName: SHIP_NAMES[shipIndex] ?? `Ship ${shipIndex + 1}`,
			absoluteAddress,
			relativeOffset,
		});
		pointerOffsets.push(relativeOffset);
	}
	// E% immediately follows XX21 and contains 33 entries plus one trailing byte.
	const defaultFlagsOffset = SHIP_BLUEPRINT_COUNT * 2;
	const defaultFlagsByShip = [];
	for (let shipIndex = 0; shipIndex < SHIP_BLUEPRINT_COUNT; shipIndex += 1) {
		const flagsByte = bytes[defaultFlagsOffset + shipIndex] ?? 0;
		defaultFlagsByShip.push({
			shipId: shipIndex + 1,
			shipName: SHIP_NAMES[shipIndex] ?? `Ship ${shipIndex + 1}`,
			flagsByte,
		});
	}
	const trailingDefaultFlagsByte = bytes[defaultFlagsOffset + SHIP_BLUEPRINT_COUNT] ?? 0;
	// KWL% and KWH% are fixed-length tables with one entry per ship type.
	const kwlOffset = defaultFlagsOffset + SHIP_BLUEPRINT_COUNT + 1;
	const kwhOffset = kwlOffset + SHIP_BLUEPRINT_COUNT;
	const killAwardsByShip = [];
	for (let shipIndex = 0; shipIndex < SHIP_BLUEPRINT_COUNT; shipIndex += 1) {
		const fractionalPartByte = bytes[kwlOffset + shipIndex] ?? 0;
		const integerPart = bytes[kwhOffset + shipIndex] ?? 0;
		const asFloat = integerPart + fractionalPartByte / 256;
		killAwardsByShip.push({
			shipId: shipIndex + 1,
			shipName: SHIP_NAMES[shipIndex] ?? `Ship ${shipIndex + 1}`,
			integerPart,
			fractionalPartByte,
			asFloat,
		});
	}
	const blueprints = [];
	for (let shipIndex = 0; shipIndex < SHIP_BLUEPRINT_COUNT; shipIndex += 1) {
		const startOffset = pointerOffsets[shipIndex];
		if (startOffset === undefined) {
			throw new Error(`Missing blueprint pointer offset for ship index ${shipIndex}.`);
		}
		const endOffset =
			shipIndex < SHIP_BLUEPRINT_COUNT - 1
				? (pointerOffsets[shipIndex + 1] ?? bytes.length)
				: bytes.length;
		if (startOffset < 0 || startOffset >= bytes.length) {
			throw new Error(`Blueprint start offset out of range for ship ${shipIndex + 1}.`);
		}
		if (endOffset <= startOffset || endOffset > bytes.length) {
			throw new Error(`Blueprint end offset out of range for ship ${shipIndex + 1}.`);
		}
		blueprints.push(
			parseShipBlueprint(
				bytes,
				shipIndex + 1,
				SHIP_NAMES[shipIndex] ?? `Ship ${shipIndex + 1}`,
				startOffset,
				endOffset,
			),
		);
	}
	return {
		shipPointerTable: pointerTable,
		defaultFlagsByShip,
		killAwardsByShip,
		trailingDefaultFlagsByte,
		blueprints,
	};
}
/**
 * Expands one byte into a fixed-width bit list (MSB first).
 */
function byteToBits(value, width = 8) {
	const bits = [];
	for (let bit = width - 1; bit >= 0; bit -= 1) {
		bits.push((value >> bit) & 1);
	}
	return bits;
}
/**
 * Parses SPRITE.bin.
 *
 * C64 sprite data is 64 bytes each:
 * - first 63 bytes = 21 rows * 3 bytes (24 monochrome pixels per row)
 * - final byte = trailing/pad byte
 */
export function parseSpriteBinary(bytes) {
	const bytesPerSprite = 64;
	if (bytes.length % bytesPerSprite !== 0) {
		throw new Error(`SPRITE.bin length (${bytes.length}) is not divisible by 64.`);
	}
	const spriteCount = bytes.length / bytesPerSprite;
	const sprites = [];
	for (let spriteIndex = 0; spriteIndex < spriteCount; spriteIndex += 1) {
		const start = spriteIndex * bytesPerSprite;
		const pixelBytes = bytes.slice(start, start + 63);
		const trailingByte = bytes[start + 63] ?? 0;
		const rowsAsBits = [];
		const rowsAsBitStrings = [];
		for (let row = 0; row < 21; row += 1) {
			const rowStart = row * 3;
			const b0 = pixelBytes[rowStart] ?? 0;
			const b1 = pixelBytes[rowStart + 1] ?? 0;
			const b2 = pixelBytes[rowStart + 2] ?? 0;
			const rowBits = [...byteToBits(b0), ...byteToBits(b1), ...byteToBits(b2)];
			rowsAsBits.push(rowBits);
			rowsAsBitStrings.push(rowBits.join(""));
		}
		sprites.push({
			spriteIndex,
			width: 24,
			height: 21,
			trailingByte,
			rowsAsBitStrings,
			rowsAsBits,
		});
	}
	return {
		spriteCount,
		bytesPerSprite,
		sprites,
	};
}
/**
 * Parses C.FONT.bin into 8x8 monochrome glyphs.
 *
 * The font file stores glyphs as 8 bytes per character cell, one byte per row.
 */
export function parseFontBinary(bytes) {
	const bytesPerGlyph = 8;
	if (bytes.length % bytesPerGlyph !== 0) {
		throw new Error(`C.FONT.bin length (${bytes.length}) is not divisible by 8.`);
	}
	const glyphCount = bytes.length / bytesPerGlyph;
	const glyphs = [];
	for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex += 1) {
		const start = glyphIndex * bytesPerGlyph;
		const glyphBytes = bytes.slice(start, start + bytesPerGlyph);
		const rowsAsBits = Array.from(glyphBytes, (rowByte) => byteToBits(rowByte));
		const rowsAsBitStrings = rowsAsBits.map((rowBits) => rowBits.join(""));
		glyphs.push({
			glyphIndex,
			width: 8,
			height: 8,
			rowsAsBitStrings,
			rowsAsBits,
		});
	}
	return {
		glyphCount,
		bytesPerGlyph,
		glyphs,
	};
}
/**
 * Wraps arbitrary binary input into a typed JSON-friendly representation.
 * This is used for assets we ingest now and decode in later milestones.
 */
export function parseRawBinaryAsset(bytes) {
	return {
		byteLength: bytes.length,
		bytes: Array.from(bytes),
	};
}
