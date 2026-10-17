"""Config flow: attach Frieda Postfach to a Frieda account."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .const import (
    CONF_ACCOUNT,
    CONF_BIRTHDAY_SENSOR,
    CONF_DIGEST_AI_TASK,
    CONF_DIGEST_NOTIFY,
    CONF_DIGEST_TIME,
    CONF_RULES_AUTO,
    CONF_RULES_INTERVAL,
    CONF_RULES_PUSH,
    CORE_DOMAIN,
    DEFAULT_BIRTHDAY_SENSOR,
    DEFAULT_RULES_AUTO,
    DEFAULT_RULES_INTERVAL,
    DEFAULT_RULES_PUSH,
    DOMAIN,
    LEGACY_OPTIONS,
    MAX_RULES_INTERVAL,
    MIN_RULES_INTERVAL,
)


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
    """Rules, push, daily overview and the birthday sensor."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
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
                vol.Optional(CONF_DIGEST_TIME, default=opts.get(CONF_DIGEST_TIME) or ""): TextSelector(),
                vol.Optional(CONF_DIGEST_NOTIFY, default=current_notify): SelectSelector(
                    SelectSelectorConfig(options=notify_options, custom_value=True, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional(CONF_DIGEST_AI_TASK, default=current_ai): SelectSelector(
                    SelectSelectorConfig(options=ai_options, mode=SelectSelectorMode.DROPDOWN)
                ),
                vol.Required(
                    CONF_BIRTHDAY_SENSOR, default=opts.get(CONF_BIRTHDAY_SENSOR, DEFAULT_BIRTHDAY_SENSOR)
                ): BooleanSelector(),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
