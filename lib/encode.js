// encode(document, table) -> Uint8Array
//
// The body is written first, into its own buffer, because the header's string
// table (a later ticket) is only known once the body has been walked. Node
// kinds each have a writer (writeElement, writeText, ...) selected by one
// switch in writeBody. The walk is iterative.
import {
  END, OPAQUE, LITERAL, HAS_CONTENT, HAS_ATTRIBUTES,
} from './codes.js';
import { getCodec } from './charset.js';
import { WbxmlError, qualified, nextIndex } from './errors.js';
import { writeAttributes, writePi } from './encode-attributes.js';
import {
  fail, checkEncodable, writeExtension, writeEntityText,
} from './encode-shared.js';
import { indexTable, nameKey } from './table.js';
import { ByteWriter } from './writer.js';

const VERSION_BYTES = { '1.1': 1, '1.2': 2, '1.3': 3 };
const DEFAULT_PUBLIC_ID = 1;
const DEFAULT_CHARSET = 106;

const isObject = (x) => x !== null && typeof x === 'object';

function checkInteger(value, what) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${what} must be a non-negative integer; got ${String(value)}`);
  }
}

/** Header fields: version, publicid, charset. Returns the bytes before the string table. */
function resolveHeader(document, index) {
  const version = document.version ?? '1.3';
  if (typeof version !== 'string') throw new TypeError(`document.version must be a string; got ${typeof version}`);
  if (!Object.hasOwn(VERSION_BYTES, version)) {
    throw new WbxmlError('UNSUPPORTED_VERSION', `WBXML version ${JSON.stringify(version)} is not '1.1', '1.2' or '1.3'`, { path: '' });
  }

  const publicId = document.publicId ?? index.publicId ?? DEFAULT_PUBLIC_ID;
  if (typeof publicId !== 'string') {
    checkInteger(publicId, 'document.publicId');
    if (publicId === 0 || publicId > 0xffffffff) {
      throw new WbxmlError('BAD_INTEGER', `publicId ${publicId} can't be written as a numeric public id`, { path: '' });
    }
  }

  const charset = document.charset ?? DEFAULT_CHARSET;
  checkInteger(charset, 'document.charset');
  const codec = getCodec(charset);
  if (!codec) {
    throw new WbxmlError('UNSUPPORTED_CHARSET', `charset ${charset} can't be written; re-encode with { ...doc, charset: 106 }`, { path: '' });
  }
  return {
    versionByte: VERSION_BYTES[version], publicId, charset, codec,
  };
}

/** A string-table builder: strings are added once each, with their offsets in first-added order. */
class StringTable {
  constructor(codec) {
    this.codec = codec;
    this.offsets = new Map();
    this.out = new ByteWriter(64);
  }

  /** The offset of `value`, adding it on first use. A bad string is reported as `what`, at `ctx`'s path. */
  add(value, what, ctx) {
    let offset = this.offsets.get(value);
    if (offset === undefined) {
      checkEncodable(value, what, ctx, this.codec);
      offset = this.out.length;
      this.out.bytes(this.codec.encode(value));
      this.out.bytes(this.codec.terminator);
      this.offsets.set(value, offset);
    }
    return offset;
  }
}

/** An opaque node: OPAQUE, a minimal length, the bytes. */
function writeOpaque(ctx, node) {
  if (!(node.value instanceof Uint8Array)) throw new TypeError('an opaque node\'s value must be a Uint8Array');
  ctx.out.byte(OPAQUE);
  ctx.out.mbUInt32(node.value.length);
  ctx.out.bytes(node.value);
}

/** Text: STR_I + bytes + terminator, or in an opaque-listed element OPAQUE + the bytes. */
function writeText(ctx, node, opaque) {
  if (typeof node.value !== 'string') throw new TypeError(`a text node's value must be a string; got ${typeof node.value}`);
  const { out, codec } = ctx;
  // ENTITY can't go in opaque bytes, so there the charset must hold every character.
  checkEncodable(node.value, 'text', ctx, opaque ? codec : { limit: 0x10ffff });
  if (opaque) {
    const bytes = (codec.encodeRaw ?? codec.encode)(node.value);
    out.byte(OPAQUE);
    out.mbUInt32(bytes.length);
    out.bytes(bytes);
    return;
  }
  writeEntityText(ctx, node.value);
}

/**
 * Writes an element's start tag and, when it has content, pushes its frame.
 * `parent` is the innermost open frame.
 */
function writeElement(ctx, node, parent) {
  if (typeof node.name !== 'string') throw new TypeError(`an element's name must be a string; got ${typeof node.name}`);
  if (node.namespace !== null && typeof node.namespace !== 'string') {
    throw new TypeError(`an element's namespace must be a string or null; got ${typeof node.namespace}`);
  }
  if (!Array.isArray(node.children)) throw new TypeError('an element needs a children array');
  if (node.attributes !== undefined && !Array.isArray(node.attributes)) {
    throw new TypeError('an element\'s attributes must be an array');
  }

  const frame = {
    node, namespace: node.namespace, name: node.name, index: nextIndex(parent, node.namespace, node.name), i: 0, opaque: false,
  };
  ctx.open.push(frame);
  const entry = ctx.index.tokens.get(nameKey(node.namespace, node.name));
  const hasContent = node.children.length > 0;
  const hasAttributes = node.attributes?.length > 0;
  if (entry === undefined) {
    writeLiteral(ctx, node, hasContent, hasAttributes);
  } else {
    switchTagPage(ctx, entry.page);
    frame.opaque = entry.opaque;
    ctx.out.byte(entry.token | (hasContent ? HAS_CONTENT : 0) | (hasAttributes ? HAS_ATTRIBUTES : 0));
  }
  if (hasAttributes) writeAttributes(ctx, node.attributes);
  if (!hasContent) ctx.open.pop();
}

/** LITERAL / LITERAL_C / LITERAL_A / LITERAL_AC: the name goes in the string table, on a code page chosen by namespace. */
function writeLiteral(ctx, node, hasContent, hasAttributes) {
  const unknown = () => fail(ctx, 'UNKNOWN_NAME', `${qualified(node.namespace, node.name)} is not in the language table`);
  if (!ctx.index.literals) unknown();
  const page = literalPage(ctx, node.namespace);
  if (page === undefined) unknown();
  const offset = ctx.strings.add(node.name, 'the element name', ctx);
  switchTagPage(ctx, page);
  ctx.out.byte(LITERAL | (hasContent ? HAS_CONTENT : 0) | (hasAttributes ? HAS_ATTRIBUTES : 0));
  ctx.out.mbUInt32(offset);
}

/** The tag code page a LITERAL for `namespace` goes on, or undefined (spec: LITERAL code page choice). */
function literalPage({ index, page: current }, namespace) {
  const { pages } = index;
  if (namespace !== null) {
    if (pages.get(current)?.namespace === namespace) return current;
    return [...pages].filter(([, p]) => p.namespace === namespace).map(([n]) => n).sort((a, b) => a - b)[0];
  }
  if (!pages.has(current) || pages.get(current).namespace === null) return current;
  const bare = [...pages].filter(([, p]) => p.namespace === null).map(([n]) => n);
  if (bare.length > 0) return Math.min(...bare);
  for (let n = 0; n < 256; n += 1) if (!pages.has(n)) return n;
  return undefined;
}

/** SWITCH_PAGE only when the tag code page changes; it carries across END. */
function switchTagPage(ctx, page) {
  if (page === ctx.page) return;
  ctx.out.byte(0x00);
  ctx.out.byte(page);
  ctx.page = page;
}

/** Walks the tree: open[0] is the document frame, the rest are open elements. */
function writeBody(ctx, document) {
  const { open } = ctx;
  open.push({ node: document, i: 0 });
  while (open.length > 0) {
    const frame = open[open.length - 1];
    const { children } = frame.node;
    if (frame.i >= children.length) {
      open.pop();
      if (open.length > 0) ctx.out.byte(END);
      continue;
    }
    const child = children[frame.i];
    frame.i += 1;
    if (!isObject(child)) throw new TypeError('a node must be an object');
    const atDocument = frame.node === document;
    switch (child.type) {
      case 'element':
        writeElement(ctx, child, frame);
        break;
      case 'text':
        if (atDocument) throw new TypeError('a document can\'t hold text at its top level');
        writeText(ctx, child, frame.opaque);
        break;
      case 'opaque':
        if (atDocument) throw new TypeError('a document can\'t hold opaque data at its top level');
        writeOpaque(ctx, child);
        break;
      case 'instruction':
        writePi(ctx, child);
        break;
      case 'extension':
        if (atDocument) throw new TypeError('a document can\'t hold an extension at its top level');
        writeExtension(ctx, child);
        break;
      default:
        throw new TypeError(`unknown node type ${JSON.stringify(child.type)}`);
    }
  }
}

function checkDocument(document) {
  if (!isObject(document) || document.type !== 'document') {
    throw new TypeError('encode() takes a Document ({ type: \'document\', children }) or null');
  }
  if (!Array.isArray(document.children)) throw new TypeError('a document needs a children array');
  const roots = document.children.filter((c) => isObject(c) && c.type === 'element').length;
  if (roots !== 1) throw new TypeError(`a document needs exactly one root element; got ${roots}`);
}

export function encode(document, table) {
  const index = indexTable(table);
  if (document === null) return new Uint8Array(0);
  checkDocument(document);
  const header = resolveHeader(document, index);

  const strings = new StringTable(header.codec);
  if (typeof header.publicId === 'string') {
    strings.add(header.publicId, 'the public id', { open: [] });
  }
  const body = new ByteWriter();
  writeBody({
    out: body, index, codec: header.codec, strings, page: 0, attrPage: 0, open: [],
  }, document);

  const out = new ByteWriter(body.length + 16);
  out.byte(header.versionByte);
  if (typeof header.publicId === 'string') {
    out.mbUInt32(0);
    out.mbUInt32(0); // the text public id is at string-table offset 0
  } else {
    out.mbUInt32(header.publicId);
  }
  out.mbUInt32(header.charset);
  out.mbUInt32(strings.out.length);
  out.bytes(strings.out.buf.subarray(0, strings.out.length));
  out.bytes(body.buf.subarray(0, body.length));
  return out.finish();
}
