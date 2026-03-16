/**
 * Compatibility shim: provides binary-parser's Parser API backed by binarik.
 * Tests that use unsupported features will throw "NOT SUPPORTED: ..." errors.
 */
import { ParserBuilder, compiler as binarikCompiler } from "../src";

export class Parser {
    _builder: ParserBuilder;
    _compiled: ReturnType<typeof binarikCompiler> | null = null;

    constructor() {
        this._builder = new ParserBuilder();
    }

    static start(): Parser {
        return new Parser();
    }

    parse(buffer: Uint8Array | Buffer): any {
        if (!this._compiled) {
            this._compiled = this._builder.compile(binarikCompiler);
        }
        const buf = buffer instanceof Uint8Array ? buffer : Uint8Array.from(buffer);
        return this._compiled.decode(buf);
    }

    // -- Unsupported features throw immediately --
    namely(_alias: string): this {
        throw new Error("NOT SUPPORTED: namely (recursive parsers)");
    }
    useContextVars(): this {
        throw new Error("NOT SUPPORTED: useContextVars ($parent, $root, $index)");
    }
    create(_ctor: any): this {
        throw new Error("NOT SUPPORTED: create (custom constructors)");
    }
    pointer(_name: string, _opts: any): this {
        throw new Error("NOT SUPPORTED: pointer");
    }
    saveOffset(_name: string): this {
        throw new Error("NOT SUPPORTED: saveOffset");
    }
    wrapped(..._args: any[]): this {
        throw new Error("NOT SUPPORTED: wrapped");
    }
    sizeOf(): number {
        throw new Error("NOT SUPPORTED: sizeOf");
    }
    string(_name: string, _opts?: any): this {
        throw new Error("NOT SUPPORTED: string");
    }

    // -- Endianness --
    endianness(e: "big" | "little"): this {
        this._builder.endianness(e);
        return this;
    }

    // -- Integer methods --
    private _int(method: keyof ParserBuilder, name: string, opts?: any): this {
        if (opts?.formatter) throw new Error("NOT SUPPORTED: formatter");
        if (opts?.assert) throw new Error("NOT SUPPORTED: assert");
        (this._builder[method] as Function).call(this._builder, name);
        return this;
    }

    uint8(name: string, opts?: any): this { return this._int("uint8", name, opts); }
    uint16(name: string, opts?: any): this { return this._int("uint16", name, opts); }
    uint16le(name: string, opts?: any): this { return this._int("uint16le", name, opts); }
    uint16be(name: string, opts?: any): this { return this._int("uint16be", name, opts); }
    uint32(name: string, opts?: any): this { return this._int("uint32", name, opts); }
    uint32le(name: string, opts?: any): this { return this._int("uint32le", name, opts); }
    uint32be(name: string, opts?: any): this { return this._int("uint32be", name, opts); }
    uint64(name: string, opts?: any): this { return this._int("uint64", name, opts); }
    uint64le(name: string, opts?: any): this { return this._int("uint64le", name, opts); }
    uint64be(name: string, opts?: any): this { return this._int("uint64be", name, opts); }
    int8(name: string, opts?: any): this { return this._int("int8", name, opts); }
    int16(name: string, opts?: any): this { return this._int("int16", name, opts); }
    int16le(name: string, opts?: any): this { return this._int("int16le", name, opts); }
    int16be(name: string, opts?: any): this { return this._int("int16be", name, opts); }
    int32(name: string, opts?: any): this { return this._int("int32", name, opts); }
    int32le(name: string, opts?: any): this { return this._int("int32le", name, opts); }
    int32be(name: string, opts?: any): this { return this._int("int32be", name, opts); }
    int64(name: string, opts?: any): this { return this._int("int64", name, opts); }
    int64le(name: string, opts?: any): this { return this._int("int64le", name, opts); }
    int64be(name: string, opts?: any): this { return this._int("int64be", name, opts); }

    // -- Float methods --
    floatle(name: string, opts?: any): this { return this._int("floatle", name, opts); }
    floatbe(name: string, opts?: any): this { return this._int("floatbe", name, opts); }
    doublele(name: string, opts?: any): this { return this._int("doublele", name, opts); }
    doublebe(name: string, opts?: any): this { return this._int("doublebe", name, opts); }

    // -- Seek --
    seek(offset: number): this {
        this._builder.seek(offset);
        return this;
    }

    // -- Bit fields --
    private _bit(n: number, name: string, opts?: any): this {
        if (opts?.formatter) throw new Error("NOT SUPPORTED: formatter on bit field");
        if (opts?.assert) throw new Error("NOT SUPPORTED: assert on bit field");
        this._builder.bit(name, n);
        return this;
    }

    // -- Buffer --
    buffer(name: string, opts: any): this {
        if (opts.readUntil) throw new Error("NOT SUPPORTED: buffer readUntil");
        if (opts.clone) throw new Error("NOT SUPPORTED: buffer clone");
        if (opts.formatter) throw new Error("NOT SUPPORTED: buffer formatter");
        this._builder.buffer(name, opts.length);
        return this;
    }

    // -- Array --
    array(name: string, opts: any): this {
        if (opts.readUntil) throw new Error("NOT SUPPORTED: array readUntil");
        if (opts.lengthInBytes) throw new Error("NOT SUPPORTED: array lengthInBytes");
        if (opts.key) throw new Error("NOT SUPPORTED: array key (associative)");
        if (opts.formatter) throw new Error("NOT SUPPORTED: array formatter");

        let itemType: ParserBuilder | string;
        if (typeof opts.type === "string") {
            // Check if it's a named parser reference (recursion)
            if (!opts.type.match(/^(u?int|float|double)/)) {
                throw new Error("NOT SUPPORTED: named parser reference in array type: " + opts.type);
            }
            itemType = opts.type;
        } else if (opts.type instanceof Parser) {
            itemType = opts.type._builder;
        } else {
            throw new Error("NOT SUPPORTED: unknown array type: " + opts.type);
        }

        const length = opts.length;
        if (typeof length === "function") {
            this._builder.array(name, itemType, length);
        } else {
            this._builder.array(name, itemType, length);
        }
        return this;
    }

    // -- Nest --
    nest(nameOrOpts: string | any, opts?: any): this {
        let name: string | undefined;
        let options: any;

        if (typeof nameOrOpts === "string") {
            name = nameOrOpts;
            options = opts;
        } else {
            name = undefined;
            options = nameOrOpts;
        }

        if (options.formatter) throw new Error("NOT SUPPORTED: nest formatter");

        let parser: ParserBuilder;
        if (typeof options.type === "string") {
            throw new Error("NOT SUPPORTED: named parser reference in nest: " + options.type);
        } else if (options.type instanceof Parser) {
            parser = options.type._builder;
        } else {
            throw new Error("NOT SUPPORTED: unknown nest type");
        }

        if (name) {
            this._builder.nested(name, parser);
        } else {
            this._builder.nested(parser);
        }
        return this;
    }

    // -- Choice --
    choice(nameOrOpts: string | any, opts?: any): this {
        let name: string | undefined;
        let options: any;

        if (typeof nameOrOpts === "string" && opts) {
            name = nameOrOpts;
            options = opts;
        } else {
            name = undefined;
            options = nameOrOpts;
        }

        if (typeof options.tag === "function") {
            throw new Error("NOT SUPPORTED: function as choice tag");
        }
        if (options.defaultChoice) {
            throw new Error("NOT SUPPORTED: defaultChoice");
        }

        const choices: Record<number, ParserBuilder> = {};
        for (const [k, v] of Object.entries(options.choices)) {
            if (typeof v === "string") {
                throw new Error("NOT SUPPORTED: primitive type as choice value: " + v);
            } else if (v instanceof Parser) {
                choices[Number(k)] = (v as Parser)._builder;
            } else {
                throw new Error("NOT SUPPORTED: unknown choice value type");
            }
        }

        const tag: string = options.tag;
        if (name) {
            this._builder.choice(name, tag, choices);
        } else {
            this._builder.choice(tag, choices);
        }
        return this;
    }
}

// Add bit1..bit32 methods
for (let i = 1; i <= 32; i++) {
    (Parser.prototype as any)[`bit${i}`] = function (this: Parser, name: string, opts?: any) {
        return this._bit(i, name, opts);
    };
}

// Type declarations for bit methods
export interface Parser {
    bit1(name: string, opts?: any): this; bit2(name: string, opts?: any): this;
    bit3(name: string, opts?: any): this; bit4(name: string, opts?: any): this;
    bit5(name: string, opts?: any): this; bit6(name: string, opts?: any): this;
    bit7(name: string, opts?: any): this; bit8(name: string, opts?: any): this;
    bit9(name: string, opts?: any): this; bit10(name: string, opts?: any): this;
    bit11(name: string, opts?: any): this; bit12(name: string, opts?: any): this;
    bit13(name: string, opts?: any): this; bit14(name: string, opts?: any): this;
    bit15(name: string, opts?: any): this; bit16(name: string, opts?: any): this;
    bit17(name: string, opts?: any): this; bit18(name: string, opts?: any): this;
    bit19(name: string, opts?: any): this; bit20(name: string, opts?: any): this;
    bit21(name: string, opts?: any): this; bit22(name: string, opts?: any): this;
    bit23(name: string, opts?: any): this; bit24(name: string, opts?: any): this;
    bit25(name: string, opts?: any): this; bit26(name: string, opts?: any): this;
    bit27(name: string, opts?: any): this; bit28(name: string, opts?: any): this;
    bit29(name: string, opts?: any): this; bit30(name: string, opts?: any): this;
    bit31(name: string, opts?: any): this; bit32(name: string, opts?: any): this;
}
