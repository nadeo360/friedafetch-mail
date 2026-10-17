"""Constants for Frieda Postfach (inbox automation on top of Frieda)."""

from __future__ import annotations

DOMAIN = "friedafetch_mail"
CORE_DOMAIN = "friedafetch"  # the Frieda connector this extension attaches to
EXTENSION_NAME = "mail"  # key in the core's ICloudClients.extensions

CONF_ACCOUNT = "account"  # entry_id of the Frieda account

# Options
CONF_RULES_AUTO = "rules_auto"
CONF_RULES_INTERVAL = "rules_interval"
CONF_RULES_PUSH = "rules_push"
CONF_DIGEST_TIME = "digest_time"  # "HH:MM", empty = off
CONF_DIGEST_NOTIFY = "digest_notify"  # notify service without "notify."
CONF_DIGEST_AI_TASK = "digest_ai_task"  # optional ai_task entity that phrases the overview
CONF_BIRTHDAY_SENSOR = "birthday_sensor"

DEFAULT_RULES_AUTO = True
DEFAULT_RULES_INTERVAL = 5  # minutes
DEFAULT_RULES_PUSH = True
DEFAULT_BIRTHDAY_SENSOR = True
MIN_RULES_INTERVAL = 1
MAX_RULES_INTERVAL = 240

# options that Frieda < 2.0 stored on its own entry and that are taken over on setup
LEGACY_OPTIONS = (
    CONF_RULES_AUTO,
    CONF_RULES_INTERVAL,
    CONF_RULES_PUSH,
    CONF_DIGEST_TIME,
    CONF_DIGEST_NOTIFY,
    CONF_DIGEST_AI_TASK,
)

SERVICE_SEND_DIGEST = "send_digest"
