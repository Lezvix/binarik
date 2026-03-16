import { bench, describe } from "vitest";
import { Parser as BinaryParser } from "binary-parser";
import { ParserBuilder, compiler } from "../src";

// ============================================================================
// Test buffers
// ============================================================================

// Simple: 3 integers
const simpleBuf = new Uint8Array([
    0x01,                   // uint8
    0x34, 0x12,             // uint16le = 0x1234
    0xDE, 0xAD, 0xBE, 0xEF // uint32be = 0xDEADBEEF
]);

// Bit fields: 1+2+5 = 8 bits, then uint8
const bitBuf = new Uint8Array([0b10110011, 0x42]);

// Array of 100 uint16le values
const arrayBuf = new Uint8Array(200);
for (let i = 0; i < 100; i++) {
    arrayBuf[i * 2] = i & 0xff;
    arrayBuf[i * 2 + 1] = (i >> 8) & 0xff;
}

// Nested: header(uint8 version, uint16le flags) + uint8 count + array of 10 x {uint8, uint16le}
const nestedBuf = new Uint8Array([
    0x01,       // version
    0xFF, 0x00, // flags
    0x0A,       // count = 10
    // 10 items of {uint8, uint16le} = 3 bytes each
    ...Array.from({ length: 10 }, (_, i) => [i, i & 0xff, 0x00]).flat(),
]);

// Complex: MBR-like structure
// bootFlag(u8) + startCHS(u8, bit2, bit6, u8) + type(u8) + endCHS(u8, bit2, bit6, u8) + startLBA(u32le) + endLBA(u32le)
// = 16 bytes per partition, 4 partitions = 64 bytes, skip 446 + 2 byte signature
const mbrBuf = new Uint8Array(512);
// Fill partition tables at offset 446
for (let p = 0; p < 4; p++) {
    const off = 446 + p * 16;
    mbrBuf[off] = p === 0 ? 0x80 : 0x00;      // bootFlag
    mbrBuf[off + 1] = 0x01;                     // head
    mbrBuf[off + 2] = 0b11_000101;              // bit2 cyl high + bit6 sector
    mbrBuf[off + 3] = 0x00;                     // cylinder
    mbrBuf[off + 4] = 0x0C;                     // type
    mbrBuf[off + 5] = 0xCC;                     // end head
    mbrBuf[off + 6] = 0b00_111100;              // end bit2 + bit6
    mbrBuf[off + 7] = 0x05;                     // end cylinder
    mbrBuf[off + 8] = 0x00; mbrBuf[off + 9] = 0x20; mbrBuf[off + 10] = 0x00; mbrBuf[off + 11] = 0x00; // startLBA
    mbrBuf[off + 12] = 0x25; mbrBuf[off + 13] = 0x4C; mbrBuf[off + 14] = 0x01; mbrBuf[off + 15] = 0x00; // endLBA
}
mbrBuf[510] = 0x55;
mbrBuf[511] = 0xAA;

// ============================================================================
// Parser definitions
// ============================================================================

// --- Simple ---
const bpSimple = new BinaryParser()
    .uint8("a")
    .uint16le("b")
    .uint32be("c");
bpSimple.compile();

const bkSimple = new ParserBuilder()
    .uint8("a")
    .uint16le("b")
    .uint32be("c")
    .compile(compiler);

// --- Bit fields ---
const bpBit = new BinaryParser()
    .bit1("a")
    .bit2("b")
    .bit5("c")
    .uint8("d");
bpBit.compile();

const bkBit = new ParserBuilder()
    .bit1("a")
    .bit2("b")
    .bit5("c")
    .uint8("d")
    .compile(compiler);

// --- Array (fixed length, primitive) ---
const bpArray = new BinaryParser()
    .array("items", { type: "uint16le", length: 100 });
bpArray.compile();

const bkArray = new ParserBuilder()
    .array("items", "uint16le", 100)
    .compile(compiler);

// --- Nested ---
const bpNested = new BinaryParser()
    .nest("header", {
        type: new BinaryParser()
            .uint8("version")
            .uint16le("flags"),
    })
    .uint8("count")
    .array("items", {
        type: new BinaryParser().uint8("id").uint16le("value"),
        length: 10,
    });
bpNested.compile();

const bkNested = new ParserBuilder()
    .nested("header", new ParserBuilder().uint8("version").uint16le("flags"))
    .uint8("count")
    .array("items", new ParserBuilder().uint8("id").uint16le("value"), 10)
    .compile(compiler);

// --- MBR-like (complex: seek + array of nested with bit fields) ---
const bpCHS = new BinaryParser()
    .uint8("head")
    .bit2("cylinderHigh")
    .bit6("sector")
    .uint8("cylinder");

const bpPartition = new BinaryParser()
    .uint8("bootFlag")
    .nest("startCHS", { type: bpCHS })
    .uint8("type")
    .nest("endCHS", { type: bpCHS })
    .uint32le("startLBA")
    .uint32le("endLBA");

const bpMBR = new BinaryParser()
    .seek(446)
    .array("partitions", { type: bpPartition, length: 4 })
    .uint16be("signature");
bpMBR.compile();

const bkCHS = new ParserBuilder()
    .uint8("head")
    .bit2("cylinderHigh")
    .bit6("sector")
    .uint8("cylinder");

const bkPartition = new ParserBuilder()
    .uint8("bootFlag")
    .nested("startCHS", bkCHS)
    .uint8("type")
    .nested("endCHS", bkCHS)
    .uint32le("startLBA")
    .uint32le("endLBA")

const bkMBR = new ParserBuilder()
    .skip(446)
    .array("partitions", bkPartition, 4)
    .uint16be("signature")
    .compile(compiler);

// ============================================================================
// Benchmarks
// ============================================================================

describe("simple (u8 + u16le + u32be)", () => {
    bench("binary-parser", () => {
        bpSimple.parse(simpleBuf);
    });

    bench("binarik", () => {
        bkSimple.decode(simpleBuf);
    });
});

describe("bit fields (1+2+5 bits + u8)", () => {
    bench("binary-parser", () => {
        bpBit.parse(bitBuf);
    });

    bench("binarik", () => {
        bkBit.decode(bitBuf);
    });
});

describe("array (100x uint16le)", () => {
    bench("binary-parser", () => {
        bpArray.parse(arrayBuf);
    });

    bench("binarik", () => {
        bkArray.decode(arrayBuf);
    });
});

describe("nested (header + 10x items)", () => {
    bench("binary-parser", () => {
        bpNested.parse(nestedBuf);
    });

    bench("binarik", () => {
        bkNested.decode(nestedBuf);
    });
});

describe("MBR-like (seek + 4x nested with bit fields)", () => {
    bench("binary-parser", () => {
        bpMBR.parse(mbrBuf);
    });

    bench("binarik", () => {
        bkMBR.decode(mbrBuf);
    });
});
