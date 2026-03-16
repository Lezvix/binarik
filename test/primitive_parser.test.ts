import { describe, it, expect } from "vitest";
import { ParserBuilder, compiler } from "../src";

function hexToBuf(hex: string): Uint8Array {
    return Uint8Array.from(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

function binaryLiteral(s: string): Uint8Array {
    const bytes: number[] = [];
    s = s.replace(/\s/g, "");
    expect(s.length % 8).toBe(0);
    for (let i = 0; i < s.length; i += 8) {
        bytes.push(parseInt(s.slice(i, i + 8), 2));
    }
    return Uint8Array.from(bytes);
}

describe("Primitive parsers", () => {
    it("should parse nothing (empty parser)", () => {
        const p = new ParserBuilder().compile(compiler);
        expect(p.decode(Uint8Array.from([0xa, 0x14, 0x1e]))).toEqual({});
    });

    it("should parse integer types", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .int16le("b")
            .uint32be("c")
            .compile(compiler);

        const buf = Uint8Array.from([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
        expect(p.decode(buf)).toEqual({ a: 0, b: 1234, c: 12345678 });
    });

    it("should parse uint64", () => {
        const p = new ParserBuilder()
            .uint64be("a")
            .uint64le("b")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
            0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
        ]);
        expect(p.decode(buf)).toEqual({
            a: BigInt("4294967295"),
            b: BigInt("18446744069414584320"),
        });
    });

    it("should parse int64", () => {
        const p = new ParserBuilder()
            .int64be("a")
            .int64le("b")
            .int64be("c")
            .int64le("d")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
            0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
            0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
            0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
        ]);
        expect(p.decode(buf)).toEqual({
            a: BigInt("4294967295"),
            b: BigInt("-4294967295"),
            c: BigInt("4294967295"),
            d: BigInt("-4294967295"),
        });
    });

    it("should parse floating point types", () => {
        const p = new ParserBuilder()
            .floatbe("a")
            .doublele("b")
            .compile(compiler);

        const FLT_EPSILON = 0.00001;
        const buf = Uint8Array.from([
            0x41, 0x45, 0x85, 0x1f, 0x7a, 0x36, 0xab, 0x3e,
            0x57, 0x5b, 0xb1, 0xbf,
        ]);
        const result = p.decode(buf);
        expect(Math.abs(result.a - 12.345)).toBeLessThan(FLT_EPSILON);
        expect(Math.abs(result.b - -0.0678)).toBeLessThan(FLT_EPSILON);
    });

    it("should handle endianness", () => {
        const p = new ParserBuilder()
            .int32le("little")
            .int32be("big")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e,
        ]);
        expect(p.decode(buf)).toEqual({ little: 12345678, big: 12345678 });
    });

    it("should handle default endianness", () => {
        const p = new ParserBuilder()
            .endianness("little")
            .int32("little")
            .endianness("big")
            .int32("big")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e,
        ]);
        expect(p.decode(buf)).toEqual({ little: 12345678, big: 12345678 });
    });

    it("should seek offset", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .seek(3)
            .uint16le("b")
            .uint32be("c")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x00, 0xff, 0xff, 0xfe, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e,
        ]);
        expect(p.decode(buf)).toEqual({ a: 0, b: 1234, c: 12345678 });
    });
});

describe("Bit field parsers", () => {
    it("binary literal helper should work", () => {
        expect(binaryLiteral("11110000")).toEqual(Uint8Array.from([0xf0]));
        expect(binaryLiteral("11110000 10100101")).toEqual(
            Uint8Array.from([0xf0, 0xa5]),
        );
    });

    it("should parse 1-byte-length bit field sequence", () => {
        const p1 = new ParserBuilder()
            .bit1("a").bit2("b").bit4("c").bit1("d")
            .compile(compiler);

        const buf = binaryLiteral("1 10 1010 0");
        expect(p1.decode(buf)).toEqual({ a: 1, b: 2, c: 10, d: 0 });

        const p2 = new ParserBuilder()
            .endianness("little")
            .bit1("a").bit2("b").bit4("c").bit1("d")
            .compile(compiler);

        expect(p2.decode(buf)).toEqual({ a: 0, b: 2, c: 10, d: 1 });
    });

    it("should parse 2-byte-length bit field sequence", () => {
        const p1 = new ParserBuilder()
            .bit3("a").bit9("b").bit4("c")
            .compile(compiler);

        const buf = binaryLiteral("101 111000111 0111");
        expect(p1.decode(buf)).toEqual({ a: 5, b: 455, c: 7 });

        const p2 = new ParserBuilder()
            .endianness("little")
            .bit3("a").bit9("b").bit4("c")
            .compile(compiler);
        expect(p2.decode(buf)).toEqual({ a: 7, b: 398, c: 11 });
    });

    it("should parse 4-byte-length bit field sequence", () => {
        const p1 = new ParserBuilder()
            .bit1("a").bit24("b").bit4("c").bit2("d").bit1("e")
            .compile(compiler);
        const buf = binaryLiteral("1 101010101010101010101010 1111 01 1");
        expect(p1.decode(buf)).toEqual({
            a: 1, b: 11184810, c: 15, d: 1, e: 1,
        });

        const p2 = new ParserBuilder()
            .endianness("little")
            .bit1("a").bit24("b").bit4("c").bit2("d").bit1("e")
            .compile(compiler);
        expect(p2.decode(buf)).toEqual({
            a: 1, b: 11184829, c: 10, d: 2, e: 1,
        });
    });

    it("should parse 32-bit fields", () => {
        const p1 = new ParserBuilder().bit32("a").compile(compiler);
        const buf1 = binaryLiteral("10110101011101010111001010011101");
        expect(p1.decode(buf1)).toEqual({ a: 3044373149 });

        const p2 = new ParserBuilder().bit6("a").bit32("b").bit2("c").compile(compiler);
        const buf2 = binaryLiteral("101101 10110101011101010111001010011101 11");
        expect(p2.decode(buf2)).toEqual({ a: 45, b: 3044373149, c: 3 });
    });

    it("should parse arbitrarily large bit field sequence", () => {
        const p1 = new ParserBuilder()
            .bit1("a").bit24("b").bit4("c").bit2("d").bit9("e")
            .compile(compiler);
        const buf = binaryLiteral(
            "1 101010101010101010101010 1111 01 110100110",
        );
        expect(p1.decode(buf)).toEqual({
            a: 1, b: 11184810, c: 15, d: 1, e: 422,
        });

        const p2 = new ParserBuilder()
            .endianness("little")
            .bit1("a").bit24("b").bit4("c").bit2("d").bit9("e")
            .compile(compiler);
        expect(p2.decode(buf)).toEqual({
            a: 1, b: 11184829, c: 10, d: 2, e: 422,
        });
    });

    it("should parse nested bit fields", () => {
        const p = new ParserBuilder()
            .bit1("a")
            .nested("x", new ParserBuilder().bit2("b").bit4("c").bit1("d"))
            .compile(compiler);

        const buf = binaryLiteral("11010100");
        expect(p.decode(buf)).toEqual({
            a: 1,
            x: { b: 2, c: 10, d: 0 },
        });
    });

    it("should parse multi-bit followed by uint8", () => {
        const buf = Uint8Array.from([0, 1, 0, 4]);

        const p1 = new ParserBuilder().bit17("a").uint8("b").compile(compiler);
        expect(p1.decode(buf)).toEqual({ a: 1 << 1, b: 4 });

        const p2 = new ParserBuilder().bit18("a").uint8("b").compile(compiler);
        expect(p2.decode(buf)).toEqual({ a: 1 << 2, b: 4 });

        const p3 = new ParserBuilder().bit19("a").uint8("b").compile(compiler);
        expect(p3.decode(buf)).toEqual({ a: 1 << 3, b: 4 });

        const p4 = new ParserBuilder().bit20("a").uint8("b").compile(compiler);
        expect(p4.decode(buf)).toEqual({ a: 1 << 4, b: 4 });

        const p5 = new ParserBuilder().bit21("a").uint8("b").compile(compiler);
        expect(p5.decode(buf)).toEqual({ a: 1 << 5, b: 4 });

        const p6 = new ParserBuilder().bit22("a").uint8("b").compile(compiler);
        expect(p6.decode(buf)).toEqual({ a: 1 << 6, b: 4 });

        const p7 = new ParserBuilder().bit23("a").uint8("b").compile(compiler);
        expect(p7.decode(buf)).toEqual({ a: 1 << 7, b: 4 });

        const p8 = new ParserBuilder().bit24("a").uint8("b").compile(compiler);
        expect(p8.decode(buf)).toEqual({ a: 1 << 8, b: 4 });
    });

    it("standalone bit fields should work", () => {
        const p = new ParserBuilder().bit6("one").bit8("two").compile(compiler);
        const buf = Uint8Array.from([0xa8, 0x78]);
        const result = p.decode(buf);
        expect(result.one).toBe(0xa8 >> 2);
        expect(result.two).toBe(0x78 >> 2);
    });

    it("bit to nested bit should work", () => {
        const p = new ParserBuilder()
            .bit6("one")
            .nested("nested",
                new ParserBuilder().bit8("two").uint8("three"),
            )
            .compile(compiler);
        const buf = Uint8Array.from([0xa8, 0x78, 0x45]);
        const result = p.decode(buf);
        expect(result.one).toBe(0xa8 >> 2);
        expect(result.nested.two).toBe(0x78 >> 2);
        expect(result.nested.three).toBe(0x45);
    });
});

describe("Buffer parser", () => {
    it("should parse as buffer", () => {
        const p = new ParserBuilder()
            .uint8("len")
            .buffer("raw", "len")
            .compile(compiler);

        const hex = "deadbeefdeadbeef";
        expect(p.decode(hexToBuf("08" + hex)).raw).toEqual(hexToBuf(hex));
    });

    it("should parse fixed-length buffer", () => {
        const p = new ParserBuilder()
            .buffer("raw", 8)
            .compile(compiler);

        const buf = hexToBuf("deadbeefdeadbeef");
        expect(p.decode(buf).raw).toEqual(buf);
    });
});

// =============================================================================
// Encode round-trip tests
// =============================================================================
describe("Encode round-trip", () => {
    it("should round-trip integers", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .int16le("b")
            .uint32be("c")
            .compile(compiler);

        const obj = { a: 0, b: 1234, c: 12345678 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip uint64", () => {
        const p = new ParserBuilder()
            .uint64be("a")
            .uint64le("b")
            .compile(compiler);

        const obj = {
            a: BigInt("4294967295"),
            b: BigInt("18446744069414584320"),
        };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip floats", () => {
        const p = new ParserBuilder()
            .floatbe("a")
            .doublele("b")
            .compile(compiler);

        const obj = { a: 12.345, b: -0.0678 };
        const encoded = p.encode(obj);
        const decoded = p.decode(encoded);
        expect(Math.abs(decoded.a - obj.a)).toBeLessThan(0.001);
        expect(Math.abs(decoded.b - obj.b)).toBeLessThan(0.00001);
    });

    it("should round-trip bit fields (big-endian)", () => {
        const p = new ParserBuilder()
            .bit1("a").bit2("b").bit4("c").bit1("d")
            .compile(compiler);

        const obj = { a: 1, b: 2, c: 10, d: 0 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip bit fields (little-endian)", () => {
        const p = new ParserBuilder()
            .endianness("little")
            .bit1("a").bit2("b").bit4("c").bit1("d")
            .compile(compiler);

        const obj = { a: 0, b: 2, c: 10, d: 1 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip 2-byte bit fields", () => {
        const p = new ParserBuilder()
            .bit3("a").bit9("b").bit4("c")
            .compile(compiler);

        const obj = { a: 5, b: 455, c: 7 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip 4-byte bit fields", () => {
        const p = new ParserBuilder()
            .bit1("a").bit24("b").bit4("c").bit2("d").bit1("e")
            .compile(compiler);

        const obj = { a: 1, b: 11184810, c: 15, d: 1, e: 1 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip with skip", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .skip(3)
            .uint16le("b")
            .compile(compiler);

        const original = Uint8Array.from([0x42, 0x00, 0x00, 0x00, 0xd2, 0x04]);
        const decoded = p.decode(original);
        expect(decoded).toEqual({ a: 0x42, b: 1234 });
    });

    it("should round-trip mixed endianness", () => {
        const p = new ParserBuilder()
            .int32le("little")
            .int32be("big")
            .compile(compiler);

        const obj = { little: 12345678, big: 12345678 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip buffer", () => {
        const p = new ParserBuilder()
            .uint8("len")
            .buffer("raw", "len")
            .compile(compiler);

        const obj = { len: 4, raw: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]) };
        const encoded = p.encode(obj);
        const decoded = p.decode(encoded);
        expect(decoded.len).toBe(4);
        expect(decoded.raw).toEqual(obj.raw);
    });
});
