# wbxml

[![npm version](https://img.shields.io/npm/v/wbxml)](https://www.npmjs.com/package/wbxml)
[![Build Status](https://img.shields.io/github/actions/workflow/status/dalgleish/wbxml/ci.yml)](https://github.com/dalgleish/wbxml/actions)

Zero-dependency WBXML (WAP Binary XML) decoder and encoder for Node.js, with a built-in Exchange ActiveSync language table.

## `decode(bytes, table)`
Turns WBXML bytes into a **Document**, a lossless tree of the message.
## `encode(document, table)` 
Turns a **Document** back into bytes.

- Both `encode` and `decode` are synchronous.
- Both `encode` and `decode` support full WBXML 1.3 grammar: code pages, string table, attributes, ENTITY, processing instructions, OPAQUE, extensions and LITERALs.
- WBXML 1.1-1.2 support for `decode` only.
- Supports charsets: US-ASCII, ISO-8859-1, UTF-8, UTF-16BE, UTF-16LE and UTF-16.

Requires Node 24 or later, built with ICU (the standard builds are; `--without-intl` builds aren't supported).

## TypeScript and CommonJS

Hand-written `.d.ts` files ship beside each entry point. Set `moduleResolution` to `node16`, `nodenext` or `bundler` so that the `wbxml/activesync` subpath resolves.

The package is ESM-only. CommonJS code on Node 24 or later can load it with `require(esm)`:

## Install
```
npm install wbxml
```

## Quick start: an ActiveSync handler

```js
import { decode, encode, WbxmlError } from 'wbxml';
import { activesync } from 'wbxml/activesync';

export async function handle(request) {
  let message;
  try {
    message = decode(await request.bytes(), activesync);
  } catch (error) {
    if (error instanceof WbxmlError) {
      // The client sent bad WBXML, so answer 400.
      return new Response(`${error.code} at byte ${error.offset}`, { status: 400 });
    }
    throw error;
  }

  const reply = {
    type: 'document',
    children: [
      {
        type: 'element',
        namespace: 'FolderHierarchy',
        name: 'FolderSync',
        children: [
          {
            type: 'element',
            namespace: 'FolderHierarchy',
            name: 'Status',
            children: [{ type: 'text', value: '1' }],
          },
        ],
      },
    ],
  };
  return new Response(encode(reply, activesync), {
    headers: { 'content-type': 'application/vnd.ms-sync.wbxml' },
  });
}
```

`decode` of zero bytes returns `null`

`encode(null, table)` returns zero bytes (an empty ActiveSync body is legal).

## API

```ts
decode(bytes: Uint8Array, table: LanguageTable): Document | null
encode(document: Document | null, table: LanguageTable): Uint8Array
```

- `bytes` must be a `Uint8Array` (a `Buffer` is one). Anything else, an `ArrayBuffer` included, is a `TypeError`; use `await request.bytes()`, not `arrayBuffer()`.
- The language table is passed on every call. Nothing is looked up by public id or MIME type.
- Both functions reserve a third `options` argument for later. It is not used in 2.0.
- A broken table, or a value that isn't a Document, is a `TypeError`.

### `WbxmlError`

Thrown by `decode` and `encode` when the arguments are valid but WBXML can't represent the content with the specified table and charset. Use `instanceof` check around `decode` to detect a client's bad message.

| Field | Meaning |
| --- | --- |
| `name` | `'WbxmlError'` |
| `code` | A stable `WbxmlErrorCode`. Adding a code is a minor release; renaming or removing one is a major release. |
| `offset` | Decode only. Index of the first byte of the failing token or header field. `bytes.length` when the input ends early. |
| `path` | The open elements, such as `AirSync:Sync[0]/AirSync:Collections[0]`. |
| `message` | For people. It can change in any release. |

Codes: `TRUNCATED`, `NO_ROOT`, `TRAILING_BYTES`, `UNEXPECTED_TOKEN`, `UNKNOWN_TOKEN`, `LITERAL_NOT_ALLOWED`, `BAD_INTEGER`, `BAD_STRING_REFERENCE`, `BAD_ENTITY`, `MALFORMED_TEXT`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_CHARSET`, `UNKNOWN_NAME`, `UNREPRESENTABLE_CHARACTER`, `UNREPRESENTABLE_EXTENSION`. `WbxmlErrorCode` is a union, so a `switch` over it is exhaustive.

## The Document

A Document records what the message says. It drops how the bytes said it: STR_I vs STR_T, ENTITY vs the character, token vs LITERAL, redundant SWITCH_PAGEs and string-table layout. The encoder chooses those.

```js
{ type: 'document',
  // optional on encode (default '1.3')
  version: '1.1' | '1.2' | '1.3',
  // number or string, optional on encode
  publicId: 1,
  // IANA MIBenum, optional on encode (default 106)
  charset: 106,
  children: [ ...instruction, element, ...instruction ] }

{ type: 'element', namespace: string | null, name: string,
  // optional on encode; wire order
  attributes: [ { name, value: [ ...part ] } ],
  // always an array
  children: [ ...node ] }

{ type: 'text', value: string }
{ type: 'opaque', value: Uint8Array }
// EXT_n, EXT_I_n or EXT_T_n
{ type: 'extension', index: 0 | 1 | 2, value?: string | number }
// processing instruction
{ type: 'instruction', name, value: [ ...part ] }
// part = text | opaque | extension
```

- An element is identified by namespace and name. Nodes do not carry a code page or token.
- `decode` always sets `version`, `publicId`, and `charset`. `encode` fills in missing ones; a hand-built Document can leave them out.
- Adjacent strings and entities merge into one text node, including in attribute and PI values.
- `<a/>` and `<a></a>` both decode to `children: []`; a present-but-empty string is `[{ type: 'text', value: '' }]`. The encoder writes `children: []` with no END.
- Charset 0 (unknown) decodes as UTF-8 and the Document records 106.
- Decode doesn't check XML well-formedness (duplicate attributes, LITERAL names that aren't XML names, control characters pass through). Whatever turns a Document into XML must escape or reject them.

### Opaque data and memory

An opaque node's `value` is a `subarray` view into the input you passed to `decode`, not a copy. That makes decoding a large attachment nearly free, and it means keeping one opaque value alive keeps the whole input buffer alive. Copy when you keep it:

```js
// owns its own memory
const attachment = node.value.slice();
```

### Opaque-flagged elements and the round-trip exception

A table can list element names as `opaque`. On encode, text inside such an element is written as OPAQUE (the text's bytes in the Document charset, with no terminator), because that is how the language carries binary data. `decode` returns it as an opaque node. This is the one place where `decode(encode(document))` does not equal `document`, because your text comes back as bytes.

```js
const bytes = encode(
  { type: 'document', children: [{ type: 'element', namespace: 'ComposeMail', name: 'Mime', children: [{ type: 'text', value: 'Hi' }] }] },
  activesync,
);
decode(bytes, activesync).children[0].children[0];
// { type: 'opaque', value: Uint8Array [ 72, 105 ] }
```

## Language tables

A table is plain, JSON-able data with no functions:

```js
const table = {
  publicId: 1,                 // optional: encoder default
  literals: true,              // optional, default true: allow LITERAL tokens
  extTStringOffsets: false,    // optional, default false: EXT_T_n integers are string-table offsets
  tagPages: {
    0: { namespace: 'urn:people', tags: { 5: 'people', 6: 'person' }, opaque: [] },
  },
  attributePages: {
    0: { starts: { 5: { name: 'lang', prefix: 'en' } }, values: { 0x85: '.org' } },
  },
};
```

- Tag tokens are 0x05-0x3F. Attribute starts are 0x05-0x3F and 0x45-0x7F. Attribute values are 0x85-0xBF and 0xC5-0xFF. Code page numbers are 0-255. Tag and attribute code pages are numbered separately.
- Keys are decimal strings in JSON; numbers work in JS.
- Tables are validated on first use and cached by object identity. Don't change a table after you've used it.
- Code pages may share a namespace, but each (namespace, name) pair must be unique.
- Under `literals: true`, the encoder writes names the table lacks as LITERALs. Under `literals: false` they are `UNKNOWN_NAME`.

```js
import { decode, encode } from 'wbxml';

const people = {
  type: 'document',
  children: [
    {
      type: 'element', namespace: 'urn:people', name: 'people',
      children: [
        { type: 'element', namespace: 'urn:people', name: 'person', children: [{ type: 'text', value: 'Andrew' }] },
      ],
    },
  ],
};
// Uint8Array
const bytes = encode(people, table);
// get back a Document with the header fields filled in
const back = decode(bytes, table);
```

### ActiveSync

One use of WBXML that is still relevant today is in Microsoft's ActiveSync protocol, for synchronizing email, contacts, calendar, tasks, and notes between a messaging server and mobile devices. It operates over HTTP or HTTPS and is designed to work efficiently in low-bandwidth environments.

`import { activesync } from 'wbxml/activesync'` is a deeply frozen `Readonly<LanguageTable>` generated from MS-ASWBXML revision 24.0: 25 code pages and 608 tokens (including those no longer used in 16.1), with `publicId: 1` and `literals: false`. One table serves every ActiveSync protocol version. Namespaces are the MS-ASCMD names without a colon (`AirSync`, `AirSyncBase`, `GAL`, ...). Elements with byte-array types are marked `opaque`.

## Resources

- [WAP-192 WBXML 1.3](docs/WAP-192-WBXML-20010725-a.pdf)
- MS-ASWBXML, MS-ASCMD and the other MS-AS* specifications on Microsoft Learn

Author: [Andrew Dalgleish](http://dalgleish.info). License: ISC.
