import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

// Small inline table: page 0 (namespace A) Sync=5 Item=6; page 1 (B) Name=5
const table = {
  tagPages: {
    0: { namespace: 'A', tags: { 5: 'Sync', 6: 'Item' } },
    1: { namespace: 'B', tags: { 5: 'Name' } },
  },
};
const strict = { ...table, literals: false };

const el = (namespace, name, children = []) => ({ type: 'element', namespace, name, attributes: [], children });
const text = (value) => ({ type: 'text', value });
const document = (child, header = {}) => ({
  type: 'document', version: '1.3', publicId: 1, charset: 106, ...header, children: [child],
});
const H = '03 01 6A 00'; // version 1.3, public id 1, charset UTF-8, empty string table

const documents = [
  {
    name: 'WAP-192 §5.3 header + tag: a content-less root element',
    bytes: hex`03 01 6A 00  05  // Sync, no content`,
    expect: document(el('A', 'Sync')),
  },
  {
    name: '§5.8.2 tag with the content bit and END gives children []',
    bytes: hex`${H} 45 01  // Sync(content) END`,
    expect: document(el('A', 'Sync')),
  },
  {
    name: 'children: [] for 06 and 46 01 alike (Item)',
    bytes: hex`${H} 45 06 46 01 01  // Sync{ Item, Item() }`,
    expect: document(el('A', 'Sync', [el('A', 'Item'), el('A', 'Item')])),
  },
  {
    name: '§5.8.4.1 STR_I: 46 03 00 01 gives [text ""]',
    bytes: hex`${H} 46 03 00 01`,
    expect: document(el('A', 'Item', [text('')])),
  },
  {
    name: 'STR_I with UTF-8 text',
    bytes: hex`${H} 46 03 68 C3 A9 00 01  // "hé"`,
    expect: document(el('A', 'Item', [text('hé')])),
  },
  {
    name: 'adjacent strings merge into one text node',
    bytes: hex`${H} 46 03 61 00 03 62 00 01`,
    expect: document(el('A', 'Item', [text('ab')])),
  },
  {
    name: '§5.8.4.7.2 SWITCH_PAGE does not break a text run',
    bytes: hex`${H} 46 03 61 00  00 01  03 62 00 01`,
    expect: document(el('A', 'Item', [text('ab')])),
  },
  {
    name: 'SWITCH_PAGE changes the namespace; the code page carries across END',
    bytes: hex`${H} 45 00 01 45 03 78 00 01  00 00 06 01  // Sync{ Name{"x"} Item } page back to 0`,
    expect: document(el('A', 'Sync', [el('B', 'Name', [text('x')]), el('A', 'Item')])),
  },
  {
    name: 'SWITCH_PAGE right before END is accepted',
    bytes: hex`${H} 45 00 01 01`,
    expect: document(el('A', 'Sync')),
  },
  {
    name: 'versions 1.1 and 1.2 are read with the same grammar',
    bytes: hex`01 01 6A 00 05`,
    expect: document(el('A', 'Sync'), { version: '1.1' }),
  },
  {
    name: 'header: a numeric public id, non-minimal mb_u_int32 accepted (80 80 01 = 1)',
    bytes: hex`02 80 80 01 6A 00 05`,
    expect: document(el('A', 'Sync'), { version: '1.2' }),
  },
  {
    name: 'header: a larger public id (0x1234 = A4 34)',
    bytes: hex`03 A4 34 6A 00 05`,
    expect: document(el('A', 'Sync'), { publicId: 0x1234 }),
  },
  {
    name: '§5.5 header: charset 0 is read as UTF-8 and recorded as 106',
    bytes: hex`03 01 00 00 46 03 C3 A9 00 01`,
    expect: document(el('A', 'Item', [text('é')])),
  },
  {
    name: '§5.7 header: an unused non-empty string table is fine',
    bytes: hex`03 01 6A 03 41 42 00  05`,
    expect: document(el('A', 'Sync')),
  },
  {
    name: '§5.7 header: public id 0 reads a text public id from the string table',
    bytes: hex`03 00 00 6A 03 4D 58 00  05  // index 0 -> "MX"`,
    expect: document(el('A', 'Sync'), { publicId: 'MX' }),
  },
  {
    name: '§5.7 a text public id may point into the middle of a string',
    bytes: hex`03 00 01 6A 03 4D 58 00  05`,
    expect: document(el('A', 'Sync'), { publicId: 'X' }),
  },
  {
    name: '§5.8.4.1 STR_T reads the string at its table offset',
    bytes: hex`03 01 6A 04 61 62 63 00  46 83 00 01  // table "abc"; Item{ STR_T 0 }`,
    expect: document(el('A', 'Item', [text('abc')])),
  },
  {
    name: '§5.7 STR_T may point into the middle of a string, and merges with STR_I',
    bytes: hex`03 01 6A 04 61 62 63 00  46 03 78 00 83 01 01  // "x" then "bc"`,
    expect: document(el('A', 'Item', [text('xbc')])),
  },
  {
    name: '§5.8.4.1 a LITERAL names its element through the string table, with the current page namespace',
    bytes: hex`03 01 6A 04 5A 65 64 00  45 04 00 01  // table "Zed"; Sync{ LITERAL 0 }`,
    expect: document(el('A', 'Sync', [el('A', 'Zed')])),
  },
  {
    name: 'LITERAL_C has content',
    bytes: hex`03 01 6A 04 5A 65 64 00  45 44 00 03 78 00 01 01  // Sync{ Zed{"x"} }`,
    expect: document(el('A', 'Sync', [el('A', 'Zed', [text('x')])])),
  },
  {
    name: 'a LITERAL root with content',
    bytes: hex`03 01 6A 04 5A 65 64 00  44 00 01`,
    expect: document(el('A', 'Zed')),
  },
  {
    name: 'a LITERAL after SWITCH_PAGE takes that page namespace',
    bytes: hex`03 01 6A 04 5A 65 64 00  45 00 01 04 00 01  // page 1 -> B`,
    expect: document(el('A', 'Sync', [el('B', 'Zed')])),
  },
  {
    name: 'a LITERAL after SWITCH_PAGE to a page missing from the table has namespace null',
    bytes: hex`03 01 6A 04 5A 65 64 00  45 00 09 04 00 01`,
    expect: document(el('A', 'Sync', [el(null, 'Zed')])),
  },
  {
    name: 'LITERAL names may share a table string, and a mid-string offset is legal',
    bytes: hex`03 01 6A 04 5A 65 64 00  45 04 00 04 01 01  // Zed, ed`,
    expect: document(el('A', 'Sync', [el('A', 'Zed'), el('A', 'ed')])),
  },
];

for (const { name, bytes, expect } of documents) {
  test(`decode: ${name}`, () => {
    assert.deepEqual(decode(bytes, table), expect);
  });
}

const errors = [
  { name: 'truncated: nothing after the version byte', bytes: hex`03 01`, expect: { code: 'TRUNCATED', offset: 2, path: '' } },
  { name: 'truncated: string table length past the end', bytes: hex`03 01 6A 05 00`, expect: { code: 'TRUNCATED', offset: 3, path: '' } },
  { name: 'truncated: SWITCH_PAGE without its operand', bytes: hex`${H} 45 00`, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Sync[0]' } },
  { name: 'truncated: unclosed element', bytes: hex`${H} 45`, expect: { code: 'TRUNCATED', offset: 5, path: 'A:Sync[0]' } },
  { name: 'truncated: path counts same-named siblings', bytes: hex`${H} 45 46 01 46`, expect: { code: 'TRUNCATED', offset: 8, path: 'A:Sync[0]/A:Item[1]' } },
  { name: 'truncated: inline string with no terminator points at STR_I', bytes: hex`${H} 45 03 41`, expect: { code: 'TRUNCATED', offset: 5, path: 'A:Sync[0]' } },
  { name: 'NO_ROOT: a header and nothing else', bytes: hex`${H}`, expect: { code: 'NO_ROOT', offset: 4, path: '' } },
  { name: 'NO_ROOT: a header with only SWITCH_PAGE', bytes: hex`${H} 00 01`, expect: { code: 'NO_ROOT', offset: 6, path: '' } },
  { name: 'TRAILING_BYTES: a second root', bytes: hex`${H} 05 05`, expect: { code: 'TRAILING_BYTES', offset: 5, path: '' } },
  { name: 'TRAILING_BYTES: after the END of the root', bytes: hex`${H} 45 01 00 00`, expect: { code: 'TRAILING_BYTES', offset: 6, path: '' } },
  { name: 'UNEXPECTED_TOKEN: END at body level', bytes: hex`${H} 01`, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
  { name: 'UNEXPECTED_TOKEN: a string at body level', bytes: hex`${H} 03 41 00 05`, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
  { name: 'UNKNOWN_TOKEN: tag token not on the page', bytes: hex`${H} 45 07`, expect: { code: 'UNKNOWN_TOKEN', offset: 5, path: 'A:Sync[0]' } },
  { name: 'UNKNOWN_TOKEN: SWITCH_PAGE to a missing page is fine until a token is read', bytes: hex`${H} 45 00 09 05`, expect: { code: 'UNKNOWN_TOKEN', offset: 7, path: 'A:Sync[0]' } },
  { name: 'LITERAL_NOT_ALLOWED: LITERAL_C under literals: false', bytes: hex`${H} 44 00`, table: strict, expect: { code: 'LITERAL_NOT_ALLOWED', offset: 4, path: '' } },
  { name: 'LITERAL_NOT_ALLOWED: LITERAL under literals: false', bytes: hex`03 01 6A 04 5A 65 64 00 45 04 00 01`, table: strict, expect: { code: 'LITERAL_NOT_ALLOWED', offset: 9, path: 'A:Sync[0]' } },
  { name: 'BAD_STRING_REFERENCE: STR_T offset at the table end points at STR_T', bytes: hex`03 01 6A 02 61 00 46 83 02 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 7, path: 'A:Item[0]' } },
  { name: 'BAD_STRING_REFERENCE: STR_T string with no terminator before the table ends', bytes: hex`03 01 6A 02 61 62 46 83 00 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 7, path: 'A:Item[0]' } },
  { name: 'BAD_STRING_REFERENCE: LITERAL index past the table points at LITERAL', bytes: hex`03 01 6A 00 45 04 00 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 5, path: 'A:Sync[0]' } },
  { name: 'BAD_STRING_REFERENCE: LITERAL_C name with no terminator', bytes: hex`03 01 6A 01 5A 44 00 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 5, path: '' } },
  { name: 'MALFORMED_TEXT: invalid UTF-8 behind STR_T points at STR_T', bytes: hex`03 01 6A 02 FF 00 46 83 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 7, path: 'A:Item[0]' } },
  { name: 'truncated: STR_T without its operand', bytes: hex`${H} 46 83`, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Item[0]' } },
  { name: 'UNEXPECTED_TOKEN: STR_T at body level', bytes: hex`03 01 6A 02 61 00 83 00 05`, expect: { code: 'UNEXPECTED_TOKEN', offset: 6, path: '' } },
  { name: 'BAD_INTEGER: public id of 5 bytes above 0xFFFFFFFF', bytes: hex`03 FF FF FF FF 7F 6A 00 05`, expect: { code: 'BAD_INTEGER', offset: 1, path: '' } },
  { name: 'BAD_INTEGER: more than 5 bytes', bytes: hex`03 01 6A 80 80 80 80 80 00 05`, expect: { code: 'BAD_INTEGER', offset: 3, path: '' } },
  { name: 'UNSUPPORTED_VERSION: 0x00 (WBXML 1.0)', bytes: hex`00 01 6A 00 05`, expect: { code: 'UNSUPPORTED_VERSION', offset: 0, path: '' } },
  { name: 'UNSUPPORTED_VERSION: 0x04', bytes: hex`04 01 6A 00 05`, expect: { code: 'UNSUPPORTED_VERSION', offset: 0, path: '' } },
  { name: 'BAD_STRING_REFERENCE: public id offset at the table end, points at the public id', bytes: hex`03 00 03 6A 03 4D 58 00 05`, expect: { code: 'BAD_STRING_REFERENCE', offset: 1, path: '' } },
  { name: 'BAD_STRING_REFERENCE: no terminator before the table ends', bytes: hex`03 00 00 6A 02 4D 58 05`, expect: { code: 'BAD_STRING_REFERENCE', offset: 1, path: '' } },
  { name: 'MALFORMED_TEXT: invalid UTF-8 in an inline string points at STR_I', bytes: hex`${H} 45 03 FF 00 01`, expect: { code: 'MALFORMED_TEXT', offset: 5, path: 'A:Sync[0]' } },
  { name: 'MALFORMED_TEXT: invalid UTF-8 in the string table', bytes: hex`03 00 00 6A 02 FF 00 05`, expect: { code: 'MALFORMED_TEXT', offset: 1, path: '' } },
];

for (const { name, bytes, expect, table: t = table } of errors) {
  test(`decode error: ${name}`, () => {
    assertWbxmlError(() => decode(bytes, t), expect);
  });
}

test('decode: zero bytes decode to null', () => {
  assert.equal(decode(new Uint8Array(0), table), null);
});

test('decode: a leading U+FEFF in UTF-8 text is kept', () => {
  const doc = decode(hex`${H} 46 03 EF BB BF 41 00 01`, table);
  assert.equal(doc.children[0].children[0].value, '﻿A');
});

test('decode: a non-Uint8Array input is a TypeError naming request.bytes()', () => {
  for (const bad of [new ArrayBuffer(4), 'text', [3, 1, 0x6a, 0], null, undefined]) {
    assert.throws(() => decode(bad, table), (e) => e instanceof TypeError && /request\.bytes\(\)/.test(e.message));
  }
  assert.ok(decode(Buffer.from([3, 1, 0x6a, 0, 5]), table));
});

test('decode: opaque-free input is a Document made only of plain objects', () => {
  const doc = decode(hex`${H} 45 06 01`, table);
  assert.equal(Object.getPrototypeOf(doc), Object.prototype);
  assert.equal(Object.getPrototypeOf(doc.children[0]), Object.prototype);
});

test('decode: 1,000,000 levels of nesting decode without a RangeError', () => {
  const depth = 1_000_000;
  const bytes = new Uint8Array(4 + 2 * depth);
  bytes.set(hex`${H}`);
  bytes.fill(0x45, 4, 4 + depth);
  bytes.fill(0x01, 4 + depth);
  const doc = decode(bytes, table);
  assert.equal(doc.children[0].name, 'Sync');
});

test('decode: nesting bytes with no end are a WbxmlError, never a RangeError', () => {
  const bytes = new Uint8Array(4 + 100_000).fill(0x45);
  bytes.set(hex`${H}`);
  assertWbxmlError(() => decode(bytes, table), { code: 'TRUNCATED', offset: bytes.length, path: Array(100_000).fill('A:Sync[0]').join('/') });
});
