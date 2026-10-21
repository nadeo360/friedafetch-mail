"""The mock answers like the real backend: every field of tests/contracts/ws.json is there.

The contract is written by this repository's tests/test_contracts.py from real answers; a field the backend added and the mock
lacks fails here, so the preview cannot fall behind unnoticed.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
_spec = importlib.util.spec_from_file_location("contract", ROOT / "tests" / "contract.py")
contract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(contract)  # type: ignore[union-attr]

# what each command is asked in the mock (the mock's example data, not the backend test's)
REQUESTS = {
    "friedafetch_mail/accounts": {},
    "friedafetch_mail/mailboxes": {},
    "friedafetch_mail/rules/list": {},
    "friedafetch_mail/rules/history": {},
    "friedafetch_mail/rules/run": {"scope": "all", "dry_run": True},
    "friedafetch_mail/ai": {},
    "friedafetch_mail/activity/list": {},
    "friedafetch_mail/activity/select": {},
    "friedafetch_mail/mail/timeline": {"message_id": "<ratenkredit@example>"},
    "friedafetch_mail/mail/locate": {"message_id": "<ratenkredit@example>"},
    "friedafetch_mail/ai/assist": {"conversation": [{"role": "user", "text": "Alles vom Steuerberater, ins Archiv"}]},
    "friedafetch_mail/ai/assist/test": {"proposal": {"name": "Steuer", "description": "Finanzamt"}},
    "friedafetch_mail/ai/check": {},
    "friedafetch_mail/mail/act": {"keys": ["<test-frieda@example>"], "action": "flag"},
    "friedafetch_mail/mail/text": {"message_id": "<ratenkredit@example>"},
    "friedafetch_mail/insights": {},
    "friedafetch_mail/insights/calendars": {},
    "friedafetch_mail/insights/event": {"proposal_id": "p1"},
}


def test_the_mock_answers_like_the_backend(open_panel) -> None:
    contracts = json.loads((ROOT / "tests" / "contracts" / "ws.json").read_text(encoding="utf-8"))
    missing = sorted(set(contracts) - set(REQUESTS))
    assert not missing, f"add a request for {missing} to REQUESTS (and an answer to the mock)"
    panel = open_panel("postfach")
    problems = []
    for command, shape in contracts.items():
        answer = panel.js("return await el._hass.callWS(arg);", {"type": command, **REQUESTS[command]})
        problems += [f"{command}: {p}" for p in contract.check(shape, answer)]
    assert problems == [], "the mock lacks what the backend sends:\n" + "\n".join(problems)
