export type WbxmlErrorCode =
  | 'TRUNCATED'
  | 'NO_ROOT'
  | 'TRAILING_BYTES'
  | 'UNEXPECTED_TOKEN'
  | 'UNKNOWN_TOKEN'
  | 'LITERAL_NOT_ALLOWED'
  | 'BAD_INTEGER'
  | 'BAD_STRING_REFERENCE'
  | 'BAD_ENTITY'
  | 'MALFORMED_TEXT'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_CHARSET'
  | 'UNKNOWN_NAME'
  | 'UNREPRESENTABLE_CHARACTER'
  | 'UNREPRESENTABLE_EXTENSION';

export class WbxmlError extends Error {
  readonly name: 'WbxmlError';
  readonly code: WbxmlErrorCode;
  /** Decode only: index of the first byte of the failing token or header field. */
  readonly offset?: number;
  /** Open elements, e.g. `AirSync:Sync[0]/AirSync:Collections[0]`. */
  readonly path?: string;
}

/** Tag code page: tokens 0x05-0x3F keyed by token (decimal string keys in JSON). */
export interface TagPage {
  /** XML namespace name, verbatim; none means null. */
  namespace?: string;
  tags: { [token: number | string]: string };
  /** Names on this code page whose content is opaque data; text in them is written as OPAQUE. */
  opaque?: string[];
}

/** An attribute start (tokens 0x05-0x3F, 0x45-0x7F). `prefix` is the start of the value the token stands for. */
export interface AttributeStart {
  name: string;
  prefix?: string;
}

/** Attribute code page, numbered apart from tag code pages (decimal string keys in JSON). */
export interface AttributePage {
  starts?: { [token: number | string]: AttributeStart };
  /** Attribute value tokens (0x85-0xBF, 0xC5-0xFF) and the text each stands for. */
  values?: { [token: number | string]: string };
}

export interface LanguageTable {
  publicId?: number | string;
  /** Whether LITERAL tokens are allowed. Default true. */
  literals?: boolean;
  /** EXT_T_0-2 integers are string-table offsets. Default false. */
  extTStringOffsets?: boolean;
  tagPages: { [page: number | string]: TagPage };
  attributePages?: { [page: number | string]: AttributePage };
}

export interface DocumentNode {
  type: 'document';
  version?: '1.1' | '1.2' | '1.3';
  publicId?: number | string;
  charset?: number;
  children: Node[];
}

export interface ElementNode {
  type: 'element';
  namespace: string | null;
  name: string;
  /** In wire order; a missing list means no attributes. */
  attributes?: Attribute[];
  children: Node[];
}

export interface TextNode {
  type: 'text';
  value: string;
}

/** Decoded values are `subarray` views into the input: keeping one keeps the whole input alive; `.slice()` copies. */
export interface OpaqueNode {
  type: 'opaque';
  value: Uint8Array;
}

/** A part of an attribute or PI value. Adjacent text is one part. */
export type AttributePart = TextNode | OpaqueNode | ExtensionNode;

export interface Attribute {
  name: string;
  value: AttributePart[];
}

/** EXT_n (no value), EXT_I_n (string) or EXT_T_n (number, or a string under `extTStringOffsets`). */
export interface ExtensionNode {
  type: 'extension';
  index: 0 | 1 | 2;
  value?: string | number;
}

/** A processing instruction: the target is an attribute start, the value is parts as in an attribute. Allowed beside the root and in element content. */
export interface InstructionNode {
  type: 'instruction';
  name: string;
  value: AttributePart[];
}

export type Node = ElementNode | TextNode | OpaqueNode | ExtensionNode | InstructionNode;
export type Document = DocumentNode;

export function decode(bytes: Uint8Array, table: LanguageTable): Document | null;
export function encode(document: Document | null, table: LanguageTable): Uint8Array;
