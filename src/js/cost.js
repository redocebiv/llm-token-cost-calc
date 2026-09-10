/**
 * The price of one request, and of a month of them.
 *
 * Pure: no DOM. All prices are USD per million tokens.
 *
 * Rules, as the providers state them:
 *  - long-context rates apply to the *whole* request once the prompt exceeds
 *    the threshold (OpenAI above 272K, Gemini Pro above 200K);
 *  - caching discounts only the cached part — here, the system prompt, the
 *    part that repeats across requests. Models with no published cached rate
 *    are charged in full and say so;
 *  - the batch discount applies on top of everything else.
 */

export const DAYS_PER_MONTH = 30;

export function ratesFor(model, promptTokens) {
  const long = model.longContext && promptTokens > model.longContext.above;
  const base = long ? model.longContext : model.price;
  return {
    input: base.input,
    cachedInput: base.cachedInput ?? null,
    output: base.output,
    longContext: Boolean(long),
  };
}

/**
 * @param model      a validated model row with providerInfo
 * @param tokens     { system, user, output } — token counts for this model
 * @param options    { cacheSystem, batch }
 */
export function requestCost(model, tokens, { cacheSystem = false, batch = false } = {}) {
  const prompt = tokens.system + tokens.user;
  const rates = ratesFor(model, prompt);
  const cacheApplied = cacheSystem && rates.cachedInput !== null && tokens.system > 0;

  const cachedTokens = cacheApplied ? tokens.system : 0;
  const freshTokens = prompt - cachedTokens;

  const multiplier = batch ? 1 - model.providerInfo.batchDiscount : 1;
  const input = (freshTokens * rates.input * multiplier) / 1e6;
  const cached = cacheApplied ? (cachedTokens * rates.cachedInput * multiplier) / 1e6 : 0;
  const output = (tokens.output * rates.output * multiplier) / 1e6;

  return {
    input,
    cached,
    output,
    total: input + cached + output,
    longContext: rates.longContext,
    cacheApplied,
    cacheUnavailable: cacheSystem && rates.cachedInput === null,
  };
}

/**
 * Cost at the low, point and high token estimates. Cost only rises with tokens
 * (a long-context jump included), so the ends of the token range are the ends
 * of the cost range.
 */
export function requestCostRange(model, ranges, output, options) {
  const at = (key) => requestCost(model, { system: ranges.system[key], user: ranges.user[key], output }, options);
  const point = at('point');
  return { low: at('low').total, point: point.total, high: at('high').total, detail: point };
}

export const monthlyCost = (perRequest, requestsPerDay) => perRequest * requestsPerDay * DAYS_PER_MONTH;

/**
 * How much of the model's window one request takes. The window has to hold the
 * prompt and the response together, so both count. Also flags a requested
 * output longer than the model can produce in one response.
 */
export function contextFill(model, promptTokens, outputTokens) {
  const used = promptTokens + outputTokens;
  return {
    used,
    share: used / model.context,
    overflow: used > model.context,
    outputTooLong: outputTokens > model.maxOutput,
  };
}
