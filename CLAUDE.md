# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is binarik

A binary-parser alternative with pluggable compilers. Define binary structures once with a fluent builder API, then compile into optimized `decode` and `encode` functions. Supports a standard compiler (DataView + `new Function()`), an ES3 code generator for constrained environments (e.g. Chirpstack), and a Kaitai Struct exporter.

## Commands

- `npm run build` — build with tsdown + tsc (generates ESM, CJS, and .d.ts into `dist/`)
- `npm run test` — run all tests (vitest)
- `npm run test -- test/primitive_parser.test.ts` — run a single test file
- `npm run test:watch` — run tests in watch mode
- `npm run bench` — run benchmarks (vitest bench)
- `npm run typecheck` — type-check without emitting

## Architecture

The library has a **schema → compiler** pipeline:

1. **`ParserBuilder`** (`src/builder.ts`) — Fluent API that accumulates a `FieldDescriptor[]` array. Each method (uint8, array, nested, choice, etc.) pushes a tagged-union descriptor. The builder carries a generic type parameter `T` that tracks the inferred output shape at the type level. `bit1`–`bit32` convenience methods are added via a prototype loop + declaration merging.

2. **`FieldDescriptor`** (`src/types.ts`) — Tagged union (`kind` discriminant) describing every field type: int, float, bit, array, nested, choice, buffer, skip, endianness. This is the IR consumed by all compilers/exporters.

3. **Standard compiler** (`src/compiler.ts`) — Generates decode and encode functions via `new Function()`. Uses `DataView` for reads/writes. Bit fields are packed/flushed in groups up to 32 bits. `calcSize()` computes static buffer size when possible; falls back to 64KB buffer + subarray for dynamic-size encoders.

4. **ES3 compiler** (`src/es3-compiler.ts`) — Generates standalone ES3 source code (decode only, no encode). No DataView/TypedArray/BigInt — uses pure byte-manipulation reader functions. Only emits the reader functions actually needed. Designed for Chirpstack codec runtimes.

5. **Kaitai exporter** (`src/kaitai-exporter.ts`) — Converts `FieldDescriptor[]` to a `.ksy`-compatible JS object. Registers subtypes for nested/array/choice fields.

The `Compiler` type is `(fields: FieldDescriptor[]) => Parser<I, any>`, making it straightforward to add new backends.

## Test structure

Tests in `test/` use vitest. `test/compat.ts` provides a helper that creates a binary-parser `Parser` alongside a binarik `ParserBuilder` to verify identical decode output. The `original_*.test.ts` files are ported from binary-parser's test suite for compatibility validation.
