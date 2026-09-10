import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ESTIMATE_METHODS, isAtypical, tokensFor } from '../../src/js/estimate.js';

const corpus = (f) => fs.readFileSync(new URL(`../fixtures/corpus/${f}`, import.meta.url), 'utf8');
const exact = (encoding) => ({ tokenizer: { kind: 'exact', encoding, assumed: false } });
const estimate = (method) => ({ tokenizer: { kind: 'estimate', method } });
const measured = { o200k: 1000, cl100k: 1100, chars: 4200, atypical: false };

test('exact models return the exact count as a zero-width range', () => {
  assert.deepEqual(tokensFor(exact('o200k_base'), measured), { low: 1000, point: 1000, high: 1000, exact: true });
  assert.equal(tokensFor(exact('cl100k_base'), measured).point, 1100);
});

for (const method of Object.keys(ESTIMATE_METHODS)) {
  test(`${method}: low ≤ point ≤ high, and not exact`, () => {
    for (const atypical of [false, true]) {
      const r = tokensFor(estimate(method), { ...measured, atypical });
      assert.ok(r.low <= r.point && r.point <= r.high, JSON.stringify(r));
      assert.equal(r.exact, false);
    }
  });
  test(`${method}: empty text is zero`, () => {
    assert.deepEqual(tokensFor(estimate(method), { o200k: 0, cl100k: 0, chars: 0, atypical: false }),
      { low: 0, point: 0, high: 0, exact: false });
  });
  test(`${method}: carries a source`, () => {
    assert.match(ESTIMATE_METHODS[method].source, /^https:\/\//);
  });
}

test('Claude previous tokenizer matches the published 15–20% undercount', () => {
  const r = tokensFor(estimate('claude-previous'), measured);
  assert.deepEqual([r.low, r.high], [1150, 1200]);
});

test('Claude 4.7+ is derived as ~30% more than the previous tokenizer', () => {
  const prev = ESTIMATE_METHODS['claude-previous'].multipliers;
  const curr = ESTIMATE_METHODS['claude-current'].multipliers;
  assert.ok(Math.abs(curr.point / prev.point - 1.3) < 1e-9);
  assert.ok(tokensFor(estimate('claude-current'), measured).point > tokensFor(estimate('claude-previous'), measured).point);
});

test('atypical text widens only the upper bound of a Claude estimate', () => {
  const typical = tokensFor(estimate('claude-current'), measured);
  const wide = tokensFor(estimate('claude-current'), { ...measured, atypical: true });
  assert.equal(wide.low, typical.low);
  assert.equal(wide.point, typical.point);
  assert.ok(wide.high > typical.high);
});

test('Gemini brackets the characters rule and the o200k count', () => {
  const r = tokensFor(estimate('gemini'), measured); // 4200 chars / 4 = 1050, o200k = 1000
  assert.deepEqual([r.low, r.point, r.high], [1000, 1050, 1050]);
});

test('Gemini uses the o200k count as its point for atypical text', () => {
  const r = tokensFor(estimate('gemini'), { o200k: 900, cl100k: 0, chars: 300, atypical: true });
  assert.equal(r.point, 900);
  assert.equal(r.low, 75);
});

test('an unknown method throws rather than guessing', () => {
  assert.throws(() => tokensFor(estimate('vibes'), measured), /unknown estimate method/);
});

// --- the atypical detector, on real corpus text ------------------------------

test('English prose is typical', () => assert.equal(isAtypical(corpus('english-prose.txt')), false));
test('legal English is typical', () => assert.equal(isAtypical(corpus('legal-clause.txt')), false));
test('Kazakh is atypical', () => assert.equal(isAtypical(corpus('kazakh-prose.txt')), true));
test('Chinese is atypical', () => assert.equal(isAtypical(corpus('chinese-prose.txt')), true));
test('code is atypical', () => assert.equal(isAtypical(corpus('javascript-code.js.txt')), true));
test('empty text is typical', () => assert.equal(isAtypical(''), false));
