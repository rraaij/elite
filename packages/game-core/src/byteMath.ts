/**
 * This module provides explicit 8-bit/16-bit arithmetic helpers with
 * deterministic overflow/carry semantics that mirror 6502-style behavior.
 *
 * Keeping this logic centralized makes later gameplay ports easier to audit
 * and avoids accidental JavaScript number semantics leaking into core logic.
 */

export interface Adc8Result {
	result: number;
	carryOut: boolean;
	overflow: boolean;
}

export interface Sbc8Result {
	result: number;
	carryOut: boolean;
	overflow: boolean;
}

export interface Rol8Result {
	result: number;
	carryOut: boolean;
}

export interface Adc16Result {
	result: number;
	carryOut: boolean;
}

/**
 * Coerce an arbitrary number into unsigned 8-bit range [0, 255].
 */
export function toUint8(value: number): number {
	return value & 0xff;
}

/**
 * Coerce an arbitrary number into unsigned 16-bit range [0, 65535].
 */
export function toUint16(value: number): number {
	return value & 0xffff;
}

/**
 * Interpret the low 8 bits of a number as signed two's-complement [-128, 127].
 */
export function toInt8(value: number): number {
	const unsigned = toUint8(value);
	return unsigned >= 0x80 ? unsigned - 0x100 : unsigned;
}

/**
 * Interpret the low 16 bits of a number as signed two's-complement.
 */
export function toInt16(value: number): number {
	const unsigned = toUint16(value);
	return unsigned >= 0x8000 ? unsigned - 0x1_0000 : unsigned;
}

/**
 * Split an unsigned 16-bit value into little-endian bytes.
 */
export function splitUint16(value: number): { lo: number; hi: number } {
	const normalized = toUint16(value);
	return {
		lo: normalized & 0xff,
		hi: normalized >> 8,
	};
}

/**
 * Merge little-endian bytes into one unsigned 16-bit value.
 */
export function joinUint16(lo: number, hi: number): number {
	return ((toUint8(hi) << 8) | toUint8(lo)) & 0xffff;
}

/**
 * 6502-style ADC for 8-bit values:
 *   result = a + b + carryIn
 *
 * Carry and signed overflow flags are returned explicitly.
 */
export function adc8(a: number, b: number, carryIn: number | boolean = 0): Adc8Result {
	const a8 = toUint8(a);
	const b8 = toUint8(b);
	const carry = carryIn === true || carryIn === 1 ? 1 : 0;

	const sum = a8 + b8 + carry;
	const result = sum & 0xff;
	const carryOut = sum > 0xff;

	// Signed overflow when adding two same-sign operands yields opposite-sign result.
	const overflow = (~(a8 ^ b8) & (a8 ^ result) & 0x80) !== 0;

	return {
		result,
		carryOut,
		overflow,
	};
}

/**
 * 6502-style SBC for 8-bit values:
 *   result = a - b - (1 - carryIn)
 *
 * `carryOut` follows 6502 convention: true means "no borrow".
 */
export function sbc8(a: number, b: number, carryIn: number | boolean = 1): Sbc8Result {
	const a8 = toUint8(a);
	const b8 = toUint8(b);
	const carry = carryIn === true || carryIn === 1 ? 1 : 0;
	const borrow = 1 - carry;

	const diff = a8 - b8 - borrow;
	const result = diff & 0xff;
	const carryOut = diff >= 0;

	// Signed overflow when subtracting opposite-sign operands flips sign unexpectedly.
	const overflow = ((a8 ^ b8) & (a8 ^ result) & 0x80) !== 0;

	return {
		result,
		carryOut,
		overflow,
	};
}

/**
 * 6502-style ROL (rotate left through carry) for one 8-bit value.
 */
export function rol8(value: number, carryIn: number | boolean = 0): Rol8Result {
	const v8 = toUint8(value);
	const carry = carryIn === true || carryIn === 1 ? 1 : 0;

	const carryOut = (v8 & 0x80) !== 0;
	const result = ((v8 << 1) | carry) & 0xff;

	return {
		result,
		carryOut,
	};
}

/**
 * 16-bit addition with optional carry-in.
 * Useful for gameplay code that chains 8-bit operations into word math.
 */
export function adc16(a: number, b: number, carryIn: number | boolean = 0): Adc16Result {
	const a16 = toUint16(a);
	const b16 = toUint16(b);
	const carry = carryIn === true || carryIn === 1 ? 1 : 0;

	const sum = a16 + b16 + carry;
	return {
		result: sum & 0xffff,
		carryOut: sum > 0xffff,
	};
}
