/**
 * Token estimates for providers that publish no offline tokenizer.
 *
 * Every number here is derived from a published statement, quoted beside it.
 * Nothing about estimation lives anywhere else, so this file and its test are
 * the whole method. Estimates are ranges: the UI shows the range and ranks by
 * the point.
 *
 * Pure: no DOM.
 */

/*
 * Claude, previous tokenizer (Claude Sonnet 4.6, Opus 4.6, Haiku 4.5 and older).
 *   Anthropic, token-counting guidance: tiktoken "undercounts Claude tokens by
 *   ~15-20% on typical text, and by much more on code or non-English input."
 *   → ×1.15 to ×1.20, point at the middle; widened to ×1.35 for atypical text.
 *
 * Claude, current tokenizer (Claude 4.7 and later: Opus 4.7/4.8/5, Fable,
 * Sonnet 5).
 *   Anthropic, pricing page: the newer tokenizer "produces approximately 30%
 *   more tokens for the same text", and Anthropic's migration guidance gives
 *   ~1×–1.35× as the spread. Applied on top of the previous tokenizer's range.
 *
 * Gemini.
 *   Google: a token is about four characters of English text. That rule is
 *   stated for English, so for atypical text the o200k count is the better
 *   point, and the two always bracket the range.
 */

const PREVIOUS = { low: 1.15, point: 1.175, high: 1.2, atypicalHigh: 1.35 };
const GENERATION = { low: 1.0, point: 1.3, high: 1.35 };

export const ESTIMATE_METHODS = {
  'claude-previous': {
    label: 'Claude (previous tokenizer)',
    multipliers: { ...PREVIOUS },
    source: 'https://platform.claude.com/docs/en/build-with-claude/token-counting',
  },
  'claude-current': {
    label: 'Claude 4.7 and later',
    multipliers: {
      low: PREVIOUS.low * GENERATION.low,
      point: PREVIOUS.point * GENERATION.point,
      high: PREVIOUS.high * GENERATION.high,
      atypicalHigh: PREVIOUS.atypicalHigh * GENERATION.high,
    },
    source: 'https://platform.claude.com/docs/en/about-claude/pricing',
  },
  gemini: {
    label: 'Gemini',
    charsPerToken: 4,
    source: 'https://ai.google.dev/gemini-api/docs/tokens',
  },
};

const CODE_SYMBOLS = new Set('{}[]()<>=;:/\\|&$#@*_`~^%+'.split(''));
const SAMPLE = 200_000;

/**
 * Text where published per-token rules of thumb stop holding: mostly non-Latin
 * script, or dense with code punctuation. Samples the first 200K code points so
 * a pasted book stays cheap.
 */
export function isAtypical(text) {
  if (!text) return false;
  let letters = 0;
  let nonLatin = 0;
  let symbols = 0;
  let total = 0;
  for (const ch of text) {
    total += 1;
    if (total > SAMPLE) break;
    if (/\p{L}/u.test(ch)) {
      letters += 1;
      if (!/\p{Script=Latin}/u.test(ch)) nonLatin += 1;
    } else if (CODE_SYMBOLS.has(ch)) {
      symbols += 1;
    }
  }
  const counted = Math.min(total, SAMPLE);
  const nonLatinShare = letters ? nonLatin / letters : 0;
  const symbolShare = counted ? symbols / counted : 0;
  return nonLatinShare > 0.3 || symbolShare > 0.08;
}

const range = (low, point, high) => ({
  low: Math.floor(low),
  point: Math.round(point),
  high: Math.ceil(high),
});

/**
 * Tokens one model would see for one piece of text.
 * `measured` is what the worker reports for that text:
 *   { o200k, cl100k, chars, atypical }
 * Exact models return a zero-width range.
 */
export function tokensFor(model, measured) {
  const { tokenizer } = model;
  if (tokenizer.kind === 'exact') {
    const n = tokenizer.encoding === 'cl100k_base' ? measured.cl100k : measured.o200k;
    return { low: n, point: n, high: n, exact: true };
  }

  const method = ESTIMATE_METHODS[tokenizer.method];
  if (!method) throw new Error(`unknown estimate method: ${tokenizer.method}`);
  if (measured.o200k === 0 && measured.chars === 0) return { low: 0, point: 0, high: 0, exact: false };

  if (method.multipliers) {
    const m = method.multipliers;
    const base = measured.o200k;
    return {
      ...range(base * m.low, base * m.point, base * (measured.atypical ? m.atypicalHigh : m.high)),
      exact: false,
    };
  }

  // Gemini: the characters rule and the o200k count bracket the estimate.
  const byChars = measured.chars / method.charsPerToken;
  const byO200k = measured.o200k;
  return {
    ...range(
      Math.min(byChars, byO200k),
      measured.atypical ? byO200k : byChars,
      Math.max(byChars, byO200k),
    ),
    exact: false,
  };
}
