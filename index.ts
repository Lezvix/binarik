import { generateES3Decoder, ParserBuilder } from "./src";

const p = new ParserBuilder().uint8("test").buffer("data", "test");

const d = generateES3Decoder(p.fields);

console.log(d);
