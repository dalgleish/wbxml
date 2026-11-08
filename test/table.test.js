import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex } from './helpers.js';

const bytes = hex`03 01 6A 00 05`;
const doc = { type: 'document', children: [{ type: 'element', namespace: 'A', name: 'Sync', children: [] }] };

const brokenTables = [
  ['tagPages missing', {}],
  ['not an object', 'activesync'],
  ['null', null],
  ['tag token below 0x05', { tagPages: { 0: { namespace: 'A', tags: { 4: 'X' } } } }],
  ['tag token above 0x3F', { tagPages: { 0: { namespace: 'A', tags: { 64: 'X' } } } }],
  ['tag token not a number', { tagPages: { 0: { namespace: 'A', tags: { x: 'X' } } } }],
  ['code page above 255', { tagPages: { 256: { namespace: 'A', tags: { 5: 'X' } } } }],
  ['code page not a number', { tagPages: { z: { namespace: 'A', tags: { 5: 'X' } } } }],
  ['a tag name that is not a string', { tagPages: { 0: { namespace: 'A', tags: { 5: 7 } } } }],
  ['a duplicate (namespace, name) across pages', {
    tagPages: { 0: { namespace: 'A', tags: { 5: 'X' } }, 1: { namespace: 'A', tags: { 5: 'X' } } },
  }],
  ['a duplicate name on one page', { tagPages: { 0: { namespace: 'A', tags: { 5: 'X', 6: 'X' } } } }],
];

for (const [name, table] of brokenTables) {
  test(`table check: ${name} is a TypeError in decode and encode`, () => {
    assert.throws(() => decode(bytes, table), TypeError);
    assert.throws(() => encode(doc, table), TypeError);
    assert.throws(() => decode(new Uint8Array(0), table), TypeError);
  });
}

test('table check: the same name in different namespaces, and page numbers as keys, are fine', () => {
  const table = { tagPages: { 0: { namespace: 'A', tags: { 5: 'X' } }, 1: { namespace: 'B', tags: { 5: 'X' } }, 2: { tags: { 5: 'X' } } } };
  assert.equal(decode(bytes, table).children[0].namespace, 'A');
});

test('table check: a frozen table works', () => {
  const table = Object.freeze({ tagPages: Object.freeze({ 0: Object.freeze({ namespace: 'A', tags: Object.freeze({ 5: 'Sync' }) }) }) });
  assert.deepEqual(encode(decode(bytes, table), table), bytes);
});

test('table: a namespace-less code page gives namespace null', () => {
  const table = { tagPages: { 0: { tags: { 5: 'Sync' } } } };
  const d = decode(bytes, table);
  assert.equal(d.children[0].namespace, null);
  assert.deepEqual(encode(d, table), bytes);
});
