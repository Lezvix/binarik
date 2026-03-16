import type {
    Endianness, FieldDescriptor, Compiler, Parser, Prettify,
    PrimitiveType, InferArrayItem, InferChoices,
} from "./types";

const VALID_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
function validateName(name: string) {
    if (!VALID_NAME.test(name)) {
        throw new Error(`Invalid field name: "${name}"`);
    }
}

// ---------------------------------------------------------------------------
// bit1..bit32 interface declarations (declaration merging)
// ---------------------------------------------------------------------------
export interface ParserBuilder<T extends Record<string, any> = {}> {
    bit1<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit2<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit3<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit4<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit5<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit6<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit7<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit8<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit9<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit10<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit11<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit12<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit13<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit14<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit15<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit16<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit17<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit18<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit19<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit20<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit21<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit22<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit23<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit24<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit25<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit26<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit27<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit28<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit29<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit30<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit31<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
    bit32<K extends string>(name: K): ParserBuilder<T & Record<K, number>>;
}

// ---------------------------------------------------------------------------
// ParserBuilder
// ---------------------------------------------------------------------------
export class ParserBuilder<T extends Record<string, any> = {}> {
    fields: FieldDescriptor[] = [];

    endianness(endianness: Endianness): this {
        this.fields.push({ kind: "endianness", le: endianness === "little" });
        return this;
    }

    // -- private helpers --
    private _addInt(name: string, size: 8 | 16 | 32 | 64, signed: boolean, le?: boolean): any {
        validateName(name);
        this.fields.push({ kind: "int", name, bits: size, signed, le });
        return this;
    }

    private _addFloat(name: string, size: 32 | 64, le?: boolean): any {
        validateName(name);
        this.fields.push({ kind: "float", name, bits: size, le });
        return this;
    }

    // -- integers (number) --
    uint8<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 8, false); }
    uint16<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, false); }
    uint32<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, false); }
    int8<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 8, true); }
    int16<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, true); }
    int32<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, true); }

    // -- integers (explicit endianness, number) --
    uint16le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, false, true); }
    uint16be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, false, false); }
    int16le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, true, true); }
    int16be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 16, true, false); }
    uint32le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, false, true); }
    uint32be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, false, false); }
    int32le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, true, true); }
    int32be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addInt(name, 32, true, false); }

    // -- integers (bigint) --
    uint64<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, false); }
    uint64le<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, false, true); }
    uint64be<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, false, false); }
    int64<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, true); }
    int64le<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, true, true); }
    int64be<K extends string>(name: K): ParserBuilder<T & Record<K, bigint>> { return this._addInt(name, 64, true, false); }

    // -- floats --
    float32<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 32); }
    float64<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 64); }
    floatle<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 32, true); }
    floatbe<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 32, false); }
    doublele<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 64, true); }
    doublebe<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 64, false); }
    float32le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 32, true); }
    float32be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 32, false); }
    float64le<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 64, true); }
    float64be<K extends string>(name: K): ParserBuilder<T & Record<K, number>> { return this._addFloat(name, 64, false); }

    // -- bit fields --
    bit<K extends string>(name: K, bits: number): ParserBuilder<T & Record<K, number>> {
        validateName(name);
        if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
            throw new RangeError(`bit size must be an integer in [1,32], got ${bits}`);
        }
        this.fields.push({ kind: "bit", name, bits });
        return this as any;
    }

    // -- arrays --
    array<K extends string, Item extends PrimitiveType | ParserBuilder<any>>(
        name: K,
        itemType: Item,
        length: number | (string & keyof T) | ((this: Prettify<T>) => number),
    ): ParserBuilder<T & Record<K, InferArrayItem<Item>[]>> {
        validateName(name);
        this.fields.push({ kind: "array", name, itemType: itemType as any, length: length as any });
        return this as any;
    }

    // -- nested --
    nested<U extends Record<string, any>>(parser: ParserBuilder<U>): ParserBuilder<T & U>;
    nested<K extends string, U extends Record<string, any>>(name: K, parser: ParserBuilder<U>): ParserBuilder<T & Record<K, Prettify<U>>>;
    nested(nameOrParser: string | ParserBuilder<any>, parser?: ParserBuilder<any>): any {
        if (typeof nameOrParser === "string") {
            validateName(nameOrParser);
            this.fields.push({ kind: "nested", name: nameOrParser, parser: parser! });
        } else {
            this.fields.push({ kind: "nested", parser: nameOrParser });
        }
        return this;
    }

    // -- choice --
    choice<C extends Record<number, ParserBuilder<any>>>(
        tag: string & keyof T, choices: C
    ): ParserBuilder<T & InferChoices<C>>;
    choice<K extends string, C extends Record<number, ParserBuilder<any>>>(
        name: K, tag: string & keyof T, choices: C
    ): ParserBuilder<T & Record<K, InferChoices<C>>>;
    choice(
        nameOrTag: string,
        tagOrChoices: string | Record<number, ParserBuilder<any>>,
        choices?: Record<number, ParserBuilder<any>>,
    ): any {
        if (choices !== undefined) {
            validateName(nameOrTag);
            this.fields.push({
                kind: "choice",
                name: nameOrTag,
                tag: tagOrChoices as string,
                choices,
            });
        } else {
            this.fields.push({
                kind: "choice",
                tag: nameOrTag,
                choices: tagOrChoices as Record<number, ParserBuilder<any>>,
            });
        }
        return this;
    }

    // -- buffer --
    buffer<K extends string>(
        name: K,
        length: number | (string & keyof T),
    ): ParserBuilder<T & Record<K, Uint8Array>> {
        validateName(name);
        this.fields.push({ kind: "buffer", name, length });
        return this as any;
    }

    // -- skip / seek --
    skip(bytes: number): this {
        this.fields.push({ kind: "skip", bytes });
        return this;
    }
    seek(bytes: number): this {
        return this.skip(bytes);
    }

    // -- compile --
    compile<I>(comp: Compiler<I>): Parser<I, Prettify<T>> {
        return comp(this.fields) as Parser<I, Prettify<T>>;
    }
}

// Add bit1..bit32 convenience methods
for (let i = 1; i <= 32; i++) {
    (ParserBuilder.prototype as any)[`bit${i}`] = function (this: ParserBuilder<any>, name: string) {
        return this.bit(name, i);
    };
}
