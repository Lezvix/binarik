# binarik

A [binary-parser](https://github.com/keichi/binary-parser) alternative with pluggable compilers and encoding support.

Define binary structures once with a fluent API, then compile them into optimized `decode` **and `encode`** functions. Unlike binary-parser, binarik lets you choose (or write) your own compiler backend and generates encoders automatically from the same schema. Supports a standard compiler (using `DataView` + `new Function()`) and an ES3 code generator for constrained environments like Chirpstack.

## Install

```
npm install binarik
```

## Quick start

```ts
import { ParserBuilder, compiler } from "binarik";

const parser = new ParserBuilder()
    .uint8("version")
    .uint16le("length")
    .uint32be("checksum")
    .compile(compiler);

const decoded = parser.decode(
    new Uint8Array([1, 0x10, 0x00, 0x00, 0x00, 0x00, 0x01]),
);
// { version: 1, length: 16, checksum: 1 }

const encoded = parser.encode({ version: 1, length: 16, checksum: 1 });
// Uint8Array
```

The output type is fully inferred:

```ts
const p = new ParserBuilder().uint8("a").int16le("b").uint64be("c");

type Out = InferOutput<typeof p>;
// { a: number; b: number; c: bigint }
```

Buffer fields resolve to the compiler's input type:

```ts
const p = new ParserBuilder().uint8("len").buffer("data", "len");

// InferOutput defaults to Uint8Array
type Out = InferOutput<typeof p>;
// { len: number; data: Uint8Array }

// Or specify a custom input type
type ES3Out = InferOutput<typeof p, number[]>;
// { len: number; data: number[] }
```

## ParserBuilder API

### Endianness

```ts
new ParserBuilder().endianness("little"); // or "big"
```

Sets the default byte order for fields that don't specify one explicitly. Defaults to big-endian.

### Integers

| Method                         | Size    | Type     |
| ------------------------------ | ------- | -------- |
| `uint8(name)` / `int8(name)`   | 1 byte  | `number` |
| `uint16(name)` / `int16(name)` | 2 bytes | `number` |
| `uint32(name)` / `int32(name)` | 4 bytes | `number` |
| `uint64(name)` / `int64(name)` | 8 bytes | `bigint` |

Each 16/32/64-bit method has explicit endianness variants:

```ts
.uint16le("a")  .uint16be("a")
.int32le("b")   .int32be("b")
.uint64le("c")  .uint64be("c")
```

### Floats

| Method                                                  | Size    |
| ------------------------------------------------------- | ------- |
| `floatle(name)` / `floatbe(name)`                       | 4 bytes |
| `float32(name)` / `float32le(name)` / `float32be(name)` | 4 bytes |
| `doublele(name)` / `doublebe(name)`                     | 8 bytes |
| `float64(name)` / `float64le(name)` / `float64be(name)` | 8 bytes |

### Bit fields

```ts
new ParserBuilder().bit1("flag").bit2("type").bit5("reserved");
```

Convenience methods `bit1` through `bit32` are available. For arbitrary widths use `.bit(name, n)`.

Consecutive bit fields are packed together and read in big-endian byte order, matching binary-parser behavior.

### Arrays

```ts
// Fixed length, primitive items
.array("values", "uint16le", 4)

// Dynamic length from a previous field
.array("items", "uint8", "count")

// Structured items
const point = new ParserBuilder().uint8("x").uint8("y");
.array("points", point, 3)

// Function length
.array("data", "uint8", function() { return this.count * 2; })
```

### Nested

```ts
const header = new ParserBuilder().uint8("version").uint16le("flags");

// Named: result.header.version
.nested("header", header)

// Unnamed (merge into parent): result.version
.nested(header)
```

### Choice

```ts
// Named
.choice("payload", "tag", {
    1: new ParserBuilder().uint8("a"),
    2: new ParserBuilder().uint16le("b"),
})

// Unnamed (merge into parent)
.choice("tag", {
    1: new ParserBuilder().uint8("a"),
    2: new ParserBuilder().uint16le("b"),
})
```

### Buffer

```ts
.buffer("data", 16)          // fixed length
.buffer("data", "length")    // dynamic length from previous field
```

Returns a slice of the input matching its type — `Uint8Array` with the standard compiler, plain `number[]` with ES3.

### Skip / Seek

```ts
.skip(4)    // skip 4 bytes
.seek(446)  // same as skip, advance offset
```

## Compilers

### Standard compiler

The default compiler generates optimized JavaScript via `new Function()` with `DataView` for reading/writing.

```ts
import { ParserBuilder, compiler } from "binarik";

const { decode, encode } = new ParserBuilder()
    .uint8("a")
    .uint16le("b")
    .compile(compiler);
```

Both `decode(Uint8Array) => object` and `encode(object) => Uint8Array` are generated.

#### Debug: inspect generated code

```ts
import { ParserBuilder, getGeneratedCode } from "binarik";

const p = new ParserBuilder().uint8("a").uint16le("b");
const { decode, encode } = getGeneratedCode(p.fields);
console.log(decode);
console.log(encode);
```

### ES3 code generator

Generates standalone ES3-compatible JavaScript source code (decode only). No `DataView`, no `TypedArray`, no `BigInt` -- works in constrained environments like Chirpstack codec runtimes.

```ts
import { ParserBuilder, generateES3Decoder } from "binarik";

const p = new ParserBuilder()
    .uint8("tag")
    .uint16le("value")
    .bit2("high")
    .bit6("low");

const source = generateES3Decoder(p.fields);
// Returns a string containing reader helper functions + a decode(buf) function
```

Custom function name:

```ts
const source = generateES3Decoder(p.fields, "parsePort1");
// function parsePort1(buf){ ... }
```

For more control, use `generateES3Body` to get the raw body and reader list:

```ts
import { generateES3Body } from "binarik";

const { body, readers } = generateES3Body(p.fields);
// body: the decode logic as a string
// readers: ["Uint8", "Uint16LE"] -- which reader functions are needed
```

This lets you assemble custom output formats (e.g. Chirpstack v3/v4 wrappers with multiple port parsers).

#### ES3 output characteristics

- Integer reads use pure byte-manipulation functions (`readUint16LE`, `readInt32BE`, etc.)
- 64-bit integers return `number` (using `hi * 0x100000000 + lo`)
- Floats are decoded with manual sign/exponent/mantissa extraction
- Buffers become plain arrays (manual byte-copy loop)
- Only the reader functions actually needed are included in the output

### Custom compilers

The compiler is a simple function:

```ts
type Compiler<I = Uint8Array> = (fields: FieldDescriptor[]) => Parser<I, any>;
```

You can write your own by iterating over the `FieldDescriptor[]` array. Each descriptor is a tagged union with `kind` discriminating the field type.

## Kaitai Struct export

Export any parser definition to a [Kaitai Struct](https://kaitai.io/) `.ksy`-compatible object. This lets you visualize, document, or use your binary format in other languages supported by Kaitai.

```ts
import { ParserBuilder, toKaitaiStruct } from "binarik";

const header = new ParserBuilder().uint8("version").uint16le("flags");
const point = new ParserBuilder().uint8("x").uint8("y");

const p = new ParserBuilder()
    .nested("header", header)
    .uint8("count")
    .array("points", point, "count")
    .buffer("tail", 4);

const ksy = toKaitaiStruct(p.fields, "my_protocol");
```

The result is a plain JS object matching the `.ksy` schema:

```js
{
  meta: { id: "my_protocol" },
  seq: [
    { id: "header", type: "header" },
    { id: "count", type: "u1" },
    { id: "points", type: "points_item", repeat: "expr", "repeat-expr": "count" },
    { id: "tail", size: 4 },
  ],
  types: {
    header: {
      seq: [
        { id: "version", type: "u1" },
        { id: "flags", type: "u2le" },
      ],
    },
    points_item: {
      seq: [
        { id: "x", type: "u1" },
        { id: "y", type: "u1" },
      ],
    },
  },
}
```

### Saving to a `.ksy` file

Kaitai Struct uses YAML. Use any YAML serializer to write the file:

```ts
import { writeFileSync } from "fs";
import yaml from "js-yaml"; // or any YAML library

writeFileSync("my_protocol.ksy", yaml.dump(ksy));
```

Or with JSON (Kaitai tools also accept JSON):

```ts
import { writeFileSync } from "fs";

writeFileSync("my_protocol.ksy.json", JSON.stringify(ksy, null, 2));
```

### Supported features

| binarik feature                 | Kaitai mapping                 |
| ------------------------------- | ------------------------------ |
| `uint8` / `int8`                | `u1` / `s1`                    |
| `uint16le` / `int32be` / ...    | `u2le` / `s4be` / ...          |
| `uint64le` / `int64be` / ...    | `u8le` / `s8be` / ...          |
| `float32le` / `float64be` / ... | `f4le` / `f8be` / ...          |
| `bit1`..`bit32`                 | `b1`..`b32`                    |
| `buffer(name, length)`          | `size: length` (raw bytes)     |
| `skip(n)`                       | padding entry with `size: n`   |
| `array(name, type, length)`     | `repeat: expr` + `repeat-expr` |
| `nested(name, parser)`          | subtype reference              |
| `nested(parser)` (unnamed)      | fields inlined into parent     |
| `choice(name, tag, choices)`    | `switch-on` with `cases`       |

> **Note:** Function-based array lengths (`.array("x", "uint8", function() { ... })`) cannot be exported and will throw an error.

## Benchmarks

Decode performance compared to [binary-parser](https://github.com/keichi/binary-parser) (operations/sec, higher is better):

| Benchmark                                   | binary-parser | binarik    | Speedup  |
| ------------------------------------------- | ------------- | ---------- | -------- |
| simple (u8 + u16le + u32be)                 | 3,325,009     | 10,746,810 | **3.2x** |
| bit fields (1+2+5 bits + u8)                | 3,283,477     | 10,855,320 | **3.3x** |
| array (100x uint16le)                       | 1,989,125     | 3,419,088  | **1.7x** |
| nested (header + 10x items)                 | 2,868,125     | 7,343,252  | **2.6x** |
| MBR-like (seek + 4x nested with bit fields) | 2,790,011     | 4,983,400  | **1.8x** |

Run benchmarks yourself with `npm run bench`.

## License

MIT
