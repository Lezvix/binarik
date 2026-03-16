import { describe, it, expect, expectTypeOf } from "vitest";
import { ParserBuilder, compiler, InferOutput } from "../src";

describe("Type inference", () => {
    it("should infer primitive integer types", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .int16le("b")
            .uint32be("c");

        const compiled = p.compile(compiler);
        type Result = ReturnType<typeof compiled.decode>;

        expectTypeOf<Result>().toEqualTypeOf<{ a: number; b: number; c: number }>();
    });

    it("should infer bigint for 64-bit integers", () => {
        const p = new ParserBuilder()
            .uint64be("a")
            .int64le("b");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ a: bigint; b: bigint }>();
    });

    it("should infer float types as number", () => {
        const p = new ParserBuilder()
            .float32le("x")
            .float64be("y");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ x: number; y: number }>();
    });

    it("should infer bit fields as number", () => {
        const p = new ParserBuilder()
            .bit1("flag")
            .bit4("nibble")
            .bit3("extra");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ flag: number; nibble: number; extra: number }>();
    });

    it("should infer buffer as Uint8Array", () => {
        const p = new ParserBuilder()
            .uint8("len")
            .buffer("data", "len");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ len: number; data: Uint8Array }>();
    });

    it("should infer array of primitives", () => {
        const p = new ParserBuilder()
            .uint8("count")
            .array("items", "uint8", "count");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ count: number; items: number[] }>();
    });

    it("should infer array of bigint primitives", () => {
        const p = new ParserBuilder()
            .array("values", "int64le", 4);

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ values: bigint[] }>();
    });

    it("should infer array of user-defined types", () => {
        const itemParser = new ParserBuilder().uint8("key").int16le("value");
        const p = new ParserBuilder()
            .uint16le("length")
            .array("items", itemParser, "length");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{
            length: number;
            items: { key: number; value: number }[];
        }>();
    });

    it("should infer named nested parser", () => {
        const header = new ParserBuilder().uint8("version").uint8("flags");
        const p = new ParserBuilder()
            .nested("header", header)
            .uint8("payload");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{
            header: { version: number; flags: number };
            payload: number;
        }>();
    });

    it("should infer flattened nested parser", () => {
        const extra = new ParserBuilder().uint8("b");
        const p = new ParserBuilder()
            .uint8("a")
            .nested(extra);

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ a: number; b: number }>();
    });

    it("should infer named choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("data", "tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().int32le("b"),
            });

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{
            tag: number;
            data: { a: number } | { b: number };
        }>();
    });

    it("should infer flattened choice", () => {
        const p = new ParserBuilder()
            .uint8("tag")
            .choice("tag", {
                1: new ParserBuilder().uint8("a"),
                2: new ParserBuilder().int16le("b"),
            });

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{
            tag: number;
        } & ({ a: number } | { b: number })>();
    });

    it("should infer seek does not change type", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .seek(4)
            .uint8("b");

        type Result = InferOutput<typeof p>;
        expectTypeOf<Result>().toEqualTypeOf<{ a: number; b: number }>();
    });

    it("should infer complex nested structure", () => {
        const point = new ParserBuilder().float32le("x").float32le("y").float32le("z");
        const mesh = new ParserBuilder()
            .uint16le("count")
            .array("vertices", point, "count");

        type Result = InferOutput<typeof mesh>;
        expectTypeOf<Result>().toEqualTypeOf<{
            count: number;
            vertices: { x: number; y: number; z: number }[];
        }>();
    });

    it("should enforce field references at type level", () => {
        const p = new ParserBuilder()
            .uint8("len")
            .buffer("data", "len");

        // The compiled parser should have the inferred type
        const compiled = p.compile(compiler);
        const buf = Uint8Array.from([3, 0xDE, 0xAD, 0xBE]);
        const result = compiled.decode(buf);

        // Runtime check
        expect(result.len).toBe(3);
        expect(result.data).toEqual(Uint8Array.from([0xDE, 0xAD, 0xBE]));

        // Type check: result.len and result.data should be accessible without casts
        const len: number = result.len;
        const data: Uint8Array = result.data;
        expect(len).toBe(3);
        expect(data.length).toBe(3);
    });

    it("should infer encode parameter type", () => {
        const p = new ParserBuilder()
            .uint8("a")
            .uint16le("b")
            .compile(compiler);

        // encode accepts the inferred type
        const encoded = p.encode({ a: 1, b: 1234 });
        expect(p.decode(encoded)).toEqual({ a: 1, b: 1234 });
    });
});
