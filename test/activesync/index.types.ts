// Type tests for the 'wbxml/activesync' entry point. Compiled by `npm run test:types`; never run.
import { decode, encode } from 'wbxml';
import type { LanguageTable } from 'wbxml';
import { activesync } from 'wbxml/activesync';

const table: Readonly<LanguageTable> = activesync;
const doc = decode(new Uint8Array(0), activesync);
const bytes: Uint8Array = encode(doc, activesync);
void table;
void bytes;

// @ts-expect-error activesync is readonly
activesync.literals = true;
