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
- **Frieda 2.0.18 or newer** (`friedafetch`; with older versions a repair asks for the update, and parts of the panel are missing), set up with at least one iCloud account. Frieda Postfach uses that
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
Frieda's own panel. Four tabs keep it tidy: **Activity**, **Rules**, **AI sorting** and **AI log**; every table has
search, filters and a **Columns** menu (stored per Home Assistant user).

**Activity** looks like a mail program: views and folders on the left, the checked mails in the middle, the chosen
mail on the right (on phones the mail opens in a sheet over the list that you swipe down to close).

- **One line per mail** that Frieda Postfach checked: sender, time, subject and in quiet grey what happened – the
  rule, the AI's category and importance, a kill-switch hold or "no action"; a folder only when the mail was moved.
  Days are grouped (and can be folded), the list loads 50 mails at a time while you scroll, the search covers all of
  them. It keeps the last 30 days (at most 3,000 mails).
- **Read and flagged** as the mailbox has it now: unread mails stand out with a dot, flagged ones carry a flag – read
  or flag a mail on the iPhone and the activity shows it. Push notices the change within seconds, otherwise the
  inbox is looked at every 10 minutes. Where the IMAP server supports CONDSTORE (RFC 7162), Frieda only asks
  whether anything changed and which flags changed since the last look; without it the flags of the newest 500 inbox
  mails are read in one request.
- **Views:** all mails, by result (AI, rule, kill switch, no action) and by the folder Frieda put them in. That is
  what Frieda did – opening a mail looks up where it really is now (one search by its Message-ID): still there, moved
  elsewhere since, or no longer found.
- **The mail** shows its whole path as a timeline – received, rules checked, sent to the AI or held back by the kill
  switch, rating, action, every correction. The category is the place to correct it. Each mail of the activity keeps
  its steps as they happen, so the timeline stays complete when the run history has moved on; for older mails the
  steps are linked by the Message-ID (it survives moves) or by subject and sender. Frieda's change log links here too.
- **Select** (or Cmd/Ctrl-click, Shift-click for a range) picks mails for **Rate again**: all of a view, a whole day
  (Today, Yesterday, …) or single ones; mails handled by a rule are not for the AI. While the batch runs, every mail
  shows whether it waits, is being rated or is done.
- **Runs** (under *Technical*) is the technical view: one entry per pass of the rules and the AI sorting
  (automatic passes without new mail are merged); a push pass shows up at once as "New mail – being rated …".
- Small status notes say how new mail is picked up (push, timer, AI mode) and lead to where it is set.

**Rules** holds the rules and everything to run them:

- **One status line** says how new mail is picked up: *instant via push* (with the timer as a safety net),
  *checking every N min* (push off), *push interrupted* (the timer keeps going) or *automation off*.
- A rule table (position, switch, name, conditions, actions, hits) that expands per rule, **+** for a new rule, and a
  ⋮ menu per rule for edit, dry run with only this rule, order, copy and delete.
- **Run** opens a menu: dry run or real run over the whole mailbox, or new mail only; the per-message report appears
  above the rules.

**AI sorting** holds its mode and the categories, **AI log** everything that went to an AI. With several accounts an
account picker appears on top. Approvals and the change log stay in Frieda's own panel, whose overview also shows
whether Frieda Postfach is running.

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
examples. An hourly limit (default 30) caps the number of AI calls; every mail is rated at most once
automatically.

**Rate again:** after changing the categories you select mails under *Activity* (single ones, a whole day or
everything a view shows) or open one mail, and choose **Rate again**. The messages go to the AI once more with the
current categories – the kill switch and the hourly limit apply as always – and messages that were moved since are
found in their new folder by their Message-ID. On request the actions of the new category run afterwards. The
re-rating runs in the background with progress and can be cancelled; when the hourly limit is used up it waits for the
next hour and goes on by itself. The earlier rating stays visible in the message timeline. Actions that changed mail
are written to Frieda's change log.

**Unsure ratings:** with each rating the AI says how sure it is. Ratings it was unsure about get a mark in the list and
their own view, *Unsure*, under *Activity* – the place to look first. Correcting one removes it from the view.

**Accuracy:** under *AI sorting*, *Check accuracy* sends your most recently corrected messages (up to 20) to the AI
again with the current categories, each without its own correction among the examples, and shows how many land where
you put them and which are still off. You can pick another AI entity for the check to compare models. Nothing is
stored or changed; it counts towards the hourly limit and the kill switch applies.

**Describe with Frieda:** next to **+** for a new category, *Describe with Frieda* opens a short conversation: you say
in your own words which mails belong to it and what should happen to them, and the AI entity you chose turns it into a
proposal – name, description for the sorting AI, folder, flag, mark read – that you can change by hand and refine in
up to five rounds. It points out a similar existing category and words the description so the two stay apart. Only
your messages and the names and descriptions of your categories and folders go to the AI, no mail; every round is
logged as *Category assistant* in the AI log and counts towards the hourly limit. An optional **test run** rates your
last 20 rated mails again with the proposed category (limit and kill switch apply, nothing is stored or moved).
Nothing is saved until you choose **Apply**.

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
| Push | `listening`, `connecting`, `error`, `unsupported`, `stopped` or `off` (diagnostic); the attributes `state_*` show the read/flagged look (CONDSTORE, mode, last look, error) |
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

**Diagnostics** (Settings → Devices & services → Frieda Postfach → ⋮ → Download diagnostics) contain versions,
options, the structure of the rules, automation and push status, runs and AI use as numbers, and the size of the
activity and whether the server offers CONDSTORE – no subjects, senders, names, Message-IDs, rule values,
kill-switch terms or the notify service. If Frieda
is older than this version needs, a repair under Settings → Repairs says so until Frieda is updated.

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

### Releases

`scripts/release.py VERSION --notes NOTES.md` releases from a clean `dev`: it stops if `origin/main` has commits
`dev` lacks, sets the version in the manifest, runs ruff and the tests, moves `main` on by fast-forward and pushes
it, waits until every CI run of that commit has passed, creates the GitHub release with the notes (German, `---`,
English), and then checks the zip the release workflow attached – checksum, version and every file against the
tagged source. `--dry-run` only checks and tests; `--draft` prints a notes skeleton from the commits since the last
release.

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
