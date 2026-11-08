import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from 'wbxml';
import { hex, assertWbxmlError } from './helpers.js';

// WAP-192 §8.2 code pages as an inline table (tags 5-8, attribute starts 5-A, values 85-86).
const wap = {
  tagPages: { 0: { tags: { 5: 'CARD', 6: 'INPUT', 7: 'XYZ', 8: 'DO' } } },
  attributePages: {
    0: {
      starts: {
        5: { name: 'STYLE', prefix: 'LIST' },
        6: { name: 'TYPE' },
        7: { name: 'TYPE', prefix: 'TEXT' },
        8: { name: 'URL', prefix: 'http://' },
        9: { name: 'NAME' },
        10: { name: 'KEY' },
      },
      values: { 0x85: '.org', 0x86: 'ACCEPT' },
    },
  },
};

const el = (name, attributes = [], children = [], namespace = null) => ({
  type: 'element', namespace, name, attributes, children,
});
const text = (value) => ({ type: 'text', value });
const opaque = (...bytes) => ({ type: 'opaque', value: Uint8Array.from(bytes) });
const attr = (name, ...value) => ({ name, value: value.map((v) => (typeof v === 'string' ? text(v) : v)) });
const document = (...children) => ({
  type: 'document', version: '1.3', publicId: 1, charset: 106, children,
});
const H = '03 01 6A 00';

const wap82Document = document(el('XYZ', [], [
  el('CARD', [attr('NAME', 'abc'), attr('STYLE', 'LIST')], [
    el('DO', [attr('TYPE', 'ACCEPT'), attr('URL', 'http://xyz.org/s')]),
    text(' Enter name: '),
    el('INPUT', [attr('TYPE', 'TEXT'), attr('KEY', 'N')]),
  ]),
]));

test('WAP-192 §8.2 decodes: start prefixes, value tokens, STR_T and STR_I parts, END of the attribute list', () => {
  const bytes = hex`
    03 01 6A 12                       // 1.3, unknown public id, UTF-8, string table length 18
    61 62 63 00 20 45 6E 74 65 72 20 6E 61 6D 65 3A 20 00   // "abc\0 Enter name: \0"
    47                                // XYZ, content
    C5                                // CARD, content and attributes
      09 83 00                        // NAME= STR_T 0 ("abc")
      05                              // STYLE="LIST"
      01                              // END of CARD attribute list
      88                              // DO, attributes
        06 86                         // TYPE= value token ACCEPT
        08 03 78 79 7A 00 85 03 2F 73 00   // URL="http://" + "xyz" + ".org" + "/s"
        01                            // END of DO attribute list
      83 04                           // STR_T 4 (" Enter name: ")
      86                              // INPUT, attributes
        07                            // TYPE="TEXT"
        0A 03 4E 00                   // KEY= "N"
        01                            // END of INPUT attribute list
    01                                // END CARD
    01                                // END XYZ`;
  assert.deepEqual(decode(bytes, wap), wap82Document);
});

test('WAP-192 §8.2: the decoded Document re-encodes to our own bytes (STR_I, empty string table)', () => {
  const expected = hex`
    03 01 6A 00
    47 C5
      09 03 61 62 63 00     // NAME= STR_I "abc"
      05 01                 // STYLE="LIST" (longest prefix), END
      88
        06 86               // TYPE= + ACCEPT value token
        08 03 78 79 7A 00 85 03 2F 73 00 01   // URL="http://" STR_I "xyz" .org STR_I "/s" END
      03 20 45 6E 74 65 72 20 6E 61 6D 65 3A 20 00
      86 07 0A 03 4E 00 01  // INPUT TYPE="TEXT" KEY="N"
    01 01`;
  assert.deepEqual(encode(wap82Document, wap), expected);
});

// Two attribute code pages, for prefixes, ties and page switches.
const t2 = {
  tagPages: { 0: { tags: { 5: 'A', 6: 'B' } } },
  attributePages: {
    0: {
      starts: {
        5: { name: 'href' },
        6: { name: 'href', prefix: 'http://' },
        7: { name: 'href', prefix: 'http://www.' },
        8: { name: 'tie' },
      },
      values: { 0x85: '.com', 0x86: '.com/' },
    },
    1: {
      starts: { 5: { name: 'tie' }, 6: { name: 'x' } },
      values: { 0x85: '.com', 0x87: 'www.' },
    },
  },
};
const t2Strict = { ...t2, literals: false };

const brokenAttributeTables = [
  ['attributePages not an object', { ...t2, attributePages: 'x' }],
  ['attribute code page above 255', { ...t2, attributePages: { 256: { starts: { 5: { name: 'a' } } } } }],
  ['attribute start token 0x04', { ...t2, attributePages: { 0: { starts: { 4: { name: 'a' } } } } }],
  ['attribute start token 0x40', { ...t2, attributePages: { 0: { starts: { 64: { name: 'a' } } } } }],
  ['attribute start token 0x80', { ...t2, attributePages: { 0: { starts: { 128: { name: 'a' } } } } }],
  ['attribute start without a name', { ...t2, attributePages: { 0: { starts: { 5: { prefix: 'a' } } } } }],
  ['attribute start prefix not a string', { ...t2, attributePages: { 0: { starts: { 5: { name: 'a', prefix: 1 } } } } }],
  ['attribute value token 0x84', { ...t2, attributePages: { 0: { values: { 0x84: 'a' } } } }],
  ['attribute value token 0xC4', { ...t2, attributePages: { 0: { values: { 0xc4: 'a' } } } }],
  ['attribute value token 0x45', { ...t2, attributePages: { 0: { values: { 0x45: 'a' } } } }],
  ['attribute value not a string', { ...t2, attributePages: { 0: { values: { 0x85: 5 } } } }],
  ['attribute value empty', { ...t2, attributePages: { 0: { values: { 0x85: '' } } } }],
];
for (const [name, table] of brokenAttributeTables) {
  test(`table check: ${name} is a TypeError`, () => {
    assert.throws(() => decode(hex`${H} 05`, table), TypeError);
    assert.throws(() => encode(document(el('A')), table), TypeError);
  });
}
test('table check: tokens 0x45-0x7F and 0xC5-0xFF are valid attribute starts and values', () => {
  const table = { ...t2, attributePages: { 0: { starts: { 0x45: { name: 'a' }, 0x7f: { name: 'b' } }, values: { 0xbf: 'x', 0xc5: 'y', 0xff: 'z' } } } };
  assert.deepEqual(decode(hex`${H} 85 45 C5 7F BF 01`, table), document(el('A', [attr('a', 'y'), attr('b', 'x')])));
});

const decodeVectors = [
  {
    name: '§5.8.2 attribute start with no value gives value []',
    bytes: hex`${H} 85 05 01   // A, attributes; href=; END`,
    expect: document(el('A', [{ name: 'href', value: [] }])),
  },
  {
    name: '§5.8.2 a prefix and value tokens join into one text part',
    bytes: hex`${H} 85 07 03 61 00 86 03 62 00 01   // href="http://www." "a" ".com/" "b"`,
    expect: document(el('A', [attr('href', 'http://www.a.com/b')])),
  },
  {
    name: 'attribute order is wire order; duplicates pass through',
    bytes: hex`${H} 85 08 05 03 31 00 08 01   // tie, href="1", tie`,
    expect: document(el('A', [{ name: 'tie', value: [] }, attr('href', '1'), { name: 'tie', value: [] }])),
  },
  {
    name: 'an element with attributes and content',
    bytes: hex`${H} C5 05 01 03 78 00 01   // A(content, attributes) href END "x" END`,
    expect: document(el('A', [{ name: 'href', value: [] }], [text('x')])),
  },
  {
    name: '§5.8.2 LITERAL attribute name through the string table',
    bytes: hex`03 01 6A 04 7A 7A 7A 00   // string table "zzz"
      85 04 00 03 76 00 01               // LITERAL zzz="v"`,
    expect: document(el('A', [attr('zzz', 'v')])),
  },
  {
    name: '§5.8.2 LITERAL_A element name with attributes, no content',
    bytes: hex`03 01 6A 02 5A 00  84 00 05 03 76 00 01   // LITERAL_A "Z"; href="v"; END`,
    expect: document(el('Z', [attr('href', 'v')])),
  },
  {
    name: '§5.8.2 LITERAL_AC element name with attributes and content',
    bytes: hex`03 01 6A 02 5A 00  C4 00 05 03 76 00 01 03 71 00 01   // LITERAL_AC "Z"; href="v"; "q"; END`,
    expect: document(el('Z', [attr('href', 'v')], [text('q')])),
  },
  {
    name: 'a LITERAL_A element takes the namespace of the tag code page',
    bytes: hex`03 01 6A 02 5A 00  84 00 05 01`,
    table: { ...t2, tagPages: { 0: { namespace: 'NS', tags: { 5: 'A' } } } },
    expect: document(el('Z', [{ name: 'href', value: [] }], [], 'NS')),
  },
  {
    name: '§5.8.2 OPAQUE in an attribute value, then more value parts',
    bytes: hex`${H} 85 05 C3 02 AA BB 03 63 00 86 01   // href= opaque AA BB, "c", ".com/"`,
    expect: document(el('A', [attr('href', opaque(0xaa, 0xbb), 'c.com/')])),
  },
  {
    name: 'WBXML 1.1 accepts OPAQUE in attributes and LITERAL_A (the 1.3 grammar is read for every version)',
    bytes: hex`01 01 6A 02 5A 00  84 00 05 C3 01 AA 01`,
    expect: { ...document(el('Z', [attr('href', opaque(0xaa))])), version: '1.1' },
  },
  {
    name: '§5.8.2 STR_I "" in an attribute is a text part ""',
    bytes: hex`${H} 85 05 03 00 01`,
    expect: document(el('A', [attr('href', '')])),
  },
  {
    name: 'a prefix followed by STR_I "" keeps just the prefix',
    bytes: hex`${H} 85 06 03 00 01`,
    expect: document(el('A', [attr('href', 'http://')])),
  },
  {
    name: 'the attribute code page persists across elements and ignores tag SWITCH_PAGE',
    bytes: hex`${H}
      45                  // A with content
        85 00 01 06 85 01 // child A: attr page 1, x=".com" (value 0x85 on page 1)
        00 00             // tag SWITCH_PAGE 0
        86 06 87 01       // child B, attrs: x= then value 0x87 "www." (attribute page 1 still)
      01`,
    expect: document(el('A', [], [
      el('A', [attr('x', '.com')]),
      el('B', [attr('x', 'www.')]),
    ])),
  },
];

for (const { name, bytes, table = t2, expect } of decodeVectors) {
  test(`decode: ${name}`, () => {
    assert.deepEqual(decode(bytes, table), expect);
  });
}

const decodeErrors = [
  { name: 'UNKNOWN_TOKEN: an attribute start token the page lacks', bytes: hex`${H} 85 09`, expect: { code: 'UNKNOWN_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNKNOWN_TOKEN: an attribute value token the page lacks', bytes: hex`${H} 85 05 88`, expect: { code: 'UNKNOWN_TOKEN', offset: 6, path: 'A[0]' } },
  { name: 'UNKNOWN_TOKEN: SWITCH_PAGE to a missing attribute page, then a start', bytes: hex`${H} 85 00 09 05`, expect: { code: 'UNKNOWN_TOKEN', offset: 7, path: 'A[0]' } },
  { name: 'UNKNOWN_TOKEN: path of an attribute error includes the nesting', bytes: hex`${H} 45 85 09`, expect: { code: 'UNKNOWN_TOKEN', offset: 6, path: 'A[0]/A[0]' } },
  { name: 'UNEXPECTED_TOKEN: C5 01 (a value before any start)', bytes: hex`${H} 85 C5 01`, expect: { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: an empty attribute list (END first)', bytes: hex`${H} 85 01`, expect: { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: a value token before any start', bytes: hex`${H} 85 86`, expect: { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: STR_I before any start', bytes: hex`${H} 85 03 61 00`, expect: { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: OPAQUE before any start', bytes: hex`${H} 85 C3 00`, expect: { code: 'UNEXPECTED_TOKEN', offset: 5, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: a PI in an attribute list', bytes: hex`${H} 85 05 43`, expect: { code: 'UNEXPECTED_TOKEN', offset: 6, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: LITERAL_C in an attribute list', bytes: hex`${H} 85 05 44 00`, expect: { code: 'UNEXPECTED_TOKEN', offset: 6, path: 'A[0]' } },
  { name: 'UNEXPECTED_TOKEN: LITERAL_A in an attribute list', bytes: hex`${H} 85 05 84 00`, expect: { code: 'UNEXPECTED_TOKEN', offset: 6, path: 'A[0]' } },
  { name: 'TRUNCATED: input ends inside an attribute list', bytes: hex`${H} 85 05`, expect: { code: 'TRUNCATED', offset: 6, path: 'A[0]' } },
  { name: 'TRUNCATED: OPAQUE in an attribute value runs past the end', bytes: hex`${H} 85 05 C3 05 AA`, expect: { code: 'TRUNCATED', offset: 6, path: 'A[0]' } },
  { name: 'TRUNCATED: unterminated STR_I in an attribute', bytes: hex`${H} 85 05 03 61`, expect: { code: 'TRUNCATED', offset: 6, path: 'A[0]' } },
  { name: 'BAD_STRING_REFERENCE: a LITERAL attribute name past the string table', bytes: hex`${H} 85 04 00 01`, expect: { code: 'BAD_STRING_REFERENCE', offset: 5, path: 'A[0]' } },
  { name: 'LITERAL_NOT_ALLOWED: LITERAL_A under literals: false', bytes: hex`${H} 84 00 01`, table: t2Strict, expect: { code: 'LITERAL_NOT_ALLOWED', offset: 4, path: '' } },
  { name: 'LITERAL_NOT_ALLOWED: LITERAL_AC under literals: false', bytes: hex`${H} C4 00 01`, table: t2Strict, expect: { code: 'LITERAL_NOT_ALLOWED', offset: 4, path: '' } },
  { name: 'LITERAL_NOT_ALLOWED: a LITERAL attribute name under literals: false', bytes: hex`${H} 85 04 00 01`, table: t2Strict, expect: { code: 'LITERAL_NOT_ALLOWED', offset: 5, path: 'A[0]' } },
];
for (const { name, bytes, table = t2, expect } of decodeErrors) {
  test(`decode error ${name}`, () => {
    assertWbxmlError(() => decode(bytes, table), expect);
  });
}

const encodeVectors = [
  {
    name: 'start with the longest matching prefix, then greedy longest value tokens with STR_I runs',
    doc: document(el('A', [attr('href', 'http://www.a.com/')])),
    bytes: hex`${H} 85 07 03 61 00 86 01   // prefix "http://www.", "a", ".com/" (not ".com")`,
  },
  {
    name: 'a shorter prefix when the longer one does not match',
    doc: document(el('A', [attr('href', 'http://x')])),
    bytes: hex`${H} 85 06 03 78 00 01`,
  },
  {
    name: 'prefix-less start when no prefix matches',
    doc: document(el('A', [attr('href', 'ftp://x')])),
    bytes: hex`${H} 85 05 03 66 74 70 3A 2F 2F 78 00 01`,
  },
  {
    name: 'a value that begins with an opaque part takes only a prefix-less start',
    doc: document(el('A', [attr('href', opaque(0xaa), 'http://')])),
    bytes: hex`${H} 85 05 C3 01 AA 03 68 74 74 70 3A 2F 2F 00 01`,
  },
  {
    name: 'ties go to the lowest attribute code page when none is current',
    doc: document(el('A', [attr('tie', '.com')])),
    bytes: hex`${H} 85 08 85 01   // page 0 tie, page 0 value token`,
  },
  {
    name: 'ties go to the current attribute code page',
    doc: document(el('A', [attr('x', '.com'), attr('tie', 'y.com')])),
    bytes: hex`${H} 85 00 01 06 85 05 03 79 00 85 01   // SWITCH_PAGE 1 once; x; value 85; tie on page 1; "y"; value 85 on page 1`,
  },
  {
    name: 'a value token on another page switches the attribute page; the next start switches back',
    doc: document(el('A', [attr('href', 'www.'), attr('href', 'q')])),
    bytes: hex`${H} 85 05 00 01 87 00 00 05 03 71 00 01   // href, switch to 1, www., switch back to 0, href "q"`,
  },
  {
    name: 'SWITCH_PAGE only on a change, and the attribute page carries across elements',
    doc: document(el('A', [], [el('A', [attr('x', 'a'), attr('x', 'b')]), el('B', [attr('x', 'c')])])),
    bytes: hex`${H} 45
      85 00 01 06 03 61 00 06 03 62 00 01
      86 06 03 63 00 01
    01`,
  },
  {
    name: 'an empty attribute list writes no attribute bit',
    doc: document(el('A', [], [el('B', [])])),
    bytes: hex`${H} 45 06 01`,
    skipDecode: true,
  },
  {
    name: 'a name with no start is LITERAL through the string table (literals: true)',
    doc: document(el('A', [attr('zzz', 'v'), attr('zzz', 'w')])),
    bytes: hex`03 01 6A 04 7A 7A 7A 00   // string table "zzz", once
      85 04 00 03 76 00 04 00 03 77 00 01`,
  },
  {
    name: 'LITERAL_A for an unknown element with attributes',
    doc: document(el('Z', [attr('href', 'v')])),
    bytes: hex`03 01 6A 02 5A 00  84 00 05 03 76 00 01`,
  },
  {
    name: 'LITERAL_AC for an unknown element with attributes and content',
    doc: document(el('Z', [attr('href', 'v')], [text('q')])),
    bytes: hex`03 01 6A 02 5A 00  C4 00 05 03 76 00 01 03 71 00 01`,
  },
  {
    name: 'string table order: element name, then its attribute names, then children',
    doc: document(el('Z', [attr('k', '')], [el('Y')])),
    bytes: hex`03 01 6A 06 5A 00 6B 00 59 00   // "Z" "k" "Y"
      C4 00 04 02 03 00 01   // LITERAL_AC Z; LITERAL k (offset 2); STR_I ""; END
      04 04                  // LITERAL Y
    01`,
  },
  {
    name: 'a text part "" is kept as STR_I ""',
    doc: document(el('A', [attr('href', '')])),
    bytes: hex`${H} 85 05 03 00 01`,
  },
  {
    name: 'an attribute with an empty value list is just the start',
    doc: document(el('A', [{ name: 'href', value: [] }])),
    bytes: hex`${H} 85 05 01`,
  },
  {
    name: 'adjacent text parts are written as one value',
    doc: document(el('A', [attr('href', 'http://', 'a')])),
    bytes: hex`${H} 85 06 03 61 00 01`,
    skipDecode: true,
  },
];
for (const { name, doc, bytes, skipDecode } of encodeVectors) {
  test(`encode: ${name}`, () => {
    assert.deepEqual(encode(doc, t2), bytes);
    if (!skipDecode) assert.deepEqual(encode(decode(bytes, t2), t2), bytes);
  });
}

test('encode: a name with no start is UNKNOWN_NAME under literals: false', () => {
  assertWbxmlError(() => encode(document(el('A', [attr('zzz', 'v')])), t2Strict), { code: 'UNKNOWN_NAME', path: 'A[0]' });
});
test('encode: attribute errors name the open element in the path', () => {
  assertWbxmlError(() => encode(document(el('A', [], [el('B', [attr('zzz', 'v')])])), t2Strict), { code: 'UNKNOWN_NAME', path: 'A[0]/B[0]' });
  assertWbxmlError(() => encode(document(el('A', [attr('href', 'a\u0000')])), t2), { code: 'UNREPRESENTABLE_CHARACTER', path: 'A[0]' });
  assertWbxmlError(() => encode(document(el('A', [attr('href', '\ud800')])), t2), { code: 'MALFORMED_TEXT', path: 'A[0]' });
});
test('encode: a malformed attribute is a TypeError', () => {
  assert.throws(() => encode(document(el('A', [{ name: 'href' }])), t2), TypeError);
  assert.throws(() => encode(document(el('A', [{ name: 'href', value: ['x'] }])), t2), TypeError);
  assert.throws(() => encode(document(el('A', [{ value: [] }])), t2), TypeError);
});
