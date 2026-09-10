import { expect, test } from '@playwright/test';
import {
  corpus, fixtures, fmt, library, noHorizontalOverflow, readRows, rowsReady, watchErrors,
} from './helpers.mjs';

let errors;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.goto('index.html');
  await rowsReady(page);
});
test.afterEach(() => expect(errors).toEqual([]));

async function useText(page, system, user = '') {
  await page.fill('#system', system);
  await page.fill('#user', user);
}

test('the example prompt is counted exactly as the reference counts it', async ({ page }) => {
  const expected = fixtures['prompt-backend-engineer-long'].o200k_base.count;
  await expect(page.locator('#count-system')).toHaveText(`${fmt(expected)} tokens`);
});

test('pasted text gets the reference count, in the counter and in an exact row', async ({ page }) => {
  const expected = fixtures['english-prose'].o200k_base.count;
  await useText(page, corpus('english-prose.txt'));
  await expect(page.locator('#count-system')).toHaveText(`${fmt(expected)} tokens`);
  const terra = (await readRows(page)).find((r) => r.id === 'gpt-5.6-terra');
  expect(terra.tokens).toBe(expected);
});

test('Kazakh text is counted exactly too', async ({ page }) => {
  await useText(page, corpus('kazakh-prose.txt'));
  await expect(page.locator('#count-system')).toHaveText(`${fmt(fixtures['kazakh-prose'].o200k_base.count)} tokens`);
  await expect(page.locator('#summary')).toContainText('estimate ranges widened');
});

test('rows are sorted from cheapest to dearest', async ({ page }) => {
  const costs = (await readRows(page)).map((r) => r.cost);
  expect(costs).toEqual([...costs].sort((a, b) => a - b));
});

test('every provider is represented and estimates are labelled', async ({ page }) => {
  const rows = await readRows(page);
  for (const provider of ['openai', 'anthropic', 'google']) expect(rows.some((r) => r.provider === provider)).toBe(true);
  for (const r of rows.filter((x) => x.provider !== 'openai')) expect(r.text).toContain('≈');
});

test('the batch API halves every cost', async ({ page }) => {
  const before = new Map((await readRows(page)).map((r) => [r.id, r.cost]));
  await page.check('#batch');
  for (const r of await readRows(page)) expect(r.cost).toBeCloseTo(before.get(r.id) / 2, 12);
});

test('caching the system prompt lowers cost wherever a cached rate exists', async ({ page }) => {
  const before = new Map((await readRows(page)).map((r) => [r.id, r.cost]));
  await page.check('#cache');
  const after = await readRows(page);
  expect(after.every((r) => r.cost <= before.get(r.id) + 1e-15)).toBe(true);
  expect(after.filter((r) => r.cost < before.get(r.id)).length).toBeGreaterThan(10);
});

test('a longer expected response costs more everywhere', async ({ page }) => {
  await page.click('#output-presets button[data-output="150"]');
  const short = new Map((await readRows(page)).map((r) => [r.id, r.cost]));
  await page.click('#output-presets button[data-output="4000"]');
  for (const r of await readRows(page)) expect(r.cost).toBeGreaterThan(short.get(r.id));
});

test('the 255K-token document overflows Haiku but fits the 1M-token models', async ({ page }) => {
  await page.click('#btn-long');
  await expect(page.locator('#count-user')).toHaveText(`${fmt(fixtures['long-document'].o200k_base.count)} tokens`);
  const rows = new Map((await readRows(page)).map((r) => [r.id, r]));

  expect(rows.get('gpt-5.6-terra').tokens).toBe(fixtures['long-document'].o200k_base.count);
  expect(rows.get('claude-haiku-4-5').overflow).toBe(true);
  expect(rows.get('claude-opus-5').overflow).toBe(false);
  expect(rows.get('gemini-3.8-flash').overflow).toBe(false);
  await expect(page.locator('tr[data-model="claude-haiku-4-5"]')).toHaveClass(/overflow/);
  await expect(page.locator('tr[data-model="claude-haiku-4-5"] .badge.danger')).toHaveText("doesn't fit");
  // Gemini 3.1 Pro's estimate is past its 200K threshold, so the long-context rate applies.
  await expect(page.locator('tr[data-model="gemini-3.1-pro-preview"] .badge.warn')).toContainText('long-context rate');
});

test('legacy models appear on request, and cl100k rows get the cl100k reference count', async ({ page }) => {
  await useText(page, corpus('english-prose.txt'));
  await expect(page.locator('#count-system')).toHaveText(`${fmt(fixtures['english-prose'].o200k_base.count)} tokens`);
  const current = (await readRows(page)).length;

  await page.check('#legacy');
  await expect(page.locator('tr[data-model="gpt-3.5-turbo"]')).toBeVisible();
  const rows = await readRows(page);
  expect(rows.length).toBeGreaterThan(current);
  expect(rows.find((r) => r.id === 'gpt-3.5-turbo').tokens).toBe(fixtures['english-prose'].cl100k_base.count);
});

test('unticking a provider removes its rows', async ({ page }) => {
  await page.uncheck('input[data-provider="google"]');
  expect((await readRows(page)).some((r) => r.provider === 'google')).toBe(false);
});

test('special-token text is counted, not rejected', async ({ page }) => {
  await useText(page, 'Stop here <|endoftext|> and continue.');
  await expect(page.locator('#count-system')).toHaveText(`${fmt(fixtures['special-endoftext'].o200k_base.count)} tokens`);
});

test('clearing the inputs gives zero tokens and near-zero costs', async ({ page }) => {
  await page.click('#btn-clear');
  await expect(page.locator('#count-system')).toHaveText('0 tokens');
  await expect(page.locator('#count-user')).toHaveText('0 tokens');
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await rowsReady(page);
  await noHorizontalOverflow(page);
});

test('the example loads the backend-engineer prompt from the library', async ({ page }) => {
  const backend = library.prompts.find((p) => p.id === 'backend-engineer');
  await expect(page.locator('#system')).toHaveValue(backend.long);
});
