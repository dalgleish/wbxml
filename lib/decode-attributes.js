// Decode: an attribute list (WAP-192 §5.8.2, `attrStart *attrValue`, ended by END).
// The attribute code page is tracked here, apart from the tag code page.
import {
  SWITCH_PAGE, END, ENTITY, STR_I, STR_T, OPAQUE, LITERAL, EXT_I_0, EXT_T_0, EXT_0,
} from './codes.js';
import { hex2 } from './errors.js';
import { readTableString } from './stringtable.js';

const isStartToken = (b) => b >= 0x05 && b <= 0x7f && (b & 0x3f) >= 0x05;
const isValueToken = (b) => b >= 0x85 && (b & 0x3f) >= 0x05;

const appendText = (attribute, value) => {
  const parts = attribute.value;
  const last = parts[parts.length - 1];
  if (last !== undefined && last.type === 'text') last.value += value;
  else parts.push({ type: 'text', value });
};

/** EXT_I_n, EXT_T_n or EXT_n (token `b`, already read) as an extension node. */
export function parseExtension(ctx, b, tokenStart) {
  const {
    r, bytes, codec, span,
  } = ctx;
  const base = b & 0xc0;
  const node = { type: 'extension', index: b & 0x03 };
  if (base === EXT_I_0) {
    const end = codec.find(bytes, r.pos, bytes.length);
    if (end === -2) r.fail('MALFORMED_TEXT', 'inline extension string has no terminator at an even distance', tokenStart);
    if (end < 0) r.fail('TRUNCATED', 'inline extension string has no terminator', tokenStart);
    const value = codec.decode(bytes, r.pos, end);
    if (value === null) r.fail('MALFORMED_TEXT', 'inline extension string holds malformed text', tokenStart);
    r.pos = end + codec.terminator.length;
    node.value = value;
  } else if (base === EXT_T_0) {
    const value = r.mbUInt32('an EXT_T value');
    node.value = ctx.index.extTStringOffsets
      ? readTableString(bytes, span, codec, value, (code, message) => r.fail(code, message, tokenStart))
      : value;
  }
  return node;
}

/**
 * Reads attributes into `attributes` up to and including END. The element is
 * the innermost open frame, so errors carry its path. With `single` it reads a
 * PI's one target and value instead (the PI token is already consumed).
 */
export function readAttributes(ctx, attributes, single = false) {
  const {
    r, bytes, codec, span, index,
  } = ctx;
  let current = null;

  const needStart = (tokenStart, what) => {
    if (current === null) r.fail('UNEXPECTED_TOKEN', `${what} before any attribute start`, tokenStart);
  };
  const begin = (name, prefix, tokenStart) => {
    if (single && attributes.length > 0) r.fail('UNEXPECTED_TOKEN', 'a second target in a PI', tokenStart);
    current = { name, value: [] };
    attributes.push(current);
    if (prefix) appendText(current, prefix);
  };

  for (;;) {
    const tokenStart = r.pos;
    const b = r.byte('an attribute list');
    switch (b) {
      case SWITCH_PAGE:
        ctx.attrPage = r.byte('a SWITCH_PAGE operand');
        break;
      case END:
        if (attributes.length === 0) r.fail('UNEXPECTED_TOKEN', 'END of an empty attribute list', tokenStart);
        return;
      case LITERAL: {
        if (!index.literals) r.fail('LITERAL_NOT_ALLOWED', `LITERAL token ${hex2(b)} with literals: false`, tokenStart);
        const offset = r.mbUInt32('a LITERAL name offset');
        begin(readTableString(bytes, span, codec, offset, (code, message) => r.fail(code, message, tokenStart)), '', tokenStart);
        break;
      }
      case ENTITY: {
        needStart(tokenStart, 'an ENTITY');
        const value = r.mbUInt32('an ENTITY value');
        if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
          r.fail('BAD_ENTITY', `ENTITY ${value} is not a Unicode scalar value`, tokenStart);
        }
        appendText(current, String.fromCodePoint(value));
        break;
      }
      case STR_I: {
        needStart(tokenStart, 'a string');
        const end = codec.find(bytes, r.pos, bytes.length);
        if (end === -2) r.fail('MALFORMED_TEXT', 'inline string has no terminator at an even distance', tokenStart);
        if (end < 0) r.fail('TRUNCATED', 'inline string has no terminator', tokenStart);
        const value = codec.decode(bytes, r.pos, end);
        if (value === null) r.fail('MALFORMED_TEXT', 'inline string holds malformed text', tokenStart);
        r.pos = end + codec.terminator.length;
        appendText(current, value);
        break;
      }
      case STR_T: {
        const offset = r.mbUInt32('a STR_T offset');
        needStart(tokenStart, 'a string');
        appendText(current, readTableString(bytes, span, codec, offset, (code, message) => r.fail(code, message, tokenStart)));
        break;
      }
      case OPAQUE: {
        needStart(tokenStart, 'OPAQUE');
        const length = r.mbUInt32('the OPAQUE length');
        if (length > bytes.length - r.pos) r.fail('TRUNCATED', `OPAQUE length ${length} runs past the end of the input`, tokenStart);
        current.value.push({ type: 'opaque', value: bytes.subarray(r.pos, r.pos + length) });
        r.pos += length;
        break;
      }
      case EXT_I_0: case EXT_I_0 + 1: case EXT_I_0 + 2:
      case EXT_T_0: case EXT_T_0 + 1: case EXT_T_0 + 2:
      case EXT_0: case EXT_0 + 1: case EXT_0 + 2:
        needStart(tokenStart, 'an extension');
        current.value.push(parseExtension(ctx, b, tokenStart));
        break;
      default:
        if (isStartToken(b)) {
          const start = index.attributePages.get(ctx.attrPage)?.starts.get(b);
          if (start === undefined) {
            r.fail('UNKNOWN_TOKEN', `attribute start token ${hex2(b)} is not defined on attribute code page ${ctx.attrPage}`, tokenStart);
          }
          begin(start.name, start.prefix, tokenStart);
        } else if (isValueToken(b)) {
          needStart(tokenStart, 'an attribute value token');
          const value = index.attributePages.get(ctx.attrPage)?.values.get(b);
          if (value === undefined) {
            r.fail('UNKNOWN_TOKEN', `attribute value token ${hex2(b)} is not defined on attribute code page ${ctx.attrPage}`, tokenStart);
          }
          appendText(current, value);
        } else {
          r.fail('UNEXPECTED_TOKEN', `token ${hex2(b)} in an attribute list`, tokenStart);
        }
    }
  }
}
