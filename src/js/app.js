/**
 * The calculator page.
 *
 * Text goes to the counting worker; everything after that — estimates, cost,
 * context fill — is pure functions over the worker's reply, recomputed on every
 * settings change without recounting.
 */

import modelsData from '../data/models.json';
import library from '../data/prompts.json';
import { longDocument } from '../data/long-document.js';
import { contextFill, monthlyCost, requestCostRange } from './cost.js';
import { ESTIMATE_METHODS, tokensFor } from './estimate.js';
import { percent, shortDate, tokens, usd } from './format.js';
import { loadModels, promoStatus, visibleModels } from './models.js';
import { createTokenClient } from './token-client.js';

const MODELS = loadModels(modelsData);
// Built here, in the entry module, so it resolves beside app.js — see token-client.js.
const client = createTokenClient(new URL('./tokenizer.worker.js', import.meta.url));

const $ = (id) => document.getElementById(id);
const PROVIDER_ORDER = ['openai', 'anthropic', 'google'];

const state = {
  output: 500,
  cacheSystem: false,
  batch: false,
  requestsPerDay: 1000,
  providers: new Set(PROVIDER_ORDER),
  showLegacy: false,
};

let measurement = null;
let latestRequest = 0;
let firstCount = true;

// --- counting ----------------------------------------------------------------

function neededEncodings() {
  const set = new Set(['o200k_base']);
  for (const model of visibleModels(MODELS, { showLegacy: state.showLegacy, providers: [...state.providers] })) {
    if (model.tokenizer.kind === 'exact') set.add(model.tokenizer.encoding);
  }
  return [...set];
}

async function measure() {
  const parts = { system: $('system').value, user: $('user').value };
  latestRequest += 1;
  const request = latestRequest;
  $('status').textContent = firstCount ? 'Loading tokenizer…' : 'Counting…';
  try {
    const reply = await client.measure(parts, neededEncodings());
    // Fast typing sends several requests; only the newest may paint.
    if (request !== latestRequest) return;
    measurement = reply;
    firstCount = false;
    $('status').textContent = '';
    render();
  } catch (error) {
    if (request === latestRequest) $('status').textContent = `Counting failed: ${error.message}`;
  }
}

let debounce = 0;
function scheduleMeasure() {
  clearTimeout(debounce);
  debounce = setTimeout(measure, 180);
}

// --- rendering ---------------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function measuredFor(key) {
  return {
    o200k: measurement.counts.o200k_base[key],
    cl100k: measurement.counts.cl100k_base?.[key] ?? Number.NaN,
    chars: measurement.chars[key],
    atypical: measurement.atypical[key],
  };
}

function compute() {
  const models = visibleModels(MODELS, { showLegacy: state.showLegacy, providers: [...state.providers] });
  const options = { cacheSystem: state.cacheSystem, batch: state.batch };
  const system = measuredFor('system');
  const user = measuredFor('user');

  return models
    .map((model) => {
      const sys = tokensFor(model, system);
      const usr = tokensFor(model, user);
      const prompt = { low: sys.low + usr.low, point: sys.point + usr.point, high: sys.high + usr.high };
      const cost = requestCostRange(model, { system: sys, user: usr }, state.output, options);
      return {
        model,
        exact: sys.exact,
        prompt,
        cost,
        monthly: monthlyCost(cost.point, state.requestsPerDay),
        fill: contextFill(model, prompt.point, state.output),
      };
    })
    .filter((row) => Number.isFinite(row.cost.point))
    .sort((a, b) => a.cost.point - b.cost.point || a.model.name.localeCompare(b.model.name));
}

function badgesFor(row) {
  const { model, cost, fill } = row;
  const badges = [];
  if (model.tokenizer.kind === 'exact') {
    badges.push(['exact', model.tokenizer.assumed ? `exact · ${model.tokenizer.encoding} assumed` : 'exact']);
  } else {
    badges.push(['estimate', `≈ ${ESTIMATE_METHODS[model.tokenizer.method].label}`]);
  }
  const promo = promoStatus(model);
  if (promo === 'active') badges.push(['promo', `promo price to ${shortDate(model.promoUntil)}`]);
  if (promo === 'ended') badges.push(['warn', 'promo may have ended']);
  if (cost.detail.longContext) badges.push(['warn', 'long-context rate']);
  if (cost.detail.cacheUnavailable) badges.push(['muted', 'no cached rate']);
  if (fill.overflow) badges.push(['danger', "doesn't fit"]);
  else if (fill.outputTooLong) badges.push(['danger', `max output ${tokens(model.maxOutput)}`]);
  return badges;
}

function renderRow(row) {
  const { model, prompt, cost, fill } = row;
  const tokenCell = row.exact
    ? el('td', { class: 'num' }, tokens(prompt.point))
    : el('td', { class: 'num' }, `≈ ${tokens(prompt.point)}`, el('small', {}, `${tokens(prompt.low)}–${tokens(prompt.high)}`));
  const costCell = row.exact
    ? el('td', { class: 'num cost' }, usd(cost.point))
    : el('td', { class: 'num cost' }, `≈ ${usd(cost.point)}`, el('small', {}, `${usd(cost.low)}–${usd(cost.high)}`));

  const width = Math.min(fill.share, 1) * 100;
  const bar = el('div', { class: `bar${fill.overflow ? ' over' : ''}`, role: 'img', 'aria-label': `${percent(fill.share)} of ${tokens(model.context)} tokens` },
    el('span', { style: { width: `${Math.max(width, fill.share > 0 ? 0.6 : 0)}%` } }));

  return el('tr', {
    class: fill.overflow ? 'overflow' : '',
    dataset: {
      model: model.id,
      provider: model.provider,
      costPoint: String(cost.point),
      tokensPoint: String(prompt.point),
      fillShare: String(fill.share),
      overflow: String(fill.overflow),
    },
  },
  el('td', { class: 'model' },
    el('span', { class: `dot ${model.provider}`, 'aria-hidden': 'true' }),
    el('a', { href: model.source, target: '_blank', rel: 'noopener', class: 'name' }, model.name),
    el('span', { class: 'badges' }, badgesFor(row).map(([kind, text]) => el('span', { class: `badge ${kind}` }, text)))),
  tokenCell,
  costCell,
  el('td', { class: 'num' }, usd(row.monthly)),
  el('td', { class: 'fill' }, bar, el('small', {}, `${percent(fill.share)} of ${tokens(model.context)}`)));
}

function renderSummary() {
  const o = measurement.counts.o200k_base;
  $('count-system').textContent = `${tokens(o.system)} tokens`;
  $('count-user').textContent = `${tokens(o.user)} tokens`;
  const chars = measurement.chars.system + measurement.chars.user;
  const unusual = measurement.atypical.system || measurement.atypical.user;
  $('summary').textContent = `${tokens(o.system + o.user)} input tokens (o200k) · ${tokens(chars)} characters · `
    + `${tokens(state.output)} output tokens · counted in ${Math.max(1, Math.round(measurement.ms))} ms`
    + (unusual ? ' · estimate ranges widened: non-Latin or code-heavy text' : '');
}

function renderFootnote() {
  const notes = [];
  if (state.cacheSystem) {
    notes.push('Caching prices the system prompt at each model\'s cached rate — the steady state once the cache is warm.');
    for (const id of PROVIDER_ORDER) {
      const note = modelsData.providers[id].cacheNote;
      if (note && state.providers.has(id)) notes.push(`${modelsData.providers[id].name}: ${note}`);
    }
  }
  if (state.batch) notes.push('Batch prices assume the job can wait for asynchronous processing.');
  notes.push(`Monthly = per request × ${tokens(state.requestsPerDay)} requests/day × 30 days.`);
  $('footnote').textContent = notes.join(' ');
}

function render() {
  if (!measurement) return;
  const needed = neededEncodings();
  if (needed.some((e) => !measurement.counts[e])) {
    scheduleMeasure();
    return;
  }
  renderSummary();
  const rows = compute();
  $('rows').replaceChildren(...rows.map(renderRow));
  if (rows.length === 0) {
    $('rows').replaceChildren(el('tr', {}, el('td', { colspan: '5', class: 'empty' }, 'No providers selected.')));
  }
  renderFootnote();
}

// --- controls ----------------------------------------------------------------

function setOutput(value) {
  const n = Math.max(0, Math.min(128000, Math.round(Number(value) || 0)));
  state.output = n;
  $('output').value = String(Math.min(n, Number($('output').max)));
  $('output-n').value = String(n);
  for (const b of document.querySelectorAll('#output-presets button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.output) === n));
  }
  render();
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 1800);
}

function loadFromLibrary() {
  const params = new URLSearchParams(location.search);
  const id = params.get('prompt');
  if (!id) return false;
  const prompt = library.prompts.find((p) => p.id === id);
  if (!prompt) return false;
  const variant = params.get('variant') === 'long' ? 'long' : 'short';
  $('system').value = prompt[variant];
  $('user').value = prompt.sampleUser ?? '';
  const note = $('loaded-note');
  note.textContent = `Loaded “${prompt.role}” (${variant} version) from the prompt library.`;
  note.hidden = false;
  return true;
}

function loadExample() {
  const prompt = library.prompts.find((p) => p.id === 'backend-engineer') ?? library.prompts[0];
  $('system').value = prompt.long;
  $('user').value = prompt.sampleUser ?? '';
  $('loaded-note').hidden = true;
}

$('system').addEventListener('input', scheduleMeasure);
$('user').addEventListener('input', scheduleMeasure);
$('output').addEventListener('input', (e) => setOutput(e.target.value));
$('output-n').addEventListener('change', (e) => setOutput(e.target.value));
$('output-presets').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-output]');
  if (button) setOutput(button.dataset.output);
});
$('cache').addEventListener('change', (e) => { state.cacheSystem = e.target.checked; render(); });
$('batch').addEventListener('change', (e) => { state.batch = e.target.checked; render(); });
$('rpd').addEventListener('input', (e) => { state.requestsPerDay = Math.max(0, Number(e.target.value) || 0); render(); });
$('legacy').addEventListener('change', (e) => { state.showLegacy = e.target.checked; render(); });
for (const box of document.querySelectorAll('input[data-provider]')) {
  box.addEventListener('change', () => {
    if (box.checked) state.providers.add(box.dataset.provider);
    else state.providers.delete(box.dataset.provider);
    render();
  });
}
$('btn-example').addEventListener('click', () => { loadExample(); measure(); });
$('btn-clear').addEventListener('click', () => {
  $('system').value = '';
  $('user').value = '';
  $('loaded-note').hidden = true;
  measure();
});
$('btn-long').addEventListener('click', () => {
  $('system').value = '';
  $('user').value = longDocument();
  $('loaded-note').hidden = true;
  toast('Loaded a 1.36-million-character document');
  measure();
});

// --- start -------------------------------------------------------------------

$('as-of').textContent = `Prices as of ${shortDate(modelsData.asOf)} from each provider's official pricing page`;
$('sources').replaceChildren(
  ...Object.values(modelsData.providers).map((p) => el('li', {}, el('a', { href: p.pricingSource, target: '_blank', rel: 'noopener' }, `${p.name} pricing`))),
  ...Object.values(ESTIMATE_METHODS).map((m) => el('li', {}, el('a', { href: m.source, target: '_blank', rel: 'noopener' }, `${m.label} — source for the estimate`))),
);
$('rpd').value = String(state.requestsPerDay);
if (!loadFromLibrary()) loadExample();
setOutput(state.output);
measure();
