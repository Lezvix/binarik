/**
 * Adapted from binary-parser/test/primitive_parser.ts
 * Uses compat shim to run against binarik.
 * Unsupported features are skipped with it.skip().
 */
import { describe, it, expect } from "vitest";
import { Parser } from "./compat";

function primitiveParserTests(
    name: string,
    factory: (array: Uint8Array | number[]) => Uint8Array,
) {
    describe(`Primitive parser (${name})`, () => {
        function hexToBuf(hex: string): Uint8Array {
            return factory(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
        }

        describe("Primitive parsers", () => {
            it("should nothing", () => {
                const parser = Parser.start();
                const buffer = factory([0xa, 0x14, 0x1e, 0x28, 0x32]);
                expect(parser.parse(buffer)).toEqual({});
            });

            it("should parse integer types", () => {
                const parser = Parser.start().uint8("a").int16le("b").uint32be("c");
                const buffer = factory([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
                expect(parser.parse(buffer)).toEqual({
                    a: 0,
                    b: 1234,
                    c: 12345678,
                });
            });

            describe("BigInt64 parsers", () => {
                it("should parse uint64", () => {
                    const parser = Parser.start().uint64be("a").uint64le("b");
                    const buf = factory([
                        0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
                        0x00, 0xff, 0xff, 0xff, 0xff,
                    ]);
                    expect(parser.parse(buf)).toEqual({
                        a: BigInt("4294967295"),
                        b: BigInt("18446744069414584320"),
                    });
                });

                it("should parse int64", () => {
                    const parser = Parser.start()
                        .int64be("a")
                        .int64le("b")
                        .int64be("c")
                        .int64le("d");
                    const buf = factory([
                        0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00,
                        0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
                        0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
                    ]);
                    expect(parser.parse(buf)).toEqual({
                        a: BigInt("4294967295"),
                        b: BigInt("-4294967295"),
                        c: BigInt("4294967295"),
                        d: BigInt("-4294967295"),
                    });
                });
            });

            it.skip("should use formatter to transform parsed integer (NOT SUPPORTED: formatter)", () => {});

            it("should parse floating point types", () => {
                const parser = Parser.start().floatbe("a").doublele("b");
                const FLT_EPSILON = 0.00001;
                const buffer = factory([
                    0x41, 0x45, 0x85, 0x1f, 0x7a, 0x36, 0xab, 0x3e, 0x57, 0x5b, 0xb1,
                    0xbf,
                ]);
                const result = parser.parse(buffer);
                expect(Math.abs(result.a - 12.345)).toBeLessThan(FLT_EPSILON);
                expect(Math.abs(result.b - -0.0678)).toBeLessThan(FLT_EPSILON);
            });

            it("should handle endianness", () => {
                const parser = Parser.start().int32le("little").int32be("big");
                const buffer = factory([
                    0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e,
                ]);
                expect(parser.parse(buffer)).toEqual({
                    little: 12345678,
                    big: 12345678,
                });
            });

            it("should seek offset", () => {
                const parser = Parser.start()
                    .uint8("a")
                    .seek(3)
                    .uint16le("b")
                    .uint32be("c");
                const buffer = factory([
                    0x00, 0xff, 0xff, 0xfe, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e,
                ]);
                expect(parser.parse(buffer)).toEqual({
                    a: 0,
                    b: 1234,
                    c: 12345678,
                });
            });
        });

        describe("Bit field parsers", () => {
            function binaryLiteral(s: string): Uint8Array {
                const bytes = Array<number>();
                s = s.replace(/\s/g, "");
                expect(s.length % 8).toBe(0);
                for (let i = 0; i < s.length; i += 8) {
                    bytes.push(parseInt(s.slice(i, i + 8), 2));
                }
                return factory(bytes);
            }

            it("binary literal helper should work", () => {
                expect(binaryLiteral("11110000")).toEqual(factory([0xf0]));
                expect(binaryLiteral("11110000 10100101")).toEqual(factory([0xf0, 0xa5]));
            });

            it("should parse 1-byte-length bit field sequence", () => {
                const parser1 = new Parser().bit1("a").bit2("b").bit4("c").bit1("d");
                const buf = binaryLiteral("1 10 1010 0");
                expect(parser1.parse(buf)).toEqual({
                    a: 1,
                    b: 2,
                    c: 10,
                    d: 0,
                });

                const parser2 = new Parser()
                    .endianness("little")
                    .bit1("a")
                    .bit2("b")
                    .bit4("c")
                    .bit1("d");
                expect(parser2.parse(buf)).toEqual({
                    a: 0,
                    b: 2,
                    c: 10,
                    d: 1,
                });
            });

            it("should parse 2-byte-length bit field sequence", () => {
                const parser1 = new Parser().bit3("a").bit9("b").bit4("c");
                const buf = binaryLiteral("101 111000111 0111");
                expect(parser1.parse(buf)).toEqual({
                    a: 5,
                    b: 455,
                    c: 7,
                });

                const parser2 = new Parser()
                    .endianness("little")
                    .bit3("a")
                    .bit9("b")
                    .bit4("c");
                expect(parser2.parse(buf)).toEqual({
                    a: 7,
                    b: 398,
                    c: 11,
                });
            });

            it("should parse 4-byte-length bit field sequence", () => {
                const parser1 = new Parser()
                    .bit1("a")
                    .bit24("b")
                    .bit4("c")
                    .bit2("d")
                    .bit1("e");
                const buf = binaryLiteral("1 101010101010101010101010 1111 01 1");
                expect(parser1.parse(buf)).toEqual({
                    a: 1,
                    b: 11184810,
                    c: 15,
                    d: 1,
                    e: 1,
                });

                const parser2 = new Parser()
                    .endianness("little")
                    .bit1("a")
                    .bit24("b")
                    .bit4("c")
                    .bit2("d")
                    .bit1("e");
                expect(parser2.parse(buf)).toEqual({
                    a: 1,
                    b: 11184829,
                    c: 10,
                    d: 2,
                    e: 1,
                });
            });

            it("should parse 32-bit fields", () => {
                const parser1 = new Parser().bit32("a");
                const buf1 = binaryLiteral("10110101011101010111001010011101");
                expect(parser1.parse(buf1)).toEqual({ a: 3044373149 });

                const parser2 = new Parser().bit6("a").bit32("b").bit2("c");
                const buf2 = binaryLiteral(
                    "101101 10110101011101010111001010011101 11",
                );
                expect(parser2.parse(buf2)).toEqual({ a: 45, b: 3044373149, c: 3 });
            });

            it("should parse arbitrarily large bit field sequence", () => {
                const parser1 = new Parser()
                    .bit1("a")
                    .bit24("b")
                    .bit4("c")
                    .bit2("d")
                    .bit9("e");
                const buf = binaryLiteral(
                    "1 101010101010101010101010 1111 01 110100110",
                );
                expect(parser1.parse(buf)).toEqual({
                    a: 1,
                    b: 11184810,
                    c: 15,
                    d: 1,
                    e: 422,
                });

                const parser2 = new Parser()
                    .endianness("little")
                    .bit1("a")
                    .bit24("b")
                    .bit4("c")
                    .bit2("d")
                    .bit9("e");
                expect(parser2.parse(buf)).toEqual({
                    a: 1,
                    b: 11184829,
                    c: 10,
                    d: 2,
                    e: 422,
                });
            });

            it("should parse nested bit fields", () => {
                const parser = new Parser().bit1("a").nest("x", {
                    type: new Parser().bit2("b").bit4("c").bit1("d"),
                });
                const buf = binaryLiteral("11010100");
                expect(parser.parse(buf)).toEqual({
                    a: 1,
                    x: {
                        b: 2,
                        c: 10,
                        d: 0,
                    },
                });
            });

            it.skip("should assert bit fields (NOT SUPPORTED: assert)", () => {});
            it.skip("should format bit fields (NOT SUPPORTED: formatter)", () => {});
        });

        describe("String parser", () => {
            it.skip("should parse UTF8 encoded string (NOT SUPPORTED: string)", () => {});
            it.skip("should parse UTF8 encoded string (NOT SUPPORTED: string)", () => {});
            it.skip("should parse HEX encoded string (NOT SUPPORTED: string)", () => {});
            it.skip("should parse variable length string (NOT SUPPORTED: string)", () => {});
            it.skip("should parse zero terminated string (NOT SUPPORTED: string)", () => {});
            it.skip("should parser zero terminated fixed-length string (NOT SUPPORTED: string)", () => {});
            it.skip("should strip trailing null characters (NOT SUPPORTED: string)", () => {});
            it.skip("should parse string greedily with zero-bytes internally (NOT SUPPORTED: string)", () => {});
        });

        describe("Bytes parser", () => {
            it("should parse as buffer", () => {
                const parser = new Parser().uint8("len").buffer("raw", {
                    length: "len",
                });
                const hex = "deadbeefdeadbeef";
                expect(parser.parse(hexToBuf("08" + hex)).raw).toEqual(hexToBuf(hex));
            });

            it.skip("should clone buffer if options.clone is true (NOT SUPPORTED: buffer clone)", () => {});
            it.skip("should parse until function returns true (NOT SUPPORTED: buffer readUntil)", () => {});
            it.skip("should return a buffer with same size (NOT SUPPORTED: buffer readUntil)", () => {});
        });

        describe("Security", () => {
            it("should throw an error on invalid field name", () => {
                expect(() => {
                    new Parser().uint8('a; console.log("INJECTED CODE EXECUTED"); //');
                }).toThrow();
            });

            it.skip("should throw an error on invalid encoding name (NOT SUPPORTED: string)", () => {});
        });
    });
}

primitiveParserTests("Buffer", (arr) => Buffer.from(arr));
primitiveParserTests("Uint8Array", (arr) => Uint8Array.from(arr));
