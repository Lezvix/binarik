import { describe, it, expect } from "vitest";
import { ParserBuilder, compiler } from "../src";

function hexToBuf(hex: string): Uint8Array {
    return Uint8Array.from(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

// =============================================================================
// Array parser
// =============================================================================
describe("Array parser", () => {
    it("should parse array of primitive types", () => {
        const p = new ParserBuilder()
            .uint8("length")
            .array("message", "uint8", "length")
            .compile(compiler);

        const buf = Uint8Array.from([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(p.decode(buf)).toEqual({
            length: 12,
            message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        });
    });

    it("should parse array of user defined types", () => {
        const elementParser = new ParserBuilder().uint8("key").int16le("value");

        const p = new ParserBuilder()
            .uint16le("length")
            .array("message", elementParser, "length")
            .compile(compiler);

        const buf = Uint8Array.from([
            0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        expect(p.decode(buf)).toEqual({
            length: 0x02,
            message: [
                { key: 0xca, value: 1234 },
                { key: 0xbe, value: 1235 },
            ],
        });
    });

    it("should parse array of arrays", () => {
        const rowParser = new ParserBuilder()
            .uint8("length")
            .array("cols", "int32le", "length");

        const p = new ParserBuilder()
            .uint8("length")
            .array("rows", rowParser, "length")
            .compile(compiler);

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

        expect(p.decode(buf)).toEqual({
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

    it("should parse array with fixed length", () => {
        const p = new ParserBuilder()
            .array("data", "uint8", 4)
            .compile(compiler);

        const buf = Uint8Array.from([0x0a, 0x0a, 0x01, 0x6e]);
        expect(p.decode(buf)).toEqual({
            data: [0x0a, 0x0a, 0x01, 0x6e],
        });
    });

    it("should parse array with function length", () => {
        const p = new ParserBuilder()
            .uint8("count")
            .array("data", "uint8", function (this: any) {
                return this.count;
            })
            .compile(compiler);

        const buf = Uint8Array.from([3, 0x0a, 0x0b, 0x0c]);
        expect(p.decode(buf)).toEqual({
            count: 3,
            data: [0x0a, 0x0b, 0x0c],
        });
    });
});

// =============================================================================
// Choice parser
// =============================================================================
describe("Choice parser", () => {
    it("should parse choices of user defined types", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("data", "tag", {
                1: new ParserBuilder().uint8("length").uint32le("number"),
                3: new ParserBuilder().int32le("number"),
            })
            .compile(compiler);

        const buf1 = Uint8Array.from([0x01, 0x0c, 0x4e, 0x61, 0xbc, 0x00]);
        expect(p.decode(buf1)).toEqual({
            tag: 1,
            data: { length: 12, number: 12345678 },
        });

        const buf2 = Uint8Array.from([0x03, 0x4e, 0x61, 0xbc, 0x00]);
        expect(p.decode(buf2)).toEqual({
            tag: 3,
            data: { number: 12345678 },
        });
    });

    it("should flatten choices when omitting varName", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("length").int32le("number"),
                3: new ParserBuilder().int32le("number"),
            })
            .compile(compiler);

        const buf1 = Uint8Array.from([0x01, 0x0c, 0x4e, 0x61, 0xbc, 0x00]);
        expect(p.decode(buf1)).toEqual({
            tag: 1,
            length: 12,
            number: 12345678,
        });

        const buf2 = Uint8Array.from([0x03, 0x4e, 0x61, 0xbc, 0x00]);
        expect(p.decode(buf2)).toEqual({
            tag: 3,
            number: 12345678,
        });
    });

    it("should throw on unknown tag", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("a"),
            })
            .compile(compiler);

        expect(() => p.decode(Uint8Array.from([0x02, 0x00]))).toThrow(
            "Unknown choice tag",
        );
    });
});

// =============================================================================
// Nest parser
// =============================================================================
describe("Nest parser", () => {
    it("should parse nested parsers", () => {
        const infoParser = new ParserBuilder().uint8("age");
        const headerParser = new ParserBuilder().uint8("version").uint8("flags");
        const personParser = new ParserBuilder()
            .nested("header", headerParser)
            .nested("info", infoParser)
            .compile(compiler);

        const buf = Uint8Array.from([0x01, 0x02, 0x20]);
        expect(personParser.decode(buf)).toEqual({
            header: { version: 1, flags: 2 },
            info: { age: 0x20 },
        });
    });

    it("should flatten output when omitting varName", () => {
        const p = new ParserBuilder()
            .uint8("s1")
            .nested(new ParserBuilder().uint8("s2"))
            .compile(compiler);

        const buf = Uint8Array.from([0x01, 0x02]);
        expect(p.decode(buf)).toEqual({ s1: 1, s2: 2 });
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
        // switching to uint8 starts at next byte boundary
        expect(result.nested.three).toBe(0x45);
    });
});

// =============================================================================
// Encode round-trip (composite)
// =============================================================================
describe("Encode round-trip (composite)", () => {
    it("should round-trip array of primitive types", () => {
        const p = new ParserBuilder()
            .uint8("length")
            .array("message", "uint8", "length")
            .compile(compiler);

        const obj = { length: 5, message: [10, 20, 30, 40, 50] };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip array of user defined types", () => {
        const elementParser = new ParserBuilder().uint8("key").int16le("value");

        const p = new ParserBuilder()
            .uint16le("length")
            .array("message", elementParser, "length")
            .compile(compiler);

        const obj = {
            length: 2,
            message: [
                { key: 0xca, value: 1234 },
                { key: 0xbe, value: 1235 },
            ],
        };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip fixed-size array", () => {
        const p = new ParserBuilder()
            .array("data", "uint8", 4)
            .compile(compiler);

        const obj = { data: [10, 10, 1, 110] };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip int32le arrays", () => {
        const p = new ParserBuilder()
            .array("values", "int32le", 3)
            .compile(compiler);

        const obj = { values: [12345678, -1, 0] };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip nested parsers", () => {
        const infoParser = new ParserBuilder().uint8("age");
        const headerParser = new ParserBuilder().uint8("version").uint8("flags");
        const p = new ParserBuilder()
            .nested("header", headerParser)
            .nested("info", infoParser)
            .compile(compiler);

        const obj = {
            header: { version: 1, flags: 2 },
            info: { age: 32 },
        };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip flattened nested", () => {
        const p = new ParserBuilder()
            .uint8("s1")
            .nested(new ParserBuilder().uint8("s2"))
            .compile(compiler);

        const obj = { s1: 1, s2: 2 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("data", "tag", {
                1: new ParserBuilder().uint8("a").uint8("b"),
                2: new ParserBuilder().int32le("number"),
            })
            .compile(compiler);

        const obj1 = { tag: 1, data: { a: 10, b: 20 } };
        const encoded1 = p.encode(obj1);
        expect(p.decode(encoded1)).toEqual(obj1);

        const obj2 = { tag: 2, data: { number: 12345678 } };
        const encoded2 = p.encode(obj2);
        expect(p.decode(encoded2)).toEqual(obj2);
    });

    it("should round-trip flattened choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().int16le("b"),
            })
            .compile(compiler);

        const obj = { tag: 1, a: 42 };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip complex structure", () => {
        const pointParser = new ParserBuilder()
            .float32le("x")
            .float32le("y")
            .float32le("z");

        const meshParser = new ParserBuilder()
            .uint16le("count")
            .array("vertices", pointParser, "count")
            .compile(compiler);

        const obj = {
            count: 2,
            vertices: [
                { x: 1.0, y: 2.0, z: 3.0 },
                { x: 4.0, y: 5.0, z: 6.0 },
            ],
        };
        const encoded = meshParser.encode(obj);
        const decoded = meshParser.decode(encoded);
        expect(decoded.count).toBe(2);
        expect(decoded.vertices.length).toBe(2);
        expect(decoded.vertices[0].x).toBeCloseTo(1.0);
        expect(decoded.vertices[0].y).toBeCloseTo(2.0);
        expect(decoded.vertices[0].z).toBeCloseTo(3.0);
        expect(decoded.vertices[1].x).toBeCloseTo(4.0);
        expect(decoded.vertices[1].y).toBeCloseTo(5.0);
        expect(decoded.vertices[1].z).toBeCloseTo(6.0);
    });

    it("should round-trip array of arrays", () => {
        const rowParser = new ParserBuilder()
            .uint8("length")
            .array("cols", "int32le", "length");

        const p = new ParserBuilder()
            .uint8("length")
            .array("rows", rowParser, "length")
            .compile(compiler);

        const obj = {
            length: 3,
            rows: [
                { length: 2, cols: [10, 20] },
                { length: 3, cols: [1, 2, 3] },
                { length: 1, cols: [99] },
            ],
        };
        const encoded = p.encode(obj);
        expect(p.decode(encoded)).toEqual(obj);
    });

    it("should round-trip buffer with header", () => {
        const p = new ParserBuilder()
            .uint32le("magic")
            .uint8("version")
            .bit1("compressed")
            .bit1("encrypted")
            .bit6("reserved")
            .uint16le("payloadLength")
            .buffer("payload", "payloadLength")
            .compile(compiler);

        const payload = Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
        const obj = {
            magic: 0x42494E52,
            version: 1,
            compressed: 1,
            encrypted: 0,
            reserved: 0,
            payloadLength: 6,
            payload,
        };
        const encoded = p.encode(obj);
        const decoded = p.decode(encoded);
        expect(decoded.magic).toBe(obj.magic);
        expect(decoded.version).toBe(obj.version);
        expect(decoded.compressed).toBe(1);
        expect(decoded.encrypted).toBe(0);
        expect(decoded.payloadLength).toBe(6);
        expect(decoded.payload).toEqual(payload);
    });
});
