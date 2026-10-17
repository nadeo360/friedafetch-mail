<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="Frieda" width="720">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml"><img alt="hassfest & HACS" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml"><img alt="Security checks" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nadeo360/friedafetch-mail?display_name=tag"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center"><b>English</b> · <a href="README.de.md">Deutsch</a></p>

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
- **Birthday sensor** for the next birthday among your contacts.
- **AI tools** for the rules (`icloud_list_rules`, `icloud_create_rule`, … ) and `icloud_daily_overview`; they are
  added to Frieda's tools for the account, so every MCP client and conversation agent that uses Frieda gets them.

Keeping this separate means Frieda itself stays a pure connector: no background connections, no scheduled jobs and
no file writes unless you install Frieda Postfach.

## Requirements

- Home Assistant 2026.10 or newer
- **Frieda 2.0 or newer** (`friedafetch`), set up with at least one iCloud account. Frieda Postfach uses that
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

| Option | Effect |
|--------|--------|
| Apply inbox rules automatically | run the rules on new mail (default: on) |
| Interval | minutes between timer runs (default 5, 1–240); the timer is the fallback and covers mailboxes other than the inbox |
| Push | IMAP IDLE: run the rules a few seconds after new mail arrives in the inbox (default: on) |
| Daily overview at | `HH:MM`, empty = off |
| Send the overview with | a `notify` service such as the companion app; empty = notification in Home Assistant |
| Phrase the overview with | optional `ai_task` entity |
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

## Panel

**Frieda Postfach** in the sidebar (admins only, German/English). One card holds the rules and everything to run
them:

- **One status line** says how new mail is picked up: *instant via push* (with the timer as a safety net),
  *checking every N min* (push off), *push interrupted* (the timer keeps going) or *automation off*.
- A compact rule list that expands per rule, **+** for a new rule (and for another condition in the editor), and
  **Test** on each rule for a dry run with only that rule.
- **Run** opens a menu: dry run or real run over the whole mailbox, or new mail only; the per-message report appears
  below the rules.
- The **Runs** history (consecutive automatic runs without hits are merged) with filters per column.

With several accounts an account picker appears on top. Approvals and the change log stay in Frieda's own panel,
whose overview also shows whether Frieda Postfach is running.

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
every other Frieda tool. See [SECURITY.md](SECURITY.md).

## Development

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
and changes your mailbox on your behalf. Details: [NOTICE.md](NOTICE.md).

## License

MIT – see [LICENSE](LICENSE).
