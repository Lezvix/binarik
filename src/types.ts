import { ParserBuilder } from "./builder";

export type Parser<I, O> = {
    decode(bytes: I): O;
    encode(object: O): I;
};

export type Endianness = "big" | "little";

export type FieldDescriptor =
    | { kind: "endianness"; le: boolean }
    | {
          kind: "int";
          name: string;
          bits: 8 | 16 | 32 | 64;
          signed: boolean;
          le?: boolean;
      }
    | { kind: "float"; name: string; bits: 32 | 64; le?: boolean }
    | { kind: "bit"; name: string; bits: number }
    | {
          kind: "array";
          name: string;
          itemType: ParserBuilder<any> | string;
          length: number | string | ((ctx: any) => number);
      }
    | {
          kind: "nested";
          name?: string;
          parser: ParserBuilder<any>;
      }
    | {
          kind: "choice";
          name?: string;
          tag: string;
          choices: Record<number, ParserBuilder<any>>;
      }
    | { kind: "buffer"; name: string; length: number | string }
    | { kind: "skip"; bytes: number };

export type Compiler<I = Uint8Array> = (
    fields: FieldDescriptor[],
) => Parser<I, any>;

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type BigIntPrimitive =
    | "uint64"
    | "uint64le"
    | "uint64be"
    | "int64"
    | "int64le"
    | "int64be";

export type NumberPrimitive =
    | "uint8"
    | "int8"
    | "uint16"
    | "uint16le"
    | "uint16be"
    | "int16"
    | "int16le"
    | "int16be"
    | "uint32"
    | "uint32le"
    | "uint32be"
    | "int32"
    | "int32le"
    | "int32be"
    | "floatle"
    | "floatbe"
    | "float32"
    | "float32le"
    | "float32be"
    | "doublele"
    | "doublebe"
    | "float64"
    | "float64le"
    | "float64be";

export type PrimitiveType = BigIntPrimitive | NumberPrimitive;

export type InferArrayItem<Item> =
    Item extends import("./builder").ParserBuilder<
        infer U extends Record<string, any>
    >
        ? U
        : Item extends BigIntPrimitive
          ? bigint
          : number;

export type InferChoices<
    C extends Record<number, import("./builder").ParserBuilder<any>>,
> = C[keyof C] extends import("./builder").ParserBuilder<
    infer U extends Record<string, any>
>
    ? U
    : never;

export type InferOutput<B> = B extends import("./builder").ParserBuilder<
    infer T extends Record<string, any>
>
    ? Prettify<T>
    : never;
