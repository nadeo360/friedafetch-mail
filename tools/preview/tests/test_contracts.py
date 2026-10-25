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
    "friedafetch_mail/mail/act": {"keys": ["<test-frieda@example>"], "action": "unflag"},  # flagged: an undo
    "friedafetch_mail/mail/text": {"message_id": "<ratenkredit@example>"},
    "friedafetch_mail/mail/thread": {"message_id": "<elternabend@example>"},
    "friedafetch_mail/insights": {},
    "friedafetch_mail/insights/calendars": {},
    "friedafetch_mail/insights/event": {"proposal_id": "p1"},
    "friedafetch_mail/insights/parcel": {"parcel_id": "k3", "action": "ignore"},
    "friedafetch_mail/rules/restore": {"rule_id": "<deleted>"},
    "friedafetch_mail/sender": {"email": "erika@example.com"},
    "friedafetch_mail/rules/preview": {"conditions": [{"field": "subject", "op": "contains", "value": "Ratenkredit"}]},
    "friedafetch_mail/insights/undo": {"token": "<undo>"},
    "friedafetch_mail/undo": {"token": "<mail-undo>"},
}
# what a request needs to have happened just before ("Undo" needs something done): JS returning the placeholder's value
PREPARE = {
    "friedafetch_mail/rules/restore": (
        "<deleted>",
        "const id = (await el._hass.callWS({ type: 'friedafetch_mail/rules/list' })).rules[0].id;"
        "await el._hass.callWS({ type: 'friedafetch_mail/rules/delete', rule_id: id }); return id;",
    ),
    "friedafetch_mail/insights/undo": (
        "<undo>",
        "return (await el._hass.callWS({ type: 'friedafetch_mail/insights/dismiss', kind: 'package', item_id: 'k1' })).undo;",
    ),
    "friedafetch_mail/undo": (
        "<mail-undo>",
        "return (await el._hass.callWS({ type: 'friedafetch_mail/mail/act', keys: ['<test-frieda@example>'], action: 'seen' })).undo_token;",
    ),
}


def test_the_mock_answers_like_the_backend(open_panel) -> None:
    contracts = json.loads((ROOT / "tests" / "contracts" / "ws.json").read_text(encoding="utf-8"))
    missing = sorted(set(contracts) - set(REQUESTS))
    assert not missing, f"add a request for {missing} to REQUESTS (and an answer to the mock)"
    panel = open_panel("postfach")
    problems = []
    for command, shape in contracts.items():
        request = {"type": command, **REQUESTS[command]}
        if command in PREPARE:
            placeholder, js = PREPARE[command]
            value = panel.js(js)
            request = {k: value if v == placeholder else v for k, v in request.items()}
        answer = panel.js("return await el._hass.callWS(arg);", request)
        problems += [f"{command}: {p}" for p in contract.check(shape, answer)]
    assert problems == [], "the mock lacks what the backend sends:\n" + "\n".join(problems)
