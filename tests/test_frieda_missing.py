"""Without a working Frieda: a repair says what to do, and it goes away by itself."""

from __future__ import annotations

import sys
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from custom_components.friedafetch_mail import async_setup
from custom_components.friedafetch_mail.const import DOMAIN


class _Broken:
    """A Frieda that fails while it is imported, as 2.0.24 did on Home Assistant 2026.11."""

    def __init__(self, error: Exception) -> None:
        self._error = error

    def __getattr__(self, name: str) -> None:
        if name.startswith("__"):  # asked for by the import system and pytest
            raise AttributeError(name)
        raise self._error


@pytest.mark.parametrize(
    "frieda",
    [
        None,
        _Broken(TypeError("cannot use it on this Home Assistant")),
        _Broken(RuntimeError("Frieda does not start")),
    ],
)
async def test_a_repair_instead_of_a_traceback(hass: HomeAssistant, frieda: object) -> None:
    with patch.dict(sys.modules, {"custom_components.friedafetch": frieda}):
        assert await async_setup(hass, {}) is False
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "frieda_unavailable")
    assert issue is not None and issue.severity is ir.IssueSeverity.ERROR

    assert await async_setup(hass, {}) is True  # updated and restarted
    assert ir.async_get(hass).async_get_issue(DOMAIN, "frieda_unavailable") is None
