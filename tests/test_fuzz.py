"""Property-based tests (Hypothesis): rule conditions, regex safety and the AI kill switch."""

from __future__ import annotations

import re
import time

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from custom_components.friedafetch_mail.ai import ai_settings, blocked_reasons, parse_exclude, parse_terms
from custom_components.friedafetch_mail.rules import FIELDS, OPS, Condition, RuleError, risky_regex

FUZZ = settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
TEXT = st.text(max_size=120)
ADDRESS = st.fixed_dictionaries({"name": st.text(max_size=30), "email": st.text(max_size=40)})
SUMMARY = st.fixed_dictionaries(
    {
        "subject": st.one_of(st.none(), TEXT),
        "from": st.lists(ADDRESS, max_size=3),
        "to": st.lists(ADDRESS, max_size=3),
        "cc": st.lists(ADDRESS, max_size=2),
    }
)
# building blocks that tend to produce slow regular expressions
REGEX_PARTS = st.sampled_from(
    [
        "a",
        "a?",
        "a+",
        "a*",
        ".",
        ".*",
        ".+",
        "\\w+",
        "\\s?",
        "(",
        ")",
        "|",
        "(a|aa)",
        "{1,50}",
        "{2,}",
        "$",
        "^",
        "[a-z]+",
        "b",
    ]
)
HOSTILE_HAYSTACKS = ["a" * 300 + "!", "a" * 299 + "b", " " * 300, "ab" * 150]


@FUZZ
@given(field=st.sampled_from(FIELDS), op=st.sampled_from([o for o in OPS if o != "regex"]), value=TEXT, summary=SUMMARY)
def test_conditions_never_crash(field: str, op: str, value: str, summary: dict) -> None:
    cond = Condition(field, op, value)
    try:
        cond.validate()
    except RuleError:
        return
    assert isinstance(cond.matches(summary), bool)


@settings(max_examples=300, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(REGEX_PARTS, min_size=1, max_size=12).map("".join))
def test_accepted_regex_conditions_stay_fast(pattern: str) -> None:
    """Whatever a user or an AI writes: if the rule is accepted, matching hostile subjects stays fast."""
    cond = Condition("subject", "regex", pattern)
    try:
        cond.validate()
    except RuleError:
        return
    for hay in HOSTILE_HAYSTACKS:
        start = time.perf_counter()
        cond.matches({"subject": hay})
        assert time.perf_counter() - start < 0.5, f"{pattern!r} took too long on {hay[:10]!r}…"


def test_known_catastrophic_patterns_are_refused() -> None:
    for pattern in ["(a+)+$", "(a|aa)+$", "(\\w+\\s?)+$", "(.*a){1,500}", "a+a+a+$", "\\s*\\s*\\s*\\s*x"]:
        try:
            Condition("subject", "regex", pattern).validate()
        except RuleError:
            continue
        raise AssertionError(f"{pattern!r} was accepted")
    for pattern in [
        "Run failed|\\] Bump ",
        "^\\[JIRA\\]",
        "gewonnen|prize",
        "(abc)+",
        "\\d{4,}",
        "Rechnung.*Nr\\.?\\s*\\d+",
    ]:
        Condition("subject", "regex", pattern).validate()
        assert not risky_regex(pattern)


@FUZZ
@given(st.text(max_size=60))
def test_risky_regex_never_crashes(pattern: str) -> None:
    assert isinstance(risky_regex(pattern), bool)


@FUZZ
@given(
    term=st.text(st.characters(whitelist_categories=("Lu", "Ll", "Nd")), min_size=2, max_size=12),
    before=TEXT,
    after=TEXT,
    where=st.sampled_from(["subject", "body", "sender_name"]),
    upper=st.booleans(),
)
def test_kill_switch_finds_a_term_anywhere(term: str, before: str, after: str, where: str, upper: bool) -> None:
    settings_ = ai_settings({"ai_block_terms": term})
    if not settings_["block_terms"]:
        return  # e.g. a term that is only digits/letters that lower() changes in length – not a valid term
    shown = term.upper() if upper else term
    fields = {"sender_name": "", "sender_email": "x@example.com", "subject": "", "body": ""}
    fields[where] = f"{before}{shown}{after}"
    if settings_["block_terms"][0] not in fields[where].lower():
        return  # case folding of some scripts changes the term itself (e.g. ß -> SS)
    reasons = blocked_reasons(settings_, **fields)
    assert any(r["type"] == "term" for r in reasons)


@FUZZ
@given(exclude=TEXT, terms=TEXT, name=TEXT, email=TEXT, subject=TEXT, body=TEXT)
def test_kill_switch_never_crashes(exclude: str, terms: str, name: str, email: str, subject: str, body: str) -> None:
    settings_ = ai_settings({"ai_exclude": exclude, "ai_block_terms": terms})
    reasons = blocked_reasons(settings_, sender_name=name, sender_email=email, subject=subject, body=body)
    assert all(r["type"] in ("sender", "term") for r in reasons)


@FUZZ
@given(TEXT)
def test_list_parsers_are_idempotent(text: str) -> None:
    for parse in (parse_exclude, parse_terms):
        once = parse(text)
        assert parse("\n".join(once)) == once
        assert all(item == item.strip().lower() for item in once)


def test_regex_input_is_capped() -> None:
    cond = Condition("subject", "regex", "x$")
    assert not cond.matches({"subject": "a" * 400 + "x"})  # only the first 300 characters are looked at
    assert re.search("x$", "a" * 299 + "x")
