import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { percent, shortDate, tokens, usd } from '../../src/js/format.js';
import { CLAUSE, TIMES } from '../../src/data/long-document.js';

test('money keeps precision proportional to size', () => {
  assert.equal(usd(0), '$0');
  assert.equal(usd(0.000042), '$0.000042');
  assert.equal(usd(0.0123456), '$0.0123');
  assert.equal(usd(3.14159), '$3.14');
  assert.equal(usd(12345.6), '$12,346');
  assert.equal(usd(Number.NaN), '—');
});

test('tiny amounts never collapse to zero or scientific notation', () => {
  assert.equal(usd(0.00000042), '$0.00000042');
});

test('token counts are grouped', () => assert.equal(tokens(254800), '254,800'));

test('percentages keep small shares visible', () => {
  assert.equal(percent(0), '0%');
  assert.equal(percent(0.00001), '<0.01%');
  assert.equal(percent(0.0042), '0.42%');
  assert.equal(percent(0.5), '50.0%');
  assert.equal(percent(1.27), '127%');
});

test('dates render in UTC, not the machine timezone', () => {
  assert.equal(shortDate('2026-11-21'), 'Nov 21, 2026');
});

test('the stress-test document is byte-identical to the long-document fixture', () => {
  const corpus = fs.readFileSync(new URL('../fixtures/corpus/legal-clause.txt', import.meta.url), 'utf8');
  const spec = JSON.parse(fs.readFileSync(new URL('../fixtures/cases.json', import.meta.url), 'utf8'));
  assert.equal(CLAUSE, corpus);
  assert.equal(TIMES, spec.cases.find((c) => c.id === 'long-document').repeat.times);
});
