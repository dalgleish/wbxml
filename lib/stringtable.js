// String table reads (decode). Only referenced strings are decoded and checked.
// `fail(code, message)` throws a WbxmlError positioned by the caller.

/**
 * @param {Uint8Array} bytes the whole input
 * @param {{ start: number, end: number }} span where the table lies in `bytes`
 * @param {object} codec from charset.js
 * @param {number} offset string-table offset of the string
 */
export function readTableString(bytes, span, codec, offset, fail) {
  const start = span.start + offset;
  if (start >= span.end) {
    fail('BAD_STRING_REFERENCE', `string table offset ${offset} is past the end of the table (length ${span.end - span.start})`);
  }
  if (offset % codec.unit !== 0) {
    fail('BAD_STRING_REFERENCE', `string table offset ${offset} is not aligned to a ${codec.unit * 8}-bit code unit`);
  }
  const end = codec.find(bytes, start, span.end);
  if (end < 0) {
    fail('BAD_STRING_REFERENCE', `string table offset ${offset} has no terminator before the table ends`);
  }
  const text = codec.decode(bytes, start, end);
  if (text === null) {
    fail('MALFORMED_TEXT', `string table offset ${offset} holds malformed text`);
  }
  return text;
}
