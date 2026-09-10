import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENCODINGS, loadModels, problemsWith, promoStatus, visibleModels } from '../../src/js/models.js';
import { ENCODING_NAMES } from '../../src/js/tokenizer.js';

const data = JSON.parse(fs.readFileSync(new URL('../../src/data/models.json', import.meta.url), 'utf8'));
const models = loadModels(data);
const byId = new Map(models.map((m) => [m.id, m]));
const good = () => structuredClone(data.models.find((m) => m.id === 'gpt-5.6-terra'));

test('every row in the real pricing file validates', () => {
  assert.doesNotThrow(() => loadModels(data));
});

test('the data carries an as-of date', () => {
  assert.match(data.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

test('the validator knows exactly the encodings the tokenizer can load', () => {
  assert.deepEqual([...ENCODINGS].sort(), [...ENCODING_NAMES].sort());
});

test('there are about twenty current models across all three providers', () => {
  const current = models.filter((m) => !m.legacy);
  assert.ok(current.length >= 15 && current.length <= 24, `${current.length} current models`);
  for (const provider of Object.keys(data.providers)) {
    assert.ok(current.some((m) => m.provider === provider), `${provider} has a current model`);
  }
});

test('the current lineup includes a model the long test document overflows', () => {
  // The E2E suite relies on this: a 255K-token prompt must not fit somewhere.
  assert.ok(models.some((m) => !m.legacy && m.context < 255_000));
});

test('legacy cl100k models exist, so that encoding is actually exercised', () => {
  assert.ok(models.some((m) => m.tokenizer.encoding === 'cl100k_base'));
});

test('OpenAI rows are exact and every other provider is an estimate', () => {
  for (const m of models) {
    assert.equal(m.tokenizer.kind, m.provider === 'openai' ? 'exact' : 'estimate', m.id);
  }
});

// --- the validator rejects what it should ------------------------------------

const rejects = (mutate, pattern) => {
  const row = good();
  mutate(row);
  const problems = problemsWith(row, data.providers);
  assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern}, got ${JSON.stringify(problems)}`);
};

test('rejects a negative or zero price', () => {
  rejects((r) => { r.price.input = -1; }, /price\.input/);
  rejects((r) => { r.price.output = 0; }, /price\.output/);
});
test('rejects a cached price above the base price', () => rejects((r) => { r.price.cachedInput = 99; }, /cachedInput/));
test('rejects a row without an https source', () => rejects((r) => { r.source = 'http://example.com'; }, /source/));
test('rejects an unknown provider', () => rejects((r) => { r.provider = 'acme'; }, /provider/));
test('rejects a long-context threshold beyond the window', () => rejects((r) => { r.longContext.above = r.context; }, /longContext\.above/));
test('rejects a long-context price below the base price', () => rejects((r) => { r.longContext.input = 0.1; }, /longContext\.input/));
test('rejects an unknown encoding', () => rejects((r) => { r.tokenizer.encoding = 'p50k_base'; }, /encoding/));
test('rejects an unknown estimate method', () => rejects((r) => { r.tokenizer = { kind: 'estimate', method: 'vibes' }; }, /estimate method/));
test('rejects a malformed promo date', () => rejects((r) => { r.promoUntil = '21/11/2026'; }, /promoUntil/));
test('rejects max output larger than the context window', () => rejects((r) => { r.maxOutput = r.context + 1; }, /maxOutput/));

test('duplicate ids are rejected by the loader', () => {
  const broken = structuredClone(data);
  broken.models.push(good());
  assert.throws(() => loadModels(broken), /duplicate id/);
});

test('the loader reports every problem, not just the first', () => {
  const broken = structuredClone(data);
  broken.models[0].price.input = -1;
  broken.models[1].source = 'nope';
  assert.throws(() => loadModels(broken), (e) => /price\.input/.test(e.message) && /source/.test(e.message));
});

// --- promotions --------------------------------------------------------------

test('a promotion is active through its end date and ended after it', () => {
  const sol = byId.get('gpt-5.6-sol');
  assert.equal(promoStatus(sol, new Date('2026-09-10T12:00:00Z')), 'active');
  assert.equal(promoStatus(sol, new Date('2026-11-21T23:00:00Z')), 'active', 'the end date is inclusive');
  assert.equal(promoStatus(sol, new Date('2026-11-22T00:00:01Z')), 'ended');
  assert.equal(promoStatus(byId.get('gpt-5.6-terra')), 'none');
});

// --- filtering ---------------------------------------------------------------

test('legacy rows are hidden until asked for', () => {
  assert.ok(visibleModels(models).every((m) => !m.legacy));
  assert.equal(visibleModels(models, { showLegacy: true }).length, models.length);
});

test('provider filtering keeps only the chosen providers', () => {
  const onlyGoogle = visibleModels(models, { providers: ['google'] });
  assert.ok(onlyGoogle.length > 0 && onlyGoogle.every((m) => m.provider === 'google'));
});
