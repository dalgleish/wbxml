// Language table checking and indexing. A table is checked the first time it
// is seen, then its lookups are cached by object identity.
//
// Each section of the table (tag pages now; attribute pages, opaque lists
// later) has its own builder that adds to the index.
import { FIRST_TAG_TOKEN, TOKEN_MASK } from './codes.js';
import { qualified } from './errors.js';

const cache = new WeakMap();
const START_RANGES = [[0x05, 0x3f], [0x45, 0x7f]];
const VALUE_RANGES = [[0x85, 0xbf], [0xc5, 0xff]];

const describe = (x) => (x === null ? 'null' : Array.isArray(x) ? 'an array' : typeof x);

export const nameKey = (namespace, name) => `${namespace ?? ''}\u0000${name}`;

function parseNumber(key, what, min, max) {
  const n = /^\d+$/.test(key) ? Number(key) : NaN;
  if (!(n >= min && n <= max)) {
    throw new TypeError(`Language table: ${what} ${JSON.stringify(key)} is not a number in ${hexOrDec(min)}-${hexOrDec(max)}`);
  }
  return n;
}
const hexOrDec = (n) => (n > 255 ? String(n) : `0x${n.toString(16).toUpperCase()}`);

/** `opaque`: names on this code page whose text content is written as OPAQUE. */
function indexOpaque(page, pageNumber, namespace, names, index) {
  if (page.opaque === undefined) return;
  if (!Array.isArray(page.opaque)) {
    throw new TypeError(`Language table: opaque on tag code page ${pageNumber} must be an array of names`);
  }
  const onPage = new Set(names.values());
  for (const name of page.opaque) {
    if (typeof name !== 'string' || !onPage.has(name)) {
      throw new TypeError(`Language table: opaque name ${JSON.stringify(name)} is not a tag on code page ${pageNumber}`);
    }
    index.tokens.get(nameKey(namespace, name)).opaque = true;
  }
}

function indexTagPages(table, index) {
  const pages = table.tagPages;
  if (pages === null || typeof pages !== 'object') {
    throw new TypeError(`Language table: tagPages must be an object; got ${describe(pages)}`);
  }
  for (const [pageKey, page] of Object.entries(pages)) {
    const pageNumber = parseNumber(pageKey, 'tag code page number', 0, 255);
    if (page === null || typeof page !== 'object') {
      throw new TypeError(`Language table: tag code page ${pageNumber} must be an object`);
    }
    const namespace = page.namespace ?? null;
    const names = new Map();
    const opaque = new Set();
    for (const [tokenKey, name] of Object.entries(page.tags ?? {})) {
      const token = parseNumber(tokenKey, `tag token on code page ${pageNumber}`, FIRST_TAG_TOKEN, TOKEN_MASK);
      if (typeof name !== 'string') {
        throw new TypeError(`Language table: tag token ${tokenKey} on code page ${pageNumber} must be a name string`);
      }
      const key = nameKey(namespace, name);
      if (index.tokens.has(key)) {
        throw new TypeError(`Language table: ${qualified(namespace, name)} appears twice across tag code pages`);
      }
      index.tokens.set(key, { page: pageNumber, token, opaque: false });
      names.set(token, name);
    }
    indexOpaque(page, pageNumber, namespace, names, index);
    index.pages.set(pageNumber, { namespace, names });
  }
}

const inRanges = (n, ranges) => ranges.some(([lo, hi]) => n >= lo && n <= hi);

/** Attribute code pages: `starts` (name, optional value prefix) and `values` (value-token text). */
function indexAttributePages(table, index) {
  const pages = table.attributePages ?? {};
  if (pages === null || typeof pages !== 'object') {
    throw new TypeError(`Language table: attributePages must be an object; got ${describe(pages)}`);
  }
  for (const [pageKey, page] of Object.entries(pages)) {
    const pageNumber = parseNumber(pageKey, 'attribute code page number', 0, 255);
    if (page === null || typeof page !== 'object') {
      throw new TypeError(`Language table: attribute code page ${pageNumber} must be an object`);
    }
    const entry = { starts: new Map(), values: new Map() };
    for (const [tokenKey, start] of Object.entries(page.starts ?? {})) {
      const token = parseNumber(tokenKey, `attribute start token on code page ${pageNumber}`, FIRST_TAG_TOKEN, 0x7f);
      if (!inRanges(token, START_RANGES)) {
        throw new TypeError(`Language table: attribute start token ${tokenKey} on code page ${pageNumber} is outside 0x05-0x3F and 0x45-0x7F`);
      }
      if (start === null || typeof start !== 'object' || typeof start.name !== 'string'
        || (start.prefix !== undefined && typeof start.prefix !== 'string')) {
        throw new TypeError(`Language table: attribute start ${tokenKey} on code page ${pageNumber} must be { name, prefix? } with strings`);
      }
      const record = { page: pageNumber, token, name: start.name, prefix: start.prefix ?? '' };
      entry.starts.set(token, record);
      if (!index.attributeStarts.has(start.name)) index.attributeStarts.set(start.name, []);
      index.attributeStarts.get(start.name).push(record);
    }
    for (const [tokenKey, text] of Object.entries(page.values ?? {})) {
      const token = parseNumber(tokenKey, `attribute value token on code page ${pageNumber}`, 0x85, 0xff);
      if (!inRanges(token, VALUE_RANGES)) {
        throw new TypeError(`Language table: attribute value token ${tokenKey} on code page ${pageNumber} is outside 0x85-0xBF and 0xC5-0xFF`);
      }
      if (typeof text !== 'string' || text === '') {
        throw new TypeError(`Language table: attribute value token ${tokenKey} on code page ${pageNumber} must be a non-empty string`);
      }
      entry.values.set(token, text);
      index.attributeValues.push({ page: pageNumber, token, text });
    }
    index.attributePages.set(pageNumber, entry);
  }
}

/**
 * Checks `table` and returns its index:
 *   pages    Map page -> { namespace, names: Map token -> name }   (decode)
 *   tokens   Map nameKey(namespace, name) -> { page, token, opaque }     (encode)
 *   attributePages, attributeStarts, attributeValues   (attributes; see indexAttributePages)
 *   namespaces Set of namespaces that some tag code page carries
 */
export function indexTable(table) {
  if (table === null || typeof table !== 'object') {
    throw new TypeError(`A language table is required as the second argument; got ${describe(table)}`);
  }
  const cached = cache.get(table);
  if (cached) return cached;
  const index = {
    publicId: table.publicId,
    literals: table.literals !== false,
    extTStringOffsets: table.extTStringOffsets === true,
    pages: new Map(),
    tokens: new Map(),
    attributePages: new Map(), // page -> { starts: Map token -> record, values: Map token -> text }
    attributeStarts: new Map(), // name -> [{ page, token, name, prefix }]
    attributeValues: [], // [{ page, token, text }]
  };
  indexTagPages(table, index);
  indexAttributePages(table, index);
  index.namespaces = new Set([...index.pages.values()].map((p) => p.namespace));
  cache.set(table, index);
  return index;
}
