import { describe, expect, test } from "vitest";
import vm from "vm";
import { ParserBuilder } from "../src/builder";
import { generateES3Decoder, generateES3Body } from "../src/es3-compiler";
import { compiler } from "../src/compiler";

function runES3<T = any>(source: string, buf: number[]): T {
    const sandbox = {} as { decode: (buf: number[]) => T };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(source, ctx);
    return sandbox.decode(buf);
}

describe("ES3 compiler - primitives", () => {
    test("uint8", () => {
        const p = new ParserBuilder().uint8("a").uint8("b");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0xff]);
        expect(result).toEqual({ a: 1, b: 255 });
    });

    test("int8", () => {
        const p = new ParserBuilder().int8("a").int8("b");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0xff]);
        expect(result).toEqual({ a: 1, b: -1 });
    });

    test("uint16le", () => {
        const p = new ParserBuilder().uint16le("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x02]);
        expect(result).toEqual({ a: 0x0201 });
    });

    test("uint16be", () => {
        const p = new ParserBuilder().uint16be("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x02]);
        expect(result).toEqual({ a: 0x0102 });
    });

    test("int16le negative", () => {
        const p = new ParserBuilder().int16le("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0xff, 0xff]);
        expect(result).toEqual({ a: -1 });
    });

    test("uint32le", () => {
        const p = new ParserBuilder().uint32le("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x00, 0x00, 0x00]);
        expect(result).toEqual({ a: 1 });
    });

    test("uint32be", () => {
        const p = new ParserBuilder().uint32be("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x00, 0x00, 0x00, 0x01]);
        expect(result).toEqual({ a: 1 });
    });

    test("uint32le large", () => {
        const p = new ParserBuilder().uint32le("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0xff, 0xff, 0xff, 0xff]);
        expect(result).toEqual({ a: 0xffffffff });
    });

    test("int32le negative", () => {
        const p = new ParserBuilder().int32le("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0xff, 0xff, 0xff, 0xff]);
        expect(result).toEqual({ a: -1 });
    });

    test("endianness big then uint16", () => {
        const p = new ParserBuilder().endianness("big").uint16("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x02]);
        expect(result).toEqual({ a: 0x0102 });
    });

    test("endianness little then uint16", () => {
        const p = new ParserBuilder().endianness("little").uint16("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x02]);
        expect(result).toEqual({ a: 0x0201 });
    });

    test("skip bytes", () => {
        const p = new ParserBuilder().skip(2).uint8("a");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x00, 0x00, 0x42]);
        expect(result).toEqual({ a: 0x42 });
    });
});

describe("ES3 compiler - bit fields", () => {
    test("basic bit fields", () => {
        const p = new ParserBuilder()
            .bit1("a")
            .bit2("b")
            .bit5("c");
        const source = generateES3Decoder(p.fields);
        // byte: 0b_1_01_10011 = 0xB3
        const result = runES3(source, [0b10110011]);
        expect(result).toEqual({ a: 1, b: 1, c: 0b10011 });
    });

    test("16-bit spanning bit fields", () => {
        const p = new ParserBuilder()
            .bit8("a")
            .bit8("b");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0xAB, 0xCD]);
        expect(result).toEqual({ a: 0xAB, b: 0xCD });
    });

    test("bit fields matching regular compiler", () => {
        const p = new ParserBuilder()
            .bit2("high")
            .bit6("low");
        const buf = new Uint8Array([0b11_000101]);
        const expected = compiler(p.fields).decode(buf);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, Array.from(buf));
        expect(result).toEqual(expected);
    });
});

describe("ES3 compiler - composites", () => {
    test("nested parser", () => {
        const inner = new ParserBuilder().uint8("x").uint8("y");
        const p = new ParserBuilder().nested("pos", inner).uint8("z");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [1, 2, 3]);
        expect(result).toEqual({ pos: { x: 1, y: 2 }, z: 3 });
    });

    test("unnamed nested (merge)", () => {
        const inner = new ParserBuilder().uint8("x");
        const p = new ParserBuilder().nested(inner).uint8("y");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [1, 2]);
        expect(result).toEqual({ x: 1, y: 2 });
    });

    test("array with primitive items", () => {
        const p = new ParserBuilder().array("items", "uint8", 3);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [10, 20, 30]);
        expect(result).toEqual({ items: [10, 20, 30] });
    });

    test("array with dynamic length", () => {
        const p = new ParserBuilder()
            .uint8("count")
            .array("items", "uint8", "count");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [2, 0xAA, 0xBB]);
        expect(result).toEqual({ count: 2, items: [0xAA, 0xBB] });
    });

    test("array with parser items", () => {
        const item = new ParserBuilder().uint8("x").uint8("y");
        const p = new ParserBuilder().array("points", item, 2);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [1, 2, 3, 4]);
        expect(result).toEqual({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    });

    test("array with uint16le items", () => {
        const p = new ParserBuilder().array("vals", "uint16le", 2);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x00, 0x02, 0x00]);
        expect(result).toEqual({ vals: [1, 2] });
    });

    test("choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("data", "tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().uint16le("b"),
            });
        const source = generateES3Decoder(p.fields);
        const r1 = runES3(source, [1, 0x42]);
        expect(r1).toEqual({ tag: 1, data: { a: 0x42 } });
        const r2 = runES3(source, [2, 0x01, 0x02]);
        expect(r2).toEqual({ tag: 2, data: { b: 0x0201 } });
    });

    test("unnamed choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().uint8("b"),
            });
        const source = generateES3Decoder(p.fields);
        const r1 = runES3(source, [1, 0x42]);
        expect(r1).toEqual({ tag: 1, a: 0x42 });
    });
});

describe("ES3 compiler - buffer", () => {
    test("fixed length buffer", () => {
        const p = new ParserBuilder().buffer("data", 3);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [0x01, 0x02, 0x03]);
        expect(result).toEqual({ data: [0x01, 0x02, 0x03] });
    });

    test("dynamic length buffer", () => {
        const p = new ParserBuilder()
            .uint8("len")
            .buffer("data", "len");
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, [2, 0xAA, 0xBB]);
        expect(result).toEqual({ len: 2, data: [0xAA, 0xBB] });
    });
});

describe("ES3 compiler - complex structures", () => {
    test("nested with bit fields", () => {
        const inner = new ParserBuilder()
            .uint8("head")
            .bit2("cylinderHigh")
            .bit6("sector")
            .uint8("cylinder");
        const p = new ParserBuilder()
            .uint8("bootFlag")
            .nested("chs", inner);
        const buf = new Uint8Array([0x80, 0x01, 0b11_000101, 0x02]);
        const expected = compiler(p.fields).decode(buf);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, Array.from(buf));
        expect(result).toEqual(expected);
    });

    test("matches regular compiler for complex structure", () => {
        const header = new ParserBuilder()
            .uint8("version")
            .uint16le("flags");
        const p = new ParserBuilder()
            .nested("header", header)
            .uint8("count")
            .array("items", "uint16be", 2);
        const buf = new Uint8Array([0x01, 0x34, 0x12, 0x02, 0x00, 0x0A, 0x00, 0x14]);
        const expected = compiler(p.fields).decode(buf);
        const source = generateES3Decoder(p.fields);
        const result = runES3(source, Array.from(buf));
        expect(result).toEqual(expected);
    });
});

describe("ES3 compiler - generateES3Body", () => {
    test("returns body and readers", () => {
        const p = new ParserBuilder().uint8("a").uint16le("b");
        const { body, readers } = generateES3Body(p.fields);
        expect(body).toContain("readUint8");
        expect(body).toContain("readUint16LE");
        expect(readers).toContain("Uint8");
        expect(readers).toContain("Uint16LE");
    });
});

describe("ES3 compiler - custom function name", () => {
    test("generates with custom name", () => {
        const p = new ParserBuilder().uint8("a");
        const source = generateES3Decoder(p.fields, "parsePort1");
        expect(source).toContain("function parsePort1(buf)");
        const sandbox = {} as { parsePort1: (buf: number[]) => any };
        const ctx = vm.createContext(sandbox);
        vm.runInContext(source, ctx);
        expect(sandbox.parsePort1([42])).toEqual({ a: 42 });
    });
});

describe("ES3 compiler - only includes needed readers", () => {
    test("uint8 only needs Uint8 reader", () => {
        const p = new ParserBuilder().uint8("a");
        const { readers } = generateES3Body(p.fields);
        expect(readers).toEqual(["Uint8"]);
    });

    test("uint16le only needs Uint16LE reader", () => {
        const p = new ParserBuilder().uint16le("a");
        const { readers } = generateES3Body(p.fields);
        expect(readers).toEqual(["Uint16LE"]);
    });

    test("bit fields need Uint8/16/32 BE readers", () => {
        const p = new ParserBuilder().bit4("a").bit4("b");
        const { readers } = generateES3Body(p.fields);
        expect(readers).toContain("Uint8");
    });
});
