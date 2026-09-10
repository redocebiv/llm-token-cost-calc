/**
 * Token counting off the main thread.
 *
 * Tokenising a pasted book takes long enough to freeze a page, and the first
 * call also parses a 2.3 MB rank table. Here it costs the UI nothing. Each
 * request carries an id, and the page keeps only the latest reply, so fast
 * typing never paints a stale count over a newer one.
 */

import { isAtypical } from './estimate.js';
import { codePoints, countWith, loadEncoder } from './tokenizer.js';

self.onmessage = async ({ data }) => {
  const { id, parts, encodings } = data;
  try {
    const started = performance.now();
    const counts = {};
    for (const name of encodings) {
      const encoder = await loadEncoder(name);
      counts[name] = {};
      for (const [key, text] of Object.entries(parts)) counts[name][key] = countWith(encoder, text);
    }
    const chars = {};
    const atypical = {};
    for (const [key, text] of Object.entries(parts)) {
      chars[key] = codePoints(text);
      atypical[key] = isAtypical(text);
    }
    self.postMessage({ id, counts, chars, atypical, ms: performance.now() - started });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
