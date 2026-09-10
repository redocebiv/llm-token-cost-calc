import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countTokens } from '../../src/js/tokenizer.js';

const library = JSON.parse(fs.readFileSync(new URL('../../src/data/prompts.json', import.meta.url), 'utf8'));
const models = JSON.parse(fs.readFileSync(new URL('../../src/data/models.json', import.meta.url), 'utf8')).models;
const prompts = library.prompts;
const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum|XXX)\b|\[insert/i;

test('the library has twelve roles', () => assert.equal(prompts.length, 12));

test('it includes the four roles asked for', () => {
  for (const id of ['ai-engineer', 'backend-engineer', 'frontend-engineer', 'finance-analyst']) {
    assert.ok(prompts.some((p) => p.id === id), id);
  }
});

test('ids are unique, URL-safe slugs', () => {
  const ids = prompts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

for (const p of prompts) {
  test(`${p.id}: every field is present and non-empty`, () => {
    for (const key of ['role', 'summary', 'short', 'long', 'sampleUser']) {
      assert.equal(typeof p[key], 'string', key);
      assert.ok(p[key].trim().length > 0, key);
    }
    assert.ok(Array.isArray(p.tags) && p.tags.length > 0);
  });

  test(`${p.id}: the long version is substantially longer than the short one`, () => {
    assert.ok(p.long.length > p.short.length * 2, `${p.short.length} vs ${p.long.length} chars`);
  });

  test(`${p.id}: no placeholder text`, () => {
    for (const key of ['short', 'long', 'summary']) assert.doesNotMatch(p[key], PLACEHOLDER, key);
  });

  test(`${p.id}: no stray leading or trailing whitespace`, () => {
    assert.equal(p.short, p.short.trim());
    assert.equal(p.long, p.long.trim());
  });

  test(`${p.id}: token counts sit in a usable range`, async () => {
    const short = await countTokens(p.short);
    const long = await countTokens(p.long);
    assert.ok(short >= 40 && short <= 200, `short = ${short} tokens`);
    assert.ok(long >= 250 && long <= 700, `long = ${long} tokens`);
  });
}

test('every prompt fits the smallest context window with room to spare', async () => {
  const smallest = Math.min(...models.filter((m) => !m.legacy).map((m) => m.context));
  for (const p of prompts) assert.ok((await countTokens(p.long)) * 2 < smallest, p.id);
});

test('no word mixes Latin and Cyrillic letters', () => {
  // A Latin "M" inside the Kazakh word «Мысал» once slipped in here. It looks
  // identical on screen, but tokenizers, search and Kazakh readers' software
  // see a different, broken word — and no other test would notice.
  const mixed = [];
  for (const p of prompts) {
    for (const key of ['role', 'summary', 'short', 'long', 'sampleUser']) {
      for (const word of p[key].match(/\p{L}+/gu) ?? []) {
        if (/\p{Script=Latin}/u.test(word) && /\p{Script=Cyrillic}/u.test(word)) mixed.push(`${p.id}.${key}: ${word}`);
      }
    }
  }
  assert.deepEqual(mixed, []);
});

test('the translator prompt really contains Kazakh', () => {
  const kk = prompts.find((p) => p.id === 'kk-en-translator');
  assert.match(kk.long, /[әғқңөұүһі]/);
});
