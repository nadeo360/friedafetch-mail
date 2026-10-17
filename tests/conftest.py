"""Shared fixtures: a loaded Frieda account to attach Frieda Postfach to."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

pytest_plugins = "pytest_homeassistant_custom_component"

APPLE_ID = "test@icloud.com"
APP_PASSWORD = "abcd-efgh-ijkl-mnop"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Enable loading custom integrations in all tests."""
    return


@pytest.fixture(autouse=True)
def no_imap_idle() -> Generator[None]:
    """Never open the IMAP IDLE connection in tests (the watcher has its own tests)."""
    with patch("custom_components.friedafetch_mail.idle.MailWatcher.start"):
        yield


@pytest.fixture(autouse=True)
def no_network() -> Generator[None]:
    """CalDAV discovery and contacts succeed without network."""
    with (
        patch(
            "custom_components.friedafetch.caldav_client.ICloudCalDav.async_discover",
            new_callable=AsyncMock,
            return_value="https://p01-caldav.icloud.com/1/calendars/",
        ),
        patch("custom_components.friedafetch.carddav_client.ICloudCardDav.async_search", AsyncMock(return_value=[])),
    ):
        yield


def core_entry(**options) -> MockConfigEntry:
    return MockConfigEntry(
        domain="friedafetch",
        title=APPLE_ID,
        unique_id=APPLE_ID,
        data={"apple_id": APPLE_ID, "app_password": APP_PASSWORD},
        options=options,
    )


async def setup_core(hass: HomeAssistant, **options) -> MockConfigEntry:
    entry = core_entry(**options)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def setup_postfach(hass: HomeAssistant, core: MockConfigEntry, **options) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain="friedafetch_mail",
        title="test",
        unique_id=core.entry_id,
        data={"account": core.entry_id},
        options=options,
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry
