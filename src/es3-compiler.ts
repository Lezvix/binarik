import type { FieldDescriptor } from "./types";

// ---------------------------------------------------------------------------
// ES3 reader functions (no DataView, no TypedArrays)
// ---------------------------------------------------------------------------

type ReaderType =
    | "Uint8"
    | "Int8"
    | "Uint16LE"
    | "Uint16BE"
    | "Int16LE"
    | "Int16BE"
    | "Uint32LE"
    | "Uint32BE"
    | "Int32LE"
    | "Int32BE"
    | "BigUint64LE"
    | "BigUint64BE"
    | "BigInt64LE"
    | "BigInt64BE"
    | "Float32LE"
    | "Float32BE"
    | "Float64LE"
    | "Float64BE";

function getDependentReaders(reader: ReaderType): ReaderType[] {
    switch (reader) {
        case "BigUint64LE":
            return ["Uint32LE", "BigUint64LE"];
        case "BigInt64LE":
            return ["Uint32LE", "Int32LE", "BigInt64LE"];
        case "BigUint64BE":
            return ["Uint32BE", "BigUint64BE"];
        case "BigInt64BE":
            return ["Uint32BE", "Int32BE", "BigInt64BE"];
        default:
            return [reader];
    }
}

const readersDictionary: Record<ReaderType, string> = {
    Uint8: `function readUint8(buf, offset){
return buf[offset];
}`,
    Int8: `function readInt8(buf, offset){
if(buf[offset] & 0x80){
return (0xFF - buf[offset] + 1) * -1;
}else{
return buf[offset];
}
}`,
    Uint16LE: `function readUint16LE(buf, offset){
return buf[offset] | (buf[offset + 1] << 8);
}`,
    Int16LE: `function readInt16LE(buf, offset){
var val = buf[offset] | (buf[offset + 1] << 8);
if(val & 0x8000){
return val | 0xFFFF0000;
}else{
return val;
}
}`,
    Uint16BE: `function readUint16BE(buf, offset){
return (buf[offset] << 8) | buf[offset + 1];
}`,
    Int16BE: `function readInt16BE(buf, offset){
var val = (buf[offset] << 8) | buf[offset + 1];
if(val & 0x8000){
return val | 0xFFFF0000;
}else{
return val;
}
}`,
    Uint32LE: `function readUint32LE(buf, offset){
return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}`,
    Int32LE: `function readInt32LE(buf, offset){
return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}`,
    Uint32BE: `function readUint32BE(buf, offset){
return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}`,
    Int32BE: `function readInt32BE(buf, offset){
return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}`,
    BigUint64LE: `function readBigUint64LE(buf, offset){
var lo = readUint32LE(buf, offset);
var hi = readUint32LE(buf, offset + 4);
return hi * 0x100000000 + lo;
}`,
    BigInt64LE: `function readBigInt64LE(buf, offset){
var lo = readUint32LE(buf, offset);
var hi = readInt32LE(buf, offset + 4);
return hi * 0x100000000 + lo;
}`,
    BigUint64BE: `function readBigUint64BE(buf, offset){
var hi = readUint32BE(buf, offset);
var lo = readUint32BE(buf, offset + 4);
return hi * 0x100000000 + lo;
}`,
    BigInt64BE: `function readBigInt64BE(buf, offset){
var hi = readInt32BE(buf, offset);
var lo = readUint32BE(buf, offset + 4);
return hi * 0x100000000 + lo;
}`,
    Float32LE: `function readFloat32LE(buf, offset){
var byte0 = buf[offset];
var byte1 = buf[offset + 1];
var byte2 = buf[offset + 2];
var byte3 = buf[offset + 3];
var sign = (byte3 & 0x80) >> 7;
var exponent = ((byte3 & 0x7F) << 1) | ((byte2 & 0x80) >> 7);
var mantissa = ((byte2 & 0x7F) << 16) | (byte1 << 8) | byte0;
if(exponent === 0){
if(mantissa === 0){
return sign ? -0 : 0;
}
return (sign ? -1 : 1) * mantissa * 1.401298464324817e-45;
}
if(exponent === 255){
if(mantissa === 0){
return sign ? -Infinity : Infinity;
}
return NaN;
}
return (sign ? -1 : 1) * (1 + mantissa / 8388608) * Math.pow(2, exponent - 127);
}`,
    Float32BE: `function readFloat32BE(buf, offset){
var byte0 = buf[offset];
var byte1 = buf[offset + 1];
var byte2 = buf[offset + 2];
var byte3 = buf[offset + 3];
var sign = (byte0 & 0x80) >> 7;
var exponent = ((byte0 & 0x7F) << 1) | ((byte1 & 0x80) >> 7);
var mantissa = ((byte1 & 0x7F) << 16) | (byte2 << 8) | byte3;
if(exponent === 0){
if(mantissa === 0){
return sign ? -0 : 0;
}
return (sign ? -1 : 1) * mantissa * 1.401298464324817e-45;
}
if(exponent === 255){
if(mantissa === 0){
return sign ? -Infinity : Infinity;
}
return NaN;
}
return (sign ? -1 : 1) * (1 + mantissa / 8388608) * Math.pow(2, exponent - 127);
}`,
    Float64LE: `function readFloat64LE(buf, offset){
var byte0 = buf[offset];
var byte1 = buf[offset + 1];
var byte2 = buf[offset + 2];
var byte3 = buf[offset + 3];
var byte4 = buf[offset + 4];
var byte5 = buf[offset + 5];
var byte6 = buf[offset + 6];
var byte7 = buf[offset + 7];
var sign = (byte7 & 0x80) >> 7;
var exponent = ((byte7 & 0x7F) << 4) | ((byte6 & 0xF0) >> 4);
var mantissaHi = ((byte6 & 0x0F) << 16) | (byte5 << 8) | byte4;
var mantissaLo = (byte3 << 16) | (byte2 << 8) | byte1 | (byte0 / 256);
if(exponent === 0){
if(mantissaHi === 0 && mantissaLo === 0){
return sign ? -0 : 0;
}
return (sign ? -1 : 1) * (mantissaHi * 4.450147717014403e-308 + mantissaLo * 5e-324);
}
if(exponent === 2047){
if(mantissaHi === 0 && mantissaLo === 0){
return sign ? -Infinity : Infinity;
}
return NaN;
}
return (sign ? -1 : 1) * (1 + mantissaHi / 1048576 + mantissaLo / 4503599627370496) * Math.pow(2, exponent - 1023);
}`,
    Float64BE: `function readFloat64BE(buf, offset){
var byte0 = buf[offset];
var byte1 = buf[offset + 1];
var byte2 = buf[offset + 2];
var byte3 = buf[offset + 3];
var byte4 = buf[offset + 4];
var byte5 = buf[offset + 5];
var byte6 = buf[offset + 6];
var byte7 = buf[offset + 7];
var sign = (byte0 & 0x80) >> 7;
var exponent = ((byte0 & 0x7F) << 4) | ((byte1 & 0xF0) >> 4);
var mantissaHi = ((byte1 & 0x0F) << 16) | (byte2 << 8) | byte3;
var mantissaLo = (byte4 << 16) | (byte5 << 8) | byte6 | (byte7 / 256);
if(exponent === 0){
if(mantissaHi === 0 && mantissaLo === 0){
return sign ? -0 : 0;
}
return (sign ? -1 : 1) * (mantissaHi * 4.450147717014403e-308 + mantissaLo * 5e-324);
}
if(exponent === 2047){
if(mantissaHi === 0 && mantissaLo === 0){
return sign ? -Infinity : Infinity;
}
return NaN;
}
return (sign ? -1 : 1) * (1 + mantissaHi / 1048576 + mantissaLo / 4503599627370496) * Math.pow(2, exponent - 1023);
}`,
};

// ---------------------------------------------------------------------------
// Primitive type → reader mapping
// ---------------------------------------------------------------------------

type ES3PrimInfo = {
    reader: ReaderType;
    size: number;
};

const ES3_PRIM_MAP: Record<string, (le: boolean) => ES3PrimInfo> = {};

function addES3Prim(
    name: string,
    size: number,
    make: (le: boolean) => ReaderType,
) {
    ES3_PRIM_MAP[name] = (le) => ({ reader: make(le), size });
}

function addES3PrimFixed(name: string, size: number, reader: ReaderType) {
    ES3_PRIM_MAP[name] = () => ({ reader, size });
}

// 8-bit (no endianness)
addES3PrimFixed("uint8", 1, "Uint8");
addES3PrimFixed("int8", 1, "Int8");
// 16-bit
addES3Prim("uint16", 2, (le) => (le ? "Uint16LE" : "Uint16BE"));
addES3PrimFixed("uint16le", 2, "Uint16LE");
addES3PrimFixed("uint16be", 2, "Uint16BE");
addES3Prim("int16", 2, (le) => (le ? "Int16LE" : "Int16BE"));
addES3PrimFixed("int16le", 2, "Int16LE");
addES3PrimFixed("int16be", 2, "Int16BE");
// 32-bit
addES3Prim("uint32", 4, (le) => (le ? "Uint32LE" : "Uint32BE"));
addES3PrimFixed("uint32le", 4, "Uint32LE");
addES3PrimFixed("uint32be", 4, "Uint32BE");
addES3Prim("int32", 4, (le) => (le ? "Int32LE" : "Int32BE"));
addES3PrimFixed("int32le", 4, "Int32LE");
addES3PrimFixed("int32be", 4, "Int32BE");
// 64-bit (returns number, not BigInt)
addES3Prim("uint64", 8, (le) => (le ? "BigUint64LE" : "BigUint64BE"));
addES3PrimFixed("uint64le", 8, "BigUint64LE");
addES3PrimFixed("uint64be", 8, "BigUint64BE");
addES3Prim("int64", 8, (le) => (le ? "BigInt64LE" : "BigInt64BE"));
addES3PrimFixed("int64le", 8, "BigInt64LE");
addES3PrimFixed("int64be", 8, "BigInt64BE");
// float
addES3Prim("float32", 4, (le) => (le ? "Float32LE" : "Float32BE"));
addES3PrimFixed("float32le", 4, "Float32LE");
addES3PrimFixed("float32be", 4, "Float32BE");
addES3PrimFixed("floatle", 4, "Float32LE");
addES3PrimFixed("floatbe", 4, "Float32BE");
addES3Prim("float64", 8, (le) => (le ? "Float64LE" : "Float64BE"));
addES3PrimFixed("float64le", 8, "Float64LE");
addES3PrimFixed("float64be", 8, "Float64BE");
addES3PrimFixed("doublele", 8, "Float64LE");
addES3PrimFixed("doublebe", 8, "Float64BE");

function es3PrimInfo(type: string, le: boolean): ES3PrimInfo {
    const make = ES3_PRIM_MAP[type];
    if (!make) throw new Error(`Unknown primitive type: ${type}`);
    return make(le);
}

// ---------------------------------------------------------------------------
// ES3 decode code-generation context
// ---------------------------------------------------------------------------

class ES3DecodeCtx {
    code = "";
    tmpN = 0;
    subarrayN = 0;
    le = false;
    readers = new Set<ReaderType>();
    pendingBits: Array<{ expr: string; bits: number }> = [];

    push(line: string) {
        this.code += line + "\n";
    }
    tmp(): string {
        return `$t${this.tmpN++}`;
    }

    addReader(reader: ReaderType) {
        for (const dep of getDependentReaders(reader)) {
            this.readers.add(dep);
        }
    }

    flushBits() {
        if (!this.pendingBits.length) return;
        const pending = this.pendingBits.splice(0);

        let rem = 0;
        let sum = 0;
        let bitOffset = 0;
        let val = "";

        const getMaxBits = (from: number): number => {
            let s = 0;
            for (let i = from; i < pending.length; i++) {
                if (s + pending[i].bits > 32) break;
                s += pending[i].bits;
            }
            return s;
        };

        const readBytes = (numBits: number): number => {
            val = this.tmp();
            if (numBits <= 8) {
                this.addReader("Uint8");
                this.push(`var ${val} = readUint8(buf, off); off += 1;`);
                return 8;
            } else if (numBits <= 16) {
                this.addReader("Uint16BE");
                this.push(`var ${val} = readUint16BE(buf, off); off += 2;`);
                return 16;
            } else if (numBits <= 24) {
                this.addReader("Uint16BE");
                this.addReader("Uint8");
                this.push(
                    `var ${val} = (readUint16BE(buf, off) << 8) | readUint8(buf, off + 2); off += 3;`,
                );
                return 24;
            } else {
                this.addReader("Uint32BE");
                this.push(`var ${val} = readUint32BE(buf, off); off += 4;`);
                return 32;
            }
        };

        for (let i = 0; i < pending.length; i++) {
            const origBits = pending[i].bits;
            let length = origBits;

            if (length > rem) {
                if (rem > 0) {
                    const mask = -1 >>> (32 - rem);
                    this.push(
                        `${pending[i].expr} = (${val} & 0x${(mask >>> 0).toString(16)}) << ${length - rem};`,
                    );
                    length -= rem;
                }
                bitOffset = 0;
                rem = sum = readBytes(getMaxBits(i) - rem);
            }

            const offset = this.le ? bitOffset : sum - bitOffset - length;
            const mask = -1 >>> (32 - length);
            const op = length < origBits ? "|=" : "=";
            this.push(
                `${pending[i].expr} ${op} (${val} >> ${offset}) & 0x${(mask >>> 0).toString(16)};`,
            );

            if (origBits === 32) {
                this.push(`${pending[i].expr} >>>= 0;`);
            }

            bitOffset += length;
            rem -= length;
        }
    }
}

// ---------------------------------------------------------------------------
// ES3 decode field generation
// ---------------------------------------------------------------------------

function genES3DecodeFields(
    fields: FieldDescriptor[],
    ctx: ES3DecodeCtx,
    tgt: string,
): void {
    for (const field of fields) {
        switch (field.kind) {
            case "endianness": {
                ctx.flushBits();
                ctx.le = field.le;
                break;
            }
            case "int": {
                ctx.flushBits();
                const { name, bits, signed } = field;
                const le = field.le !== undefined ? field.le : ctx.le;
                const T = signed ? "Int" : "Uint";
                let reader: ReaderType;
                if (bits === 8) {
                    reader = (signed ? "Int8" : "Uint8") as ReaderType;
                } else if (bits === 64) {
                    reader = `Big${T}64${le ? "LE" : "BE"}` as ReaderType;
                } else {
                    reader = `${T}${bits}${le ? "LE" : "BE"}` as ReaderType;
                }
                ctx.addReader(reader);
                ctx.push(
                    `${tgt}.${name} = read${reader}(buf, off); off += ${bits / 8};`,
                );
                break;
            }
            case "float": {
                ctx.flushBits();
                const { name, bits } = field;
                const le = field.le !== undefined ? field.le : ctx.le;
                const reader: ReaderType =
                    `Float${bits}${le ? "LE" : "BE"}` as ReaderType;
                ctx.addReader(reader);
                ctx.push(
                    `${tgt}.${name} = read${reader}(buf, off); off += ${bits / 8};`,
                );
                break;
            }
            case "bit": {
                ctx.pendingBits.push({
                    expr: `${tgt}.${field.name}`,
                    bits: field.bits,
                });
                break;
            }
            case "skip": {
                ctx.flushBits();
                ctx.push(`off += ${field.bytes};`);
                break;
            }
            case "buffer": {
                ctx.flushBits();
                const lenExpr =
                    typeof field.length === "number"
                        ? `${field.length}`
                        : `${tgt}.${field.length}`;
                const idx = ctx.subarrayN++;
                const iVar = `$i${idx}`;
                const lenVar = `$len${idx}`;
                ctx.push(`${tgt}.${field.name} = [];`);
                ctx.push(`var ${lenVar} = ${lenExpr};`);
                ctx.push(
                    `for(var ${iVar} = 0; ${iVar} < ${lenVar}; ${iVar}++){`,
                );
                ctx.push(`${tgt}.${field.name}[${iVar}] = buf[off + ${iVar}];`);
                ctx.push(`}`);
                ctx.push(`off += ${lenVar};`);
                break;
            }
            case "array": {
                ctx.flushBits();
                const { name, itemType, length } = field;
                const lenExpr =
                    typeof length === "number"
                        ? `${length}`
                        : typeof length === "string"
                          ? `${tgt}.${length}`
                          : (() => {
                                throw new Error(
                                    "Function length not supported in ES3 compiler",
                                );
                            })();
                const i = ctx.tmp();
                ctx.push(`${tgt}.${name} = [];`);
                ctx.push(
                    `for(var ${i} = 0, $n${i} = ${lenExpr}; ${i} < $n${i}; ${i}++){`,
                );
                if (typeof itemType === "string") {
                    const info = es3PrimInfo(itemType, ctx.le);
                    ctx.addReader(info.reader);
                    ctx.push(
                        `${tgt}.${name}.push(read${info.reader}(buf, off)); off += ${info.size};`,
                    );
                } else {
                    const item = ctx.tmp();
                    ctx.push(`var ${item} = {};`);
                    genES3DecodeFields(itemType.fields, ctx, item);
                    ctx.push(`${tgt}.${name}.push(${item});`);
                }
                ctx.push(`}`);
                break;
            }
            case "nested": {
                if (field.name) {
                    ctx.push(`${tgt}.${field.name} = {};`);
                    genES3DecodeFields(
                        field.parser.fields,
                        ctx,
                        `${tgt}.${field.name}`,
                    );
                } else {
                    genES3DecodeFields(field.parser.fields, ctx, tgt);
                }
                break;
            }
            case "choice": {
                const choiceTgt = field.name ? `${tgt}.${field.name}` : tgt;
                if (field.name) ctx.push(`${tgt}.${field.name} = {};`);
                ctx.push(`switch(${tgt}.${field.tag}){`);
                for (const [k, sub] of Object.entries(field.choices)) {
                    ctx.push(`case ${k}:`);
                    genES3DecodeFields(sub.fields, ctx, choiceTgt);
                    ctx.push(`break;`);
                }
                ctx.push(
                    `default: throw new Error("Unknown choice tag: " + ${tgt}.${field.tag});`,
                );
                ctx.push(`}`);
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ES3GenerateResult {
    body: string;
    readers: ReaderType[];
}

/**
 * Generate the decode function body and list of required readers.
 * Use this when you need to assemble the output yourself
 * (e.g. wrapping in a Chirpstack entry-point).
 */
export function generateES3Body(fields: FieldDescriptor[]): ES3GenerateResult {
    const ctx = new ES3DecodeCtx();
    ctx.push("var off = 0;");
    ctx.push("var result = {};");
    genES3DecodeFields(fields, ctx, "result");
    ctx.flushBits();
    ctx.push("return result;");

    return {
        body: ctx.code,
        readers: Array.from(ctx.readers),
    };
}

/**
 * Generate a complete standalone ES3 decode function including reader helpers.
 * Returns source code that defines a `decode(buf)` function.
 */
export function generateES3Decoder(
    fields: FieldDescriptor[],
    fnName = "decode",
): string {
    const { body, readers } = generateES3Body(fields);
    const lines: string[] = [];

    for (const reader of readers) {
        lines.push(readersDictionary[reader]);
    }

    lines.push(`function ${fnName}(buf){`);
    lines.push(body);
    lines.push(`}`);

    return lines.join("\n");
}
