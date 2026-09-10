# Token & Cost Calculator

Paste a system prompt and a user message. See how many tokens they are and what the request costs on every current OpenAI, Anthropic and Google model, side by side, with how much of each model's context window it fills.

**Live: https://redocebiv.github.io/llm-token-cost-calc/**

There's also a [prompt library](https://redocebiv.github.io/llm-token-cost-calc/prompts.html) with twelve ready-to-use system prompts for different roles. Each comes in a short and a long version, so you can see what the extra detail costs.

Everything runs in your browser. Nothing you type is sent anywhere.

## What it does

- **Token counts**: exact for OpenAI models, clearly labelled estimate ranges for Claude and Gemini (below).
- **Cost per request** for 18 current models, with 21 legacy ones behind a switch.
- **Expected response length**, since output can't be counted before it exists and is usually several times dearer per token than input.
- **Prompt caching** for the system prompt, and the **batch API** discount. Both change which provider comes out cheapest.
- **Monthly projection** from requests per day.
- **Context-window fill** per model. The *Stress test* button loads a 255,000-token document: it overflows Claude Haiku 4.5's 200K window and fits the 1M-token models.
- **Pricing details the provider pages bury**: long-context rates that apply to the whole request past 272K tokens on OpenAI and 200K on Gemini Pro; promotional prices with their end dates, flagged once they pass; models with no published cached rate.

Every price links to the official page it came from.

## Exact where possible, honest where not

OpenAI counts are **exact**. They come from [`js-tiktoken`](https://github.com/dqbd/tiktoken), which this project checks against OpenAI's own Python `tiktoken` (see *Testing*). The newest model names aren't in tiktoken's model map yet, so for those the `o200k_base` encoding is **assumed**, and the row says so.

Anthropic and Google publish no offline tokenizer. An exact count needs their APIs and a key, which a static page shouldn't ask you for. So those rows show an estimate range, marked `≈`, derived from what the providers themselves publish:

- **Claude**: Anthropic says tiktoken undercounts Claude by about 15–20% on typical text and more on code and non-English text. It also says Claude 4.7 and later use a tokenizer producing about 30% more tokens again. Previous-generation Claude models are estimated at ×1.15–1.20 of the o200k count, and current ones at that ×1.0–1.35.
- **Gemini**: Google gives about four characters per token for English text. The range spans that rule and the o200k count.

Ranges widen when your text is mostly non-Latin script or dense with code punctuation, which is where these rules of thumb stop holding. The table ranks models by the middle of each range. The whole method lives in [`src/js/estimate.js`](src/js/estimate.js), with sources quoted beside each number.

## Testing

A tokenizer that's slightly wrong still produces plausible numbers, so the testing is built to catch that.

- **Reference dataset.** 69 cases chosen to break tokenizers: prose, code, JSON, Markdown, Kazakh, Russian, Chinese, Japanese, Arabic, emoji and ZWJ sequences, combining accents, CRLF vs LF, whitespace edge cases, special-token text like `<|endoftext|>`, a 255K-token document, and all 24 library prompts. [`scripts/make_fixtures.py`](scripts/make_fixtures.py) runs OpenAI's reference **Python** `tiktoken` over them. The browser tokenizer must match every count *and* the leading token ids, for both `o200k_base` and `cl100k_base`. (CRLF and LF text gives the same count but different ids, so a count-only test would miss it.)
- **Unit tests** (`node:test`) for the tokenizer, cost maths, estimates, pricing-data validation, formatting and the prompt library.
- **Python tests** (`pytest`) for the fixture generator itself, including a check that the committed fixtures are current.
- **End-to-end tests** (Playwright, headless Chromium) against the *built* site, served under the same subpath as GitHub Pages.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) regenerates the fixtures and fails if they changed, then runs everything. It **deploys only if every test passes**.

## Why JavaScript and Python

GitHub Pages serves static files, so the site itself is JavaScript: vanilla ES modules bundled by esbuild. The tokenizer's rank tables load lazily in a Web Worker, so the page paints straight away and never freezes on a pasted book.

Python is here because OpenAI's reference tokenizer is a Python library, which makes it the right source of truth for the tests. It also serves the built site for the browser tests.

## Run it locally

```bash
npm ci
npm run build
npm run serve
```

Then open http://127.0.0.1:4173/llm-token-cost-calc/.

```bash
npm test                               # unit tests
npm run e2e                            # end-to-end (needs: npx playwright install chromium)
pip install -r scripts/requirements.txt
npm run fixtures                       # regenerate reference counts
python3 -m pytest                      # fixture-generator tests
```

## Updating prices

Prices live in [`src/data/models.json`](src/data/models.json), one row per model with its source and an as-of date. A validator rejects bad rows: negative prices, a cached rate above the base rate, long-context tiers past the window, missing sources. So updating a price is a data edit that the tests check, never a code change.

## Limitations

- Claude and Gemini counts are estimates; for exact numbers use Anthropic's `count_tokens` or Google's `countTokens` API.
- The one-off cost of *writing* a prompt cache and Gemini's hourly cache storage aren't modelled; cached requests are priced in the steady state.
- Prices change. Check the linked pages before committing to a budget.
- Not affiliated with OpenAI, Anthropic or Google.

## Licence

MIT
