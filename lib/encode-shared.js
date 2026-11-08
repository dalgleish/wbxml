// Encode helpers shared by element content and attribute / PI values.
import {
  ENTITY, STR_I, EXT_I_0, EXT_T_0, EXT_0,
} from './codes.js';
import { WbxmlError, formatPath } from './errors.js';

export function fail(ctx, code, message) {
  throw new WbxmlError(code, message, { path: formatPath(ctx.open.slice(1)) });
}

/** Where ENTITY can't go (names, public ids, opaque bytes), `codec` must hold every character. */
export function checkEncodable(value, what, ctx, codec) {
  if (!value.isWellFormed()) fail(ctx, 'MALFORMED_TEXT', `${what} holds an unpaired surrogate`);
  if (value.includes('\u0000')) fail(ctx, 'UNREPRESENTABLE_CHARACTER', `${what} holds U+0000`);
  if (codec.limit < 0x10ffff) {
    for (const c of value) {
      const codePoint = c.codePointAt(0);
      if (codePoint > codec.limit) {
        fail(ctx, 'UNREPRESENTABLE_CHARACTER', `${what} holds U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}, which the charset can't hold`);
      }
    }
  }
}

/** An extension node: EXT_n (no value), EXT_T_n (a number) or EXT_I_n (a string). */
export function writeExtension(ctx, node) {
  const { out } = ctx;
  const { index, value } = node;
  if (![0, 1, 2].includes(index)) throw new TypeError(`an extension's index must be 0, 1 or 2; got ${String(index)}`);
  if (value === undefined) {
    out.byte(EXT_0 + index);
  } else if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) throw new TypeError(`an extension's number value must be a non-negative integer; got ${String(value)}`);
    if (value > 0xffffffff) fail(ctx, 'BAD_INTEGER', `extension value ${value} is above 0xFFFFFFFF`);
    if (ctx.index.extTStringOffsets) {
      fail(ctx, 'UNREPRESENTABLE_EXTENSION', 'a number extension would read back as a string-table offset (extTStringOffsets)');
    }
    out.byte(EXT_T_0 + index);
    out.mbUInt32(value);
  } else if (typeof value === 'string') {
    checkEncodable(value, 'an extension value', ctx, ctx.codec);
    out.byte(EXT_I_0 + index);
    out.bytes(ctx.codec.encode(value));
    out.bytes(ctx.codec.terminator);
  } else {
    throw new TypeError(`an extension's value must be a string, a number or absent; got ${typeof value}`);
  }
}

/** Text as STR_I runs; characters the charset can't hold become ENTITY, splitting the STR_I around them. */
export function writeEntityText(ctx, value) {
  const { out, codec } = ctx;
  let run = '';
  let wrote = false;
  const flush = () => {
    out.byte(STR_I);
    out.bytes(codec.encode(run));
    out.bytes(codec.terminator);
    run = '';
    wrote = true;
  };
  for (const c of value) {
    const codePoint = c.codePointAt(0);
    if (codePoint <= codec.limit) {
      run += c;
    } else {
      if (run !== '') flush();
      out.byte(ENTITY);
      out.mbUInt32(codePoint);
      wrote = true;
    }
  }
  if (run !== '' || !wrote) flush();
}
