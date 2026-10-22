"""The problem sensor of an account: on while push, the look, the AI, a pass or iCloud's throttling has a problem."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval

from .const import SIGNAL_UPDATED
from .live import SIGNAL_PANEL
from .sensor import _device

CHECK_EVERY = timedelta(minutes=1)


async def async_setup_entry(
    hass: HomeAssistant, entry: Any, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    link = entry.runtime_data
    if getattr(link, "health", None) is not None:
        async_add_entities([HealthSensor(entry, link)])


class HealthSensor(BinarySensorEntity):
    """Problem: on with the reasons as attributes (push, look, ai, pass_slow, throttled, for_you)."""

    _attr_has_entity_name = True
    _attr_translation_key = "problem"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, entry: Any, link: Any) -> None:
        self._link = link
        self._attr_unique_id = f"{entry.entry_id}_problem"
        self._attr_device_info = _device(entry, link.label)
        self._problems: list[dict[str, Any]] = []

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED.format(self._link.core_entry_id), self._refresh)
        )
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_PANEL, self._panel_changed))
        self.async_on_remove(async_track_time_interval(self.hass, self._refresh, CHECK_EVERY))
        self._problems = self._link.health.check()

    @callback
    def _panel_changed(self, core_entry_id: str, topic: str) -> None:
        if core_entry_id == self._link.core_entry_id:
            self._refresh()

    @callback
    def _refresh(self, *_: Any) -> None:
        self._problems = self._link.health.check()
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return bool(self._problems)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"problems": self._problems, "throttle": self._link.throttle.status()}
