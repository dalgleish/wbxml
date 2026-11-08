import { test } from 'node:test';
import { encode } from 'wbxml';
import { tables, prng, generateDocument, checkRoundTrips, checkMutants } from './helpers.js';

for (const [name, table] of Object.entries(tables)) {
  test(`property: decode(encode(d)) is d over generated Documents (${name})`, () => {
    checkRoundTrips(name, table);
  });
}

test('fuzz: a mutated vector or Document decodes, or throws WbxmlError; what decodes re-encodes and round-trips', () => {
  const seeds = [];
  const rng = prng(1); // a fixed corpus, so that WBXML_SEED=n WBXML_RUNS=1 replays mutation n
  for (const table of Object.values(tables)) {
    for (let i = 0; i < 40; i += 1) seeds.push(encode(generateDocument(rng, table), table));
  }
  checkMutants('core tables', Object.values(tables), seeds);
});
