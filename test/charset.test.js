import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

const table = {
  publicId: 1,
  tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync', 6: 'Item', 7: 'Mime' }, opaque: ['Mime'] } },
};
const el = (name, children = []) => ({ type: 'element', namespace: 'A', name, attributes: [], children });
const text = (value) => ({ type: 'text', value });
const doc = (child, charset = 106, extra = {}) => ({ type: 'document', charset, children: [child], ...extra });
const item = (value, charset) => doc(el('Item', [text(value)]), charset);
const decoded = (child, charset, extra = {}) => ({
  type: 'document', version: '1.3', publicId: 1, charset, children: [child], ...extra,
});
const decodedItem = (value, charset) => decoded(el('Item', [text(value)]), charset);
// Headers: version 1.3, public id 1, charset MIB, empty string table
const H3 = '03 01 03 00';
const H4 = '03 01 04 00';
const H1013 = '03 01 87 75 00'; // 1013 = 0x3F5 = 87 75
const H1014 = '03 01 87 76 00';
const H1015 = '03 01 87 77 00';

const decodeVectors = [
  { name: 'ENTITY within the charset inside an opaque-flagged element', bytes: hex`${H3} 47 02 41 01`, expect: decoded(el('Mime', [text('A')]), 3) },
  { name: 'US-ASCII', bytes: hex`${H3} 46 03 68 69 00 01`, expect: decodedItem('hi', 3) },
  { name: 'ISO-8859-1: 0x80-0x9F are C1 controls, not windows-1252', bytes: hex`${H4} 46 03 E9 80 9F FF 00 01`, expect: decodedItem('é\u0080\u009Fÿ', 4) },
  { name: 'UTF-16BE', bytes: hex`${H1013} 46 03 00 68 00 E9 00 00 01`, expect: decodedItem('hé', 1013) },
  { name: 'UTF-16LE', bytes: hex`${H1014} 46 03 68 00 E9 00 00 00 01`, expect: decodedItem('hé', 1014) },
  { name: 'UTF-16, no BOM: big-endian', bytes: hex`${H1015} 46 03 00 68 00 E9 00 00 01`, expect: decodedItem('hé', 1015) },
  { name: 'UTF-16, BOM FE FF: big-endian, BOM dropped', bytes: hex`${H1015} 46 03 FE FF 00 68 00 00 01`, expect: decodedItem('h', 1015) },
  { name: 'UTF-16, BOM FF FE: little-endian, BOM dropped', bytes: hex`${H1015} 46 03 FF FE 68 00 00 00 01`, expect: decodedItem('h', 1015) },
  {
    name: 'UTF-16: each string picks its own byte order',
    bytes: hex`${H1015} 46 03 FF FE 68 00 00 00  03 FE FF 00 69 00 00 01`,
    expect: decodedItem('hi', 1015),
  },
  { name: 'UTF-16: a BOM-only string is empty text', bytes: hex`${H1015} 46 03 FE FF 00 00 01`, expect: decodedItem('', 1015) },
  { name: 'UTF-16BE: a leading U+FEFF stays as text', bytes: hex`${H1013} 46 03 FE FF 00 41 00 00 01`, expect: decodedItem('﻿A', 1013) },
  { name: 'UTF-16LE: a leading U+FEFF stays as text', bytes: hex`${H1014} 46 03 FF FE 41 00 00 00 01`, expect: decodedItem('﻿A', 1014) },
  { name: 'UTF-16BE: the terminator is the first 00 00 at an even distance', bytes: hex`${H1013} 46 03 01 00 00 41 00 00 01  // U+0100 U+0041, unaligned pair skipped`, expect: decodedItem('ĀA', 1013) },
  { name: 'UTF-16BE: a surrogate pair', bytes: hex`${H1013} 46 03 D8 3D DE 00 00 00 01`, expect: decodedItem('\u{1F600}', 1013) },
  {
    name: 'UTF-16BE string table: STR_T at an even offset, aligned terminator',
    bytes: hex`03 01 87 75 06 01 00 00 41 00 00  46 83 00 01`,
    expect: decodedItem('ĀA', 1013),
  },
  {
    name: 'UTF-16BE string table: a text public id',
    bytes: hex`03 00 00 87 75 06 00 4D 00 58 00 00  07`,
    expect: decoded(el('Mime'), 1013, { publicId: 'MX' }),
  },
  { name: 'ENTITY becomes text', bytes: hex`${H4} 46 02 81 20 01`, expect: decodedItem(' ', 4) },
  { name: 'ENTITY merges with the strings around it', bytes: hex`${H3} 46 03 61 00 02 81 20 03 62 00 01`, expect: decodedItem('a b', 3) },
  { name: 'ENTITY above the BMP', bytes: hex`${H3} 46 02 87 EC 00 01`, expect: decodedItem('\u{1F600}', 3) },
  { name: 'ENTITY works in UTF-8 too', bytes: hex`03 01 6A 00 46 02 69 01`, expect: decodedItem('i', 106) },
];

for (const { name, bytes, expect } of decodeVectors) {
  test(`charset decode: ${name}`, () => assert.deepEqual(decode(bytes, table), expect));
}

const decodeErrors = [
  { name: 'unsupported MIB', bytes: hex`03 01 11 00 05`, expect: { code: 'UNSUPPORTED_CHARSET', offset: 2, path: '' } },
  { name: 'US-ASCII byte >= 0x80', bytes: hex`${H3} 46 03 80 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 5, path: 'A:Item[0]' } },
  { name: 'UTF-16BE unpaired surrogate', bytes: hex`${H1013} 46 03 D8 00 00 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 6, path: 'A:Item[0]' } },
  { name: 'UTF-16LE unpaired low surrogate', bytes: hex`${H1014} 46 03 00 DC 00 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 6, path: 'A:Item[0]' } },
  { name: 'UTF-16 with only an unaligned 00 00', bytes: hex`${H1013} 46 03 41 00 00 42 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 6, path: 'A:Item[0]' } },
  { name: 'UTF-16 with no terminator at all is truncated', bytes: hex`${H1013} 46 03 00 41`, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Item[0]' } },
  { name: 'UTF-16 odd string-table offset', bytes: hex`03 01 87 75 04 00 41 00 00  46 83 01 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 10, path: 'A:Item[0]' } },
  { name: 'UTF-16 string table with only an unaligned terminator', bytes: hex`03 01 87 75 04 41 00 00 42  46 83 00 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 10, path: 'A:Item[0]' } },
  { name: 'UTF-16 string table with malformed text', bytes: hex`03 01 87 75 04 D8 00 00 00  46 83 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 10, path: 'A:Item[0]' } },
  { name: 'ENTITY 0x110000', bytes: hex`${H3} 46 02 C4 80 00 01`, expect: { code: 'BAD_ENTITY', offset: 5, path: 'A:Item[0]' } },
  { name: 'ENTITY 0xD800', bytes: hex`${H3} 46 02 83 B0 00 01`, expect: { code: 'BAD_ENTITY', offset: 5, path: 'A:Item[0]' } },
  { name: 'ENTITY 0xDFFF', bytes: hex`${H3} 46 02 83 BF 7F 01`, expect: { code: 'BAD_ENTITY', offset: 5, path: 'A:Item[0]' } },
  // Found by the mutation fuzz (ticket 24): encode can't write such text as OPAQUE (UNREPRESENTABLE_CHARACTER), so decode refuses it
  // to keep encode(decode(x)) total. An ENTITY the charset can hold in an opaque-flagged element is fine.
  { name: 'ENTITY above the charset limit inside an opaque-flagged element', bytes: hex`${H3} 47 02 81 20 01`, expect: { code: 'BAD_ENTITY', offset: 5, path: 'A:Mime[0]' } },
  { name: 'ENTITY 0', bytes: hex`${H3} 46 02 00 01`, expect: { code: 'BAD_ENTITY', offset: 5, path: 'A:Item[0]' } },
  { name: 'ENTITY at body level', bytes: hex`${H3} 02 41 05`, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
  { name: 'ENTITY without its operand', bytes: hex`${H3} 46 02`, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Item[0]' } },
];

for (const { name, bytes, expect } of decodeErrors) {
  test(`charset decode error: ${name}`, () => assertWbxmlError(() => decode(bytes, table), expect));
}

// A misaligned 00 00 in UTF-16 is MALFORMED_TEXT at the token wherever a string can be: attribute STR_I, EXT_I in content and in attributes.
const attributeTable = { ...table, attributePages: { 0: { starts: { 5: { name: 'a' } } } } };
const misalignedErrors = [
  { name: 'attribute STR_I', bytes: hex`${H1013} C6 05 03 41 00 00 01 01`, expect: { code: 'MALFORMED_TEXT', offset: 7, path: 'A:Item[0]' } },
  { name: 'EXT_I in content', bytes: hex`${H1013} 46 40 41 00 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 6, path: 'A:Item[0]' } },
  { name: 'EXT_I in an attribute value', bytes: hex`${H1013} C6 05 40 41 00 00 01 01`, expect: { code: 'MALFORMED_TEXT', offset: 7, path: 'A:Item[0]' } },
];
for (const { name, bytes, expect } of misalignedErrors) {
  test(`charset decode error: UTF-16 only an unaligned 00 00 in ${name}`, () => assertWbxmlError(() => decode(bytes, attributeTable), expect));
}

const encodeVectors = [
  { name: 'US-ASCII', document: item('hi', 3), bytes: hex`${H3} 46 03 68 69 00 01` },
  { name: 'ISO-8859-1', document: item('é', 4), bytes: hex`${H4} 46 03 E9 00 01` },
  { name: 'UTF-16BE', document: item('hé', 1013), bytes: hex`${H1013} 46 03 00 68 00 E9 00 00 01` },
  { name: 'UTF-16LE', document: item('hé', 1014), bytes: hex`${H1014} 46 03 68 00 E9 00 00 00 01` },
  { name: 'UTF-16: big-endian, no BOM', document: item('hé', 1015), bytes: hex`${H1015} 46 03 00 68 00 E9 00 00 01` },
  { name: 'UTF-16BE: a surrogate pair', document: item('\u{1F600}', 1013), bytes: hex`${H1013} 46 03 D8 3D DE 00 00 00 01` },
  { name: 'UTF-16BE: a leading U+FEFF is written as text', document: item('﻿A', 1013), bytes: hex`${H1013} 46 03 FE FF 00 41 00 00 01` },
  // Found by the round-trip property (ticket 24): 1015 decode drops a leading BOM, so a text that starts with U+FEFF
  // (RFC 2781: a leading ZWNBSP needs a BOM before it) or U+FFFE (reads as the little-endian BOM) must get one.
  { name: 'UTF-16: a leading U+FEFF gets a BOM, so it survives', document: item('﻿A', 1015), bytes: hex`${H1015} 46 03 FE FF FE FF 00 41 00 00 01` },
  { name: 'UTF-16: a leading U+FFFE gets a BOM, so it is not read as little-endian', document: item('￾A', 1015), bytes: hex`${H1015} 46 03 FE FF FF FE 00 41 00 00 01` },
  { name: 'UTF-16: U+FEFF past the start needs no BOM', document: item('A﻿', 1015), bytes: hex`${H1015} 46 03 00 41 FE FF 00 00 01` },
  {
    name: 'UTF-16: a LITERAL name that starts with U+FEFF gets a BOM too',
    document: doc(el('﻿Z'), 1015),
    bytes: hex`03 01 87 77 08 FE FF FE FF 00 5A 00 00  04 00`,
  },
  { name: '&nbsp; in US-ASCII is one ENTITY and no empty STR_I', document: item(' ', 3), bytes: hex`${H3} 46 02 81 20 01` },
  { name: 'ISO-8859-1 keeps U+00A0 as a byte', document: item(' ', 4), bytes: hex`${H4} 46 03 A0 00 01` },
  { name: 'ENTITY splits the STR_I', document: item('a€b', 4), bytes: hex`${H4} 46 03 61 00 02 C1 2C 03 62 00 01` },
  { name: 'ENTITY at the end of the text', document: item('a ', 3), bytes: hex`${H3} 46 03 61 00 02 81 20 01` },
  { name: 'two ENTITYs in a row', document: item(' ¡', 3), bytes: hex`${H3} 46 02 81 20 02 81 21 01` },
  { name: 'ENTITY for a character above the BMP', document: item('\u{1F600}', 3), bytes: hex`${H3} 46 02 87 EC 00 01` },
  { name: 'empty text is still STR_I', document: item('', 3), bytes: hex`${H3} 46 03 00 01` },
  { name: 'a text public id in UTF-16BE', document: doc(el('Sync'), 1013, { publicId: 'MX' }), bytes: hex`03 00 00 87 75 06 00 4D 00 58 00 00 05` },
  { name: 'a LITERAL name in UTF-16LE', document: doc(el('Zed'), 1014), bytes: hex`03 01 87 76 08 5A 00 65 00 64 00 00 00  04 00` },
  {
    name: 'opaque-flagged text in UTF-16 is big-endian with no BOM',
    document: doc(el('Mime', [text('hé')]), 1015),
    bytes: hex`${H1015} 47 C3 04 00 68 00 E9 01`,
  },
  { name: 'opaque-flagged text in ISO-8859-1', document: doc(el('Mime', [text('é')]), 4), bytes: hex`${H4} 47 C3 01 E9 01` },
];

for (const { name, document, bytes } of encodeVectors) {
  test(`charset encode: ${name}`, () => assert.deepEqual(encode(document, table), bytes));
}

const encodeErrors = [
  { name: 'unsupported MIB', document: doc(el('Sync'), 17), expect: { code: 'UNSUPPORTED_CHARSET', path: '' } },
  { name: 'lone surrogate in UTF-16', document: item('a\uD800', 1013), expect: { code: 'MALFORMED_TEXT', path: 'A:Item[0]' } },
  { name: 'lone surrogate in US-ASCII', document: item('\uDC00', 3), expect: { code: 'MALFORMED_TEXT', path: 'A:Item[0]' } },
  { name: 'U+0000 in ISO-8859-1', document: item('a\u0000', 4), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Item[0]' } },
  { name: 'U+0000 in UTF-16', document: item('\u0000', 1013), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Item[0]' } },
  { name: 'LITERAL name in US-ASCII', document: doc(el('Zé'), 3), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Zé[0]' } },
  { name: 'LITERAL name above U+00FF in ISO-8859-1', document: doc(el('Z€'), 4), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Z€[0]' } },
  { name: 'text public id in US-ASCII', document: doc(el('Sync'), 3, { publicId: 'é' }), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: '' } },
  { name: 'EXT_I string in US-ASCII', document: doc(el('Sync', [{ type: 'extension', index: 0, value: 'é' }]), 3), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Sync[0]' } },
  { name: 'opaque-flagged text in US-ASCII', document: doc(el('Mime', [text('é')]), 3), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Mime[0]' } },
  { name: 'opaque-flagged text above U+00FF in ISO-8859-1', document: doc(el('Mime', [text('€')]), 4), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Mime[0]' } },
];

for (const { name, document, expect } of encodeErrors) {
  test(`charset encode error: ${name}`, () => assertWbxmlError(() => encode(document, table), expect));
}

test('charset round trip: every supported charset', () => {
  const value = 'a é€\u{1F600}﻿';
  for (const charset of [3, 4, 106, 1013, 1014, 1015]) {
    const d = decodedItem(value, charset);
    assert.deepEqual(decode(encode(d, table), table), d, `charset ${charset}`);
  }
});
