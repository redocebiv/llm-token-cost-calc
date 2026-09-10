import { expect, test } from '@playwright/test';
import { fixtures, fmt, library, noHorizontalOverflow, watchErrors } from './helpers.mjs';

let errors;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.goto('prompts.html');
});
test.afterEach(() => expect(errors).toEqual([]));

test('all twelve roles are shown', async ({ page }) => {
  await expect(page.locator('.prompt-card')).toHaveCount(12);
});

test('every card shows the reference token count for its short and long prompt', async ({ page }) => {
  for (const prompt of library.prompts) {
    const card = page.locator(`.prompt-card[data-prompt="${prompt.id}"]`);
    await expect(card.locator('.prompt-meta')).toContainText(`${fmt(fixtures[`prompt-${prompt.id}-short`].o200k_base.count)} tokens`);
    await card.locator('button[data-variant="long"]').click();
    await expect(card.locator('.prompt-meta')).toContainText(`${fmt(fixtures[`prompt-${prompt.id}-long`].o200k_base.count)} tokens`);
    await expect(card.locator('.prompt-text')).toHaveText(prompt.long);
  }
});

test('"Use in calculator" opens the calculator with that prompt, counted', async ({ page }) => {
  const prompt = library.prompts.find((p) => p.id === 'finance-analyst');
  const card = page.locator(`.prompt-card[data-prompt="${prompt.id}"]`);
  await card.locator('button[data-variant="long"]').click();
  await card.getByRole('link', { name: 'Use in calculator' }).click();

  await expect(page).toHaveURL(/index\.html\?prompt=finance-analyst&variant=long$/);
  await expect(page.locator('#system')).toHaveValue(prompt.long);
  await expect(page.locator('#loaded-note')).toContainText('Finance analyst');
  await expect(page.locator('#count-system')).toHaveText(`${fmt(fixtures['prompt-finance-analyst-long'].o200k_base.count)} tokens`);
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.prompt-card')).toHaveCount(12);
  await noHorizontalOverflow(page);
});
