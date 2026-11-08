import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

const table = {
  publicId: 1,
  tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync' } } },
};
const offsets = { ...table, extTStringOffsets: true };
const H = '03 01 6A 00';

const el = (children = []) => ({ type: 'element', namespace: 'A', name: 'Sync', attributes: [], children });
const text = (value) => ({ type: 'text', value });
const ext = (index, value) => (value === undefined ? { type: 'extension', index } : { type: 'extension', index, value });
const doc = (child) => ({ type: 'document', children: [child] });

test('decode: EXT_0-2, EXT_I_0-2 and EXT_T_0-2 become extension nodes in wire order', () => {
  const d = decode(hex`${H} 45
    C0 C1 C2              // EXT_0, EXT_1, EXT_2
    40 61 00              // EXT_I_0 "a"
    41 62 63 00           // EXT_I_1 "bc"
    42 00                 // EXT_I_2 ""
    80 00 81 81 48 82 7F  // EXT_T_0 0, EXT_T_1 200, EXT_T_2 127
    01`, table);
  assert.deepEqual(d.children[0].children, [
    ext(0), ext(1), ext(2), ext(0, 'a'), ext(1, 'bc'), ext(2, ''), ext(0, 0), ext(1, 200), ext(2, 127),
  ]);
});

test('decode: an extension breaks a text run', () => {
  const d = decode(hex`${H} 45 03 61 00 C0 03 62 00 01`, table);
  assert.deepEqual(d.children[0].children, [text('a'), ext(0), text('b')]);
});

test('decode: extTStringOffsets resolves EXT_T_n through the string table, same node as EXT_I_n', () => {
  const bytes = hex`03 01 6A 05   // string table: "x" at 0, "yz" at 2
    78 00 79 7A 00
    45 81 00 82 02 01   // Sync: EXT_T_1 0, EXT_T_2 2`;
  assert.deepEqual(decode(bytes, offsets).children[0].children, [ext(1, 'x'), ext(2, 'yz')]);
  assert.deepEqual(decode(bytes, table).children[0].children, [ext(1, 0), ext(2, 2)]);
  const inline = hex`${H} 45 41 78 00 42 79 7A 00 01`;
  assert.deepEqual(decode(inline, offsets), decode(inline, table));
});

const decodeErrors = [
  { name: 'BAD_STRING_REFERENCE: EXT_T offset past the table', bytes: hex`03 01 6A 02 78 00 45 81 05 01`, t: offsets, expect: { code: 'BAD_STRING_REFERENCE', offset: 7, path: 'A:Sync[0]' } },
  { name: 'BAD_STRING_REFERENCE: EXT_T with an empty table', bytes: hex`${H} 45 80 00 01`, t: offsets, expect: { code: 'BAD_STRING_REFERENCE', offset: 5, path: 'A:Sync[0]' } },
  { name: 'BAD_INTEGER: EXT_T above 0xFFFFFFFF', bytes: hex`${H} 45 80 90 80 80 80 00 01`, t: table, expect: { code: 'BAD_INTEGER', offset: 6, path: 'A:Sync[0]' } },
  { name: 'TRUNCATED: EXT_T has no integer', bytes: hex`${H} 45 80`, t: table, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Sync[0]' } },
  { name: 'TRUNCATED: EXT_I has no terminator', bytes: hex`${H} 45 40 61`, t: table, expect: { code: 'TRUNCATED', offset: 5, path: 'A:Sync[0]' } },
  { name: 'MALFORMED_TEXT: EXT_I holds invalid UTF-8', bytes: hex`${H} 45 40 FF 00 01`, t: table, expect: { code: 'MALFORMED_TEXT', offset: 5, path: 'A:Sync[0]' } },
  { name: 'UNEXPECTED_TOKEN: EXT_0 at body level', bytes: hex`${H} C0 05`, t: table, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
  { name: 'UNEXPECTED_TOKEN: EXT_I at body level', bytes: hex`${H} 40 61 00 05`, t: table, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
  { name: 'UNEXPECTED_TOKEN: EXT_T at body level', bytes: hex`${H} 80 00 05`, t: table, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
];
for (const { name, bytes, t, expect } of decodeErrors) {
  test(`decode ${name}`, () => assertWbxmlError(() => decode(bytes, t), expect));
}

test('encode: no value is EXT_n, a number EXT_T_n with a minimal integer, a string EXT_I_n', () => {
  const d = doc(el([ext(0), ext(1, 'a'), ext(2, 200), ext(0, 0), ext(1, 0xffffffff)]));
  assert.deepEqual(encode(d, table), hex`${H} 45
    C0 41 61 00 82 81 48 80 00 81 8F FF FF FF 7F 01`);
});

test('encode: a string is EXT_I_n even under extTStringOffsets', () => {
  assert.deepEqual(encode(doc(el([ext(1, 'a')])), offsets), hex`${H} 45 41 61 00 01`);
  assert.deepEqual(encode(doc(el([ext(1)])), offsets), hex`${H} 45 C1 01`);
});

test('encode: round trip of extensions', () => {
  const d = { type: 'document', version: '1.3', publicId: 1, charset: 106, children: [el([text('a'), ext(0), ext(1, 'é'), ext(2, 5)])] };
  assert.deepEqual(decode(encode(d, table), table), d);
});

const encodeErrors = [
  { name: 'BAD_INTEGER: number above 0xFFFFFFFF', d: doc(el([ext(0, 0x100000000)])), t: table, expect: { code: 'BAD_INTEGER', path: 'A:Sync[0]' } },
  { name: 'UNREPRESENTABLE_EXTENSION: number under extTStringOffsets', d: doc(el([ext(0, 3)])), t: offsets, expect: { code: 'UNREPRESENTABLE_EXTENSION', path: 'A:Sync[0]' } },
  { name: 'MALFORMED_TEXT: lone surrogate in a string value', d: doc(el([ext(0, '\ud800')])), t: table, expect: { code: 'MALFORMED_TEXT', path: 'A:Sync[0]' } },
  { name: 'UNREPRESENTABLE_CHARACTER: U+0000 in a string value', d: doc(el([ext(0, 'a\u0000')])), t: table, expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Sync[0]' } },
];
for (const { name, d, t, expect } of encodeErrors) {
  test(`encode ${name}`, () => assertWbxmlError(() => encode(d, t), expect));
}

test('encode: a bad extension index or value type is a TypeError', () => {
  assert.throws(() => encode(doc(el([ext(3)])), table), TypeError);
  assert.throws(() => encode(doc(el([ext(0, -1)])), table), TypeError);
  assert.throws(() => encode(doc(el([ext(0, 1.5)])), table), TypeError);
  assert.throws(() => encode(doc(el([ext(0, true)])), table), TypeError);
  assert.throws(() => encode({ type: 'document', children: [ext(0), el()] }, table), TypeError);
});
