// The browser tokenizer must agree exactly with OpenAI's reference Python
// tiktoken on every case in the dataset — counts *and* leading token ids.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENCODING_NAMES, codePoints, countTokens, encodeTokens, loadEncoder,
} from '../../src/js/tokenizer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const fixtures = JSON.parse(read('tests/fixtures/token_cases.json'));
const spec = JSON.parse(read('tests/fixtures/cases.json'));
const inline = new Map(spec.cases.filter((c) => 'text' in c).map((c) => [c.id, c.text]));
const prompts = fs.existsSync(path.join(root, 'src/data/prompts.json'))
  ? new Map(JSON.parse(read('src/data/prompts.json')).prompts.map((p) => [p.id, p]))
  : new Map();

// Node's 'utf8' read keeps \r\n as-is, matching the generator's newline="".
const corpus = (file) => read(`tests/fixtures/corpus/${file}`);

function textFor(entry) {
  if (inline.has(entry.id)) return inline.get(entry.id);
  if (entry.file) return corpus(entry.file);
  if (entry.repeat) return corpus(entry.repeat.file).repeat(entry.repeat.times);
  if (entry.prompt) return prompts.get(entry.prompt.id)[entry.prompt.variant];
  throw new Error(`no text for fixture ${entry.id}`);
}

test('fixtures were produced by the pinned reference tiktoken', () => {
  const pin = read('scripts/requirements.txt').match(/tiktoken==(\S+)/)[1];
  assert.equal(fixtures.tiktoken_version, pin);
});

test('the dataset covers both encodings the app uses', () => {
  assert.deepEqual([...fixtures.encodings].sort(), [...ENCODING_NAMES].sort());
});

for (const entry of fixtures.cases) {
  test(`${entry.id} — code points match Python len()`, () => {
    assert.equal(codePoints(textFor(entry)), entry.chars);
  });

  for (const encoding of fixtures.encodings) {
    test(`${entry.id} — ${encoding} matches the reference`, async (t) => {
      const text = textFor(entry);
      const started = performance.now();
      const ids = await encodeTokens(text, encoding);
      if (entry.id === 'long-document') t.diagnostic(`${encoding}: ${ids.length} tokens in ${Math.round(performance.now() - started)} ms`);
      assert.equal(ids.length, entry[encoding].count, 'token count');
      assert.deepEqual(ids.slice(0, entry[encoding].head.length), entry[encoding].head, 'leading token ids');
    });
  }
}

test('special-token text is counted, not rejected', async () => {
  // js-tiktoken's default would throw here.
  assert.ok((await countTokens('before <|endoftext|> after')) > 3);
});

test('empty text is zero tokens', async () => {
  assert.equal(await countTokens(''), 0);
});

test('an encoder loads once and is reused', async () => {
  const [a, b] = await Promise.all([loadEncoder('o200k_base'), loadEncoder('o200k_base')]);
  assert.equal(a, b);
});

test('an unknown encoding is rejected', async () => {
  await assert.rejects(loadEncoder('p50k_base_typo'), /unknown encoding/);
});

test('code points differ from UTF-16 length for astral characters', () => {
  assert.equal(codePoints('🇰🇿'), 2);
  assert.equal('🇰🇿'.length, 4);
});
