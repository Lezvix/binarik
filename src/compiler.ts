import type { FieldDescriptor, Compiler } from "./types";
import { ParserBuilder } from "./builder";

// ---------------------------------------------------------------------------
// Primitive type info for array item types
// ---------------------------------------------------------------------------
type PrimInfo = {
    get: string;
    set: string;
    size: number;
    le?: boolean;
    bigint: boolean;
};

const PRIM_MAP: Record<string, PrimInfo> = {};

function addPrim(name: string, get: string, set: string, size: number, bigint: boolean, le?: boolean) {
    PRIM_MAP[name] = { get, set, size, le, bigint };
}

// 8-bit
addPrim("uint8", "getUint8", "setUint8", 1, false);
addPrim("int8", "getInt8", "setInt8", 1, false);
// 16-bit
addPrim("uint16", "getUint16", "setUint16", 2, false);
addPrim("uint16le", "getUint16", "setUint16", 2, false, true);
addPrim("uint16be", "getUint16", "setUint16", 2, false, false);
addPrim("int16", "getInt16", "setInt16", 2, false);
addPrim("int16le", "getInt16", "setInt16", 2, false, true);
addPrim("int16be", "getInt16", "setInt16", 2, false, false);
// 32-bit
addPrim("uint32", "getUint32", "setUint32", 4, false);
addPrim("uint32le", "getUint32", "setUint32", 4, false, true);
addPrim("uint32be", "getUint32", "setUint32", 4, false, false);
addPrim("int32", "getInt32", "setInt32", 4, false);
addPrim("int32le", "getInt32", "setInt32", 4, false, true);
addPrim("int32be", "getInt32", "setInt32", 4, false, false);
// 64-bit
addPrim("uint64", "getBigUint64", "setBigUint64", 8, true);
addPrim("uint64le", "getBigUint64", "setBigUint64", 8, true, true);
addPrim("uint64be", "getBigUint64", "setBigUint64", 8, true, false);
addPrim("int64", "getBigInt64", "setBigInt64", 8, true);
addPrim("int64le", "getBigInt64", "setBigInt64", 8, true, true);
addPrim("int64be", "getBigInt64", "setBigInt64", 8, true, false);
// float
addPrim("floatle", "getFloat32", "setFloat32", 4, false, true);
addPrim("floatbe", "getFloat32", "setFloat32", 4, false, false);
addPrim("float32", "getFloat32", "setFloat32", 4, false);
addPrim("float32le", "getFloat32", "setFloat32", 4, false, true);
addPrim("float32be", "getFloat32", "setFloat32", 4, false, false);
addPrim("doublele", "getFloat64", "setFloat64", 8, false, true);
addPrim("doublebe", "getFloat64", "setFloat64", 8, false, false);
addPrim("float64", "getFloat64", "setFloat64", 8, false);
addPrim("float64le", "getFloat64", "setFloat64", 8, false, true);
addPrim("float64be", "getFloat64", "setFloat64", 8, false, false);

function primInfo(type: string): PrimInfo {
    const info = PRIM_MAP[type];
    if (!info) throw new Error(`Unknown primitive type: ${type}`);
    return info;
}

// =============================================================================
// Decode code-generation
// =============================================================================

class DecodeCtx {
    code = "";
    tmpN = 0;
    imports: unknown[] = [];
    le = false;
    pendingBits: Array<{ expr: string; bits: number }> = [];

    push(line: string) { this.code += line + "\n"; }
    tmp(): string { return `$t${this.tmpN++}`; }

    imp(fn: unknown): string {
        let i = this.imports.indexOf(fn);
        if (i < 0) i = this.imports.push(fn) - 1;
        return `$im[${i}]`;
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
                this.push(`var ${val} = dv.getUint8(off); off+=1;`);
                return 8;
            } else if (numBits <= 16) {
                this.push(`var ${val} = dv.getUint16(off); off+=2;`);
                return 16;
            } else if (numBits <= 24) {
                this.push(`var ${val} = (dv.getUint16(off)<<8)|dv.getUint8(off+2); off+=3;`);
                return 24;
            } else {
                this.push(`var ${val} = dv.getUint32(off); off+=4;`);
                return 32;
            }
        };

        for (let i = 0; i < pending.length; i++) {
            const origBits = pending[i].bits;
            let length = origBits;

            if (length > rem) {
                if (rem > 0) {
                    const mask = -1 >>> (32 - rem);
                    this.push(`${pending[i].expr} = (${val} & 0x${(mask >>> 0).toString(16)}) << ${length - rem};`);
                    length -= rem;
                }
                bitOffset = 0;
                rem = sum = readBytes(getMaxBits(i) - rem);
            }

            const offset = this.le ? bitOffset : sum - bitOffset - length;
            const mask = -1 >>> (32 - length);
            const op = length < origBits ? "|=" : "=";
            this.push(`${pending[i].expr} ${op} (${val}>>${offset}) & 0x${(mask >>> 0).toString(16)};`);

            if (origBits === 32) {
                this.push(`${pending[i].expr} >>>= 0;`);
            }

            bitOffset += length;
            rem -= length;
        }
    }
}

function genDecodeFields(fields: FieldDescriptor[], ctx: DecodeCtx, tgt: string): void {
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
                if (bits === 8) {
                    ctx.push(`${tgt}.${name} = dv.get${T}8(off); off+=1;`);
                } else if (bits === 64) {
                    ctx.push(`${tgt}.${name} = dv.get${signed ? "BigInt64" : "BigUint64"}(off,${le}); off+=8;`);
                } else {
                    ctx.push(`${tgt}.${name} = dv.get${T}${bits}(off,${le}); off+=${bits / 8};`);
                }
                break;
            }
            case "float": {
                ctx.flushBits();
                const { name, bits } = field;
                const le = field.le !== undefined ? field.le : ctx.le;
                ctx.push(`${tgt}.${name} = dv.get${bits === 32 ? "Float32" : "Float64"}(off,${le}); off+=${bits / 8};`);
                break;
            }
            case "bit": {
                ctx.pendingBits.push({ expr: `${tgt}.${field.name}`, bits: field.bits });
                break;
            }
            case "skip": {
                ctx.flushBits();
                ctx.push(`off+=${field.bytes};`);
                break;
            }
            case "buffer": {
                ctx.flushBits();
                const lenExpr = typeof field.length === "number"
                    ? `${field.length}`
                    : `${tgt}.${field.length}`;
                ctx.push(`${tgt}.${field.name} = buf.subarray(off, off+${lenExpr}); off+=${lenExpr};`);
                break;
            }
            case "array": {
                ctx.flushBits();
                const { name, itemType, length } = field;
                const lenExpr = typeof length === "number"
                    ? `${length}`
                    : typeof length === "string"
                      ? `${tgt}.${length}`
                      : `${ctx.imp(length)}.call(${tgt})`;
                const i = ctx.tmp();
                ctx.push(`${tgt}.${name} = [];`);
                ctx.push(`for(var ${i}=0,$n${i}=${lenExpr};${i}<$n${i};${i}++){`);
                if (typeof itemType === "string") {
                    const info = primInfo(itemType);
                    const le = info.le !== undefined ? info.le : ctx.le;
                    const leArg = info.size > 1 ? `,${le}` : "";
                    ctx.push(`${tgt}.${name}.push(dv.${info.get}(off${leArg})); off+=${info.size};`);
                } else {
                    const item = ctx.tmp();
                    ctx.push(`var ${item} = {};`);
                    genDecodeFields(itemType.fields, ctx, item);
                    ctx.push(`${tgt}.${name}.push(${item});`);
                }
                ctx.push(`}`);
                break;
            }
            case "nested": {
                if (field.name) {
                    ctx.push(`${tgt}.${field.name} = {};`);
                    genDecodeFields(field.parser.fields, ctx, `${tgt}.${field.name}`);
                } else {
                    genDecodeFields(field.parser.fields, ctx, tgt);
                }
                break;
            }
            case "choice": {
                const choiceTgt = field.name ? `${tgt}.${field.name}` : tgt;
                if (field.name) ctx.push(`${tgt}.${field.name} = {};`);
                ctx.push(`switch(${tgt}.${field.tag}){`);
                for (const [k, sub] of Object.entries(field.choices)) {
                    ctx.push(`case ${k}:`);
                    genDecodeFields(sub.fields, ctx, choiceTgt);
                    ctx.push(`break;`);
                }
                ctx.push(`default: throw new Error("Unknown choice tag: "+${tgt}.${field.tag});`);
                ctx.push(`}`);
                break;
            }
        }
    }
}

function compileDecoder(fields: FieldDescriptor[]): (buf: Uint8Array) => any {
    const ctx = new DecodeCtx();
    ctx.push("var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);");
    ctx.push("var off = 0;");
    ctx.push("var vars = {};");
    genDecodeFields(fields, ctx, "vars");
    ctx.flushBits();
    ctx.push("return vars;");
    return new Function("$im", `return function decode(buf){\n${ctx.code}}`)(ctx.imports);
}

// =============================================================================
// Encode code-generation
// =============================================================================

class EncodeCtx {
    code = "";
    tmpN = 0;
    imports: unknown[] = [];
    le = false;
    pendingBits: Array<{ expr: string; bits: number }> = [];

    push(line: string) { this.code += line + "\n"; }
    tmp(): string { return `$t${this.tmpN++}`; }

    imp(fn: unknown): string {
        let i = this.imports.indexOf(fn);
        if (i < 0) i = this.imports.push(fn) - 1;
        return `$im[${i}]`;
    }

    flushBits() {
        if (!this.pendingBits.length) return;
        const pending = this.pendingBits.splice(0);

        let rem = 0;
        let sum = 0;
        let bitOffset = 0;
        let val = "";
        let wordAllocated = false;

        const getMaxBits = (from: number): number => {
            let s = 0;
            for (let i = from; i < pending.length; i++) {
                if (s + pending[i].bits > 32) break;
                s += pending[i].bits;
            }
            return s;
        };

        const allocWord = (numBits: number): number => {
            val = this.tmp();
            this.push(`var ${val} = 0;`);
            wordAllocated = true;
            if (numBits <= 8) return 8;
            if (numBits <= 16) return 16;
            if (numBits <= 24) return 24;
            return 32;
        };

        const writeWord = () => {
            if (sum === 8) {
                this.push(`dv.setUint8(off,${val}); off+=1;`);
            } else if (sum === 16) {
                this.push(`dv.setUint16(off,${val}); off+=2;`);
            } else if (sum === 24) {
                this.push(`dv.setUint16(off,(${val}>>8)&0xffff); dv.setUint8(off+2,${val}&0xff); off+=3;`);
            } else {
                this.push(`dv.setUint32(off,${val}>>>0); off+=4;`);
            }
            wordAllocated = false;
        };

        for (let i = 0; i < pending.length; i++) {
            const origBits = pending[i].bits;
            let length = origBits;
            const fieldExpr = pending[i].expr;

            if (length > rem) {
                if (rem > 0) {
                    const mask = -1 >>> (32 - rem);
                    const shift = this.le ? bitOffset : sum - bitOffset - rem;
                    this.push(`${val} |= (((${fieldExpr} >>> ${length - rem}) & 0x${(mask >>> 0).toString(16)}) << ${shift});`);
                    writeWord();
                    length -= rem;
                } else if (wordAllocated) {
                    writeWord();
                }
                bitOffset = 0;
                rem = sum = allocWord(getMaxBits(i) - (origBits - length));
            }

            const offset = this.le ? bitOffset : sum - bitOffset - length;
            const mask = length === 32 ? 0xffffffff : (1 << length) - 1;
            this.push(`${val} |= ((${fieldExpr} & 0x${(mask >>> 0).toString(16)}) << ${offset});`);

            bitOffset += length;
            rem -= length;
        }

        if (wordAllocated) {
            writeWord();
        }
    }
}

function genEncodeFields(fields: FieldDescriptor[], ctx: EncodeCtx, src: string): void {
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
                if (bits === 8) {
                    ctx.push(`dv.set${T}8(off,${src}.${name}); off+=1;`);
                } else if (bits === 64) {
                    ctx.push(`dv.set${signed ? "BigInt64" : "BigUint64"}(off,BigInt(${src}.${name}),${le}); off+=8;`);
                } else {
                    ctx.push(`dv.set${T}${bits}(off,${src}.${name},${le}); off+=${bits / 8};`);
                }
                break;
            }
            case "float": {
                ctx.flushBits();
                const { name, bits } = field;
                const le = field.le !== undefined ? field.le : ctx.le;
                ctx.push(`dv.set${bits === 32 ? "Float32" : "Float64"}(off,${src}.${name},${le}); off+=${bits / 8};`);
                break;
            }
            case "bit": {
                ctx.pendingBits.push({ expr: `${src}.${field.name}`, bits: field.bits });
                break;
            }
            case "skip": {
                ctx.flushBits();
                ctx.push(`off+=${field.bytes};`);
                break;
            }
            case "buffer": {
                ctx.flushBits();
                const lenExpr = typeof field.length === "number"
                    ? `${field.length}`
                    : `${src}.${field.length}`;
                ctx.push(`buf.set(${src}.${field.name},off); off+=${lenExpr};`);
                break;
            }
            case "array": {
                ctx.flushBits();
                const { name, itemType } = field;
                const i = ctx.tmp();
                ctx.push(`for(var ${i}=0;${i}<${src}.${name}.length;${i}++){`);
                if (typeof itemType === "string") {
                    const info = primInfo(itemType);
                    const le = info.le !== undefined ? info.le : ctx.le;
                    const leArg = info.size > 1 ? `,${le}` : "";
                    const val = info.bigint
                        ? `BigInt(${src}.${name}[${i}])`
                        : `${src}.${name}[${i}]`;
                    ctx.push(`dv.${info.set}(off,${val}${leArg}); off+=${info.size};`);
                } else {
                    genEncodeFields(itemType.fields, ctx, `${src}.${name}[${i}]`);
                }
                ctx.push(`}`);
                break;
            }
            case "nested": {
                const nestedSrc = field.name ? `${src}.${field.name}` : src;
                genEncodeFields(field.parser.fields, ctx, nestedSrc);
                break;
            }
            case "choice": {
                const choiceSrc = field.name ? `${src}.${field.name}` : src;
                ctx.push(`switch(${src}.${field.tag}){`);
                for (const [k, sub] of Object.entries(field.choices)) {
                    ctx.push(`case ${k}:`);
                    genEncodeFields(sub.fields, ctx, choiceSrc);
                    ctx.push(`break;`);
                }
                ctx.push(`default: throw new Error("Unknown choice tag: "+${src}.${field.tag});`);
                ctx.push(`}`);
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Size calculation
// ---------------------------------------------------------------------------
function calcSize(fields: FieldDescriptor[]): number | null {
    let size = 0;
    let bitAcc = 0;

    const flushBitAcc = () => {
        if (bitAcc === 0) return;
        size += bitAcc <= 8 ? 1 : bitAcc <= 16 ? 2 : bitAcc <= 24 ? 3 : 4;
        bitAcc = 0;
    };

    for (const field of fields) {
        switch (field.kind) {
            case "endianness":
                break;
            case "int":
                flushBitAcc();
                size += field.bits / 8;
                break;
            case "float":
                flushBitAcc();
                size += field.bits / 8;
                break;
            case "bit":
                if (bitAcc + field.bits > 32) flushBitAcc();
                bitAcc += field.bits;
                break;
            case "skip":
                flushBitAcc();
                size += field.bytes;
                break;
            case "buffer":
                if (typeof field.length !== "number") return null;
                flushBitAcc();
                size += field.length;
                break;
            case "array": {
                if (typeof field.length !== "number") return null;
                if (typeof field.itemType === "string") {
                    const info = primInfo(field.itemType);
                    flushBitAcc();
                    size += field.length * info.size;
                } else if (field.itemType instanceof ParserBuilder) {
                    const itemSz = calcSize(field.itemType.fields);
                    if (itemSz === null) return null;
                    flushBitAcc();
                    size += field.length * itemSz;
                } else {
                    return null;
                }
                break;
            }
            case "nested": {
                const nSz = calcSize(field.parser.fields);
                if (nSz === null) return null;
                flushBitAcc();
                size += nSz;
                break;
            }
            case "choice":
                return null;
        }
    }
    flushBitAcc();
    return size;
}

// ---------------------------------------------------------------------------
// Encoder compilation
// ---------------------------------------------------------------------------
function compileEncoder(fields: FieldDescriptor[]): (obj: any) => Uint8Array {
    const ctx = new EncodeCtx();
    const fixedSize = calcSize(fields);

    if (fixedSize !== null) {
        ctx.push(`var buf = new Uint8Array(${fixedSize});`);
    } else {
        ctx.push(`var buf = new Uint8Array(65536);`);
    }
    ctx.push(`var dv = new DataView(buf.buffer);`);
    ctx.push(`var off = 0;`);
    genEncodeFields(fields, ctx, "src");
    ctx.flushBits();
    ctx.push(fixedSize !== null ? `return buf;` : `return buf.subarray(0,off);`);

    return new Function("$im", `return function encode(src){\n${ctx.code}}`)(ctx.imports);
}

// =============================================================================
// Public compiler
// =============================================================================
export const compiler: Compiler = (fields) => ({
    decode: compileDecoder(fields),
    encode: compileEncoder(fields),
});

// =============================================================================
// Debug helper
// =============================================================================
export function getGeneratedCode(fields: FieldDescriptor[]): { decode: string; encode: string } {
    const dCtx = new DecodeCtx();
    dCtx.push("var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);");
    dCtx.push("var off = 0;");
    dCtx.push("var vars = {};");
    genDecodeFields(fields, dCtx, "vars");
    dCtx.flushBits();
    dCtx.push("return vars;");

    const eCtx = new EncodeCtx();
    const fixedSize = calcSize(fields);
    eCtx.push(fixedSize !== null ? `var buf = new Uint8Array(${fixedSize});` : `var buf = new Uint8Array(65536);`);
    eCtx.push(`var dv = new DataView(buf.buffer);`);
    eCtx.push(`var off = 0;`);
    genEncodeFields(fields, eCtx, "src");
    eCtx.flushBits();
    eCtx.push(fixedSize !== null ? `return buf;` : `return buf.subarray(0,off);`);

    return {
        decode: `function decode(buf){\n${dCtx.code}}`,
        encode: `function encode(src){\n${eCtx.code}}`,
    };
}
