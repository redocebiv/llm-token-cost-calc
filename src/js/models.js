/**
 * Pricing data: loading, validation and promotion status.
 *
 * Prices live in data/models.json, not in code. They go stale, and when one
 * does the fix should be a one-line data edit that the validator checks — never
 * a code change. Every row must name the page it came from.
 *
 * Pure: no DOM.
 */

import { ESTIMATE_METHODS } from './estimate.js';

/** The encodings the tokenizer can load. A test keeps this in step with tokenizer.js. */
export const ENCODINGS = ['o200k_base', 'cl100k_base'];

const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Every problem with one row, as readable strings. An empty list means valid. */
export function problemsWith(row, providers) {
  const problems = [];
  const need = (cond, message) => { if (!cond) problems.push(message); };

  need(typeof row.id === 'string' && row.id.length > 0, 'missing id');
  need(typeof row.name === 'string' && row.name.length > 0, 'missing name');
  need(Boolean(providers[row.provider]), `unknown provider "${row.provider}"`);
  need(typeof row.legacy === 'boolean', 'legacy must be true or false');
  need(Number.isInteger(row.context) && row.context > 0, 'context must be a positive integer');
  need(Number.isInteger(row.maxOutput) && row.maxOutput > 0 && row.maxOutput <= row.context,
    'maxOutput must be a positive integer no larger than context');
  need(typeof row.source === 'string' && row.source.startsWith('https://'), 'source must be an https URL');
  need(row.promoUntil === null || isDate(row.promoUntil), 'promoUntil must be null or YYYY-MM-DD');

  const p = row.price ?? {};
  need(isPrice(p.input) && p.input > 0, 'price.input must be a positive number');
  need(isPrice(p.output) && p.output > 0, 'price.output must be a positive number');
  need(p.cachedInput === null || (isPrice(p.cachedInput) && p.cachedInput <= p.input),
    'price.cachedInput must be null or no more than price.input');

  if (row.longContext !== null && row.longContext !== undefined) {
    const lc = row.longContext;
    need(Number.isInteger(lc.above) && lc.above > 0 && lc.above < row.context,
      'longContext.above must be a positive integer below the context window');
    need(isPrice(lc.input) && lc.input >= p.input, 'longContext.input must be at least price.input');
    need(isPrice(lc.output) && lc.output >= p.output, 'longContext.output must be at least price.output');
    need(lc.cachedInput === null || isPrice(lc.cachedInput), 'longContext.cachedInput must be null or a number');
  }

  const t = row.tokenizer ?? {};
  if (t.kind === 'exact') {
    need(ENCODINGS.includes(t.encoding), `unknown encoding "${t.encoding}"`);
    need(typeof t.assumed === 'boolean', 'tokenizer.assumed must be true or false');
  } else if (t.kind === 'estimate') {
    need(Boolean(ESTIMATE_METHODS[t.method]), `unknown estimate method "${t.method}"`);
  } else {
    problems.push('tokenizer.kind must be "exact" or "estimate"');
  }
  return problems;
}

/** Validate the whole file and return models with their provider attached. Throws on any problem. */
export function loadModels(data) {
  const errors = [];
  const seen = new Set();
  for (const row of data.models) {
    for (const problem of problemsWith(row, data.providers)) errors.push(`${row.id ?? '(no id)'}: ${problem}`);
    if (seen.has(row.id)) errors.push(`${row.id}: duplicate id`);
    seen.add(row.id);
  }
  if (errors.length) throw new Error(`invalid pricing data:\n  ${errors.join('\n  ')}`);
  return data.models.map((row) => ({ ...row, providerInfo: { id: row.provider, ...data.providers[row.provider] } }));
}

/**
 * 'none', 'active' or 'ended'. The end date is inclusive: a promotion that runs
 * "through November 21" still applies all of November 21 (UTC).
 */
export function promoStatus(model, now = new Date()) {
  if (!model.promoUntil) return 'none';
  const end = Date.parse(`${model.promoUntil}T23:59:59.999Z`);
  return now.getTime() <= end ? 'active' : 'ended';
}

export function visibleModels(models, { showLegacy = false, providers = null } = {}) {
  return models.filter((m) => (showLegacy || !m.legacy) && (!providers || providers.includes(m.provider)));
}
