/** Every WbxmlError code (spec: Errors). Kept in sync with WbxmlErrorCode in index.d.ts. */
export const ERROR_CODES = Object.freeze([
  'TRUNCATED',
  'NO_ROOT',
  'TRAILING_BYTES',
  'UNEXPECTED_TOKEN',
  'UNKNOWN_TOKEN',
  'LITERAL_NOT_ALLOWED',
  'BAD_INTEGER',
  'BAD_STRING_REFERENCE',
  'BAD_ENTITY',
  'MALFORMED_TEXT',
  'UNSUPPORTED_VERSION',
  'UNSUPPORTED_CHARSET',
  'UNKNOWN_NAME',
  'UNREPRESENTABLE_CHARACTER',
  'UNREPRESENTABLE_EXTENSION',
]);

export class WbxmlError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message for people; may change in any release
   * @param {{ offset?: number, path?: string }} [where]
   */
  constructor(code, message, where = {}) {
    super(message);
    this.name = 'WbxmlError';
    this.code = code;
    if (where.offset !== undefined) this.offset = where.offset;
    if (where.path !== undefined) this.path = where.path;
  }
}

export const hex2 = (n) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

/** 'Namespace:Name', or just the name when the namespace is null. */
export const qualified = (namespace, name) => (namespace === null ? name : `${namespace}:${name}`);

/**
 * Path steps are shared by decode and encode. `frames` is a stack of
 * { namespace, name } (open elements, document frame excluded) with `index`
 * = position among earlier same-named siblings.
 */
export function formatPath(frames) {
  return frames.map((f) => `${qualified(f.namespace, f.name)}[${f.index}]`).join('/');
}

/** Counts same-(namespace, name) siblings under a parent frame. */
export function nextIndex(parent, namespace, name) {
  parent.counts ??= new Map();
  const key = `${namespace ?? ''}\u0000${name}`;
  const n = parent.counts.get(key) ?? 0;
  parent.counts.set(key, n + 1);
  return n;
}
