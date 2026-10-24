"""Sensors: next birthday, unread inbox mail, rule matches, push state and AI sorting of one Frieda account."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity, DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from custom_components.friedafetch.const import (
    CONF_ENABLE_CONTACTS,
    CONF_ENABLE_MAIL,
    DEFAULT_ENABLE_CONTACTS,
    DEFAULT_ENABLE_MAIL,
)
from custom_components.friedafetch.insights import upcoming_birthdays

from .const import CONF_BIRTHDAY_SENSOR, DEFAULT_BIRTHDAY_SENSOR, DOMAIN, SIGNAL_UPDATED
from .live import SIGNAL_PANEL

_LOGGER = logging.getLogger(__name__)
LOOKAHEAD_DAYS = 30
UPDATE_INTERVAL = timedelta(hours=6)
UNREAD_INTERVAL = timedelta(minutes=5)
SCAN_INTERVAL = timedelta(minutes=1)  # status sensors only read values kept in memory
PUSH_STATES = ["off", "stopped", "connecting", "listening", "error", "unsupported"]
MAX_LISTED = 5


async def async_setup_entry(
    hass: HomeAssistant, entry: Any, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    link = entry.runtime_data
    options = link.clients.options
    entities: list[SensorEntity] = []

    if options.get(CONF_ENABLE_MAIL, DEFAULT_ENABLE_MAIL) and link.mail is not None:

        async def _unread() -> int:
            try:
                return len(await link.mail.async_search_uids("INBOX", ["UNSEEN"]))
            except Exception as err:  # noqa: BLE001
                raise UpdateFailed(str(err)) from err

        unread = DataUpdateCoordinator(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} unread",
            update_method=_unread,
            update_interval=UNREAD_INTERVAL,
        )
        await unread.async_refresh()
        entities.append(UnreadSensor(unread, entry, link))
        entities.append(RuleMatchesSensor(entry, link))
        entities.append(PushSensor(entry, link))
        if getattr(link, "insights", None) is not None:
            entities.append(ParcelsSensor(entry, link))
        if link.ai is not None and link.ai.settings["enabled"]:
            entities.append(ImportantSensor(entry, link))
            entities.append(AiUsageSensor(entry, link))

    if entry.options.get(CONF_BIRTHDAY_SENSOR, DEFAULT_BIRTHDAY_SENSOR) and options.get(
        CONF_ENABLE_CONTACTS, DEFAULT_ENABLE_CONTACTS
    ):

        async def _update() -> list[dict[str, Any]]:
            try:
                contacts = await link.clients.carddav.async_search(None, limit=100000)
            except Exception as err:  # noqa: BLE001
                raise UpdateFailed(str(err)) from err
            return upcoming_birthdays(contacts, dt_util.now().date(), days=LOOKAHEAD_DAYS)

        coordinator = DataUpdateCoordinator(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} birthdays",
            update_method=_update,
            update_interval=UPDATE_INTERVAL,
        )
        await coordinator.async_refresh()  # a failed first refresh must not block the extension
        entities.append(BirthdaySensor(coordinator, entry, link.label))

    async_add_entities(entities)


def _device(entry: Any, label: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=f"Frieda Postfach ({label})",
        manufacturer="Frieda",
        entry_type=DeviceEntryType.SERVICE,
    )


class _StatusSensor(SensorEntity):
    """Reads the state of rules, push and AI sorting; refreshes after every run and once a minute."""

    _attr_has_entity_name = True
    key = ""

    def __init__(self, entry: Any, link: Any) -> None:
        self._link = link
        self._attr_translation_key = self.key
        self._attr_unique_id = f"{entry.entry_id}_{self.key}"
        self._attr_device_info = _device(entry, link.label)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED.format(self._link.core_entry_id), self._updated)
        )

    @callback
    def _updated(self) -> None:
        self.async_write_ha_state()


class UnreadSensor(CoordinatorEntity[DataUpdateCoordinator[int]], SensorEntity):
    """Unread messages in the inbox (checked every 5 minutes and after each rule run)."""

    _attr_has_entity_name = True
    _attr_translation_key = "unread_inbox"
    _attr_icon = "mdi:email-alert-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: DataUpdateCoordinator[int], entry: Any, link: Any) -> None:
        super().__init__(coordinator)
        self._link = link
        self._attr_unique_id = f"{entry.entry_id}_unread_inbox"
        self._attr_device_info = _device(entry, link.label)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()

        @callback
        def _refresh() -> None:
            self.hass.async_create_task(self.coordinator.async_request_refresh())

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED.format(self._link.core_entry_id), _refresh)
        )

    @property
    def native_value(self) -> int | None:
        return self.coordinator.data


class RuleMatchesSensor(_StatusSensor):
    """Messages the inbox rules acted on today."""

    key = "rule_matches_today"
    _attr_icon = "mdi:filter-check-outline"
    _attr_state_class = SensorStateClass.TOTAL_INCREASING

    @property
    def native_value(self) -> int:
        return self._link.rules.history_today()["matched"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        rules = self._link.rules
        auto = rules.automation_status()
        last = rules.last_run or {}
        return {
            "runs_today": rules.history_today()["runs"],
            "last_run": last.get("finished"),
            "last_trigger": last.get("trigger"),
            "next_run": auto.get("next_run"),
            "enabled_rules": auto.get("enabled_rules", 0),
        }


class PushSensor(_StatusSensor):
    """State of the IMAP IDLE connection that delivers new mail right away."""

    key = "push"
    _attr_icon = "mdi:email-fast-outline"
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = PUSH_STATES
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self) -> str:
        watcher = self._link.watcher
        return watcher.state if watcher is not None and watcher.state in PUSH_STATES else "off"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        watcher = self._link.watcher
        out: dict[str, Any] = {}
        if watcher is not None:
            status = watcher.status()
            out = {k: status.get(k) for k in ("since", "last_push", "error")}
        if self._link.state is not None:
            # the read / flagged look (mailstate.py): numbers and times only
            state = self._link.state.status()
            out |= {
                "state_condstore": state["condstore"],
                "state_qresync": state["qresync"],
                "state_mode": state["mode"],
                "state_last": state["last"],
                "state_last_full": state["last_full"],
                "state_tracked": state["tracked"],
                "state_folders": state["folders"],
                "state_gone": state["gone"],
                "state_error": state["error"],
            }
        return out


class ImportantSensor(_StatusSensor):
    """Mails the AI rated as important today (from the notification threshold, else from 4)."""

    key = "important_today"
    _attr_icon = "mdi:email-alert"

    @property
    def native_value(self) -> int:
        return len(self._link.ai.important_today())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        ai = self._link.ai
        return {
            "threshold": ai.important_from,
            "mails": [
                # the Message-ID lets the dashboard card open the mail in the panel
                {k: r.get(k) for k in ("time", "from", "subject", "category", "importance", "reason", "message_id")}
                for r in ai.important_today()[:MAX_LISTED]
            ],
        }


class ParcelsSensor(_StatusSensor):
    """Parcels on their way (from shipping mails); the list with carrier, status and expected day as attributes."""

    key = "parcels"
    _attr_icon = "mdi:package-variant-closed"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_PANEL, self._panel_changed))

    @callback
    def _panel_changed(self, core_entry_id: str, topic: str) -> None:
        if core_entry_id == self._link.core_entry_id and topic == "insights":
            self.async_write_ha_state()

    @property
    def native_value(self) -> int:
        return sum(1 for p in self._link.insights.parcels() if p["status"] != "delivered")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        listed = self._link.insights.parcels()
        return {
            "out_for_delivery": sum(1 for p in listed if p["status"] == "out_for_delivery"),
            "parcels": [
                {k: p[k] for k in ("carrier", "number", "shop", "status", "eta", "window", "url")}
                for p in listed[:MAX_LISTED]
            ],
        }


class AiUsageSensor(_StatusSensor):
    """AI ratings in the current hour against the hourly limit."""

    key = "ai_ratings_hour"
    _attr_icon = "mdi:robot-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self) -> int:
        return int(self._link.ai.status()["used_this_hour"])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        status = self._link.ai.status()
        return {k: status.get(k) for k in ("limit", "active", "mode", "entity", "last_run", "last_error")}


class BirthdaySensor(CoordinatorEntity[DataUpdateCoordinator[list[dict[str, Any]]]], SensorEntity):
    """Date of the next birthday; the attributes list everyone in the next 30 days."""

    _attr_has_entity_name = True
    _attr_translation_key = "next_birthday"
    _attr_device_class = SensorDeviceClass.DATE
    _attr_icon = "mdi:cake-variant"

    def __init__(self, coordinator: DataUpdateCoordinator, entry: Any, label: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_next_birthday"
        self._attr_device_info = _device(entry, label)

    @property
    def native_value(self) -> date | None:
        items = self.coordinator.data or []
        return date.fromisoformat(items[0]["date"]) if items else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        items = self.coordinator.data or []
        first = items[0] if items else None
        same_day = [b["name"] for b in items if first and b["date"] == first["date"]]
        return {
            "names": same_day,
            "in_days": first["in_days"] if first else None,
            "turns": first["turns"] if first else None,
            "upcoming": [{k: b[k] for k in ("name", "date", "in_days", "turns")} for b in items[:15]],
        }
