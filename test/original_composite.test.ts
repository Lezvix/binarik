/**
 * Adapted from binary-parser/test/composite_parser.ts
 * Uses compat shim to run against binarik.
 * Unsupported features are skipped with it.skip().
 */
import { describe, it, expect } from "vitest";
import { Parser } from "./compat";

function compositeParserTests(
    name: string,
    factory: (array: Uint8Array | number[]) => Uint8Array,
) {
    describe(`Composite parser (${name})`, () => {
        function hexToBuf(hex: string): Uint8Array {
            return factory(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
        }

        describe("Array parser", () => {
            it("should parse array of primitive types", () => {
                const parser = Parser.start().uint8("length").array("message", {
                    length: "length",
                    type: "uint8",
                });
                const buffer = factory([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
                expect(parser.parse(buffer)).toEqual({
                    length: 12,
                    message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                });
            });

            it.skip("should parse array of primitive types with lengthInBytes (NOT SUPPORTED: lengthInBytes)", () => {});

            it("should parse array of user defined types", () => {
                const elementParser = new Parser().uint8("key").int16le("value");
                const parser = Parser.start().uint16le("length").array("message", {
                    length: "length",
                    type: elementParser,
                });
                const buffer = factory([
                    0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
                ]);
                expect(parser.parse(buffer)).toEqual({
                    length: 0x02,
                    message: [
                        { key: 0xca, value: 1234 },
                        { key: 0xbe, value: 1235 },
                    ],
                });
            });

            it.skip("should parse array of user defined types and have access to parent context (NOT SUPPORTED: useContextVars)", () => {});
            it.skip("should parse array of user defined types and have access to root context (NOT SUPPORTED: useContextVars)", () => {});
            it.skip("should parse array of user defined types with lengthInBytes (NOT SUPPORTED: lengthInBytes)", () => {});
            it.skip("should parse array of user defined types with lengthInBytes literal (NOT SUPPORTED: lengthInBytes)", () => {});
            it.skip("should parse array of user defined types with lengthInBytes function (NOT SUPPORTED: lengthInBytes)", () => {});

            it("should parse array of arrays", () => {
                const rowParser = Parser.start().uint8("length").array("cols", {
                    length: "length",
                    type: "int32le",
                });
                const parser = Parser.start().uint8("length").array("rows", {
                    length: "length",
                    type: rowParser,
                });

                const size = 1 + 10 * (1 + 5 * 4);
                const buf = new Uint8Array(size);
                const dv = new DataView(buf.buffer);

                let iter = 0;
                buf[iter] = 10;
                iter += 1;
                for (let i = 0; i < 10; i++) {
                    buf[iter] = 5;
                    iter += 1;
                    for (let j = 0; j < 5; j++) {
                        dv.setInt32(iter, i * j, true);
                        iter += 4;
                    }
                }

                expect(parser.parse(factory(Array.from(buf)))).toEqual({
                    length: 10,
                    rows: [
                        { length: 5, cols: [0, 0, 0, 0, 0] },
                        { length: 5, cols: [0, 1, 2, 3, 4] },
                        { length: 5, cols: [0, 2, 4, 6, 8] },
                        { length: 5, cols: [0, 3, 6, 9, 12] },
                        { length: 5, cols: [0, 4, 8, 12, 16] },
                        { length: 5, cols: [0, 5, 10, 15, 20] },
                        { length: 5, cols: [0, 6, 12, 18, 24] },
                        { length: 5, cols: [0, 7, 14, 21, 28] },
                        { length: 5, cols: [0, 8, 16, 24, 32] },
                        { length: 5, cols: [0, 9, 18, 27, 36] },
                    ],
                });
            });

            it.skip("should parse until eof when readUntil is specified (NOT SUPPORTED: readUntil)", () => {});
            it.skip("should parse until function returns true when readUntil is function (NOT SUPPORTED: readUntil)", () => {});
            it.skip("should parse until function returns true when readUntil is function (using read-ahead) (NOT SUPPORTED: readUntil)", () => {});
            it.skip("should parse associative arrays (NOT SUPPORTED: key)", () => {});
            it.skip("should use formatter to transform parsed array (NOT SUPPORTED: formatter)", () => {});
            it.skip("should be able to go into recursion (NOT SUPPORTED: namely)", () => {});
            it.skip("should be able to go into even deeper recursion (NOT SUPPORTED: namely)", () => {});
            it.skip("should allow parent parser attributes as choice key (NOT SUPPORTED: function tag)", () => {});
            it.skip("should be able to access to index context variable when using length (NOT SUPPORTED: useContextVars)", () => {});
            it.skip("should be able to access to index context variable when using length on named parser (NOT SUPPORTED: useContextVars)", () => {});

            it("should parse array with fixed length", () => {
                const parser = Parser.start().array("data", {
                    type: "uint8",
                    length: 4,
                });
                const buffer = factory([0x0a, 0x0a, 0x01, 0x6e]);
                expect(parser.parse(buffer)).toEqual({
                    data: [0x0a, 0x0a, 0x01, 0x6e],
                });
            });

            it("should parse array with function length", () => {
                const parser = Parser.start()
                    .uint8("count")
                    .array("data", {
                        type: "uint8",
                        length: function (this: any) {
                            return this.count;
                        },
                    });
                const buffer = factory([3, 0x0a, 0x0b, 0x0c]);
                expect(parser.parse(buffer)).toEqual({
                    count: 3,
                    data: [0x0a, 0x0b, 0x0c],
                });
            });
        });

        describe("Choice parser", () => {
            it.skip("should parse choices of primitive types (NOT SUPPORTED: primitive type as choice value)", () => {});
            it.skip("should parse default choice (NOT SUPPORTED: defaultChoice)", () => {});

            it("should parse choices of user defined types", () => {
                const parser = Parser.start()
                    .uint8("tag")
                    .choice("data", {
                        tag: "tag",
                        choices: {
                            1: Parser.start().uint8("length").uint32le("number"),
                            3: Parser.start().int32le("number"),
                        },
                    });

                const buf1 = factory([0x01, 0x0c, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf1)).toEqual({
                    tag: 1,
                    data: { length: 12, number: 12345678 },
                });

                const buf2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf2)).toEqual({
                    tag: 3,
                    data: { number: 12345678 },
                });
            });

            it.skip("should be able to go into recursion (NOT SUPPORTED: namely)", () => {});
            it.skip("should be able to go into recursion with simple nesting (NOT SUPPORTED: namely)", () => {});
            it.skip("should be able to refer to other parsers by name (NOT SUPPORTED: namely)", () => {});
            it.skip("should be able to refer to other parsers both directly and by name (NOT SUPPORTED: namely)", () => {});
            it.skip("should be able to go into recursion with complex nesting (NOT SUPPORTED: namely)", () => {});

            it("should be able to 'flatten' choices when using null varName", () => {
                const parser = Parser.start()
                    .uint8("tag")
                    .choice({
                        tag: "tag",
                        choices: {
                            1: Parser.start().uint8("length").int32le("number"),
                            3: Parser.start().int32le("number"),
                        },
                    });

                const buf1 = factory([0x01, 0x0c, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf1)).toEqual({
                    tag: 1,
                    length: 12,
                    number: 12345678,
                });

                const buf2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf2)).toEqual({
                    tag: 3,
                    number: 12345678,
                });
            });

            it("should be able to 'flatten' choices when omitting varName parameter", () => {
                const parser = Parser.start()
                    .uint8("tag")
                    .choice({
                        tag: "tag",
                        choices: {
                            1: Parser.start().uint8("length").int32le("number"),
                            3: Parser.start().int32le("number"),
                        },
                    });

                const buf1 = factory([0x01, 0x0c, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf1)).toEqual({
                    tag: 1,
                    length: 12,
                    number: 12345678,
                });

                const buf2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
                expect(parser.parse(buf2)).toEqual({
                    tag: 3,
                    number: 12345678,
                });
            });

            it.skip("should be able to use function as the choice selector (NOT SUPPORTED: function tag)", () => {});
            it.skip("should be able to use parsing context (NOT SUPPORTED: useContextVars)", () => {});
        });

        describe("Nest parser", () => {
            it("should parse nested parsers", () => {
                const infoParser = new Parser().uint8("age");
                const headerParser = new Parser().uint8("version").uint8("flags");
                const personParser = new Parser()
                    .nest("name", { type: headerParser })
                    .nest("info", { type: infoParser });

                const buffer = factory([0x01, 0x02, 0x20]);
                expect(personParser.parse(buffer)).toEqual({
                    name: { version: 1, flags: 2 },
                    info: { age: 0x20 },
                });
            });

            it.skip("should format parsed nested parser (NOT SUPPORTED: nest formatter)", () => {});

            it("should 'flatten' output when using null varName", () => {
                const parser = new Parser()
                    .uint8("s1")
                    .nest({ type: new Parser().uint8("s2") });
                const buf = factory([0x01, 0x02]);
                expect(parser.parse(buf)).toEqual({ s1: 1, s2: 2 });
            });

            it("should 'flatten' output when omitting varName", () => {
                const parser = new Parser()
                    .uint8("s1")
                    .nest({ type: new Parser().uint8("s2") });
                const buf = factory([0x01, 0x02]);
                expect(parser.parse(buf)).toEqual({ s1: 1, s2: 2 });
            });

            it.skip("should be able to use parsing context (NOT SUPPORTED: useContextVars)", () => {});

            it("standalone bit fields should work", () => {
                const parser = Parser.start().bit6("one").bit8("two");
                const buffer = factory([0xa8, 0x78]);
                const result = parser.parse(buffer);
                expect(result.one).toBe(0xa8 >> 2);
                expect(result.two).toBe(0x78 >> 2);
            });

            it("bit to nested bit should work", () => {
                const parser = Parser.start()
                    .bit6("one")
                    .nest("nested", {
                        type: new Parser().bit8("two").uint8("three"),
                    });
                const buffer = factory([0xa8, 0x78, 0x45]);
                const result = parser.parse(buffer);
                expect(result.one).toBe(0xa8 >> 2);
                expect(result.nested.two).toBe(0x78 >> 2);
                // switching to uint8 should start at next byte (skipping two bits here)
                expect(result.nested.three).toBe(0x45);
            });

            it.skip("bit before nest should work (NOT SUPPORTED: useContextVars)", () => {});
        });

        describe("Constructors", () => {
            it.skip("should create a custom object type (NOT SUPPORTED: create)", () => {});
        });

        describe("Pointer parser", () => {
            it.skip("should move pointer to specified offset (NOT SUPPORTED: pointer)", () => {});
            it.skip("should restore pointer to original position (NOT SUPPORTED: pointer)", () => {});
            it.skip("should work with child parser (NOT SUPPORTED: pointer)", () => {});
            it.skip("should pass variable context to child parser (NOT SUPPORTED: pointer)", () => {});
        });

        describe("SaveOffset", () => {
            it.skip("should save the offset (NOT SUPPORTED: saveOffset)", () => {});
            it.skip("should save the offset if not at end (NOT SUPPORTED: saveOffset)", () => {});
            it.skip("should save the offset with a dynamic parser (NOT SUPPORTED: saveOffset)", () => {});
        });

        describe("Utilities", () => {
            it.skip("should count size for fixed size structs (NOT SUPPORTED: sizeOf)", () => {});
            it.skip("should assert parsed values (NOT SUPPORTED: assert)", () => {});
        });

        describe("Parse other fields after bit", () => {
            it("Parse uint8", () => {
                const buffer = factory([0, 1, 0, 4]);

                const parser1 = Parser.start().bit17("a").uint8("b");
                expect(parser1.parse(buffer)).toEqual({
                    a: 1 << 1,
                    b: 4,
                });
                const parser2 = Parser.start().bit18("a").uint8("b");
                expect(parser2.parse(buffer)).toEqual({
                    a: 1 << 2,
                    b: 4,
                });
                const parser3 = Parser.start().bit19("a").uint8("b");
                expect(parser3.parse(buffer)).toEqual({
                    a: 1 << 3,
                    b: 4,
                });
                const parser4 = Parser.start().bit20("a").uint8("b");
                expect(parser4.parse(buffer)).toEqual({
                    a: 1 << 4,
                    b: 4,
                });
                const parser5 = Parser.start().bit21("a").uint8("b");
                expect(parser5.parse(buffer)).toEqual({
                    a: 1 << 5,
                    b: 4,
                });
                const parser6 = Parser.start().bit22("a").uint8("b");
                expect(parser6.parse(buffer)).toEqual({
                    a: 1 << 6,
                    b: 4,
                });
                const parser7 = Parser.start().bit23("a").uint8("b");
                expect(parser7.parse(buffer)).toEqual({
                    a: 1 << 7,
                    b: 4,
                });
                const parser8 = Parser.start().bit24("a").uint8("b");
                expect(parser8.parse(buffer)).toEqual({
                    a: 1 << 8,
                    b: 4,
                });
            });
        });

        describe("Wrapper", () => {
            it.skip("should parse deflated then inflated data (NOT SUPPORTED: wrapped)", () => {});
            it.skip("should embed parsed object in current object (NOT SUPPORTED: wrapped)", () => {});
        });
    });
}

compositeParserTests("Buffer", (arr) => Buffer.from(arr));
compositeParserTests("Uint8Array", (arr) => Uint8Array.from(arr));
