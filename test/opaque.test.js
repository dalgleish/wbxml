import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

const table = {
  publicId: 1,
  tagPages: {
    0: { namespace: 'A', tags: { 5: 'Sync', 6: 'Mime' }, opaque: ['Mime'] },
  },
};
const H = '03 01 6A 00';

const el = (name, children = []) => ({ type: 'element', namespace: 'A', name, attributes: [], children });
const text = (value) => ({ type: 'text', value });
const opaque = (...bytes) => ({ type: 'opaque', value: Uint8Array.of(...bytes) });
const doc = (child) => ({ type: 'document', children: [child] });

test('decode: OPAQUE becomes an opaque node, a subarray view of the input', () => {
  const bytes = hex`${H}
    45        // Sync, content
    46        // Mime, content
    C3 03 01 02 03  // OPAQUE, length 3
    01 01`;
  const d = decode(bytes, table);
  const node = d.children[0].children[0].children[0];
  assert.equal(node.type, 'opaque');
  assert.deepEqual(node.value, Uint8Array.of(1, 2, 3));
  assert.equal(node.value.buffer, bytes.buffer);
  assert.equal(node.value.byteOffset, bytes.byteOffset + 8);
});

test('decode: opaque sits between text nodes in wire order, an empty one is an empty view', () => {
  const d = decode(hex`${H} 45 03 61 00 C3 00 03 62 00 C3 01 FF 01`, table);
  assert.deepEqual(d.children[0].children, [
    text('a'), opaque(), text('b'), opaque(0xff),
  ]);
});

test('decode: a multi-byte length', () => {
  const body = new Uint8Array(200).fill(7);
  const bytes = new Uint8Array([...hex`${H} 45 C3 81 48`, ...body, 1]);
  const node = decode(bytes, table).children[0].children[0];
  assert.equal(node.value.length, 200);
});

const decodeErrors = [
  { name: 'TRUNCATED: length runs past the end', bytes: hex`${H} 45 C3 05 01 02`, expect: { code: 'TRUNCATED', offset: 5, path: 'A:Sync[0]' } },
  { name: 'TRUNCATED: no length byte', bytes: hex`${H} 45 C3`, expect: { code: 'TRUNCATED', offset: 6, path: 'A:Sync[0]' } },
  { name: 'UNEXPECTED_TOKEN: OPAQUE at body level', bytes: hex`${H} C3 00 05`, expect: { code: 'UNEXPECTED_TOKEN', offset: 4, path: '' } },
];
for (const { name, bytes, expect } of decodeErrors) {
  test(`decode ${name}`, () => assertWbxmlError(() => decode(bytes, table), expect));
}

test('encode: an opaque node is OPAQUE with a minimal length, wherever it sits', () => {
  const d = doc(el('Sync', [opaque(1, 2, 3), opaque(), el('Sync')]));
  assert.deepEqual(encode(d, table), hex`${H} 45 C3 03 01 02 03 C3 00 05 01`);
  const big = doc(el('Sync', [{ type: 'opaque', value: new Uint8Array(200) }]));
  assert.deepEqual(encode(big, table).subarray(4, 8), hex`45 C3 81 48`);
});

test('encode: text in an opaque-listed element is OPAQUE holding its UTF-8 bytes', () => {
  assert.deepEqual(encode(doc(el('Mime', [text('hé')])), table), hex`${H} 46 C3 03 68 C3 A9 01`);
});

test('encode: [text ""] in an opaque-listed element is C3 00', () => {
  assert.deepEqual(encode(doc(el('Mime', [text('')])), table), hex`${H} 46 C3 00 01`);
});

test('encode: text elsewhere stays STR_I', () => {
  assert.deepEqual(encode(doc(el('Sync', [text('x')])), table), hex`${H} 45 03 78 00 01`);
});

test('round trip: opaque-flagged text comes back as an opaque node', () => {
  const back = decode(encode(doc(el('Mime', [text('hé')])), table), table);
  assert.deepEqual(back.children[0].children, [opaque(0x68, 0xc3, 0xa9)]);
});

test('round trip: a STR_I in an opaque-listed element is re-encoded as OPAQUE', () => {
  const d = decode(hex`${H} 46 03 41 00 01`, table);
  assert.deepEqual(encode(d, table), hex`${H} 46 C3 01 41 01`);
});

const encodeErrors = [
  { name: 'lone surrogate in opaque-flagged text', document: doc(el('Mime', [text('\uD800')])), expect: { code: 'MALFORMED_TEXT', path: 'A:Mime[0]' } },
  { name: 'U+0000 in opaque-flagged text', document: doc(el('Mime', [text('a\u0000')])), expect: { code: 'UNREPRESENTABLE_CHARACTER', path: 'A:Mime[0]' } },
];
for (const { name, document, expect } of encodeErrors) {
  test(`encode ${name}`, () => assertWbxmlError(() => encode(document, table), expect));
}

test('encode: an opaque node whose value is not a Uint8Array is a TypeError', () => {
  assert.throws(() => encode(doc(el('Sync', [{ type: 'opaque', value: 'abc' }])), table), TypeError);
});

const brokenOpaque = [
  ['a name missing from its code page', { 0: { namespace: 'A', tags: { 5: 'Sync' }, opaque: ['Nope'] } }],
  ['a name that is only on another code page', { 0: { namespace: 'A', tags: { 5: 'Sync' }, opaque: ['Other'] }, 1: { namespace: 'A', tags: { 5: 'Other' } } }],
  ['not an array', { 0: { namespace: 'A', tags: { 5: 'Sync' }, opaque: 'Sync' } }],
  ['a non-string entry', { 0: { namespace: 'A', tags: { 5: 'Sync' }, opaque: [5] } }],
];
for (const [name, tagPages] of brokenOpaque) {
  test(`table check: opaque list with ${name} is a TypeError`, () => {
    assert.throws(() => decode(hex`${H} 05`, { tagPages }), TypeError);
    assert.throws(() => encode(null, { tagPages }), TypeError);
  });
}
