"""Config flow: attach Frieda Postfach to a Frieda account."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
)

from .const import (
    AI_MODES,
    CONF_ACCOUNT,
    CONF_AI_BLOCK_TERMS,
    CONF_AI_BODY,
    CONF_AI_ENABLED,
    CONF_AI_ENTITY,
    CONF_AI_EVENTS,
    CONF_AI_EXCLUDE,
    CONF_AI_KNOWN,
    CONF_AI_LIMIT,
    CONF_AI_MODE,
    CONF_AI_NOTIFY,
    CONF_BIRTHDAY_SENSOR,
    CONF_DIGEST_AI_TASK,
    CONF_DIGEST_NOTIFY,
    CONF_DIGEST_TIME,
    CONF_EVENTS_CALENDAR,
    CONF_FOLLOWUP_DAYS,
    CONF_RULES_AUTO,
    CONF_RULES_INTERVAL,
    CONF_RULES_PUSH,
    CONF_VIP_GROUPS,
    CONF_VIP_NOTIFY,
    CONF_VIP_SENDERS,
    CONF_WEEKLY_DAY,
    CORE_DOMAIN,
    DEFAULT_AI_BODY,
    DEFAULT_AI_ENABLED,
    DEFAULT_AI_EVENTS,
    DEFAULT_AI_KNOWN,
    DEFAULT_AI_LIMIT,
    DEFAULT_AI_MODE,
    DEFAULT_AI_NOTIFY,
    DEFAULT_BIRTHDAY_SENSOR,
    DEFAULT_FOLLOWUP_DAYS,
    DEFAULT_RULES_AUTO,
    DEFAULT_RULES_INTERVAL,
    DEFAULT_RULES_PUSH,
    DEFAULT_VIP_NOTIFY,
    DOMAIN,
    LEGACY_OPTIONS,
    MAX_AI_LIMIT,
    MAX_FOLLOWUP_DAYS,
    MAX_RULES_INTERVAL,
    MIN_RULES_INTERVAL,
    VIP_ALL_CONTACTS,
)

_LOGGER = logging.getLogger(__name__)
WEEKLY_DAYS = ["off", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _vol():
    from custom_components.friedafetch.schema import vol  # noqa: PLC0415

    return vol


def _label(entry: ConfigEntry) -> str:
    try:
        from custom_components.friedafetch.accounts import account_label  # noqa: PLC0415
    except ImportError:
        return entry.title
    return account_label(entry)


def valid_clock(value: str) -> bool:
    parts = value.split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        return False
    return 0 <= int(parts[0]) <= 23 and 0 <= int(parts[1]) <= 59


class FriedaPostfachConfigFlow(ConfigFlow, domain=DOMAIN):
    """One entry per Frieda account."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        core_entries = self.hass.config_entries.async_entries(CORE_DOMAIN)
        if not core_entries:
            return self.async_abort(reason="no_frieda")
        configured = {e.unique_id for e in self._async_current_entries()}
        free = [e for e in core_entries if e.entry_id not in configured]
        if not free:
            return self.async_abort(reason="already_configured")
        if user_input is not None:
            core = next(e for e in free if e.entry_id == user_input[CONF_ACCOUNT])
            await self.async_set_unique_id(core.entry_id)
            self._abort_if_unique_id_configured()
            # take over the automation settings Frieda < 2.0 kept on its own entry
            options = {k: core.options[k] for k in LEGACY_OPTIONS if k in core.options}
            return self.async_create_entry(title=_label(core), data={CONF_ACCOUNT: core.entry_id}, options=options)
        vol = _vol()
        choices = [{"value": e.entry_id, "label": f"{_label(e)} ({e.title})"} for e in free]
        schema = vol.Schema(
            {
                vol.Required(CONF_ACCOUNT, default=free[0].entry_id): SelectSelector(
                    SelectSelectorConfig(options=choices, mode=SelectSelectorMode.DROPDOWN)
                )
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return FriedaPostfachOptionsFlow()


class FriedaPostfachOptionsFlow(OptionsFlow):
    """Menu: automation (rules, push, daily overview, birthday sensor) and AI sorting.

    Optional text and select fields use ``suggested_value`` instead of ``default``: the frontend leaves a cleared
    field out of the submitted data, and a default would silently put the old value back.
    """

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["automation", "ai", "foryou"])

    async def async_step_foryou(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """For you: important senders, calendar proposals, waiting for a reply, the weekly review."""
        if user_input is not None:
            user_input[CONF_VIP_GROUPS] = [str(g) for g in user_input.get(CONF_VIP_GROUPS) or [] if str(g).strip()]
            user_input[CONF_VIP_SENDERS] = str(user_input.get(CONF_VIP_SENDERS) or "").strip()
            user_input[CONF_EVENTS_CALENDAR] = str(user_input.get(CONF_EVENTS_CALENDAR) or "")
            user_input[CONF_FOLLOWUP_DAYS] = int(user_input.get(CONF_FOLLOWUP_DAYS, DEFAULT_FOLLOWUP_DAYS) or 0)
            return self.async_create_entry(data={**self.config_entry.options, **user_input})
        vol = _vol()
        opts = dict(self.config_entry.options)
        de = (self.hass.config.language or "en").startswith("de")
        groups: list[str] = []
        calendars: list[dict[str, Any]] = []
        insights = getattr(getattr(self.config_entry, "runtime_data", None), "insights", None)
        if insights is not None:
            try:
                groups = await insights.async_groups()
            except Exception as err:  # noqa: BLE001 - contacts off or unreachable: typed names still work
                _LOGGER.debug("Options: the contact groups could not be read: %s", err)
            try:
                calendars = await insights.async_calendars()
            except Exception as err:  # noqa: BLE001 - calendar off or unreachable
                _LOGGER.debug("Options: the calendars could not be read: %s", err)
        chosen = list(opts.get(CONF_VIP_GROUPS) or [])
        names = dict.fromkeys([*groups, *(c for c in chosen if c != VIP_ALL_CONTACTS)])
        group_options = [SelectOptionDict(value=VIP_ALL_CONTACTS, label="Alle Kontakte" if de else "All contacts")]
        group_options += [SelectOptionDict(value=g, label=g) for g in names]
        current_cal = str(opts.get(CONF_EVENTS_CALENDAR) or "")
        cal_options = [SelectOptionDict(value="", label="–")]
        cal_options += [SelectOptionDict(value=c["id"], label=c["name"]) for c in calendars]
        if current_cal and current_cal not in {c["id"] for c in calendars}:
            cal_options.append(SelectOptionDict(value=current_cal, label=current_cal))
        schema = vol.Schema(
            {
                vol.Optional(CONF_VIP_GROUPS, description={"suggested_value": chosen}): SelectSelector(
                    SelectSelectorConfig(
                        options=group_options, multiple=True, custom_value=True, mode=SelectSelectorMode.DROPDOWN
                    )
                ),
                vol.Optional(
                    CONF_VIP_SENDERS, description={"suggested_value": opts.get(CONF_VIP_SENDERS) or ""}
                ): TextSelector(TextSelectorConfig(multiline=True)),
                vol.Required(CONF_VIP_NOTIFY, default=opts.get(CONF_VIP_NOTIFY, DEFAULT_VIP_NOTIFY)): BooleanSelector(),
                vol.Required(CONF_AI_EVENTS, default=opts.get(CONF_AI_EVENTS, DEFAULT_AI_EVENTS)): BooleanSelector(),
                vol.Optional(CONF_EVENTS_CALENDAR, description={"suggested_value": current_cal}): SelectSelector(
                    SelectSelectorConfig(options=cal_options, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Required(
                    CONF_FOLLOWUP_DAYS, default=opts.get(CONF_FOLLOWUP_DAYS, DEFAULT_FOLLOWUP_DAYS)
                ): NumberSelector(
                    NumberSelectorConfig(min=0, max=MAX_FOLLOWUP_DAYS, step=1, mode=NumberSelectorMode.BOX)
                ),
                vol.Required(CONF_WEEKLY_DAY, default=opts.get(CONF_WEEKLY_DAY) or "off"): SelectSelector(
                    SelectSelectorConfig(
                        options=WEEKLY_DAYS, translation_key="weekly_day", mode=SelectSelectorMode.DROPDOWN
                    )
                ),
            }
        )
        return self.async_show_form(step_id="foryou", data_schema=schema)

    async def async_step_ai(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """AI sorting: off by default; needs the switch AND a chosen ai_task entity."""
        errors: dict[str, str] = {}
        ai_tasks = sorted(self.hass.states.async_entity_ids("ai_task"))
        if user_input is not None:
            entity = str(user_input.get(CONF_AI_ENTITY) or "")
            user_input[CONF_AI_ENTITY] = entity
            user_input[CONF_AI_LIMIT] = int(user_input.get(CONF_AI_LIMIT, DEFAULT_AI_LIMIT))
            user_input[CONF_AI_NOTIFY] = int(user_input.get(CONF_AI_NOTIFY, DEFAULT_AI_NOTIFY) or 0)
            user_input[CONF_AI_EXCLUDE] = str(user_input.get(CONF_AI_EXCLUDE) or "").strip()
            user_input[CONF_AI_BLOCK_TERMS] = str(user_input.get(CONF_AI_BLOCK_TERMS) or "").strip()
            if user_input.get(CONF_AI_ENABLED) and not entity:
                errors[CONF_AI_ENTITY] = "ai_entity_required"
            elif entity and entity not in ai_tasks:
                errors[CONF_AI_ENTITY] = "ai_entity_invalid"
            else:
                return self.async_create_entry(data={**self.config_entry.options, **user_input})
        vol = _vol()
        opts = {**self.config_entry.options, **(user_input or {})}
        current = str(opts.get(CONF_AI_ENTITY) or "")
        entity_options = [{"value": "", "label": "–"}] + [{"value": e, "label": e} for e in ai_tasks]
        if current and current not in ai_tasks:
            entity_options.append({"value": current, "label": current})
        schema = vol.Schema(
            {
                vol.Required(CONF_AI_ENABLED, default=opts.get(CONF_AI_ENABLED, DEFAULT_AI_ENABLED)): BooleanSelector(),
                vol.Optional(CONF_AI_ENTITY, description={"suggested_value": current}): SelectSelector(
                    SelectSelectorConfig(options=entity_options, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Required(CONF_AI_MODE, default=opts.get(CONF_AI_MODE, DEFAULT_AI_MODE)): SelectSelector(
                    SelectSelectorConfig(
                        options=list(AI_MODES), translation_key="ai_mode", mode=SelectSelectorMode.LIST
                    )
                ),
                vol.Required(CONF_AI_BODY, default=opts.get(CONF_AI_BODY, DEFAULT_AI_BODY)): BooleanSelector(),
                vol.Required(CONF_AI_KNOWN, default=opts.get(CONF_AI_KNOWN, DEFAULT_AI_KNOWN)): BooleanSelector(),
                vol.Required(CONF_AI_LIMIT, default=opts.get(CONF_AI_LIMIT, DEFAULT_AI_LIMIT)): NumberSelector(
                    NumberSelectorConfig(min=1, max=MAX_AI_LIMIT, step=1, mode=NumberSelectorMode.BOX)
                ),
                vol.Required(
                    CONF_AI_NOTIFY, default=str(opts.get(CONF_AI_NOTIFY, DEFAULT_AI_NOTIFY) or 0)
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=["0", "3", "4", "5"], translation_key="ai_notify", mode=SelectSelectorMode.DROPDOWN
                    )
                ),
                vol.Optional(
                    CONF_AI_EXCLUDE, description={"suggested_value": opts.get(CONF_AI_EXCLUDE) or ""}
                ): TextSelector(TextSelectorConfig(multiline=True)),
                vol.Optional(
                    CONF_AI_BLOCK_TERMS, description={"suggested_value": opts.get(CONF_AI_BLOCK_TERMS) or ""}
                ): TextSelector(TextSelectorConfig(multiline=True)),
            }
        )
        return self.async_show_form(step_id="ai", data_schema=schema, errors=errors)

    async def async_step_automation(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            user_input[CONF_RULES_INTERVAL] = int(user_input.get(CONF_RULES_INTERVAL, DEFAULT_RULES_INTERVAL))
            user_input[CONF_DIGEST_TIME] = str(user_input.get(CONF_DIGEST_TIME) or "").strip()
            user_input[CONF_DIGEST_NOTIFY] = str(user_input.get(CONF_DIGEST_NOTIFY) or "").removeprefix("notify.")
            user_input[CONF_DIGEST_AI_TASK] = str(user_input.get(CONF_DIGEST_AI_TASK) or "")
            if user_input[CONF_DIGEST_TIME] and not valid_clock(user_input[CONF_DIGEST_TIME]):
                errors[CONF_DIGEST_TIME] = "invalid_time"
            else:
                return self.async_create_entry(data={**self.config_entry.options, **user_input})
        vol = _vol()
        opts = {**self.config_entry.options, **(user_input or {})}
        notify_services = sorted(self.hass.services.async_services().get("notify", {}))
        current_notify = opts.get(CONF_DIGEST_NOTIFY) or ""
        notify_options = [{"value": "", "label": "–"}] + [{"value": n, "label": f"notify.{n}"} for n in notify_services]
        if current_notify and current_notify not in notify_services:
            notify_options.append({"value": current_notify, "label": f"notify.{current_notify}"})
        ai_tasks = sorted(self.hass.states.async_entity_ids("ai_task"))
        current_ai = opts.get(CONF_DIGEST_AI_TASK) or ""
        ai_options = [{"value": "", "label": "–"}] + [{"value": e, "label": e} for e in ai_tasks]
        if current_ai and current_ai not in ai_tasks:
            ai_options.append({"value": current_ai, "label": current_ai})
        schema = vol.Schema(
            {
                vol.Required(CONF_RULES_AUTO, default=opts.get(CONF_RULES_AUTO, DEFAULT_RULES_AUTO)): BooleanSelector(),
                vol.Required(
                    CONF_RULES_INTERVAL, default=opts.get(CONF_RULES_INTERVAL, DEFAULT_RULES_INTERVAL)
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=MIN_RULES_INTERVAL, max=MAX_RULES_INTERVAL, step=1, mode=NumberSelectorMode.BOX
                    )
                ),
                vol.Required(CONF_RULES_PUSH, default=opts.get(CONF_RULES_PUSH, DEFAULT_RULES_PUSH)): BooleanSelector(),
                vol.Optional(
                    CONF_DIGEST_TIME, description={"suggested_value": opts.get(CONF_DIGEST_TIME) or ""}
                ): TextSelector(),
                vol.Optional(CONF_DIGEST_NOTIFY, description={"suggested_value": current_notify}): SelectSelector(
                    SelectSelectorConfig(options=notify_options, custom_value=True, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional(CONF_DIGEST_AI_TASK, description={"suggested_value": current_ai}): SelectSelector(
                    SelectSelectorConfig(options=ai_options, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Required(
                    CONF_BIRTHDAY_SENSOR, default=opts.get(CONF_BIRTHDAY_SENSOR, DEFAULT_BIRTHDAY_SENSOR)
                ): BooleanSelector(),
            }
        )
        return self.async_show_form(step_id="automation", data_schema=schema, errors=errors)
