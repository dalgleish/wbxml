import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// WBXML_SEED=random picks a seed and prints it, so that a failing run can be replayed.
const seedIn = (value) => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', "import { SEED } from './test/helpers.js'; console.log(SEED);"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WBXML_SEED: value },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  return { seed: Number(run.stdout), stderr: run.stderr };
};

test('WBXML_SEED=n is used as given and not announced', () => {
  assert.deepEqual(seedIn('7'), { seed: 7, stderr: '' });
});

test('WBXML_SEED=random picks an integer seed and prints it', () => {
  const { seed, stderr } = seedIn('random');
  assert.ok(Number.isInteger(seed) && seed >= 0, `seed ${seed}`);
  assert.match(stderr, new RegExp(`WBXML_SEED=${seed}\\b`));
});
