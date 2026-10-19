<p align="center">
  <img src="https://raw.githubusercontent.com/nadeo360/friedafetch-mail/main/assets/logo@2x.png" alt="Frieda Postfach" width="720">
</p>

<p align="center">
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml"><img alt="hassfest & HACS" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml"><img alt="Security checks" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nadeo360/friedafetch-mail?display_name=tag"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/blob/main/LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center"><b>English</b> · <a href="https://github.com/nadeo360/friedafetch-mail/blob/main/README.de.md">Deutsch</a></p>

# Frieda Postfach – inbox automation for Frieda

**Frieda Postfach** (technical name `friedafetch_mail`) is the companion integration to
[**Frieda**](https://github.com/nadeo360/friedafetch), the MCP connector for iCloud. Frieda gives AI assistants
controlled access to your iCloud calendars, contacts, mail and notes and only acts when it is asked to.
Frieda Postfach is the part that **acts on its own**:

- **Inbox rules** with conditions and actions, applied to new mail – within seconds via **push** (IMAP IDLE) or on a
  timer – and on demand to a whole mailbox, with dry runs, a run history and a management panel.
- **Receipts:** a rule action that stores attachments (e.g. invoices) in a folder.
- **Daily overview:** a morning summary of unread mail, rule activity, today's events and birthdays, sent to your
  phone and optionally phrased by a Home Assistant AI task.
- **AI sorting (optional, off by default):** an AI of your choice rates new mail – category, importance 1–5 and a
  short reason – and, if you allow it, sorts it into folders. See [AI sorting](#ai-sorting).
- **Sensors and events** for automations: unread mail, rule matches, push state, important mails and AI usage; events for every rule match and AI rating. Plus a birthday sensor.
- **AI tools** for the rules (`icloud_list_rules`, `icloud_create_rule`, … ) and `icloud_daily_overview`; they are
  added to Frieda's tools for the account, so every MCP client and conversation agent that uses Frieda gets them.

Keeping this separate means Frieda itself stays a pure connector: no background connections, no scheduled jobs and
no file writes unless you install Frieda Postfach.

## Requirements

- Home Assistant 2026.10 or newer
- **Frieda 2.0.14 or newer** (`friedafetch`; older versions work, but the panel then only shows an update hint), set up with at least one iCloud account. Frieda Postfach uses that
  account's connection; it never asks for your Apple ID or password itself.

## Installation

1. HACS → ⋮ → Custom repositories → `https://github.com/nadeo360/friedafetch-mail`, type *Integration*.
2. Download **Frieda Postfach** and restart Home Assistant.
3. Settings → Devices & services → Add integration → **Frieda Postfach**, pick the Frieda account.

**Coming from Frieda 1.x?** Your rules, their hit counters and the run history stay where they are
(`.storage/friedafetch.rules.<account>`) and are picked up automatically, as are the automation settings
(interval, push, daily overview). Until Frieda Postfach is installed, Frieda 2.0 shows a repair notice for accounts
with stored rules, and no rules run.

## Options

The options have two parts: **Automation and daily overview** (below) and **AI sorting** (see
[AI sorting](#ai-sorting)).

| Option | Effect |
|--------|--------|
| Apply rules automatically | run the rules on new mail (default: on) |
| Interval | minutes between timer runs (default 5, 1–240); the timer is the fallback and covers mailboxes other than the inbox |
| Push | IMAP IDLE: run the rules a few seconds after new mail arrives in the inbox (default: on) |
| Daily overview at | `HH:MM`, empty = off |
| Send the overview with | a `notify` service such as the companion app; empty = notification in Home Assistant |
| AI task for the overview | optional `ai_task` entity |
| Birthday sensor | create `sensor.frieda_postfach_<account>_next_birthday` |

Nothing runs automatically on accounts that Frieda keeps in read-only mode; dry runs still work there.

## Inbox rules

- **Conditions** on `from`, `to`, `cc`, `subject` or `any` with `contains`, `equals`, `starts_with`, `ends_with`,
  `domain` (sender domain incl. subdomains) or `regex`; combined with `all` (default) or `any`.
- **Actions:** `move_to` (folder), `mark_seen`, `flag`, `delete` (trash), `save_attachments` (with an optional
  `attachments_folder`, e.g. `Receipts`) and `stop` (default: skip further rules for this message). Deleting needs
  Frieda's "Allow deleting" option; attachments are stored before a message is moved or deleted and need Frieda's
  attachment folder (Frieda → Configure → Tools and account).
- **Only new mail** since the last run is processed automatically. The very first run only sets the baseline. For
  existing mail use the panel or `icloud_run_rules` with `scope: "all"` (newest 2000 messages) and `dry_run: true`.
- **Batched execution:** matches are grouped per action and executed in a few IMAP commands.
- Frieda's guard rails apply: quotas, protected and hidden mailboxes, and every run with hits or errors is written
  to Frieda's change log (marked manual, automatic or push).

Example (as a tool call):

```json
{
  "name": "Archive newsletters",
  "conditions": [{"field": "from", "op": "domain", "value": "newsletter.example.com"}],
  "actions": {"move_to": "Archive", "mark_seen": true}
}
```

**Limits.** Unattended runs (timer, push) and runs an AI starts change at most 100 messages, 50 of them deletions,
per run and count against Frieda's hourly quota for mail changes; the rest follows in the next run. When an AI
creates or enables a rule that deletes or moves, or applies the rules to the whole mailbox, Frieda's approvals apply
(“approve deleting”, mass threshold), and so does Frieda's injection lock. Regex conditions that could block Home
Assistant on unlucky subjects – nested repetition such as `(a+)+` or chains like `a+a+a+` – are refused when the
rule is saved; regex conditions look at the first 300 characters of a header.

## Panel

**Frieda Postfach** in the sidebar (admins only, German/English). It uses Frieda's design library, so it looks like
Frieda's own panel; the cards (rules, AI sorting, sent to AI, runs) are widgets you can arrange, resize and hide,
and every table has search, filters and a **Columns** menu (stored per Home Assistant user). The rules card holds
the rules and everything to run them:

- **One status line** says how new mail is picked up: *instant via push* (with the timer as a safety net),
  *checking every N min* (push off), *push interrupted* (the timer keeps going) or *automation off*.
- A rule table (position, switch, name, conditions, actions, hits) that expands per rule, **+** for a new rule, and a
  ⋮ menu per rule for edit, dry run with only this rule, order, copy and delete.
- **Run** opens a menu: dry run or real run over the whole mailbox, or new mail only; the per-message report appears
  below the rules.
- The **Runs** history: one entry per pass of the rules and the AI sorting (automatic passes without new mail are
  merged), with search, filters and sorting; a push pass shows up at once as "New mail – being rated …"; a click shows every message of the pass with what the rules did, the
  AI's category and importance, a kill-switch hold or "no action".
- The **message timeline**: a click on a message (in a run, under *Recently rated* or *Sent to AI*) opens its whole
  path as a timeline – received, rules checked, sent to the AI or held back by the kill switch, rating, action, your
  correction. Steps are linked by the message's Message-ID (it survives moves); older entries are matched by subject
  and sender. Nothing new is stored for it, everything stays in Home Assistant. Frieda's change log links to it too.

With several accounts an account picker appears on top. Approvals and the change log stay in Frieda's own panel,
whose overview also shows whether Frieda Postfach is running.

## AI sorting

AI sorting is **off** and analyses nothing until you switch it on deliberately: *Settings → Devices & services →
Frieda Postfach → Configure → AI sorting*, turn on **Use AI sorting** and choose an **AI entity** (an `ai_task`
entity, e.g. from Google Generative AI, OpenAI or a local Ollama model). Without both, no mail is sent to any AI.

How it works:

1. New inbox mail first goes through your inbox rules. Only mail still in the inbox afterwards is rated, with push
   or on the timer (with the automation off, only via **Rate newest** in the panel). The first run only sets a
   starting point; older mail is never rated automatically.
2. The AI receives sender, recipients and subject – and the first 1,000 characters of the text only if you allow
   it.
3. **Kill switch:** mail from senders or domains on the block list (e.g. bank, doctor) and mail that contains a
   blocked term (e.g. diagnosis, salary, password) in subject, sender or text never reaches any AI – even with AI
   sorting switched on. The check runs locally in Home Assistant before anything is sent and also applies to the AI
   daily overview.
4. It answers with one of your **categories**, an **importance** from 1 (irrelevant) to 5 (needs attention today)
   and a short reason. Categories are plain-language descriptions you edit in the panel.
5. In the mode **Only rate** (default) nothing is changed; the ratings appear in the panel. In the mode **Run the
   category actions** each category can move the mail to a folder, mark it read and flag it, and mail from a chosen
   importance on can be flagged and announced (notify service of the daily overview, else a notification in Home
   Assistant). The AI can never delete or send.

In the panel you correct a rating by choosing the right category; up to 30 corrections are passed to the AI as
examples. An hourly limit (default 30) caps the number of AI calls; every mail is rated at most once. Actions that
changed mail are written to Frieda's change log.

The panel card **Sent to AI** shows what went to an AI: calls and characters today, in 7 and 30 days, how many of
them included text, per AI entity and per purpose (sorting, daily overview), and a log of every transmission with
the fields sent – plus every mail the kill switch held back and why. The log stays local.

| Option | Effect |
|--------|--------|
| Use AI sorting | master switch, off by default |
| AI entity | the `ai_task` entity that rates; required |
| What the AI may do | *Only rate* (default) or *Run the category actions* |
| Also send the text | first 1,000 characters of the text (default: off – sender, recipients and subject only) |
| Maximum ratings per hour | 1–200, default 30 |
| Notify about important mail | off, from importance 3, 4 or only 5 (act mode) |
| Kill switch: senders/domains | never send mail from them to an AI, one per line |
| Kill switch: terms | never send mail containing one of these terms to an AI, one per line |

## Sensors and events

Besides the birthday sensor, every account gets these sensors (when mail is enabled in Frieda):

| Sensor | Value |
|---|---|
| Unread in inbox | unread messages in the inbox (checked every 5 minutes and after each rule run) |
| Rule matches today | messages the rules acted on today; attributes: runs today, last and next run |
| Push | `listening`, `connecting`, `error`, `unsupported`, `stopped` or `off` (diagnostic) |
| Important mails today | only with AI sorting: mails rated at or above the notification threshold (else 4), the latest five as attributes |
| AI ratings this hour | only with AI sorting: ratings in the current hour, limit and mode as attributes (diagnostic) |

Automations can react to these events (data stays on the Home Assistant event bus):

| Event | When | Data |
|---|---|---|
| `friedafetch_mail_rule_matched` | a rule acted on a message (real runs only, at most 25 per run) | `account`, `rule`, `rule_id`, `trigger`, `mailbox`, `uid`, `subject`, `from`, `move_to`, `delete`, `mark_seen`, `flag` |
| `friedafetch_mail_rated` | the AI rated a mail | `account`, `uid`, `subject`, `from`, `from_domain`, `category`, `importance`, `reason`, `mode`, `applied` |
| `friedafetch_mail_important` | like `rated`, from the importance threshold on | same as `rated` |

```yaml
triggers:
  - trigger: event
    event_type: friedafetch_mail_important
actions:
  - action: notify.mobile_app_iphone
    data:
      title: "{{ trigger.event.data.from }}"
      message: "{{ trigger.event.data.subject }} ({{ trigger.event.data.reason }})"
```

## Daily overview

At the configured time Frieda Postfach collects unread mail since yesterday (newsletters left out), the rule
activity of the last 24 hours, today's events and birthdays in the next 7 days and sends them through the chosen
`notify` service. With an `ai_task` entity the overview is phrased as a short text; mail subjects are passed as data
with the instruction not to follow anything inside them. The action `friedafetch_mail.send_digest` sends it on
demand (optionally for one `account`) and returns the text.

## Security

Frieda Postfach adds no credentials and no network endpoints of its own. It reuses Frieda's connection, guard rails
and change log; the push connection is a second, read-only IMAP session that only listens for new mail. Tools of
Frieda Postfach follow Frieda's options: writing rule tools disappear in read-only mode, and approvals apply as for
every other Frieda tool. See [SECURITY.md](https://github.com/nadeo360/friedafetch-mail/blob/main/SECURITY.md).

## Development

How to report bugs, suggest ideas and send pull requests: [CONTRIBUTING.md](https://github.com/nadeo360/friedafetch-mail/blob/main/CONTRIBUTING.md).

The architecture of Frieda and Frieda Postfach is described in the arc42 document in Frieda's repository: [docs/architecture.md](https://github.com/nadeo360/friedafetch/blob/main/docs/architecture.md).

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements_dev.txt
git clone --depth 1 https://github.com/nadeo360/friedafetch /tmp/frieda
ln -s /tmp/frieda/custom_components/friedafetch custom_components/friedafetch
pytest && ruff check . && ruff format --check .
```

## About the use of AI

This integration was developed with substantial help from an AI coding assistant (Anthropic's Claude), working from
the maintainer's requirements and decisions. Every change is covered by the automated test suite and the security
checks, and releases are tested by the maintainer against a real iCloud account. Please report bugs and ideas via
GitHub issues – they are read by a human.

## Legal notices

Apple and iCloud are trademarks of Apple Inc.; Home Assistant is a trademark of the Open Home Foundation. **This is an
independent community project and is not affiliated with, endorsed or supported by Apple, the Open Home Foundation,
Nabu Casa, Anthropic or HACS.** Using iCloud is subject to Apple's iCloud terms. The software comes without warranty
and changes your mailbox on your behalf. Details: [NOTICE.md](https://github.com/nadeo360/friedafetch-mail/blob/main/NOTICE.md).

## License

MIT – see [LICENSE](https://github.com/nadeo360/friedafetch-mail/blob/main/LICENSE).
