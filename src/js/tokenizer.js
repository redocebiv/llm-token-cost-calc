/**
 * Exact OpenAI token counts, via js-tiktoken.
 *
 * The rank tables are large (o200k_base is 2.3 MB), so they are imported lazily:
 * the bundler splits each into its own chunk and nothing loads until the first
 * count. Encoders are cached as promises, so two concurrent first calls share
 * one load instead of racing.
 *
 * Special-token text such as "<|endoftext|>" is counted as ordinary text.
 * js-tiktoken throws on it by default; passing empty allowed/disallowed lists
 * matches Python's `disallowed_special=()`, which is what the reference
 * fixtures are generated with, and what someone pasting that text means.
 */

import { Tiktoken } from 'js-tiktoken/lite';

const loaders = {
  o200k_base: () => import('js-tiktoken/ranks/o200k_base'),
  cl100k_base: () => import('js-tiktoken/ranks/cl100k_base'),
};

export const ENCODING_NAMES = Object.keys(loaders);

const encoders = new Map();

export function loadEncoder(name) {
  if (!loaders[name]) return Promise.reject(new Error(`unknown encoding: ${name}`));
  if (!encoders.has(name)) {
    encoders.set(name, loaders[name]().then((module) => new Tiktoken(module.default)));
  }
  return encoders.get(name);
}

export const encodeWith = (encoder, text) => encoder.encode(text, [], []);

export const countWith = (encoder, text) => (text ? encodeWith(encoder, text).length : 0);

export async function countTokens(text, name = 'o200k_base') {
  return countWith(await loadEncoder(name), text);
}

export async function encodeTokens(text, name = 'o200k_base') {
  return encodeWith(await loadEncoder(name), text);
}

/**
 * Unicode code points, not UTF-16 units. "🇰🇿" is 2 code points but 4 UTF-16
 * units; `.length` would overstate every emoji and every CJK supplement
 * character. Code points match Python's len(), which the fixtures record, and
 * they are what a characters-per-token estimate should divide.
 */
export function codePoints(text) {
  let count = 0;
  // eslint-disable-next-line no-unused-vars
  for (const _ of text) count += 1;
  return count;
}
