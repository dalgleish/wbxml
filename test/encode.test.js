import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

const table = {
  publicId: 1,
  tagPages: {
    0: { namespace: 'A', tags: { 5: 'Sync', 6: 'Item' } },
    1: { namespace: 'B', tags: { 5: 'Name' } },
  },
};
const strict = { ...table, literals: false };

const el = (namespace, name, children = []) => ({ type: 'element', namespace, name, attributes: [], children });
const text = (value) => ({ type: 'text', value });
const doc = (child, header = {}) => ({ type: 'document', children: [child], ...header });
const H = '03 01 6A 00';

const vectors = [
  { name: 'a content-less root: 05, no END', document: doc(el('A', 'Sync')), bytes: hex`${H} 05` },
  { name: 'header defaults: 1.3, table.publicId, UTF-8', document: doc(el('A', 'Item')), bytes: hex`03 01 6A 00 06` },
  {
    name: 'header fields come from the document',
    document: doc(el('A', 'Sync'), { version: '1.2', publicId: 0x1234, charset: 106 }),
    bytes: hex`02 A4 34 6A 00 05`,
  },
  {
    name: 'content: tag|0x40, children, END',
    document: doc(el('A', 'Sync', [el('A', 'Item'), el('A', 'Item', [text('x')])])),
    bytes: hex`${H} 45 06 46 03 78 00 01 01`,
  },
  { name: 'children: [text ""] is the content bit, 03 00 and END', document: doc(el('A', 'Item', [text('')])), bytes: hex`${H} 46 03 00 01` },
  {
    name: 'SWITCH_PAGE only on a code page change; it carries across END',
    document: doc(el('A', 'Sync', [el('B', 'Name'), el('B', 'Name'), el('A', 'Item')])),
    bytes: hex`${H} 45 00 01 05 05 00 00 06 01`,
  },
  { name: 'text is UTF-8 STR_I', document: doc(el('A', 'Item', [text('hé')])), bytes: hex`${H} 46 03 68 C3 A9 00 01` },
  {
    name: 'a missing attributes field is the same as []',
    document: doc({ type: 'element', namespace: 'A', name: 'Sync', children: [] }),
    bytes: hex`${H} 05`,
  },
];

// Tables for the LITERAL code page choice (spec: Encode rules, LITERAL code page choice)
const twoA = { tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync' } }, 1: { namespace: 'B', tags: { 5: 'Name' } }, 2: { namespace: 'A', tags: { 5: 'Other' } } } };
const withBare = { tagPages: { ...table.tagPages, 3: { tags: { 5: 'Free' } } } };

vectors.push(
  {
    name: 'a name the table lacks is a LITERAL through the string table',
    document: doc(el('A', 'Sync', [el('A', 'Zed')])),
    bytes: hex`03 01 6A 04 5A 65 64 00  45 04 00 01  // table "Zed"; LITERAL 0`,
  },
  {
    name: 'a LITERAL with content is LITERAL_C',
    document: doc(el('A', 'Sync', [el('A', 'Zed', [text('x')])])),
    bytes: hex`03 01 6A 04 5A 65 64 00  45 44 00 03 78 00 01 01`,
  },
  {
    name: 'LITERAL names are in the table once each, in first-occurrence order',
    document: doc(el('A', 'Sync', [el('A', 'Zed'), el('A', 'Yo'), el('A', 'Zed', [el('A', 'Yo')])])),
    bytes: hex`03 01 6A 07 5A 65 64 00 59 6F 00  45 04 00 04 04 44 00 04 04 01 01`,
  },
  {
    name: 'a text public id is first in the string table (offset 0), after 00',
    document: doc(el('A', 'Sync'), { publicId: 'MX' }),
    bytes: hex`03 00 00 6A 03 4D 58 00 05`,
  },
  {
    name: 'a text public id then LITERAL names',
    document: doc(el('A', 'Sync', [el('A', 'Zed')]), { publicId: 'MX' }),
    bytes: hex`03 00 00 6A 07 4D 58 00 5A 65 64 00  45 04 03 01`,
  },
  {
    name: 'a text public id from table.publicId is the default',
    document: doc(el('A', 'Sync')),
    table: { ...table, publicId: 'MX' },
    bytes: hex`03 00 00 6A 03 4D 58 00 05`,
  },
  {
    name: 'repeated text stays STR_I, so the string table stays empty',
    document: doc(el('A', 'Sync', [el('A', 'Item', [text('abc')]), el('A', 'Item', [text('abc')])])),
    bytes: hex`${H} 45 46 03 61 62 63 00 01 46 03 61 62 63 00 01 01`,
  },
  {
    name: 'LITERAL for namespace X switches to the page that carries X',
    document: doc(el('A', 'Sync', [el('B', 'Zed')])),
    bytes: hex`03 01 6A 04 5A 65 64 00  45 00 01 04 00 01`,
  },
  {
    name: 'LITERAL for namespace X stays on the current page when it carries X',
    document: doc(el('A', 'Other', [el('A', 'Zed')])),
    table: twoA,
    bytes: hex`03 01 6A 04 5A 65 64 00  00 02 45 04 00 01`,
  },
  {
    name: 'LITERAL for namespace X from another page takes the lowest page that carries X',
    document: doc(el('B', 'Name', [el('A', 'Zed')])),
    table: twoA,
    bytes: hex`03 01 6A 04 5A 65 64 00  00 01 45 00 00 04 00 01`,
  },
  {
    name: 'LITERAL for namespace null takes the lowest table page without a namespace',
    document: doc(el('A', 'Sync', [el(null, 'Zed')])),
    table: withBare,
    bytes: hex`03 01 6A 04 5A 65 64 00  45 00 03 04 00 01`,
  },
  {
    name: 'LITERAL for namespace null stays on a namespace-less page',
    document: doc(el(null, 'Free', [el(null, 'Zed')])),
    table: withBare,
    bytes: hex`03 01 6A 04 5A 65 64 00  00 03 45 04 00 01`,
  },
  {
    name: 'LITERAL for namespace null with no namespace-less table page takes the lowest missing page, then stays on it',
    document: doc(el('A', 'Sync', [el(null, 'Zed'), el(null, 'Yo')])),
    bytes: hex`03 01 6A 07 5A 65 64 00 59 6F 00  45 00 02 04 00 04 04 01`,
  },
);

for (const { name, document, bytes, table: t = table } of vectors) {
  test(`encode: ${name}`, () => {
    assert.deepEqual(encode(document, t), bytes);
  });
}

test('encode(null) gives zero bytes', () => {
  assert.equal(encode(null, table).length, 0);
});

test('encode: a decoded document re-encodes to the same bytes', () => {
  const bytes = hex`${H} 45 06 46 03 78 00 01 00 01 05 00 00 06 01`;
  assert.deepEqual(encode(decode(bytes, table), table), bytes);
});

test('encode: a decoded LITERAL document re-encodes to the same bytes', () => {
  const bytes = hex`03 01 6A 04 5A 65 64 00  45 04 00 44 00 03 78 00 01 01`;
  const d = decode(bytes, table);
  assert.deepEqual(encode(d, table), bytes);
});

test('encode: the header can be changed by spreading the document', () => {
  const d = decode(hex`${H} 05`, table);
  assert.deepEqual(encode({ ...d, version: '1.2' }, table), hex`02 01 6A 00 05`);
});

test('encode: 1,000,000 levels of nesting encode without a RangeError', () => {
  const depth = 1_000_000;
  // minimal form: depth-1 opening tags, a content-less innermost tag, depth-1 ENDs
  const bytes = new Uint8Array(4 + 2 * depth - 1);
  bytes.set(hex`${H}`);
  bytes.fill(0x45, 4, 4 + depth - 1);
  bytes[4 + depth - 1] = 0x05;
  bytes.fill(0x01, 4 + depth);
  assert.deepEqual(encode(decode(bytes, table), table), bytes);
});

const errors = [
  { name: 'UNKNOWN_NAME: a misspelled name under literals: false, path includes the element', document: doc(el('A', 'Sync', [el('A', 'Itme')])), table: strict, expect: { code: 'UNKNOWN_NAME', path: 'A:Sync[0]/A:Itme[0]' } },
  { name: 'UNKNOWN_NAME: a namespace no code page carries', document: doc(el('Z', 'Sync')), expect: { code: 'UNKNOWN_NAME', path: 'Z:Sync[0]' } },
  { name: 'UNKNOWN_NAME: a null namespace no code page carries, under literals: false', document: doc(el(null, 'Sync')), table: strict, expect: { code: 'UNKNOWN_NAME', path: 'Sync[0]' } },
  { name: 'UNKNOWN_NAME under literals: false', document: doc(el('A', 'Nope')), table: strict, expect: { code: 'UNKNOWN_NAME', path: 'A:Nope[0]' } },
  { name: 'UNSUPPORTED_VERSION: 1.0', document: doc(el('A', 'Sync'), { version: '1.0' }), expect: { code: 'UNSUPPORTED_VERSION', path: '' } },
  { name: 'UNSUPPORTED_CHARSET: 0 can be read but not written', document: doc(el('A', 'Sync'), { charset: 0 }), expect: { code: 'UNSUPPORTED_CHARSET', path: '' } },
  { name: 'UNKNOWN_NAME: namespace-less LITERAL when all 256 code pages carry a namespace', document: doc(el(null, 'Zed')), table: { tagPages: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i, { namespace: 'N', tags: {} }])) }, expect: { code: 'UNKNOWN_NAME', path: 'Zed[0]' } },
  { name: 'MALFORMED_TEXT: a LITERAL name with a lone surrogate', document: doc(el('A', 'a\uD800')), expect: { code: 'MALFORMED_TEXT', path: 'A:a\uD800[0]' } },
  { name: 'UNREPRESENTABLE_CHARACTER: a LITERAL name with U+0000', document: doc(el('A', 'a\u0000')), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:a\u0000[0]' } },
  { name: 'BAD_INTEGER: publicId 0', document: doc(el('A', 'Sync'), { publicId: 0 }), expect: { code: 'BAD_INTEGER', path: '' } },
  { name: 'BAD_INTEGER: publicId above 0xFFFFFFFF', document: doc(el('A', 'Sync'), { publicId: 2 ** 32 }), expect: { code: 'BAD_INTEGER', path: '' } },
  { name: 'MALFORMED_TEXT: a lone surrogate', document: doc(el('A', 'Item', [text('a\uD800')])), expect: { code: 'MALFORMED_TEXT', path: 'A:Item[0]' } },
  { name: 'UNREPRESENTABLE_CHARACTER: U+0000', document: doc(el('A', 'Item', [text('a\u0000b')])), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Item[0]' } },
];

for (const { name, document, expect, table: t = table } of errors) {
  test(`encode error: ${name}`, () => {
    assertWbxmlError(() => encode(document, t), expect);
  });
}

const typeErrors = [
  ['a non-Document', { hello: 1 }],
  ['a wrong node type', doc({ type: 'banana' })],
  ['an element without a name', doc({ type: 'element', namespace: 'A', children: [] })],
  ['an element without children', doc({ type: 'element', namespace: 'A', name: 'Sync' })],
  ['two roots', { type: 'document', children: [el('A', 'Sync'), el('A', 'Sync')] }],
  ['text at document level', { type: 'document', children: [text('x'), el('A', 'Sync')] }],
  ['no root', { type: 'document', children: [] }],
  ['a negative publicId', doc(el('A', 'Sync'), { publicId: -1 })],
  ['a non-integer publicId', doc(el('A', 'Sync'), { publicId: 1.5 })],
  ['a text node without a string', doc(el('A', 'Item', [{ type: 'text', value: 5 }]))],
];

for (const [name, bad] of typeErrors) {
  test(`encode: ${name} is a TypeError`, () => {
    assert.throws(() => encode(bad, table), TypeError);
  });
}
