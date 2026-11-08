// Ticket 22: conformance sweep. Spec: Testing Decisions -> Vectors, Grammar matrix, Per token, Error-code coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

const text = (value) => ({ type: 'text', value });
const el = (namespace, name, children = [], attributes = []) => ({
  type: 'element', namespace, name, attributes, children,
});
const doc = (children, header = {}) => ({
  type: 'document', version: '1.3', publicId: 1, charset: 106, ...header, children,
});

// --- WAP-192 §8.1: the simple example (US-ASCII, WBXML 1.1, &nbsp; as ENTITY) ---

const simple = { tagPages: { 0: { tags: { 5: 'BR', 6: 'CARD', 7: 'XYZ' } } } };
const simpleBytes = hex`
  01 01 03 00         // version 1.1, public id 1, US-ASCII, no string table
  47                  // XYZ, content
  46                  // CARD, content
  03 20 58 20 26 20 59 00   // STR_I " X & Y"
  05                  // BR
  03 20 58 00         // STR_I " X"
  02 81 20            // ENTITY 160 (&nbsp;)
  03 3D 00            // STR_I "="
  02 81 20            // ENTITY 160
  03 31 20 00         // STR_I "1 "
  01 01               // END CARD, END XYZ`;
const simpleDocument = doc(
  [el(null, 'XYZ', [el(null, 'CARD', [text(' X & Y'), el(null, 'BR'), text(' X = 1 ')])])],
  { version: '1.1', charset: 3 },
);

test('WAP-192 §8.1 decodes: STR_I runs and ENTITY merge into one text node', () => {
  assert.deepEqual(decode(simpleBytes, simple), simpleDocument);
});

test('WAP-192 §8.1 encodes back to the same bytes (US-ASCII turns U+00A0 into ENTITY)', () => {
  assert.deepEqual(encode(simpleDocument, simple), simpleBytes);
});

// --- Grammar matrix: decoder state x global-token byte, from the 1.3 BNF ---
//
//   body      = pi* element pi*
//   element   = stag [1*attribute END] [*content END]
//   attribute = attrStart *attrValue   (attrValue: value token | string | extension | ENTITY | OPAQUE)
//   content   = element | string | extension | ENTITY | pi | OPAQUE
//   pi        = PI attrStart *attrValue END
//
// Header 03 01 6A 02 78 00 has a 2-byte string table ("x"), so STR_T 00 and
// LITERAL index 00 resolve. Tag page 0 (namespace A): 05 Sync. Attribute page
// 0: start 05 "a". `ok` cells carry the bytes that complete a valid document.
// Error cells are the token plus a valid operand, so the grammar error is the
// first failure, at offset 6 + prefix length.

const matrixTable = {
  tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync' } } },
  attributePages: { 0: { starts: { 5: { name: 'a' } }, values: { 0x85: 'v' } } },
};
const HEADER = '03 01 6A 02 78 00';
const UNEXP = 'UNEXPECTED_TOKEN';
const TRAIL = 'TRAILING_BYTES';

// token byte -> cells for [prolog, element content, attribute list, attribute value, after the root]
const matrix = {
  // SWITCH_PAGE is accepted wherever a token is read
  '00 SWITCH_PAGE': [['00 00 05', 'ok'], ['00 00 01', 'ok'], ['00 00 05 01', 'ok'], ['00 00 01', 'ok'], ['00 00', TRAIL]],
  '01 END': [['01 05', UNEXP], ['01', 'ok'], ['01', UNEXP], ['01', 'ok'], ['01', TRAIL]],
  '02 ENTITY': [['02 41 05', UNEXP], ['02 41 01', 'ok'], ['02 41', UNEXP], ['02 41 01', 'ok'], ['02 41', TRAIL]],
  '03 STR_I': [['03 41 00 05', UNEXP], ['03 41 00 01', 'ok'], ['03 41 00', UNEXP], ['03 41 00 01', 'ok'], ['03 41 00', TRAIL]],
  // in an attribute list or value, LITERAL is an attribute start
  '04 LITERAL': [['04 00', 'ok'], ['04 00 01', 'ok'], ['04 00 01', 'ok'], ['04 00 01', 'ok'], ['04 00', TRAIL]],
  '40 EXT_I_0': [['40 41 00 05', UNEXP], ['40 41 00 01', 'ok'], ['40 41 00', UNEXP], ['40 41 00 01', 'ok'], ['40 41 00', TRAIL]],
  '41 EXT_I_1': [['41 41 00 05', UNEXP], ['41 41 00 01', 'ok'], ['41 41 00', UNEXP], ['41 41 00 01', 'ok'], ['41 41 00', TRAIL]],
  '42 EXT_I_2': [['42 41 00 05', UNEXP], ['42 41 00 01', 'ok'], ['42 41 00', UNEXP], ['42 41 00 01', 'ok'], ['42 41 00', TRAIL]],
  // a PI is allowed beside the root and in content, never in an attribute list
  '43 PI': [['43 05 01 05', 'ok'], ['43 05 01 01', 'ok'], ['43 05 01', UNEXP], ['43 05 01', UNEXP], ['43 05 01', 'ok']],
  '44 LITERAL_C': [['44 00 01', 'ok'], ['44 00 01 01', 'ok'], ['44 00', UNEXP], ['44 00', UNEXP], ['44 00 01', TRAIL]],
  '80 EXT_T_0': [['80 00 05', UNEXP], ['80 00 01', 'ok'], ['80 00', UNEXP], ['80 00 01', 'ok'], ['80 00', TRAIL]],
  '81 EXT_T_1': [['81 00 05', UNEXP], ['81 00 01', 'ok'], ['81 00', UNEXP], ['81 00 01', 'ok'], ['81 00', TRAIL]],
  '82 EXT_T_2': [['82 00 05', UNEXP], ['82 00 01', 'ok'], ['82 00', UNEXP], ['82 00 01', 'ok'], ['82 00', TRAIL]],
  '83 STR_T': [['83 00 05', UNEXP], ['83 00 01', 'ok'], ['83 00', UNEXP], ['83 00 01', 'ok'], ['83 00', TRAIL]],
  '84 LITERAL_A': [['84 00 05 01', 'ok'], ['84 00 05 01 01', 'ok'], ['84 00', UNEXP], ['84 00', UNEXP], ['84 00 05 01', TRAIL]],
  'C0 EXT_0': [['C0 05', UNEXP], ['C0 01', 'ok'], ['C0', UNEXP], ['C0 01', 'ok'], ['C0', TRAIL]],
  'C1 EXT_1': [['C1 05', UNEXP], ['C1 01', 'ok'], ['C1', UNEXP], ['C1 01', 'ok'], ['C1', TRAIL]],
  'C2 EXT_2': [['C2 05', UNEXP], ['C2 01', 'ok'], ['C2', UNEXP], ['C2 01', 'ok'], ['C2', TRAIL]],
  'C3 OPAQUE': [['C3 01 41 05', UNEXP], ['C3 01 41 01', 'ok'], ['C3 01 41', UNEXP], ['C3 01 41 01', 'ok'], ['C3 01 41', TRAIL]],
  'C4 LITERAL_AC': [['C4 00 05 01 01', 'ok'], ['C4 00 05 01 01 01', 'ok'], ['C4 00', UNEXP], ['C4 00', UNEXP], ['C4 00 05 01 01', TRAIL]],
};
// Prefix per state: nothing; Sync(content); Sync(attrs); Sync(attrs) start "a"; a whole Sync.
const states = [
  { name: 'prolog', prefix: '', path: '' },
  { name: 'element content', prefix: '45', path: 'A:Sync[0]' },
  { name: 'attribute list', prefix: '85', path: 'A:Sync[0]' },
  { name: 'attribute value', prefix: '85 05', path: 'A:Sync[0]' },
  { name: 'after the root', prefix: '05', path: '' },
];

for (const [token, cells] of Object.entries(matrix)) {
  states.forEach((state, column) => {
    const [tail, expected] = cells[column];
    test(`grammar matrix: ${token} in ${state.name} -> ${expected}`, () => {
      const prefix = hex`${state.prefix}`;
      const bytes = hex`${HEADER} ${state.prefix} ${tail}`;
      if (expected === 'ok') {
        assert.ok(decode(bytes, matrixTable));
      } else {
        assertWbxmlError(() => decode(bytes, matrixTable), {
          code: expected, offset: 6 + prefix.length, path: state.path,
        });
      }
    });
  });
}

test('grammar matrix: C5 01 (an attribute list holding no attribute) is UNEXPECTED_TOKEN', () => {
  assertWbxmlError(() => decode(hex`${HEADER} C5 01`, matrixTable), { code: UNEXP, offset: 7, path: 'A:Sync[0]' });
});

// --- Per token: a byte-exact decode vector for every global token, and an
// encode vector wherever the encoder emits it (never END alone, STR_T) ---

const tokenTable = {
  publicId: 1,
  tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync' } }, 1: { namespace: 'B', tags: { 5: 'Name' } } },
  attributePages: { 0: { starts: { 5: { name: 'a' } } } },
};
const H0 = '03 01 6A 00'; // empty string table
const H1 = '03 01 6A 02 6E 00'; // string table "n"
const ext = (index, value) => ({ type: 'extension', index, ...(value === undefined ? {} : { value }) });
const sync = (children) => doc([el('A', 'Sync', children)]);
const attributeA = [{ name: 'a', value: [] }];
const tokenVectors = [
  { token: '00 SWITCH_PAGE', bytes: hex`${H0} 00 01 05`, document: doc([el('B', 'Name')]), encodes: true },
  { token: '01 END', bytes: hex`${H0} 45 01`, document: sync([]), encodes: false },
  {
    token: '02 ENTITY',
    bytes: hex`01 01 03 00 46 03 61 00 02 81 20 03 62 00 01`,
    table: { tagPages: { 0: { tags: { 6: 'Item' } } } },
    document: doc([el(null, 'Item', [text('a b')])], { version: '1.1', charset: 3 }),
    encodes: true,
  },
  { token: '03 STR_I', bytes: hex`${H0} 45 03 68 69 00 01`, document: sync([text('hi')]), encodes: true },
  { token: '04 LITERAL', bytes: hex`${H1} 04 00`, document: doc([el('A', 'n')]), encodes: true },
  { token: '40 EXT_I_0', bytes: hex`${H0} 45 40 78 00 01`, document: sync([ext(0, 'x')]), encodes: true },
  { token: '41 EXT_I_1', bytes: hex`${H0} 45 41 78 00 01`, document: sync([ext(1, 'x')]), encodes: true },
  { token: '42 EXT_I_2', bytes: hex`${H0} 45 42 78 00 01`, document: sync([ext(2, 'x')]), encodes: true },
  {
    token: '43 PI',
    bytes: hex`${H0} 43 05 03 78 00 01 05`,
    document: doc([{ type: 'instruction', name: 'a', value: [text('x')] }, el('A', 'Sync')]),
    encodes: true,
  },
  { token: '44 LITERAL_C', bytes: hex`${H1} 44 00 03 78 00 01`, document: doc([el('A', 'n', [text('x')])]), encodes: true },
  { token: '80 EXT_T_0', bytes: hex`${H0} 45 80 07 01`, document: sync([ext(0, 7)]), encodes: true },
  { token: '81 EXT_T_1', bytes: hex`${H0} 45 81 07 01`, document: sync([ext(1, 7)]), encodes: true },
  { token: '82 EXT_T_2', bytes: hex`${H0} 45 82 07 01`, document: sync([ext(2, 7)]), encodes: true },
  { token: '83 STR_T', bytes: hex`03 01 6A 03 68 69 00 45 83 00 01`, document: sync([text('hi')]), encodes: false },
  { token: '84 LITERAL_A', bytes: hex`${H1} 84 00 05 01`, document: doc([el('A', 'n', [], attributeA)]), encodes: true },
  { token: 'C0 EXT_0', bytes: hex`${H0} 45 C0 01`, document: sync([ext(0)]), encodes: true },
  { token: 'C1 EXT_1', bytes: hex`${H0} 45 C1 01`, document: sync([ext(1)]), encodes: true },
  { token: 'C2 EXT_2', bytes: hex`${H0} 45 C2 01`, document: sync([ext(2)]), encodes: true },
  {
    token: 'C3 OPAQUE',
    bytes: hex`${H0} 45 C3 02 AB CD 01`,
    document: sync([{ type: 'opaque', value: Uint8Array.of(0xAB, 0xCD) }]),
    encodes: true,
  },
  {
    token: 'C4 LITERAL_AC',
    bytes: hex`${H1} C4 00 05 01 03 78 00 01`,
    document: doc([el('A', 'n', [text('x')], attributeA)]),
    encodes: true,
  },
];

for (const v of tokenVectors) {
  const table = v.table ?? tokenTable;
  test(`per token: ${v.token} decodes byte-exact`, () => {
    assert.deepEqual(decode(v.bytes, table), v.document);
  });
  if (v.encodes) {
    test(`per token: ${v.token} encodes byte-exact`, () => {
      assert.deepEqual(encode(v.document, table), v.bytes);
    });
  }
}

// --- Version 1.1 and 1.2 headers are read with the 1.3 grammar (spec: Decode rules) ---

test('a 0x01 document accepts SWITCH_PAGE, OPAQUE in an attribute value and LITERAL_C', () => {
  const bytes = hex`
    01 01 6A 02 6E 00   // WBXML 1.1, string table "n"
    C5 00 00 05         // Sync with attributes and content, SWITCH_PAGE to page 0, start "a"
    C3 01 41            // OPAQUE value in an attribute
    01                  // END of the attribute list
    44 00 01            // LITERAL_C "n", empty
    01                  // END Sync`;
  const result = decode(bytes, tokenTable);
  assert.equal(result.version, '1.1');
  assert.deepEqual(result.children[0].attributes, [{ name: 'a', value: [{ type: 'opaque', value: Uint8Array.of(0x41) }] }]);
  assert.deepEqual(result.children[0].children, [el('A', 'n')]);
});

// --- Error-code coverage: all 15 codes, each produced by at least one decode or encode case ---

const CODES = [
  'TRUNCATED', 'NO_ROOT', 'TRAILING_BYTES', 'UNEXPECTED_TOKEN', 'UNKNOWN_TOKEN',
  'LITERAL_NOT_ALLOWED', 'BAD_INTEGER', 'BAD_STRING_REFERENCE', 'BAD_ENTITY', 'MALFORMED_TEXT',
  'UNSUPPORTED_VERSION', 'UNSUPPORTED_CHARSET', 'UNKNOWN_NAME', 'UNREPRESENTABLE_CHARACTER',
  'UNREPRESENTABLE_EXTENSION',
];
const strictTable = { ...tokenTable, literals: false };
const offsetTable = { ...tokenTable, extTStringOffsets: true };
const badName = doc([el('A', 'Nope')]);
const produce = {
  TRUNCATED: () => decode(hex`${H0} 45`, tokenTable),
  NO_ROOT: () => decode(hex`${H0}`, tokenTable),
  TRAILING_BYTES: () => decode(hex`${H0} 05 05`, tokenTable),
  UNEXPECTED_TOKEN: () => decode(hex`${H0} 01`, tokenTable),
  UNKNOWN_TOKEN: () => decode(hex`${H0} 3F`, tokenTable),
  LITERAL_NOT_ALLOWED: () => decode(hex`${H1} 04 00`, strictTable),
  BAD_INTEGER: () => decode(hex`03 80 80 80 80 80 00 6A 00 05`, tokenTable),
  BAD_STRING_REFERENCE: () => decode(hex`${H0} 45 83 00 01`, tokenTable),
  BAD_ENTITY: () => decode(hex`${H0} 45 02 00 01`, tokenTable),
  MALFORMED_TEXT: () => decode(hex`${H0} 45 03 FF 00 01`, tokenTable),
  UNSUPPORTED_VERSION: () => decode(hex`00 01 6A 00 05`, tokenTable),
  UNSUPPORTED_CHARSET: () => decode(hex`03 01 02 00 05`, tokenTable),
  UNKNOWN_NAME: () => encode(badName, strictTable),
  UNREPRESENTABLE_CHARACTER: () => encode(sync([text('a\u0000')]), tokenTable),
  UNREPRESENTABLE_EXTENSION: () => encode(sync([ext(0, 5)]), offsetTable),
};

// Where each case fails: `offset` for decode, `path` always.
const where = {
  TRUNCATED: { offset: 5, path: 'A:Sync[0]' },
  NO_ROOT: { offset: 4, path: '' },
  TRAILING_BYTES: { offset: 5, path: '' },
  UNEXPECTED_TOKEN: { offset: 4, path: '' },
  UNKNOWN_TOKEN: { offset: 4, path: '' },
  LITERAL_NOT_ALLOWED: { offset: 6, path: '' },
  BAD_INTEGER: { offset: 1, path: '' },
  BAD_STRING_REFERENCE: { offset: 5, path: 'A:Sync[0]' },
  BAD_ENTITY: { offset: 5, path: 'A:Sync[0]' },
  MALFORMED_TEXT: { offset: 5, path: 'A:Sync[0]' },
  UNSUPPORTED_VERSION: { offset: 0, path: '' },
  UNSUPPORTED_CHARSET: { offset: 2, path: '' },
  UNKNOWN_NAME: { path: 'A:Nope[0]' },
  UNREPRESENTABLE_CHARACTER: { path: 'A:Sync[0]' },
  UNREPRESENTABLE_EXTENSION: { path: 'A:Sync[0]' },
};
test('error codes: the list matches WbxmlErrorCode in lib/index.d.ts', () => {
  const source = readFileSync(new URL('../lib/index.d.ts', import.meta.url), 'utf8');
  const union = source.match(/type WbxmlErrorCode =([^;]*);/)[1];
  assert.deepEqual([...union.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]), CODES);
});

test('error codes: every code is produced by at least one case, and each case produces its own code', () => {
  assert.deepEqual(Object.keys(produce), CODES);
  for (const code of CODES) assertWbxmlError(produce[code], { code, ...where[code] });
});
