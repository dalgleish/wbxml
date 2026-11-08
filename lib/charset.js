// The charset seam. A codec turns the bytes of one string into text and back.
//
// Codec contract:
//   mib          IANA MIBenum
//   unit         bytes per code unit (string-table offsets must be multiples of it)
//   limit        the highest code point the charset holds; above it the encoder writes ENTITY
//   terminator   bytes that end a string on the wire
//   find(bytes, start, end)   index of the first terminator in [start, end), -1 when there is none,
//                             -2 when there is only a misaligned one (UTF-16)
//   decode(bytes, start, end) text, or null when the bytes are malformed (never U+FFFD)
//   encode(text)              bytes without terminator (text is already well-formed and within limit)
//   encodeRaw(text)           optional: the same for opaque data (no BOM); defaults to encode

const decoder = (label) => new TextDecoder(label, { fatal: true, ignoreBOM: true });
const utf8Decoder = decoder('utf-8');
const utf8Encoder = new TextEncoder();

const tryDecode = (d, view) => {
  try {
    return d.decode(view);
  } catch {
    return null;
  }
};

const findZero = (bytes, start, end) => {
  const i = bytes.subarray(start, end).indexOf(0);
  return i < 0 ? -1 : start + i;
};

const utf8 = {
  mib: 106,
  unit: 1,
  limit: 0x10ffff,
  terminator: Uint8Array.of(0),
  find: findZero,
  decode: (bytes, start, end) => tryDecode(utf8Decoder, bytes.subarray(start, end)),
  encode: (text) => utf8Encoder.encode(text),
};

/** US-ASCII and ISO-8859-1: byte = code point (WHATWG would map both to windows-1252). */
const singleByte = (mib, limit) => ({
  mib,
  unit: 1,
  limit,
  terminator: Uint8Array.of(0),
  find: findZero,
  decode(bytes, start, end) {
    let out = '';
    for (let i = start; i < end; i += 8192) {
      const chunk = bytes.subarray(i, Math.min(i + 8192, end));
      if (limit < 0xff && chunk.some((b) => b > limit)) return null;
      out += String.fromCharCode(...chunk);
    }
    return out;
  },
  encode: (text) => Uint8Array.from(text, (c) => c.codePointAt(0)),
});

const utf16be = decoder('utf-16be');
const utf16le = decoder('utf-16le');

/** UTF-16: the terminator is the first 00 00 at an even distance from the string's start. */
function findUtf16(bytes, start, end) {
  for (let i = start; i + 1 < end; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
  for (let i = start + 1; i + 1 < end; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return -2;
  return -1;
}

const encodeUtf16 = (text, littleEndian) => {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i += 1) view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  return out;
};

const utf16 = (mib, decodeAt, littleEndian) => ({
  mib,
  unit: 2,
  limit: 0x10ffff,
  terminator: Uint8Array.of(0, 0),
  find: findUtf16,
  decode: decodeAt,
  encode: (text) => encodeUtf16(text, littleEndian),
});

const utf16BE = utf16(1013, (bytes, start, end) => tryDecode(utf16be, bytes.subarray(start, end)), false);
const utf16LE = utf16(1014, (bytes, start, end) => tryDecode(utf16le, bytes.subarray(start, end)), true);
// 1015: a BOM picks the string's byte order and is dropped; no BOM means big-endian.
const utf16Bom = utf16(1015, (bytes, start, end) => {
  if (end - start >= 2) {
    if (bytes[start] === 0xfe && bytes[start + 1] === 0xff) return utf16BE.decode(bytes, start + 2, end);
    if (bytes[start] === 0xff && bytes[start + 1] === 0xfe) return utf16LE.decode(bytes, start + 2, end);
  }
  return utf16BE.decode(bytes, start, end);
}, false);

// A text that starts with U+FEFF (a ZWNBSP, RFC 2781) or U+FFFE would be read as a BOM, so such a string gets a real
// BOM first. Opaque text is never decoded as text, so it keeps `encodeRaw`: big-endian, no BOM.
utf16Bom.encodeRaw = utf16Bom.encode;
utf16Bom.encode = (text) => {
  const bytes = utf16Bom.encodeRaw(text);
  if (text[0] !== '﻿' && text[0] !== '￾') return bytes;
  return Uint8Array.of(0xfe, 0xff, ...bytes);
};

const CODECS = new Map([utf8, singleByte(3, 0x7f), singleByte(4, 0xff), utf16BE, utf16LE, utf16Bom].map((c) => [c.mib, c]));

/** The codec for a MIBenum, or undefined when unsupported. */
export const getCodec = (mib) => CODECS.get(mib);

/** Charset 0 ("unknown") is read as UTF-8 on decode, and the Document records 106. */
export const decodeMib = (mib) => (mib === 0 ? 106 : mib);
