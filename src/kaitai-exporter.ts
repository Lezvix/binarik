import type { FieldDescriptor } from "./types";
import { ParserBuilder } from "./builder";

// ---------------------------------------------------------------------------
// Kaitai Struct type definitions (.ksy schema)
// ---------------------------------------------------------------------------

export interface KaitaiStruct {
    meta: { id: string; endian?: "le" | "be" };
    seq: KaitaiSeqEntry[];
    types?: Record<string, { seq: KaitaiSeqEntry[]; types?: Record<string, any> }>;
}

export interface KaitaiSeqEntry {
    id: string;
    type?: string | KaitaiSwitchType;
    size?: number | string;
    repeat?: "expr";
    "repeat-expr"?: number | string;
}

export interface KaitaiSwitchType {
    "switch-on": string;
    cases: Record<number, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intTypeToKaitai(bits: 8 | 16 | 32 | 64, signed: boolean, le: boolean): string {
    const prefix = signed ? "s" : "u";
    const size = bits / 8;
    if (bits === 8) return `${prefix}1`;
    return `${prefix}${size}${le ? "le" : "be"}`;
}

function floatTypeToKaitai(bits: 32 | 64, le: boolean): string {
    return `f${bits / 8}${le ? "le" : "be"}`;
}

const PRIM_TO_KAITAI: Record<string, string | ((le: boolean) => string)> = {
    uint8: "u1", int8: "s1",
    uint16: (le) => `u2${le ? "le" : "be"}`,
    uint16le: "u2le", uint16be: "u2be",
    int16: (le) => `s2${le ? "le" : "be"}`,
    int16le: "s2le", int16be: "s2be",
    uint32: (le) => `u4${le ? "le" : "be"}`,
    uint32le: "u4le", uint32be: "u4be",
    int32: (le) => `s4${le ? "le" : "be"}`,
    int32le: "s4le", int32be: "s4be",
    uint64: (le) => `u8${le ? "le" : "be"}`,
    uint64le: "u8le", uint64be: "u8be",
    int64: (le) => `s8${le ? "le" : "be"}`,
    int64le: "s8le", int64be: "s8be",
    float32: (le) => `f4${le ? "le" : "be"}`,
    float32le: "f4le", float32be: "f4be",
    floatle: "f4le", floatbe: "f4be",
    float64: (le) => `f8${le ? "le" : "be"}`,
    float64le: "f8le", float64be: "f8be",
    doublele: "f8le", doublebe: "f8be",
};

function primToKaitai(type: string, defaultLe: boolean): string {
    const entry = PRIM_TO_KAITAI[type];
    if (!entry) throw new Error(`Unknown primitive type: ${type}`);
    return typeof entry === "function" ? entry(defaultLe) : entry;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export function toKaitaiStruct(fields: FieldDescriptor[], id: string): KaitaiStruct {
    const types: Record<string, { seq: KaitaiSeqEntry[] }> = {};
    let counter = 0;

    function uniqueName(base: string): string {
        if (!(base in types)) return base;
        let name: string;
        do { name = `${base}_${counter++}`; } while (name in types);
        return name;
    }

    function registerSubtype(base: string, subFields: FieldDescriptor[], defaultLe: boolean): string {
        const name = uniqueName(base);
        types[name] = { seq: convertFields(subFields, defaultLe) };
        return name;
    }

    function convertFields(descs: FieldDescriptor[], defaultLe: boolean): KaitaiSeqEntry[] {
        const seq: KaitaiSeqEntry[] = [];

        for (const field of descs) {
            switch (field.kind) {
                case "endianness":
                    defaultLe = field.le;
                    break;

                case "int": {
                    const le = field.le ?? defaultLe;
                    seq.push({ id: field.name, type: intTypeToKaitai(field.bits, field.signed, le) });
                    break;
                }

                case "float": {
                    const le = field.le ?? defaultLe;
                    seq.push({ id: field.name, type: floatTypeToKaitai(field.bits, le) });
                    break;
                }

                case "bit":
                    seq.push({ id: field.name, type: `b${field.bits}` });
                    break;

                case "skip":
                    seq.push({ id: `_skip_${counter++}`, size: field.bytes });
                    break;

                case "buffer":
                    seq.push({ id: field.name, size: field.length });
                    break;

                case "array": {
                    const { name, itemType, length } = field;
                    if (typeof length === "function") {
                        throw new Error("Function-based array length cannot be exported to Kaitai Struct");
                    }
                    const entry: KaitaiSeqEntry = {
                        id: name,
                        repeat: "expr",
                        "repeat-expr": length,
                    };
                    if (typeof itemType === "string") {
                        entry.type = primToKaitai(itemType, defaultLe);
                    } else {
                        entry.type = registerSubtype(`${name}_item`, itemType.fields, defaultLe);
                    }
                    seq.push(entry);
                    break;
                }

                case "nested": {
                    if (field.name) {
                        const typeName = registerSubtype(field.name, field.parser.fields, defaultLe);
                        seq.push({ id: field.name, type: typeName });
                    } else {
                        // Unnamed nested: inline fields into parent
                        seq.push(...convertFields(field.parser.fields, defaultLe));
                    }
                    break;
                }

                case "choice": {
                    const { tag, choices } = field;
                    const cases: Record<number, string> = {};
                    for (const [k, sub] of Object.entries(choices)) {
                        const base = `${field.name || "choice"}_${k}`;
                        cases[Number(k)] = registerSubtype(base, sub.fields, defaultLe);
                    }
                    seq.push({
                        id: field.name || `_choice_${counter++}`,
                        type: { "switch-on": tag, cases },
                    });
                    break;
                }
            }
        }
        return seq;
    }

    const result: KaitaiStruct = {
        meta: { id },
        seq: convertFields(fields, false),
    };

    if (Object.keys(types).length > 0) {
        result.types = types;
    }

    return result;
}
