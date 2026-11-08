// WBXML 1.3 global tokens (WAP-192 §5.8.3). Facts from the spec.
export const SWITCH_PAGE = 0x00;
export const END = 0x01;
export const ENTITY = 0x02;
export const STR_I = 0x03;
export const LITERAL = 0x04;
export const EXT_I_0 = 0x40;
export const EXT_I_1 = 0x41;
export const EXT_I_2 = 0x42;
export const PI = 0x43;
export const LITERAL_C = 0x44;
export const EXT_T_0 = 0x80;
export const EXT_T_1 = 0x81;
export const EXT_T_2 = 0x82;
export const STR_T = 0x83;
export const LITERAL_A = 0x84;
export const EXT_0 = 0xc0;
export const EXT_1 = 0xc1;
export const EXT_2 = 0xc2;
export const OPAQUE = 0xc3;
export const LITERAL_AC = 0xc4;

/** Tag token bits: 0x80 has attributes, 0x40 has content, low six bits are the token. */
export const HAS_ATTRIBUTES = 0x80;
export const HAS_CONTENT = 0x40;
export const TOKEN_MASK = 0x3f;
export const FIRST_TAG_TOKEN = 0x05;
