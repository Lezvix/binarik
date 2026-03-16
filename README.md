# binarik

Binary parser/encoder library with a pluggable compiler architecture and full TypeScript type inference.

Define binary structures once with a fluent API, then compile them into optimized `decode` and `encode` functions. Supports a standard compiler (using `DataView` + `new Function()`) and an ES3 code generator for constrained environments like Chirpstack.

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

const decoded = parser.decode(new Uint8Array([1, 0x10, 0x00, 0x00, 0x00, 0x00, 0x01]));
// { version: 1, length: 16, checksum: 1 }

const encoded = parser.encode({ version: 1, length: 16, checksum: 1 });
// Uint8Array
```

The output type is fully inferred:

```ts
const p = new ParserBuilder()
    .uint8("a")
    .int16le("b")
    .uint64be("c");

type Out = InferOutput<typeof p>;
// { a: number; b: number; c: bigint }
```

## ParserBuilder API

### Endianness

```ts
new ParserBuilder().endianness("little") // or "big"
```

Sets the default byte order for fields that don't specify one explicitly. Defaults to big-endian.

### Integers

| Method | Size | Type |
|---|---|---|
| `uint8(name)` / `int8(name)` | 1 byte | `number` |
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

| Method | Size |
|---|---|
| `floatle(name)` / `floatbe(name)` | 4 bytes |
| `float32(name)` / `float32le(name)` / `float32be(name)` | 4 bytes |
| `doublele(name)` / `doublebe(name)` | 8 bytes |
| `float64(name)` / `float64le(name)` / `float64be(name)` | 8 bytes |

### Bit fields

```ts
new ParserBuilder()
    .bit1("flag")
    .bit2("type")
    .bit5("reserved")
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

Returns a `Uint8Array` slice of the input.

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

## License

ISC
