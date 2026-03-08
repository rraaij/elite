import { describe, expect, it } from "vitest";
import {
  adc8,
  adc16,
  joinUint16,
  rol8,
  sbc8,
  splitUint16,
  toInt8,
  toInt16,
  toUint8,
  toUint16,
} from "../../game-core/src/index";

describe("byteMath helpers", () => {
  it("normalizes values to unsigned ranges", () => {
    expect(toUint8(-1)).toBe(255);
    expect(toUint8(258)).toBe(2);
    expect(toUint16(-1)).toBe(65535);
    expect(toUint16(65537)).toBe(1);
  });

  it("converts low bits to signed two's-complement values", () => {
    expect(toInt8(0xff)).toBe(-1);
    expect(toInt8(0x7f)).toBe(127);
    expect(toInt16(0xffff)).toBe(-1);
    expect(toInt16(0x7fff)).toBe(32767);
  });

  it("round-trips little-endian word packing", () => {
    const split = splitUint16(0xabcd);
    expect(split).toEqual({ lo: 0xcd, hi: 0xab });
    expect(joinUint16(split.lo, split.hi)).toBe(0xabcd);
  });

  it("performs ADC with carry and signed overflow flags", () => {
    // 0x7F + 0x01 => 0x80, no carry, signed overflow.
    expect(adc8(0x7f, 0x01, 0)).toEqual({
      result: 0x80,
      carryOut: false,
      overflow: true,
    });

    // 0xFF + 0x01 => 0x00, carry set, no signed overflow.
    expect(adc8(0xff, 0x01, 0)).toEqual({
      result: 0x00,
      carryOut: true,
      overflow: false,
    });
  });

  it("performs SBC with 6502 no-borrow carry semantics", () => {
    // 0x10 - 0x01 with carry-in set => 0x0F, no borrow.
    expect(sbc8(0x10, 0x01, 1)).toEqual({
      result: 0x0f,
      carryOut: true,
      overflow: false,
    });

    // 0x00 - 0x01 with carry-in set => 0xFF, borrow occurred.
    expect(sbc8(0x00, 0x01, 1)).toEqual({
      result: 0xff,
      carryOut: false,
      overflow: false,
    });
  });

  it("rotates left through carry", () => {
    expect(rol8(0x80, false)).toEqual({
      result: 0x00,
      carryOut: true,
    });

    expect(rol8(0x80, true)).toEqual({
      result: 0x01,
      carryOut: true,
    });
  });

  it("adds 16-bit values with carry", () => {
    expect(adc16(0xffff, 0x0001, 0)).toEqual({
      result: 0x0000,
      carryOut: true,
    });
    expect(adc16(0x0100, 0x0001, 1)).toEqual({
      result: 0x0102,
      carryOut: false,
    });
  });
});
