import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

// Tag 5 'A'; attribute starts 5 't', 6 'u'="p:", 7 'v'; values 0x85 '.org'.
const table = {
  publicId: 1,
  tagPages: { 0: { tags: { 5: 'A' } } },
  attributePages: {
    0: {
      starts: { 5: { name: 't' }, 6: { name: 'u', prefix: 'p:' }, 7: { name: 'v' } },
      values: { 0x85: '.org' },
    },
  },
};
const H = '03 01 6A 00';
const HL = '03 01 6A 03 70 69 00'; // string table "pi" at 0

const text = (value) => ({ type: 'text', value });
const ext = (index, value) => (value === undefined ? { type: 'extension', index } : { type: 'extension', index, value });
const pi = (name, ...value) => ({ type: 'instruction', name, value: value.map((v) => (typeof v === 'string' ? text(v) : v)) });
const root = (attributes = [], children = []) => ({ type: 'element', namespace: null, name: 'A', attributes, children });
const document = (...children) => ({
  type: 'document', version: '1.3', publicId: 1, charset: 106, children,
});

test('decode: PIs before and after the root', () => {
  const bytes = hex`${H}
    43 05 03 78 00 01     // PI t="x"
    05                    // root A
    43 06 85 01           // PI u="p:" + ".org"
    43 07 01              // PI v with an empty value`;
  assert.deepEqual(decode(bytes, table), document(pi('t', 'x'), root(), pi('u', 'p:.org'), pi('v')));
});

test('decode: PIs inside element content keep wire order among siblings', () => {
  const bytes = hex`${H} 45
    03 61 00
    43 05 03 78 00 01
    03 62 00
    01`;
  assert.deepEqual(decode(bytes, table).children[0].children, [text('a'), pi('t', 'x'), text('b')]);
});

test('decode: a LITERAL PI target comes from the string table', () => {
  assert.deepEqual(
    decode(hex`${HL} 43 04 00 03 76 00 01 05`, table),
    document(pi('pi', 'v'), root()),
  );
});

test('decode: a PI with no target is UNEXPECTED_TOKEN', () => {
  assertWbxmlError(() => decode(hex`${H} 43 01 05`, table), { code: 'UNEXPECTED_TOKEN', offset: 5, path: '' });
  assertWbxmlError(() => decode(hex`${H} 45 43 01 01`, table), { code: 'UNEXPECTED_TOKEN', offset: 6, path: 'A[0]' });
  assertWbxmlError(() => decode(hex`${H} 43 03 78 00 01 05`, table), { code: 'UNEXPECTED_TOKEN', offset: 5, path: '' });
});

test('decode: a PI holds one target', () => {
  assertWbxmlError(() => decode(hex`${H} 43 05 07 01 05`, table), { code: 'UNEXPECTED_TOKEN', offset: 6, path: '' });
});

test('decode: only PIs is NO_ROOT, and a PI cannot sit in an attribute list', () => {
  assertWbxmlError(() => decode(hex`${H} 43 05 01`, table), { code: 'NO_ROOT', offset: 7, path: '' });
  assertWbxmlError(() => decode(hex`${H} C5 05 43 05 01 01 01`, table), { code: 'UNEXPECTED_TOKEN', offset: 6, path: 'A[0]' });
});

test('decode: anything but a PI after the root is TRAILING_BYTES', () => {
  assertWbxmlError(() => decode(hex`${H} 05 43 05 01 05`, table), { code: 'TRAILING_BYTES', offset: 8, path: '' });
});

test('decode: an unterminated PI is TRUNCATED', () => {
  assertWbxmlError(() => decode(hex`${H} 05 43 05 03 78 00`, table), { code: 'TRUNCATED', offset: 10, path: '' });
});

test('decode: ENTITY and extension parts in attribute and PI values', () => {
  const bytes = hex`${H}
    43 05 03 61 00 02 81 69 C0 40 78 00 80 07 01   // PI t = "a" ENTITY 233 EXT_0 EXT_I_0 "x" EXT_T_0 7
    C5 05 02 41 01 01`;
  const d = decode(bytes, table);
  assert.deepEqual(d.children[0], pi('t', 'aé', ext(0), ext(0, 'x'), ext(0, 7)));
  assert.deepEqual(d.children[1].attributes, [{ name: 't', value: [text('A')] }]);
});

test('decode: bad ENTITY and truncated extension in an attribute value', () => {
  assertWbxmlError(() => decode(hex`${H} C5 05 02 00 01`, table), { code: 'BAD_ENTITY', offset: 6, path: 'A[0]' });
  assertWbxmlError(() => decode(hex`${H} C5 05 41 78`, table), { code: 'TRUNCATED', offset: 6, path: 'A[0]' });
});

test('decode: an ENTITY or extension before any attribute start is UNEXPECTED_TOKEN', () => {
  assertWbxmlError(() => decode(hex`${H} C5 02 41 01`, table), { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' });
  assertWbxmlError(() => decode(hex`${H} C5 C0 01`, table), { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' });
});

const attr = (name, ...value) => ({ name, value: value.map((v) => (typeof v === 'string' ? text(v) : v)) });
const A3 = '03 01 03 00'; // US-ASCII
const A4 = '03 01 04 00'; // ISO-8859-1
const doc3 = (charset, ...children) => ({ ...document(...children), charset });

test('encode: PIs before and after the root, as the same bytes decode reads', () => {
  const bytes = hex`${H} 43 05 03 78 00 01 05 43 06 85 01 43 07 01`;
  const d = document(pi('t', 'x'), root(), pi('u', 'p:.org'), pi('v'));
  assert.deepEqual(encode(d, table), bytes);
  assert.deepEqual(encode(decode(bytes, table), table), bytes);
});

test('encode: a PI inside element content', () => {
  const d = document(root([], [text('a'), pi('t', 'x'), text('b')]));
  assert.deepEqual(encode(d, table), hex`${H} 45 03 61 00 43 05 03 78 00 01 03 62 00 01`);
});

test('encode: a PI target the table lacks is a LITERAL, or UNKNOWN_NAME under literals: false', () => {
  assert.deepEqual(
    encode(document(pi('zz', 'v'), root()), table),
    hex`03 01 6A 03 7A 7A 00 43 04 00 03 76 00 01 05`,
  );
  assertWbxmlError(() => encode(document(root([], [pi('zz')])), { ...table, literals: false }), { code: 'UNKNOWN_NAME', path: 'A[0]' });
});

test('encode: extension parts in a PI and an attribute value', () => {
  assert.deepEqual(
    encode(document(pi('t', 'a', ext(0), ext(1, 'x'), ext(2, 7)), root()), table),
    hex`${H} 43 05 03 61 00 C0 41 78 00 82 07 01 05`,
  );
  assert.deepEqual(encode(document(root([attr('t', ext(0, 'x'))])), table), hex`${H} 85 05 40 78 00 01`);
});

test('encode: a value that begins with an extension only matches a start with no prefix', () => {
  const t = {
    tagPages: { 0: { tags: { 5: 'A' } } },
    attributePages: { 0: { starts: { 5: { name: 'w', prefix: 'p:' }, 6: { name: 'w' } } } },
  };
  assert.deepEqual(encode(document(root([attr('w', ext(0))])), t), hex`03 01 6A 00 85 06 C0 01`);
  assert.deepEqual(encode(document(root([attr('w', 'p:', ext(0))])), t), hex`03 01 6A 00 85 05 C0 01`);
  // Only a prefixed start exists: the extension-first value falls back to a LITERAL.
  assert.deepEqual(
    encode(document(root([attr('u', ext(0))])), table),
    hex`03 01 6A 02 75 00 85 04 00 C0 01`,
  );
  assertWbxmlError(() => encode(document(root([attr('u', ext(0))])), { ...table, literals: false }), { code: 'UNKNOWN_NAME', path: 'A[0]' });
});

test('encode: a bad extension in a value', () => {
  assertWbxmlError(() => encode(document(root([attr('t', ext(0, 2 ** 32))])), table), { code: 'BAD_INTEGER', path: 'A[0]' });
  assertWbxmlError(() => encode(document(pi('t', ext(1, 5)), root()), { ...table, extTStringOffsets: true }), { code: 'UNREPRESENTABLE_EXTENSION', path: '' });
  assert.throws(() => encode(document(root([attr('t', ext(3))])), table), TypeError);
  assert.throws(() => encode(document(pi('t', ext(0, true)), root()), table), TypeError);
  assert.throws(() => encode(document({ type: 'instruction', name: 't', value: 'x' }, root()), table), TypeError);
});

test('charset 4: attribute and PI values write ENTITY for what ISO-8859-1 cannot hold', () => {
  const bytes = hex`${A4} 85 05 03 E9 00 02 82 00 03 62 00 01`;
  assert.deepEqual(encode(doc3(4, root([attr('t', 'éĀb')])), table), bytes);
  assert.deepEqual(decode(bytes, table).children[0].attributes, [attr('t', 'éĀb')]);
  assert.deepEqual(encode(doc3(4, pi('t', 'Ā'), root()), table), hex`${A4} 43 05 02 82 00 01 05`);
});

test('charset 3: ENTITY in attribute values, PI values and around extensions', () => {
  const bytes = hex`${A3} 43 05 02 81 69 C0 03 7A 00 01 85 05 03 61 00 02 81 69 01`;
  const d = doc3(3, pi('t', 'é', ext(0), 'z'), root([attr('t', 'aé')]));
  assert.deepEqual(encode(d, table), bytes);
  assert.deepEqual(decode(bytes, table), d);
  assert.deepEqual(encode(decode(bytes, table), table), bytes);
});

test('charset 3: a LITERAL attribute name, a PI target or an EXT_I string it cannot hold is UNREPRESENTABLE_CHARACTER', () => {
  const fails = (d, path) => assertWbxmlError(() => encode(d, table), { code: 'UNREPRESENTABLE_CHARACTER', path });
  fails(doc3(3, root([attr('é')])), 'A[0]');
  fails(doc3(3, pi('é'), root()), '');
  fails(doc3(3, root([], [pi('é')])), 'A[0]');
  fails(doc3(3, root([attr('t', ext(0, 'é'))])), 'A[0]');
  fails(doc3(3, pi('t', ext(0, 'é')), root()), '');
  // The same characters are fine in UTF-8.
  assert.doesNotThrow(() => encode(document(pi('é', ext(0, 'é')), root([attr('é')])), table));
});
