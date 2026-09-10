import fs from 'node:fs';
import { expect } from '@playwright/test';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

export const fixtures = Object.fromEntries(
  JSON.parse(read('fixtures/token_cases.json')).cases.map((c) => [c.id, c]),
);
export const corpus = (file) => read(`fixtures/corpus/${file}`);
export const library = JSON.parse(fs.readFileSync(new URL('../../src/data/prompts.json', import.meta.url), 'utf8'));
export const fmt = (n) => n.toLocaleString('en-US');

/** Fail the test on any console error or uncaught exception. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

export async function rowsReady(page) {
  await expect(page.locator('#rows tr[data-model]').first()).toBeVisible();
}

export async function readRows(page) {
  return page.$$eval('#rows tr[data-model]', (rows) => rows.map((r) => ({
    id: r.dataset.model,
    provider: r.dataset.provider,
    cost: Number(r.dataset.costPoint),
    tokens: Number(r.dataset.tokensPoint),
    share: Number(r.dataset.fillShare),
    overflow: r.dataset.overflow === 'true',
    text: r.textContent,
  })));
}

export async function noHorizontalOverflow(page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, 'page must not scroll sideways').toBeLessThanOrEqual(client);
}
