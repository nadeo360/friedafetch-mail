"""Live updates for the Frieda Postfach panel.

Rules, runs and the AI sorting send a short signal with the Frieda account and the topic whenever they save. The
open panel subscribes through the websocket and reloads only that part, so its tables follow without polling.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN

SIGNAL_PANEL = f"{DOMAIN}_panel_changed"

# topics: rules (rules, runs, automation status), ai (AI sorting, ratings, transmissions)
TOPICS = ("rules", "ai")


@callback
def async_notify(hass: HomeAssistant, entry_id: str, topic: str) -> None:
    """Tell open panels that a part of a Frieda account changed."""
    async_dispatcher_send(hass, SIGNAL_PANEL, entry_id, topic)
