/**
 * The prompt-library page: one card per role, with a short/long switch, an
 * exact token count, the cost of sending it on a reference model, copy, and a
 * link that opens it in the calculator. The link carries the prompt's id,
 * never its text.
 */

import modelsData from '../data/models.json';
import library from '../data/prompts.json';
import { requestCost } from './cost.js';
import { tokens, usd } from './format.js';
import { loadModels } from './models.js';
import { createTokenClient } from './token-client.js';

// An exact-count model, so the card's figure is a real number, not an estimate.
const REFERENCE_MODEL = 'gpt-5.6-terra';
const PER = 1000;

const model = loadModels(modelsData).find((m) => m.id === REFERENCE_MODEL);
const client = createTokenClient(new URL('./tokenizer.worker.js', import.meta.url));
const $ = (id) => document.getElementById(id);
const counts = new Map();

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 1600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Copy failed — select the text and copy it by hand');
  }
}

function metaLine(prompt, variant) {
  const n = counts.get(`${prompt.id}:${variant}`);
  if (n === undefined) return 'Counting…';
  const cost = requestCost(model, { system: n, user: 0, output: 0 }).total * PER;
  return `${tokens(n)} tokens · ${usd(cost)} per ${tokens(PER)} requests on ${model.name}`;
}

function card(prompt) {
  let variant = 'short';

  const node = document.createElement('article');
  node.className = 'card prompt-card';
  node.dataset.prompt = prompt.id;

  const title = document.createElement('h3');
  title.textContent = prompt.role;

  const summary = document.createElement('p');
  summary.className = 'prompt-summary';
  summary.textContent = prompt.summary;

  const tags = document.createElement('div');
  tags.className = 'tags';
  for (const tag of prompt.tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tags.append(span);
  }

  const toggle = document.createElement('div');
  toggle.className = 'segmented';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', `${prompt.role} prompt length`);
  const buttons = ['short', 'long'].map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.variant = v;
    b.textContent = v === 'short' ? 'Short' : 'Long';
    toggle.append(b);
    return b;
  });

  const meta = document.createElement('p');
  meta.className = 'prompt-meta';

  const text = document.createElement('pre');
  text.className = 'prompt-text';

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'link-btn';

  const actions = document.createElement('div');
  actions.className = 'prompt-actions';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'btn small';
  copyButton.textContent = 'Copy';
  const use = document.createElement('a');
  use.className = 'btn small primary';
  use.textContent = 'Use in calculator';
  actions.append(copyButton, use);

  function paint() {
    text.textContent = prompt[variant];
    meta.textContent = metaLine(prompt, variant);
    use.href = `index.html?prompt=${encodeURIComponent(prompt.id)}&variant=${variant}`;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.variant === variant));
    const expanded = text.classList.contains('expanded');
    more.textContent = expanded ? 'Show less' : 'Show all';
  }

  toggle.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-variant]');
    if (!b) return;
    variant = b.dataset.variant;
    paint();
  });
  more.addEventListener('click', () => { text.classList.toggle('expanded'); paint(); });
  copyButton.addEventListener('click', () => copy(prompt[variant]));

  node.append(title, summary, tags, toggle, meta, text, more, actions);
  node.paint = paint;
  paint();
  return node;
}

const cards = library.prompts.map(card);
$('library').replaceChildren(...cards);
$('library-meta').textContent = `${library.prompts.length} roles · costs are for the system prompt alone, before any user message or response`;

const parts = {};
for (const prompt of library.prompts) {
  parts[`${prompt.id}:short`] = prompt.short;
  parts[`${prompt.id}:long`] = prompt.long;
}
client.measure(parts).then((reply) => {
  for (const [key, n] of Object.entries(reply.counts.o200k_base)) counts.set(key, n);
  for (const c of cards) c.paint();
}).catch((error) => {
  $('library-meta').textContent = `Counting failed: ${error.message}`;
});
