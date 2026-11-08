// Shared test helpers. Not a test file (the test glob is test/*.test.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WbxmlError, decode, encode } from 'wbxml';

const attributePages = {
  0: {
    starts: { 5: { name: 'href', prefix: 'http://' }, 6: { name: 'href', prefix: 'https://' }, 7: { name: 'class' }, 8: { name: 'src' } },
    values: { 0x85: '.com', 0x86: '.org', 0x87: 'www.' },
  },
  1: { starts: { 5: { name: 'href' }, 6: { name: 'id', prefix: 'x-' } }, values: { 0x85: 'ab', 0xC5: 'abc' } },
};
const tagPages = {
  0: { namespace: 'A', tags: { 5: 'Sync', 6: 'Item', 7: 'Blob' }, opaque: ['Blob'] },
  1: { namespace: 'B', tags: { 5: 'Name', 6: 'Item' } },
  2: { namespace: 'A', tags: { 5: 'More' } },
  3: { tags: { 5: 'Bare', 6: 'Blob' }, opaque: ['Blob'] },
};
/** The core language tables the fuzz decodes with. */
export const tables = {
  'rich, literals': { publicId: 1, tagPages, attributePages },
  'rich, strict': { publicId: 1, literals: false, tagPages, attributePages },
  'ext offsets': { extTStringOffsets: true, tagPages, attributePages: { 0: attributePages[0] } },
  'strict, no attributes': { literals: false, tagPages },
  'one bare page': { tagPages: { 0: { tags: { 5: 'Root', 6: 'Leaf' } } } },
};


// Every file that makes hex vectors fuzzes its own (per-process) vectors, so no suite runs twice.
const vectors = [];
let registered = false;

/**
 * Tagged template for annotated hex vectors: whitespace and `//` comments
 * (to end of line) are ignored.
 *   hex`03 01 6A 00   // header
 *       00            // empty string table`
 */
export function hex(strings, ...values) {
  const source = String.raw({ raw: strings }, ...values);
  const digits = source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(digits)) {
    throw new Error(`hex: not whole hex bytes: ${digits}`);
  }
  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  vectors.push(out);
  if (!registered) {
    registered = true;
    const file = process.argv[1]?.split('/').pop() ?? 'tests';
    // About 10 files make vectors: together they get the default RUNS * 10 mutations.
    test(`fuzz: mutated vectors of ${file} decode, or throw WbxmlError; what decodes re-encodes and round-trips`, () => {
      checkMutants(file, Object.values(tables), vectors, RUNS);
    });
  }
  return out;
}

/**
 * Asserts that `fn` throws a WbxmlError with exactly the given `code`, and
 * `path`, and `offset` when the error carries one (decode errors do; encode
 * errors don't), so `expected` must give them. Messages are never compared.
 */
export function assertWbxmlError(fn, expected) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof WbxmlError, `expected WbxmlError, got ${error}`);
    assert.equal(error.name, 'WbxmlError');
    assert.equal(error.code, expected.code, `code (${error.message})`);
    assert.ok('path' in expected, `the expected error needs a path (got ${error.path})`);
    assert.equal(error.path, expected.path, `path (${error.message})`);
    if (error.offset !== undefined) {
      assert.ok('offset' in expected, `the expected error needs an offset (got ${error.offset})`);
      assert.equal(error.offset, expected.offset, `offset (${error.message})`);
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Properties and fuzzing (spec: Testing Decisions → Properties and fuzzing).
// A hand-written seeded generator: no dependencies, no shrinking. A failure
// prints the WBXML_SEED / WBXML_RUNS values that replay exactly that case.
// ---------------------------------------------------------------------------

/** mulberry32: a small seeded PRNG. `rng()` is a float in [0, 1). */
export function prng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n); // 0 .. n-1
  rng.chance = (p) => rng() < p;
  rng.pick = (list) => list[rng.int(list.length)];
  return rng;
}

/** WBXML_SEED (default 1; `random` picks one and prints it) and WBXML_RUNS (default 1000 Documents per table; mutations default to 10 times that). */
export const SEED = process.env.WBXML_SEED === 'random' ? Math.floor(Math.random() * 2 ** 32) : Number(process.env.WBXML_SEED ?? 1);
if (process.env.WBXML_SEED === 'random') console.error(`WBXML_SEED=${SEED} (random; set it to replay)`);
export const RUNS = Number(process.env.WBXML_RUNS ?? 1000);

/** Runs `fn(rng, i)` for `count` cases; case i uses seed SEED + i. A failure names the seed that replays it. */
export function forEachCase(label, count, fn) {
  for (let i = 0; i < count; i += 1) {
    try {
      fn(prng(SEED + i), i);
    } catch (cause) {
      throw new Error(`${label}: replay with WBXML_SEED=${SEED + i} WBXML_RUNS=1 (${cause?.message})`, { cause });
    }
  }
}

const CHARSETS = [3, 4, 106, 1013, 1014, 1015];
// Characters by what a charset can hold. Names, PI targets, extension strings and text public ids can't use ENTITY.
const ASCII = ['a', 'b', 'Z', '0', '-', '_', ' ', '.', ':', '/', '\u0001'];
const LATIN1 = ['é', 'ÿ', '\u0080'];
const WIDE = ['Ā', '€', '😀', '﻿', '￾', '\u{10FFFF}'];

const alphabet = (charset, restricted) => {
  if (restricted && charset === 3) return ASCII;
  if (restricted && charset === 4) return [...ASCII, ...LATIN1];
  return [...ASCII, ...LATIN1, ...WIDE];
};

const randomString = (rng, charset, restricted, max = 5) => {
  const chars = alphabet(charset, restricted);
  let s = '';
  for (let n = 1 + rng.int(max); n > 0; n -= 1) s += rng.pick(chars);
  return s;
};

const randomBytes = (rng) => Uint8Array.from({ length: rng.int(9) }, () => rng.int(256));

const tagEntries = (table) => Object.values(table.tagPages).flatMap((page) => Object.values(page.tags)
  .map((name) => ({ namespace: page.namespace ?? null, name, opaque: page.opaque?.includes(name) ?? false })));

/**
 * Builds a random Document for `table` that is canonical, meaning decode of
 * its encoding gives it back (see `roundTripped` for the one exception). It
 * covers every node type, and attributes, PIs and LITERALs wherever the table
 * allows them. All six charsets are used.
 */
export function generateDocument(rng, table) {
  const literals = table.literals !== false;
  const charset = rng.pick(CHARSETS);
  const tags = tagEntries(table);
  const namespaces = [...new Set(Object.values(table.tagPages).map((page) => page.namespace ?? null))];
  const pages = Object.values(table.attributePages ?? {});
  const starts = pages.flatMap((page) => Object.values(page.starts ?? {}));
  const valueTokens = pages.flatMap((page) => Object.values(page.values ?? {}));
  const canName = literals || starts.length > 0; // attributes and PIs need a start or a LITERAL
  const str = (restricted, max) => randomString(rng, charset, restricted, max);

  const extension = () => {
    const node = { type: 'extension', index: rng.int(3) };
    const form = rng.int(3);
    if (form === 1) node.value = str(true);
    else if (form === 2 && !table.extTStringOffsets) node.value = rng.pick([0, 1, 255, 70000, 0xffffffff]);
    return node;
  };
  const opaque = () => ({ type: 'opaque', value: randomBytes(rng) });
  // Adjacent text is one part, so there are never two text parts in a row.
  const parts = (lead) => {
    const out = [];
    if (lead !== undefined) out.push({ type: 'text', value: lead + (rng.chance(0.5) ? str(false) : '') });
    for (let n = rng.int(4); n > 0; n -= 1) {
      const kind = rng.int(3);
      if (kind === 0) {
        if (out.at(-1)?.type === 'text') continue;
        const pieces = [str(false), ...valueTokens];
        out.push({ type: 'text', value: Array.from({ length: 1 + rng.int(3) }, () => rng.pick(pieces)).join('') });
      } else {
        out.push(kind === 1 ? extension() : opaque());
      }
    }
    return out;
  };
  // A name with a value. Under literals: false it must be a table start, and a prefixed start needs a value that begins with its prefix.
  const named = () => {
    if (starts.length === 0 || (literals && rng.chance(0.3))) return { name: str(true), value: parts() };
    const start = rng.pick(starts);
    const prefixed = start.prefix !== undefined && (!literals || rng.chance(0.6));
    return { name: start.name, value: parts(prefixed ? start.prefix : undefined) };
  };
  const instruction = () => ({ type: 'instruction', ...named() });

  const budget = { nodes: 1 + rng.int(40) };
  const element = (depth) => {
    budget.nodes -= 1;
    let entry;
    if (tags.length > 0 && (!literals || rng.chance(0.75))) {
      entry = rng.pick(tags);
    } else {
      entry = { namespace: rng.pick(namespaces), name: str(true), opaque: false };
    }
    const node = {
      type: 'element',
      namespace: entry.namespace,
      name: entry.name,
      attributes: canName ? Array.from({ length: rng.int(3) }, named) : [],
      children: [],
    };
    if (rng.chance(0.05)) {
      node.children = [{ type: 'text', value: '' }];
      return node;
    }
    for (let n = depth < 6 ? rng.int(5) : 0; n > 0 && budget.nodes > 0; n -= 1) {
      const kind = rng.int(8);
      if (kind < 3) {
        node.children.push(element(depth + 1));
      } else if (kind < 5) {
        // Opaque-flagged elements get ASCII text only, so its bytes are the same in every charset.
        if (node.children.at(-1)?.type !== 'text') {
          node.children.push({ type: 'text', value: entry.opaque ? randomAscii(rng) : str(false) });
        }
      } else if (kind === 5) {
        node.children.push(extension());
      } else if (kind === 6) {
        node.children.push(opaque());
      } else if (canName) {
        node.children.push(instruction());
      }
    }
    return node;
  };

  const children = [element(0)];
  if (canName) {
    for (let n = rng.int(3); n > 0; n -= 1) children.unshift(instruction());
    for (let n = rng.int(3); n > 0; n -= 1) children.push(instruction());
  }
  const publicId = rng.chance(0.3) ? str(true) : rng.pick([1, 2, 0x1234, 0x7f, 0x80, 0xffffffff]);
  return { type: 'document', version: rng.pick(['1.1', '1.2', '1.3']), publicId, charset, children };
}

const randomAscii = (rng) => Array.from({ length: 1 + rng.int(5) }, () => rng.pick(ASCII.slice(0, -1))).join('');

// Bytes of text in a charset, with no terminator and no BOM (the text is assumed to fit the charset).
const textBytes = (text, charset) => {
  if (charset === 106) return new TextEncoder().encode(text);
  if (charset < 106) return Uint8Array.from(text, (c) => c.codePointAt(0));
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i += 1) view.setUint16(i * 2, text.charCodeAt(i), charset === 1014);
  return out;
};

/**
 * What decode(encode(document, table), table) must equal: the document, except
 * that text in an element on its code page's `opaque` list comes back as an
 * opaque node holding the text's bytes in the document charset. (The generator only puts
 * ASCII text in such elements, so that every charset can hold it.)
 */
export function roundTripped(document, table) {
  const key = (namespace, name) => JSON.stringify([namespace, name]);
  const flagged = new Set(Object.values(table.tagPages)
    .flatMap((page) => (page.opaque ?? []).map((name) => key(page.namespace ?? null, name))));
  const charset = document.charset ?? 106;
  const walk = (node) => {
    if (node.type !== 'element' && node.type !== 'document') return node;
    const opaqueText = node.type === 'element' && flagged.has(key(node.namespace, node.name));
    return {
      ...node,
      children: node.children.map((child) => (opaqueText && child.type === 'text'
        ? { type: 'opaque', value: textBytes(child.value, charset) }
        : walk(child))),
    };
  };
  return walk(document);
}

const INTERESTING = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x40, 0x45, 0x46, 0x80, 0x83, 0xc3, 0xc4, 0xff];
const randomByte = (rng) => (rng.chance(0.6) ? rng.pick(INTERESTING) : rng.int(256));

/** One to three random edits of `bytes`: byte flips, truncations, insertions and splices. `others` supplies splice material. */
export function mutate(rng, bytes, others) {
  let out = Array.from(bytes);
  for (let n = 1 + rng.int(3); n > 0; n -= 1) {
    const at = rng.int(out.length + 1);
    switch (rng.int(5)) {
      case 0:
        if (out.length) out[Math.min(at, out.length - 1)] ^= 1 << rng.int(8);
        break;
      case 1:
        if (out.length) out[Math.min(at, out.length - 1)] = randomByte(rng);
        break;
      case 2:
        out = out.slice(0, at);
        break;
      case 3:
        out.splice(at, 0, ...Array.from({ length: 1 + rng.int(4) }, () => randomByte(rng)));
        break;
      default: {
        const donor = rng.pick(others);
        const from = rng.int(donor.length + 1);
        out.splice(at, rng.int(4), ...donor.slice(from, from + 1 + rng.int(12)));
      }
    }
  }
  return Uint8Array.from(out);
}

/** Property: for `runs` generated Documents, decode(encode(d)) is d (see `roundTripped`). */
export function checkRoundTrips(label, table, runs = RUNS) {
  forEachCase(`${label} round trip`, runs, (rng) => {
    const document = generateDocument(rng, table);
    assert.deepStrictEqual(decode(encode(document, table), table), roundTripped(document, table));
  });
}

/**
 * Fuzz: mutates `seeds` (byte arrays) `count` times and decodes each mutant with
 * every table. decode must return a Document or null or throw WbxmlError, and
 * a Document must encode and round-trip.
 */
export function checkMutants(label, tables, seeds, count = RUNS * 10) {
  forEachCase(`${label} fuzz`, count, (rng) => {
    const mutant = mutate(rng, rng.pick(seeds), seeds);
    for (const table of tables) {
      let document;
      try {
        document = decode(mutant, table);
      } catch (error) {
        if (error instanceof WbxmlError) continue;
        throw error;
      }
      if (document === null) continue;
      assert.deepStrictEqual(decode(encode(document, table), table), roundTripped(document, table));
    }
  });
}
