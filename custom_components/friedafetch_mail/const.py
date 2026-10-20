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

# AI sorting: off unless switched on deliberately AND an ai_task entity is chosen
CONF_AI_ENABLED = "ai_enabled"
CONF_AI_ENTITY = "ai_entity"  # ai_task entity that rates the e-mails
CONF_AI_BODY = "ai_include_body"  # also send the first characters of the text (default: sender and subject only)
CONF_AI_MODE = "ai_mode"  # observe = only rate, act = run the category actions
CONF_AI_LIMIT = "ai_hourly_limit"  # ratings per hour
CONF_AI_EXCLUDE = "ai_exclude"  # senders/domains that are never sent to the AI
CONF_AI_BLOCK_TERMS = "ai_block_terms"  # kill switch: mails containing one of these terms never go to an AI
CONF_AI_NOTIFY = "ai_notify_importance"  # 0 = off, else notify from this importance on (act mode)

DEFAULT_AI_ENABLED = False
DEFAULT_AI_BODY = False
DEFAULT_AI_MODE = "observe"
DEFAULT_AI_LIMIT = 30
MAX_AI_LIMIT = 200
DEFAULT_AI_NOTIFY = 0
AI_MODES = ("observe", "act")
AI_BODY_CHARS = 1000

SERVICE_SEND_DIGEST = "send_digest"

# events for automations (fired on the HA event bus; subject and sender stay local to Home Assistant)
EVENT_RULE_MATCHED = "friedafetch_mail_rule_matched"  # one per message and rule of an executed run
EVENT_RATED = "friedafetch_mail_rated"  # every AI rating
EVENT_IMPORTANT = "friedafetch_mail_important"  # AI rating at or above the importance threshold
MAX_EVENTS_PER_RUN = 25  # a large run must not flood the event bus
DEFAULT_IMPORTANT_FROM = 4  # threshold for "important" when no notification threshold is set
SIGNAL_UPDATED = "friedafetch_mail_updated_{}"  # dispatcher signal per Frieda account: rules/AI state changed

# Frieda that Frieda Postfach needs for everything (the tabs of Frieda UI 5, the IMAP state of 2.0.18); older ones get a repair
MIN_FRIEDA_VERSION = "2.0.18"
