// Type tests for the 'wbxml' entry point. Compiled by `npm run test:types`; never run.
import { decode, encode, WbxmlError } from 'wbxml';
import type {
  Attribute, AttributePart, Document, LanguageTable, WbxmlErrorCode,
} from 'wbxml';

const table: LanguageTable = {
  publicId: 1,
  literals: false,
  tagPages: { 0: { namespace: 'A', tags: { 5: 'Sync' } }, 1: { tags: { 5: 'X' } } },
};

const doc: Document | null = decode(new Uint8Array(0), table);
const bytes: Uint8Array = encode(doc, table);
encode(null, table);
encode({ type: 'document', version: '1.2', publicId: 3, charset: 106, children: [] }, table);
encode({ type: 'document', publicId: '-//WAPFORUM//DTD X//EN', children: [] }, { publicId: 'MX', literals: true, tagPages: {} });
encode(
  { type: 'document', children: [{ type: 'element', namespace: null, name: 'Sync', children: [{ type: 'text', value: 'x' }] }] },
  table,
);
encode(
  { type: 'document', children: [{ type: 'element', namespace: null, name: 'Mime', children: [{ type: 'opaque', value: new Uint8Array(3) }] }] },
  { tagPages: { 0: { tags: { 5: 'Mime' }, opaque: ['Mime'] } } },
);
const attributeTable: LanguageTable = {
  tagPages: { 0: { tags: { 5: 'A' } } },
  attributePages: { 0: { starts: { 5: { name: 'href', prefix: 'http://' }, 6: { name: 'x' } }, values: { 0x85: '.com' } } },
};
const part: AttributePart = { type: 'opaque', value: new Uint8Array(1) };
const attribute: Attribute = { name: 'href', value: [{ type: 'text', value: 'http://a.com' }, part] };
encode(
  { type: 'document', children: [{ type: 'element', namespace: null, name: 'A', attributes: [attribute], children: [] }] },
  attributeTable,
);
encode(
  { type: 'document', children: [{ type: 'element', namespace: null, name: 'Sync', children: [{ type: 'extension', index: 0 }, { type: 'extension', index: 1, value: 'x' }, { type: 'extension', index: 2, value: 5 }] }] },
  { extTStringOffsets: true, tagPages: { 0: { tags: { 5: 'Sync' } } } },
);
encode(
  {
    type: 'document',
    children: [
      { type: 'instruction', name: 'x', value: [{ type: 'text', value: 'a' }, { type: 'extension', index: 0, value: 'b' }] },
      { type: 'element', namespace: null, name: 'A', attributes: [{ name: 'x', value: [{ type: 'extension', index: 1 }] }], children: [{ type: 'instruction', name: 'x', value: [] }] },
    ],
  },
  attributeTable,
);
void bytes;

// @ts-expect-error a non-Uint8Array input
decode(new ArrayBuffer(4), table);
// @ts-expect-error an opaque value is bytes, not a string
encode({ type: 'document', children: [{ type: 'element', namespace: null, name: 'X', children: [{ type: 'opaque', value: 'abc' }] }] }, table);
// @ts-expect-error an extension index is 0, 1 or 2
encode({ type: 'document', children: [{ type: 'element', namespace: null, name: 'X', children: [{ type: 'extension', index: 3 }] }] }, table);
// @ts-expect-error an extension value is a string or a number
encode({ type: 'document', children: [{ type: 'element', namespace: null, name: 'X', children: [{ type: 'extension', index: 0, value: true }] }] }, table);
// @ts-expect-error a PI value is an array of parts
encode({ type: 'document', children: [{ type: 'instruction', name: 'x', value: 'a' }] }, table);
// @ts-expect-error a wrong node type
encode({ type: 'document', children: [{ type: 'banana' }] }, table);
// @ts-expect-error WBXML 1.0 is not a supported version
encode({ type: 'document', version: '1.0', children: [] }, table);
// @ts-expect-error the table is required
decode(new Uint8Array(0));

// WbxmlErrorCode is a union: this switch is exhaustive over all 15 codes.
function describeCode(code: WbxmlErrorCode): number {
  switch (code) {
    case 'TRUNCATED':
    case 'NO_ROOT':
    case 'TRAILING_BYTES':
    case 'UNEXPECTED_TOKEN':
    case 'UNKNOWN_TOKEN':
    case 'LITERAL_NOT_ALLOWED':
    case 'BAD_INTEGER':
    case 'BAD_STRING_REFERENCE':
    case 'BAD_ENTITY':
    case 'MALFORMED_TEXT':
    case 'UNSUPPORTED_VERSION':
    case 'UNSUPPORTED_CHARSET':
    case 'UNKNOWN_NAME':
    case 'UNREPRESENTABLE_CHARACTER':
    case 'UNREPRESENTABLE_EXTENSION':
      return 1;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

try {
  decode(new Uint8Array(1), table);
} catch (error) {
  if (error instanceof WbxmlError) {
    const code: WbxmlErrorCode = error.code;
    const offset: number | undefined = error.offset;
    const path: string | undefined = error.path;
    describeCode(code);
    void [offset, path];
  }
}

// @ts-expect-error an attribute value is an array of parts, not a string
const badAttribute: Attribute = { name: 'href', value: 'x' };
void badAttribute;
// @ts-expect-error an attribute start needs a name
const badStart: LanguageTable = { tagPages: {}, attributePages: { 0: { starts: { 5: { prefix: 'x' } } } } };
void badStart;

// The list of all 15 codes matches the WbxmlErrorCode union in both directions.
const allCodes = [
  'TRUNCATED', 'NO_ROOT', 'TRAILING_BYTES', 'UNEXPECTED_TOKEN', 'UNKNOWN_TOKEN',
  'LITERAL_NOT_ALLOWED', 'BAD_INTEGER', 'BAD_STRING_REFERENCE', 'BAD_ENTITY', 'MALFORMED_TEXT',
  'UNSUPPORTED_VERSION', 'UNSUPPORTED_CHARSET', 'UNKNOWN_NAME', 'UNREPRESENTABLE_CHARACTER',
  'UNREPRESENTABLE_EXTENSION',
] as const;
type Listed = (typeof allCodes)[number];
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const listedCoversUnion: Equal<Listed, WbxmlErrorCode> = true;
void listedCoversUnion;
