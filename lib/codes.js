"use strict";

/*
 * See http://www.w3.org/TR/wbxml
 */
module.exports.global = {
  SWITCH_PAGE: 0x00,  // Change the code page for the current token state.
                      // Followed by a single u_int8 indicating the new code page number.
  END        : 0x01,  // Indicates the end of an attribute list or the end of an element.
  ENTITY     : 0x02,  // A character entity. Followed by a mb_u_int32 encoding the character entity number.
  STR_I      : 0x03,  // Inline string. Followed by a termstr.
  LITERAL    : 0x04,  // An unknown tag or attribute name. Followed by an mb_u_int32 that encodes an offset into the string table.
  EXT_I_0    : 0x40,  // Inline string document-type-specific extension token. Token is followed by a termstr.
  EXT_I_1    : 0x41,  // Inline string document-type-specific extension token. Token is followed by a termstr.
  EXT_I_2    : 0x42,  // Inline string document-type-specific extension token. Token is followed by a termstr.
  PI         : 0x43,  // Processing instruction.
  LITERAL_C  : 0x44,  // Unknown tag, with content.
  EXT_T_0    : 0x80,  // Inline integer document-type-specific extension token. Token is followed by a mb_uint_32.
  EXT_T_1    : 0x81,  // Inline integer document-type-specific extension token. Token is followed by a mb_uint_32.
  EXT_T_2    : 0x82,  // Inline integer document-type-specific extension token. Token is followed by a mb_uint_32.
  STR_T      : 0x83,  // String table reference. Followed by a mb_u_int32 encoding a byte offset from the beginning of the string table.
  LITERAL_A  : 0x84,  // Unknown tag, with attributes.
  EXT_0      : 0xC0,  // Single-byte document-type-specific extension token.
  EXT_1      : 0xC1,  // Single-byte document-type-specific extension token.
  EXT_2      : 0xC2,  // Single-byte document-type-specific extension token.
  OPAQUE     : 0xC3,  // Opaque document-type-specific data.
  LITERAL_AC : 0xC4   // Unknown tag, with content and attributes.
};

var mib2str = {
  106: 'UTF-8',
  1013: 'UTF-16BE',
  1014: 'UTF-16LE',
  1015: 'UTF-16'
};

var str2mib = {};

for (var mibId in mib2str) {
  var mibStr = mib2str[mibId];
  str2mib[mibStr] = mibId;
}

module.exports.str2mib = str2mib;
module.exports.mib2str = mib2str;