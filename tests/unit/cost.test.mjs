import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_PER_MONTH, contextFill, monthlyCost, ratesFor, requestCost, requestCostRange } from '../../src/js/cost.js';

const provider = { batchDiscount: 0.5 };
const openaiLike = {
  context: 1_050_000, maxOutput: 128_000, providerInfo: provider,
  price: { input: 2, cachedInput: 0.2, output: 12 },
  longContext: { above: 272_000, input: 4, cachedInput: 0.4, output: 18 },
};
const noCache = { context: 8192, maxOutput: 8192, providerInfo: provider, price: { input: 30, cachedInput: null, output: 60 }, longContext: null };
const near = (a, b) => Math.abs(a - b) < 1e-12;

test('a plain request is input plus output at the base rates', () => {
  const c = requestCost(openaiLike, { system: 1000, user: 500, output: 250 });
  assert.ok(near(c.total, (1500 * 2 + 250 * 12) / 1e6));
  assert.equal(c.longContext, false);
});

test('zero tokens cost nothing', () => {
  assert.equal(requestCost(openaiLike, { system: 0, user: 0, output: 0 }).total, 0);
});

test('the long-context tier starts strictly above the threshold', () => {
  assert.equal(ratesFor(openaiLike, 272_000).longContext, false);
  assert.equal(ratesFor(openaiLike, 272_001).longContext, true);
});

test('long-context rates apply to the whole request, output included', () => {
  const c = requestCost(openaiLike, { system: 0, user: 300_000, output: 1000 });
  assert.ok(near(c.total, (300_000 * 4 + 1000 * 18) / 1e6));
});

test('caching discounts only the system prompt', () => {
  const c = requestCost(openaiLike, { system: 10_000, user: 1000, output: 0 }, { cacheSystem: true });
  assert.ok(near(c.cached, (10_000 * 0.2) / 1e6));
  assert.ok(near(c.input, (1000 * 2) / 1e6));
  assert.equal(c.cacheApplied, true);
});

test('caching a model with no cached rate changes nothing and says so', () => {
  const plain = requestCost(noCache, { system: 1000, user: 100, output: 10 });
  const cached = requestCost(noCache, { system: 1000, user: 100, output: 10 }, { cacheSystem: true });
  assert.equal(cached.total, plain.total);
  assert.equal(cached.cacheApplied, false);
  assert.equal(cached.cacheUnavailable, true);
});

test('batch halves every part of the cost', () => {
  const tokens = { system: 5000, user: 2000, output: 800 };
  assert.ok(near(requestCost(openaiLike, tokens, { batch: true }).total, requestCost(openaiLike, tokens).total / 2));
});

test('batch and caching stack', () => {
  const tokens = { system: 5000, user: 2000, output: 800 };
  const both = requestCost(openaiLike, tokens, { batch: true, cacheSystem: true }).total;
  assert.ok(near(both, requestCost(openaiLike, tokens, { cacheSystem: true }).total / 2));
});

test('output tokens are priced at the output rate', () => {
  const a = requestCost(openaiLike, { system: 0, user: 0, output: 1_000_000 });
  assert.ok(near(a.total, 12));
});

test('a monthly projection is per-request × requests/day × 30', () => {
  assert.equal(DAYS_PER_MONTH, 30);
  assert.ok(near(monthlyCost(0.002, 1000), 60));
});

test('cost ranges are ordered and follow the token ranges', () => {
  const ranges = { system: { low: 900, point: 1000, high: 1200 }, user: { low: 90, point: 100, high: 120 } };
  const r = requestCostRange(openaiLike, ranges, 200, {});
  assert.ok(r.low < r.point && r.point < r.high);
});

test('cost never falls as tokens rise, even across the long-context jump', () => {
  let previous = -1;
  for (let n = 200_000; n <= 400_000; n += 1000) {
    const total = requestCost(openaiLike, { system: 0, user: n, output: 500 }).total;
    assert.ok(total >= previous, `cost fell at ${n}`);
    previous = total;
  }
});

test('context fill counts prompt and response together', () => {
  const f = contextFill({ context: 200_000, maxOutput: 64_000 }, 150_000, 60_000);
  assert.equal(f.used, 210_000);
  assert.equal(f.overflow, true);
  assert.ok(near(f.share, 1.05));
});

test('a request that fits exactly does not overflow', () => {
  assert.equal(contextFill({ context: 1000, maxOutput: 500 }, 600, 400).overflow, false);
});

test('an output longer than the model can produce is flagged', () => {
  assert.equal(contextFill({ context: 1_000_000, maxOutput: 64_000 }, 10, 65_000).outputTooLong, true);
});
