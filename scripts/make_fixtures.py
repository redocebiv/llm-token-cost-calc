"""Generate expected token counts from OpenAI's reference tokenizer.

The browser uses js-tiktoken. Testing js-tiktoken against its own output would
prove nothing, so the expected values come from the original Python `tiktoken`
(pinned in scripts/requirements.txt) and the JS tests must match them exactly.

CI reruns this script and fails if the output differs from the committed file,
so a tokenizer upgrade or a hand-edited expectation cannot slip through.

Two details that are easy to get wrong:
  * files are read with newline="" — Python's default universal-newline mode
    would silently turn the CRLF cases into LF and stop testing CRLF;
  * special-token text like "<|endoftext|>" is counted as ordinary text
    (disallowed_special=()), because that is what a user pasting it means and
    what the browser must do too. By default tiktoken would raise instead.
"""

from __future__ import annotations

import json
import pathlib
import sys

import tiktoken

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
CORPUS = FIXTURES / "corpus"
PROMPTS = ROOT / "src" / "data" / "prompts.json"
TARGET = FIXTURES / "token_cases.json"
ENCODINGS = ("o200k_base", "cl100k_base")
HEAD = 16  # leading token ids kept per case — catches differences a count alone misses
LONG_DOCUMENT_MINIMUM = 250_000  # must overflow a 200K-context model


def read_corpus(name: str) -> str:
    with open(CORPUS / name, encoding="utf-8", newline="") as handle:
        return handle.read()


def case_text(case: dict) -> str:
    if "text" in case:
        return case["text"]
    if "file" in case:
        return read_corpus(case["file"])
    if "repeat" in case:
        return read_corpus(case["repeat"]["file"]) * case["repeat"]["times"]
    raise ValueError(f"case {case.get('id')!r} has no text, file or repeat")


def load_cases() -> list[dict]:
    """The hand-written cases plus both variants of every library prompt."""
    cases = json.loads((FIXTURES / "cases.json").read_text(encoding="utf-8"))["cases"]
    if PROMPTS.exists():
        library = json.loads(PROMPTS.read_text(encoding="utf-8"))
        for prompt in library["prompts"]:
            for variant in ("short", "long"):
                cases.append({
                    "id": f"prompt-{prompt['id']}-{variant}",
                    "category": "prompt-library",
                    "prompt": {"id": prompt["id"], "variant": variant},
                    "_text": prompt[variant],
                })
    return cases


def validate_cases(cases: list[dict]) -> None:
    ids = [case["id"] for case in cases]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        raise ValueError(f"duplicate case ids: {duplicates}")
    for case in cases:
        sources = [key for key in ("text", "file", "repeat", "_text") if key in case]
        if len(sources) != 1:
            raise ValueError(f"case {case['id']!r} must have exactly one source, has {sources}")


def build() -> dict:
    cases = load_cases()
    validate_cases(cases)
    encoders = {name: tiktoken.get_encoding(name) for name in ENCODINGS}

    out = []
    for case in cases:
        text = case["_text"] if "_text" in case else case_text(case)
        entry = {k: v for k, v in case.items() if k not in ("text", "_text")}
        entry["chars"] = len(text)  # code points, which is what JS must count too
        for name, encoder in encoders.items():
            tokens = encoder.encode(text, disallowed_special=())
            entry[name] = {"count": len(tokens), "head": tokens[:HEAD]}
        out.append(entry)

    long_doc = next((e for e in out if e["id"] == "long-document"), None)
    if long_doc and long_doc["o200k_base"]["count"] < LONG_DOCUMENT_MINIMUM:
        raise ValueError(
            f"long-document is only {long_doc['o200k_base']['count']} tokens; "
            f"raise 'times' so it exceeds {LONG_DOCUMENT_MINIMUM}"
        )

    return {
        "_generated_by": "scripts/make_fixtures.py — do not edit by hand",
        "tiktoken_version": tiktoken.__version__,
        "encodings": list(ENCODINGS),
        "cases": out,
    }


def serialise(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    try:
        payload = build()
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    TARGET.write_text(serialise(payload), encoding="utf-8")
    print(f"wrote {len(payload['cases'])} cases to {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
