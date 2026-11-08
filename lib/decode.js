// decode(bytes, table) -> Document | null
//
// A byte-level reader plus a token loop. Each token kind has its own handler
// (readStrI, openTag, ...) selected by one switch in readBody, so a new token
// kind is a new handler and a new case. Every tree walk is iterative.
import {
  SWITCH_PAGE, END, ENTITY, STR_I, PI, STR_T, OPAQUE, EXT_I_0, EXT_T_0, EXT_0, LITERAL, LITERAL_C, LITERAL_A, LITERAL_AC,
  HAS_ATTRIBUTES, HAS_CONTENT, TOKEN_MASK, FIRST_TAG_TOKEN,
} from './codes.js';
import { decodeMib, getCodec } from './charset.js';
import {
  WbxmlError, hex2, formatPath, nextIndex, qualified,
} from './errors.js';
import { readAttributes, parseExtension } from './decode-attributes.js';
import { readTableString } from './stringtable.js';
import { indexTable, nameKey } from './table.js';

const describeInput = (x) => (x === null ? 'null' : x instanceof ArrayBuffer ? 'an ArrayBuffer' : Array.isArray(x) ? 'an array' : typeof x === 'object' ? `a ${x.constructor?.name ?? 'object'}` : typeof x);

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
    this.frames = []; // open elements, set by readBody; the first is the document frame
  }

  /** Throws a WbxmlError at `offset` (default: the current position) with the open-element path. */
  fail(code, message, offset = this.pos) {
    throw new WbxmlError(code, message, { offset, path: formatPath(this.frames.slice(1)) });
  }

  truncated(what) {
    return this.fail('TRUNCATED', `input ends inside ${what}`, this.bytes.length);
  }

  byte(what) {
    if (this.pos >= this.bytes.length) this.truncated(what);
    const b = this.bytes[this.pos];
    this.pos += 1;
    return b;
  }

  /** mb_u_int32: up to 5 bytes, at most 0xFFFFFFFF. Non-minimal forms are accepted. */
  mbUInt32(what) {
    const start = this.pos;
    let value = 0;
    for (let n = 0; n < 5; n += 1) {
      const b = this.byte(what);
      value = value * 128 + (b & 0x7f);
      if (!(b & 0x80)) {
        if (value > 0xffffffff) this.fail('BAD_INTEGER', `${what} is above 0xFFFFFFFF`, start);
        return value;
      }
    }
    return this.fail('BAD_INTEGER', `${what} is longer than 5 bytes`, start);
  }
}

/** Header: version publicid charset strtbl_length strtbl. Returns the Document shell and codec. */
function readHeader(r, bytes) {
  const versionByte = r.byte('the version byte');
  if (versionByte < 1 || versionByte > 3) {
    r.fail('UNSUPPORTED_VERSION', `WBXML version byte ${hex2(versionByte)} is not 0x01-0x03`, 0);
  }
  const version = `1.${versionByte}`;

  const publicIdStart = r.pos;
  let publicId = r.mbUInt32('the public id');
  let publicIdOffset = null;
  if (publicId === 0) publicIdOffset = r.mbUInt32('the public id string-table index');

  const charsetStart = r.pos;
  const mib = decodeMib(r.mbUInt32('the charset'));
  const codec = getCodec(mib);
  if (!codec) r.fail('UNSUPPORTED_CHARSET', `charset ${mib} is not supported`, charsetStart);

  const lengthStart = r.pos;
  const length = r.mbUInt32('the string table length');
  if (length > bytes.length - r.pos) {
    r.fail('TRUNCATED', `string table length ${length} runs past the end of the input`, lengthStart);
  }
  const span = { start: r.pos, end: r.pos + length };
  r.pos = span.end;

  if (publicIdOffset !== null) {
    publicId = readTableString(bytes, span, codec, publicIdOffset, (code, message) => r.fail(code, message, publicIdStart));
  }
  return {
    document: {
      type: 'document', version, publicId, charset: mib, children: [],
    },
    codec,
    span,
  };
}

const appendText = (children, value) => {
  const last = children[children.length - 1];
  if (last !== undefined && last.type === 'text') last.value += value;
  else children.push({ type: 'text', value });
};

/** STR_I: an inline string, only inside an element. */
function readStrI(ctx, tokenStart) {
  const { r, bytes, codec } = ctx;
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'a string at body level', tokenStart);
  const end = codec.find(bytes, r.pos, bytes.length);
  if (end === -2) r.fail('MALFORMED_TEXT', 'inline string has no terminator at an even distance', tokenStart);
  if (end < 0) r.fail('TRUNCATED', 'inline string has no terminator', tokenStart);
  const value = codec.decode(bytes, r.pos, end);
  if (value === null) r.fail('MALFORMED_TEXT', 'inline string holds malformed text', tokenStart);
  r.pos = end + codec.terminator.length;
  appendText(r.frames[r.frames.length - 1].node.children, value);
}

/** ENTITY: a code point as a character, only inside an element. */
function readEntity(ctx, tokenStart) {
  const { r, codec } = ctx;
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'an ENTITY at body level', tokenStart);
  const value = r.mbUInt32('an ENTITY value');
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    r.fail('BAD_ENTITY', `ENTITY ${value} is not a Unicode scalar value`, tokenStart);
  }
  const frame = r.frames[r.frames.length - 1];
  // Encode writes text in an opaque-listed element as OPAQUE, which can't carry an ENTITY, so refuse one the charset can't hold.
  if (value > codec.limit && ctx.index.tokens.get(nameKey(frame.namespace, frame.name))?.opaque) {
    r.fail('BAD_ENTITY', `ENTITY ${value} is above the charset's limit, in the opaque-listed element ${qualified(frame.namespace, frame.name)}`, tokenStart);
  }
  appendText(frame.node.children, String.fromCodePoint(value));
}

/** The string-table string at `offset`; a bad one is reported at the referencing token. */
function tableString(ctx, offset, tokenStart) {
  const { r, bytes, codec, span } = ctx;
  return readTableString(bytes, span, codec, offset, (code, message) => r.fail(code, message, tokenStart));
}

/** STR_T: a string-table string, only inside an element. */
function readStrT(ctx, tokenStart) {
  const { r } = ctx;
  const offset = r.mbUInt32('a STR_T offset');
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'a string at body level', tokenStart);
  appendText(r.frames[r.frames.length - 1].node.children, tableString(ctx, offset, tokenStart));
}

/** OPAQUE: a length and that many raw bytes, kept as a view into the input. */
function readOpaque(ctx, tokenStart) {
  const { r, bytes } = ctx;
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'OPAQUE at body level', tokenStart);
  const length = r.mbUInt32('the OPAQUE length');
  if (length > bytes.length - r.pos) r.fail('TRUNCATED', `OPAQUE length ${length} runs past the end of the input`, tokenStart);
  r.frames[r.frames.length - 1].node.children.push({ type: 'opaque', value: bytes.subarray(r.pos, r.pos + length) });
  r.pos += length;
}

/** EXT_I_n, EXT_T_n, EXT_n: an extension node in element content. */
function readExtension(ctx, b, tokenStart) {
  const { r } = ctx;
  const node = parseExtension(ctx, b, tokenStart);
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'an extension at body level', tokenStart);
  r.frames[r.frames.length - 1].node.children.push(node);
}

/** PI: a target (an attribute start) and a value, as an instruction node in the innermost open node. */
function readPi(ctx) {
  const attributes = [];
  readAttributes(ctx, attributes, true);
  const [{ name, value }] = attributes;
  ctx.r.frames[ctx.r.frames.length - 1].node.children.push({ type: 'instruction', name, value });
}

/** END: closes the innermost element. */
function closeElement(ctx, tokenStart) {
  const { r } = ctx;
  if (r.frames.length === 1) r.fail('UNEXPECTED_TOKEN', 'END at body level', tokenStart);
  r.frames.pop();
  if (r.frames.length === 1) ctx.rootDone = true;
}

/** A tag token (0x05-0x3F, with the attribute and content bits): an element. */
function openTag(ctx, b, tokenStart) {
  const { r, index } = ctx;
  const page = index.pages.get(ctx.page);
  const name = page?.names.get(b & TOKEN_MASK);
  if (name === undefined) {
    r.fail('UNKNOWN_TOKEN', `tag token ${hex2(b & TOKEN_MASK)} is not defined on tag code page ${ctx.page}`, tokenStart);
  }
  pushElement(ctx, page.namespace, name, b & HAS_CONTENT, b & HAS_ATTRIBUTES);
}

/** Adds an element to the open parent; opens a frame while it has attributes or content. */
function pushElement(ctx, namespace, name, hasContent, hasAttributes) {
  const { r } = ctx;
  const parent = r.frames[r.frames.length - 1];
  const node = {
    type: 'element', namespace, name, attributes: [], children: [],
  };
  const position = nextIndex(parent, namespace, name);
  parent.node.children.push(node);
  if (hasContent || hasAttributes) {
    r.frames.push({
      node, namespace, name, index: position,
    });
  }
  if (hasAttributes) readAttributes(ctx, node.attributes);
  if (!hasContent) {
    if (hasAttributes) r.frames.pop();
    if (parent.node.type === 'document') ctx.rootDone = true;
  }
}

/** LITERAL, LITERAL_C, LITERAL_A, LITERAL_AC. */
function openLiteral(ctx, b, tokenStart) {
  if (!ctx.index.literals) {
    ctx.r.fail('LITERAL_NOT_ALLOWED', `LITERAL token ${hex2(b)} with literals: false`, tokenStart);
  }
  const { r } = ctx;
  const name = tableString(ctx, r.mbUInt32('a LITERAL name offset'), tokenStart);
  const namespace = ctx.index.pages.get(ctx.page)?.namespace ?? null;
  pushElement(ctx, namespace, name, b & HAS_CONTENT, b & HAS_ATTRIBUTES);
}

/** Any other token below the first tag token: not valid in a body or element content. */
function unsupportedToken(ctx, b, tokenStart) {
  ctx.r.fail('UNEXPECTED_TOKEN', `token ${hex2(b)} is not a token that can appear here`, tokenStart);
}

/** Body: *pi element *pi. Tokens are dispatched here and nowhere else. */
function readBody(ctx) {
  const { r, bytes } = ctx;
  while (r.pos < bytes.length) {
    const tokenStart = r.pos;
    const b = bytes[r.pos];
    r.pos += 1;
    if (ctx.rootDone && b !== PI) r.fail('TRAILING_BYTES', 'bytes after the root element', tokenStart);
    switch (b) {
      case SWITCH_PAGE:
        ctx.page = r.byte('a SWITCH_PAGE operand');
        break;
      case END:
        closeElement(ctx, tokenStart);
        break;
      case STR_I:
        readStrI(ctx, tokenStart);
        break;
      case ENTITY:
        readEntity(ctx, tokenStart);
        break;
      case STR_T:
        readStrT(ctx, tokenStart);
        break;
      case OPAQUE:
        readOpaque(ctx, tokenStart);
        break;
      case EXT_I_0:
      case EXT_I_0 + 1:
      case EXT_I_0 + 2:
      case EXT_T_0:
      case EXT_T_0 + 1:
      case EXT_T_0 + 2:
      case EXT_0:
      case EXT_0 + 1:
      case EXT_0 + 2:
        readExtension(ctx, b, tokenStart);
        break;
      case PI:
        readPi(ctx);
        break;
      case LITERAL:
      case LITERAL_C:
      case LITERAL_A:
      case LITERAL_AC:
        openLiteral(ctx, b, tokenStart);
        break;
      default:
        if ((b & TOKEN_MASK) >= FIRST_TAG_TOKEN) openTag(ctx, b, tokenStart);
        else unsupportedToken(ctx, b, tokenStart);
    }
  }
  if (r.frames.length > 1) r.truncated('an open element');
  if (!ctx.rootDone) r.fail('NO_ROOT', 'the header is not followed by a root element', bytes.length);
}

export function decode(bytes, table) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`decode() takes a Uint8Array (a Buffer is one); got ${describeInput(bytes)}. In a fetch handler: decode(await request.bytes(), table)`);
  }
  const index = indexTable(table);
  if (bytes.length === 0) return null;

  const r = new Reader(bytes);
  const { document, codec, span } = readHeader(r, bytes);
  r.frames.push({ node: document });
  readBody({
    r, bytes, index, codec, span, page: 0, attrPage: 0, rootDone: false,
  });
  return document;
}
