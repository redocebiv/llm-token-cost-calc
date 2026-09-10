"""Tests for the reference fixture generator.

The generator is the source of truth for every JS token-count test, so its own
behaviour is pinned down here: that the committed fixtures are current, that
CRLF survives, and that the edge cases mean what they claim to.
"""

import json
import pathlib
import sys

import pytest
import tiktoken

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import make_fixtures  # noqa: E402


@pytest.fixture(scope="module")
def built():
    return make_fixtures.build()


@pytest.fixture(scope="module")
def by_id(built):
    return {case["id"]: case for case in built["cases"]}


def test_committed_fixtures_are_current(built):
    committed = json.loads(make_fixtures.TARGET.read_text(encoding="utf-8"))
    assert committed == built, "token_cases.json is stale — run: python3 scripts/make_fixtures.py"


def test_fixtures_come_from_the_pinned_tiktoken(built):
    pin = (ROOT / "scripts" / "requirements.txt").read_text().split("tiktoken==")[1].split()[0]
    assert built["tiktoken_version"] == pin == tiktoken.__version__


def test_crlf_bytes_survive_reading():
    # Python's default universal-newline mode would quietly turn these into \n.
    assert "\r\n" in make_fixtures.read_corpus("crlf-lines.txt")


def test_crlf_file_and_escaped_inline_crlf_are_identical(by_id):
    for encoding in make_fixtures.ENCODINGS:
        assert by_id["crlf-file"][encoding] == by_id["crlf-inline"][encoding]


@pytest.mark.parametrize("encoding", make_fixtures.ENCODINGS)
def test_crlf_and_lf_differ_in_token_ids_not_count(by_id, encoding):
    # "\r\n" and "\n" are each a single token, so the counts match — which is
    # exactly why the fixtures keep token ids and not just counts.
    lf, crlf = by_id["lf-lines"][encoding], by_id["crlf-inline"][encoding]
    assert lf["count"] == crlf["count"]
    assert lf["head"] != crlf["head"]


def test_combining_and_precomposed_accents_differ(by_id):
    assert by_id["combining-accent"]["chars"] != by_id["precomposed-accent"]["chars"]
    assert by_id["combining-accent"]["o200k_base"] != by_id["precomposed-accent"]["o200k_base"]


def test_special_token_text_is_ordinary_text(by_id):
    for case in ("special-endoftext", "special-chatml", "special-fim"):
        assert by_id[case]["o200k_base"]["count"] > 1


def test_empty_string_is_zero_tokens(by_id):
    assert by_id["empty"]["chars"] == 0
    assert all(by_id["empty"][e]["count"] == 0 for e in make_fixtures.ENCODINGS)


def test_long_document_overflows_a_200k_window(by_id):
    assert by_id["long-document"]["o200k_base"]["count"] > make_fixtures.LONG_DOCUMENT_MINIMUM


def test_every_referenced_corpus_file_exists():
    for case in make_fixtures.load_cases():
        name = case.get("file") or case.get("repeat", {}).get("file")
        if name:
            assert (make_fixtures.CORPUS / name).exists(), name


def test_duplicate_ids_are_rejected():
    with pytest.raises(ValueError, match="duplicate"):
        make_fixtures.validate_cases([{"id": "a", "text": "x"}, {"id": "a", "text": "y"}])


def test_a_case_needs_exactly_one_source():
    with pytest.raises(ValueError, match="exactly one source"):
        make_fixtures.validate_cases([{"id": "a", "text": "x", "file": "y.txt"}])
    with pytest.raises(ValueError, match="exactly one source"):
        make_fixtures.validate_cases([{"id": "b"}])
