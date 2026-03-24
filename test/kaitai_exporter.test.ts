import { describe, expect, test } from "vitest";
import { ParserBuilder } from "../src/builder";
import { toKaitaiStruct } from "../src/kaitai-exporter";

describe("Kaitai exporter - primitives", () => {
    test("integer types", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .int8("b")
            .uint16le("c")
            .int32be("d")
            .uint64le("e");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.meta).toEqual({ id: "test" });
        expect(ksy.seq).toEqual([
            { id: "a", type: "u1" },
            { id: "b", type: "s1" },
            { id: "c", type: "u2le" },
            { id: "d", type: "s4be" },
            { id: "e", type: "u8le" },
        ]);
        expect(ksy.types).toBeUndefined();
    });

    test("float types", () => {
        const p = new ParserBuilder()
            .float32le("a")
            .float64be("b");
        const ksy = toKaitaiStruct(p.fields, "floats");
        expect(ksy.seq).toEqual([
            { id: "a", type: "f4le" },
            { id: "b", type: "f8be" },
        ]);
    });

    test("float aliases", () => {
        const p = new ParserBuilder()
            .floatle("a")
            .doublebe("b");
        const ksy = toKaitaiStruct(p.fields, "aliases");
        expect(ksy.seq).toEqual([
            { id: "a", type: "f4le" },
            { id: "b", type: "f8be" },
        ]);
    });
});

describe("Kaitai exporter - endianness", () => {
    test("default endianness (big) for bare uint16", () => {
        const p = new ParserBuilder().uint16("a");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[0].type).toBe("u2be");
    });

    test("endianness directive changes default", () => {
        const p = new ParserBuilder()
            .endianness("little")
            .uint16("a")
            .int32("b");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([
            { id: "a", type: "u2le" },
            { id: "b", type: "s4le" },
        ]);
    });

    test("explicit endianness overrides default", () => {
        const p = new ParserBuilder()
            .endianness("little")
            .uint16be("a")
            .uint16("b");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([
            { id: "a", type: "u2be" },
            { id: "b", type: "u2le" },
        ]);
    });
});

describe("Kaitai exporter - bit fields", () => {
    test("bit fields", () => {
        const p = new ParserBuilder()
            .bit1("flag")
            .bit5("value")
            .bit2("pad");
        const ksy = toKaitaiStruct(p.fields, "bits");
        expect(ksy.seq).toEqual([
            { id: "flag", type: "b1" },
            { id: "value", type: "b5" },
            { id: "pad", type: "b2" },
        ]);
    });
});

describe("Kaitai exporter - skip and buffer", () => {
    test("skip generates padding entry", () => {
        const p = new ParserBuilder().skip(4).uint8("a");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq.length).toBe(2);
        expect(ksy.seq[0].id).toMatch(/^_skip_/);
        expect(ksy.seq[0].size).toBe(4);
        expect(ksy.seq[1]).toEqual({ id: "a", type: "u1" });
    });

    test("buffer with fixed length", () => {
        const p = new ParserBuilder().buffer("data", 16);
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([{ id: "data", size: 16 }]);
    });

    test("buffer with dynamic length", () => {
        const p = new ParserBuilder().uint8("len").buffer("data", "len");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[1]).toEqual({ id: "data", size: "len" });
    });
});

describe("Kaitai exporter - arrays", () => {
    test("fixed-length primitive array", () => {
        const p = new ParserBuilder().array("values", "uint16le", 4);
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([
            { id: "values", type: "u2le", repeat: "expr", "repeat-expr": 4 },
        ]);
    });

    test("dynamic-length primitive array", () => {
        const p = new ParserBuilder()
            .uint8("count")
            .array("items", "uint8", "count");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[1]).toEqual({
            id: "items", type: "u1", repeat: "expr", "repeat-expr": "count",
        });
    });

    test("array with structured items creates subtype", () => {
        const point = new ParserBuilder().uint8("x").uint8("y");
        const p = new ParserBuilder().array("points", point, 3);
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[0].type).toBe("points_item");
        expect(ksy.types!.points_item).toEqual({
            seq: [
                { id: "x", type: "u1" },
                { id: "y", type: "u1" },
            ],
        });
    });

    test("function-based array length throws", () => {
        const p = new ParserBuilder()
            .uint8("count")
            .array("items", "uint8", function () { return this.count * 2; });
        expect(() => toKaitaiStruct(p.fields, "test"))
            .toThrow("Function-based array length cannot be exported to Kaitai Struct");
    });

    test("array primitive type inherits default endianness", () => {
        const p = new ParserBuilder()
            .endianness("little")
            .array("vals", "uint16", 2);
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[0].type).toBe("u2le");
    });
});

describe("Kaitai exporter - nested", () => {
    test("named nested creates subtype", () => {
        const header = new ParserBuilder().uint8("version").uint16le("flags");
        const p = new ParserBuilder().nested("header", header).uint8("body");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([
            { id: "header", type: "header" },
            { id: "body", type: "u1" },
        ]);
        expect(ksy.types!.header).toEqual({
            seq: [
                { id: "version", type: "u1" },
                { id: "flags", type: "u2le" },
            ],
        });
    });

    test("unnamed nested inlines fields", () => {
        const inner = new ParserBuilder().uint8("x").uint8("y");
        const p = new ParserBuilder().nested(inner).uint8("z");
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq).toEqual([
            { id: "x", type: "u1" },
            { id: "y", type: "u1" },
            { id: "z", type: "u1" },
        ]);
        expect(ksy.types).toBeUndefined();
    });

    test("nested inherits parent endianness", () => {
        const inner = new ParserBuilder().uint16("val");
        const p = new ParserBuilder().endianness("little").nested("sub", inner);
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.types!.sub.seq[0].type).toBe("u2le");
    });
});

describe("Kaitai exporter - choice", () => {
    test("named choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("payload", "tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().uint16le("b"),
            });
        const ksy = toKaitaiStruct(p.fields, "test");
        expect(ksy.seq[1]).toEqual({
            id: "payload",
            type: {
                "switch-on": "tag",
                cases: {
                    1: "payload_1",
                    2: "payload_2",
                },
            },
        });
        expect(ksy.types!.payload_1.seq).toEqual([{ id: "a", type: "u1" }]);
        expect(ksy.types!.payload_2.seq).toEqual([{ id: "b", type: "u2le" }]);
    });

    test("unnamed choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().uint8("b"),
            });
        const ksy = toKaitaiStruct(p.fields, "test");
        const choiceEntry = ksy.seq[1];
        expect(choiceEntry.id).toMatch(/^_choice_/);
        expect(choiceEntry.type).toHaveProperty("switch-on", "tag");
    });
});

describe("Kaitai exporter - complex", () => {
    test("full parser structure", () => {
        const header = new ParserBuilder().uint8("version").uint16le("length");
        const point = new ParserBuilder().uint8("x").uint8("y");
        const p = new ParserBuilder()
            .nested("header", header)
            .uint8("count")
            .array("points", point, "count")
            .buffer("tail", 4);
        const ksy = toKaitaiStruct(p.fields, "my_protocol");

        expect(ksy.meta.id).toBe("my_protocol");
        expect(ksy.seq).toEqual([
            { id: "header", type: "header" },
            { id: "count", type: "u1" },
            { id: "points", type: "points_item", repeat: "expr", "repeat-expr": "count" },
            { id: "tail", size: 4 },
        ]);
        expect(ksy.types).toHaveProperty("header");
        expect(ksy.types).toHaveProperty("points_item");
    });
});
