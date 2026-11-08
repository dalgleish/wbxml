// Encode: an element's attribute list (spec: Encode rules → Attributes and PIs).
// The attribute code page is tracked here, apart from the tag code page, and
// SWITCH_PAGE is written only on a change.
import {
  SWITCH_PAGE, END, PI, STR_I, OPAQUE, LITERAL,
} from './codes.js';
import { qualified } from './errors.js';
import { fail, writeExtension, writeEntityText } from './encode-shared.js';

const isObject = (x) => x !== null && typeof x === 'object';

/** Parts of an attribute value, adjacent text merged (as decode does). */
function normalizeParts(value, ctx) {
  if (!Array.isArray(value)) throw new TypeError('an attribute\'s value must be an array of parts');
  const parts = [];
  for (const part of value) {
    if (!isObject(part)) throw new TypeError('an attribute value part must be an object');
    if (part.type === 'text') {
      if (typeof part.value !== 'string') throw new TypeError(`a text part's value must be a string; got ${typeof part.value}`);
      if (!part.value.isWellFormed()) fail(ctx, 'MALFORMED_TEXT', 'attribute text holds an unpaired surrogate');
      if (part.value.includes('\u0000')) fail(ctx, 'UNREPRESENTABLE_CHARACTER', 'attribute text holds U+0000');
      const last = parts[parts.length - 1];
      if (last?.type === 'text') last.value += part.value;
      else parts.push({ type: 'text', value: part.value });
    } else if (part.type === 'opaque') {
      if (!(part.value instanceof Uint8Array)) throw new TypeError('an opaque part\'s value must be a Uint8Array');
      parts.push(part);
    } else if (part.type === 'extension') {
      parts.push(part);
    } else {
      throw new TypeError(`attribute value part type ${JSON.stringify(part.type)} is not supported`);
    }
  }
  return parts;
}

/** The candidate with the longest `key`, then the current page, then the lowest page and token. */
function pick(candidates, key, currentPage) {
  let best;
  for (const c of candidates) {
    if (best === undefined) best = c;
    else {
      const d = key(c) - key(best)
        || (c.page === currentPage) - (best.page === currentPage)
        || best.page - c.page
        || best.token - c.token;
      if (d > 0) best = c;
    }
  }
  return best;
}

function switchAttributePage(ctx, page) {
  if (page === ctx.attrPage) return;
  ctx.out.byte(SWITCH_PAGE);
  ctx.out.byte(page);
  ctx.attrPage = page;
}

function writeRun(ctx, run) {
  if (run !== '') writeEntityText(ctx, run);
}

/** Text after the start's prefix: the greedy longest value token at each position, STR_I runs between. */
function writeText(ctx, value) {
  if (value === '') return;
  let runStart = 0;
  let pos = 0;
  while (pos < value.length) {
    const matches = ctx.index.attributeValues.filter((v) => value.startsWith(v.text, pos));
    const best = pick(matches, (v) => v.text.length, ctx.attrPage);
    if (best === undefined) {
      pos += 1;
    } else {
      writeRun(ctx, value.slice(runStart, pos));
      switchAttributePage(ctx, best.page);
      ctx.out.byte(best.token);
      pos += best.text.length;
      runStart = pos;
    }
  }
  writeRun(ctx, value.slice(runStart));
}

/** One attribute (or PI): its start or LITERAL name, then the value parts. */
function writeAttribute(ctx, attribute) {
  if (!isObject(attribute) || typeof attribute.name !== 'string') {
    throw new TypeError('an attribute needs a string name and a value array');
  }
  const parts = normalizeParts(attribute.value, ctx);
  const lead = parts[0]?.type === 'text' ? parts[0].value : '';
  const starts = (ctx.index.attributeStarts.get(attribute.name) ?? [])
    .filter((s) => s.prefix === '' || lead.startsWith(s.prefix));
  const start = pick(starts, (s) => s.prefix.length, ctx.attrPage);
  let consumed = 0;
  if (start !== undefined) {
    switchAttributePage(ctx, start.page);
    ctx.out.byte(start.token);
    consumed = start.prefix.length;
  } else {
    if (!ctx.index.literals) fail(ctx, 'UNKNOWN_NAME', `attribute ${qualified(null, attribute.name)} is not in the language table`);
    const offset = ctx.strings.add(attribute.name, 'the attribute name', ctx);
    ctx.out.byte(LITERAL);
    ctx.out.mbUInt32(offset);
  }
  parts.forEach((part, i) => {
    if (part.type === 'opaque') {
      ctx.out.byte(OPAQUE);
      ctx.out.mbUInt32(part.value.length);
      ctx.out.bytes(part.value);
    } else if (part.type === 'extension') {
      writeExtension(ctx, part);
    } else if (part.value === '') {
      ctx.out.byte(STR_I); // an empty string stays a part: STR_I "" (decode gives text '')
      ctx.out.bytes(ctx.codec.terminator);
    } else {
      writeText(ctx, i === 0 ? part.value.slice(consumed) : part.value);
    }
  });
}

/** Writes every attribute of an element, then END. The element is the innermost open frame. */
export function writeAttributes(ctx, attributes) {
  attributes.forEach((attribute) => writeAttribute(ctx, attribute));
  ctx.out.byte(END);
}

/** A PI node: PI, a target (an attribute start) and a value, then END. */
export function writePi(ctx, node) {
  ctx.out.byte(PI);
  writeAttribute(ctx, node);
  ctx.out.byte(END);
}
