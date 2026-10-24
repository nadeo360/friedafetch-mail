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
- **AI tools** for the rules (`icloud_list_rules`, `icloud_create_rule`, … ), `icloud_daily_overview` and the tab
  *For you* (`icloud_mail_for_you`, `icloud_add_proposed_event`); they are added to Frieda's tools for the account, so
  every MCP client and conversation agent that uses Frieda gets them – ask Assist or Claude “what is important in my
  mail today?” or “who still owes me an answer?”.

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

The options have three parts: **Automation and daily overview** (below), **AI sorting** (see
[AI sorting](#ai-sorting)) and **For you** (see [For you](#for-you)).

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
Frieda's own panel. Five tabs keep it tidy: **Activity**, **For you**, **Rules**, **AI sorting** and **AI log**; every table has
search, filters and a **Columns** menu (stored per Home Assistant user).

**Activity** looks like a mail program: views and folders on the left, the checked mails in the middle, the chosen
mail on the right (on phones the mail opens in a sheet over the list that you swipe down to close).

- **One line per mail** that Frieda Postfach checked: sender, time, subject and in quiet grey what happened – the
  rule, the AI's category and importance, a kill-switch hold or "no action"; a folder only when the mail was moved.
  Days are grouped (and can be folded), the list loads 50 mails at a time while you scroll, the search covers all of
  them. It keeps the last 30 days (at most 3,000 mails).
- **Conversations**: mails of one conversation share one line – the newest – with the number of its mails next to
  the sender (*Show every mail* in the list's menu turns it off). A reply belongs to the mail it answers
  (In-Reply-To); without that reference, a “Re:”/“AW:” mail joins an earlier mail with the same subject of the last
  30 days. The open mail lists its conversation, oldest first, including your own answers from the sent mail.
- **Read and flagged** as the mailbox has it now: unread mails stand out with a dot, flagged ones carry a flag – read
  or flag a mail on the iPhone and the activity shows it. A mail that leaves its folder (archived on the iPhone,
  moved by a rule or the AI, deleted) is found again by its Message-ID and followed there. Push notices changes in
  the inbox within seconds; every 10 minutes Frieda looks at all folders with tracked mails. Where the IMAP server
  supports CONDSTORE (RFC 7162) – iCloud does – Frieda only asks whether anything changed in a folder and which
  flags changed since the last look; without it the flags of the newest 500 mails are read with one request per
  folder.
- **Views:** all mails, by result (AI, rule, kill switch, no action) and by the folder Frieda put them in. That is
  what Frieda did – opening a mail looks up where it really is now (one search by its Message-ID): still there, moved
  elsewhere since, or no longer found.
- **The mail** shows its whole path as a timeline – received, rules checked, sent to the AI or held back by the kill
  switch, rating, action, every correction. The category is the place to correct it. Each mail of the activity keeps
  its steps as they happen, so the timeline stays complete when the run history has moved on; for older mails the
  steps are linked by the Message-ID (it survives moves) or by subject and sender. Frieda's change log links here too.
- **Act on mails** like in a mail program: in the open mail (or for the picked ones) *read / unread*, *flag*,
  *archive* (back *to the inbox*) and *trash* – with Frieda's guard rails: nothing in read-only mode, protected and
  hidden folders stay untouched, the hourly limit of mail changes applies, the trash only when deleting is allowed,
  and nothing is ever deleted for good. Each action is in Frieda's change log and in the mail's timeline. **Show
  text** loads the mail's text (cleaned, without marking it read). **Create rule** opens the rule editor with the
  sender as condition. On a keyboard: j/k next/previous mail, u read, s flag, e archive, # trash, z undo, / search,
  1–5 the tabs; **?** shows them all. On a touch screen you swipe a mail of the list to the right to mark it read
  (or unread) and to the left to archive it (or put it back into the inbox). The AI's confidence shows as a small
  three-step meter next to the category (sure, fairly sure, unsure).
- **Reading:** the text shows what is new; the quoted history of a reply (“On … wrote:”, Outlook headers, lines with
  `>`) and the signature fold away under *Show quoted text* and *Signature*. Web links appear as small chips with
  their real destination (the host in bold) before you open them; anything but http/https stays plain text. A
  conversation reads like messages – your own answers on the right, the others' on the left. Every AI category has
  one colour, the same in the list, the reading pane, the categories and the charts.
- **⌘K / Ctrl+K** opens the command palette: one search for the tabs, actions (new rule, refresh *For you*, new AI
  category, the keys), rules, categories and mails (searched on the server, all of the activity). Arrow keys, Enter,
  Esc.
- **On the phone** the tabs sit at the bottom within reach of the thumb, the open mail fills the screen and closes
  with the back gesture (or a swipe from the left edge or down), a long press on a mail starts picking it, and pulling
  the list down loads it again.
- **Views** *Unread* and *Flagged* (under *In the mailbox*) list what the mailbox has like that now.
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
  ⋮ menu per rule for edit, dry run with only this rule, order, copy and delete. Drag a rule by its handle to change
  the order (the menu's up/down stays for keyboards).
- **The editor** says the rule in one sentence (“If the subject contains “Invoice”, then: Archive.”) and shows a
  **live preview** while you type: how many of the last 300 mails of the activity it would catch, with the first
  ones. The activity knows sender and subject; conditions on To/Cc are named as not checked.
- **Run** opens a menu: dry run or real run over the whole mailbox, or new mail only; the per-message report appears
  above the rules.

**AI sorting** holds its mode, an **overview** (the categories of the last ratings as a ring with the corrections
per category, and the accuracy per week) and the categories; **AI log** everything that went to an AI. With several accounts an
account picker appears on top. Approvals and the change log stay in Frieda's own panel, whose overview also shows
whether Frieda Postfach is running.

**Undo instead of asking first:** what can be taken back happens at once, and a calm bar at the bottom says what
happened with **Undo** next to it (or press z) – for read/unread, flag, archive, back to the inbox and trash (each
mail goes back to the folder it came from; mails that were read already stay read), deleting a rule (it comes back
with its hits at its place) or an AI category, and hiding or correcting things in *For you*. The bar stays about eight
seconds and waits while the pointer or the focus is on it. Only what cannot be undone still asks first: clearing
lists, unsubscribing, rating again (it costs AI requests) and runs over the whole mailbox.

## Dashboard card

A card for any dashboard shows the parcels on their way (the ones arriving today first, with their time window and
the tracking link), the important mail of today (a tap opens it in the panel) and whether Frieda Postfach works (the
*Problem* sensor's reasons, or *All good*), with the number of unread mails at the bottom. Add it with *Edit
dashboard → Add card → Frieda Postfach*, or in YAML:

```yaml
type: custom:friedafetch-mail-card
# all optional:
device_id: 0123456789abcdef   # the Frieda Postfach device of an account (default: the first one)
parcels: true                 # parcels on their way
important: true               # important mail of today
title: Mail
```

It reads only the account's own sensors, so it also works for users who are not admins (opening a mail in the panel
needs an admin).

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
automatically. One AI answer may take up to 5 minutes; a mail without an answer is rated in the next pass.

**Known senders without the AI** (option, on by default): when the AI sorted a sender's mail the same way three times
in a row and was sure each time, Frieda sorts that sender's next mails itself – into the same category with the
same importance, without sending anything and without using the hourly limit. The activity marks them with a person
icon, the timeline says *Sorted as a known sender*, the AI log counts them. Every tenth time the AI looks again; a
correction, a subject that tries to steer the rating, or *Rate again* always go to the AI.

**Correct with action:** if the category you choose moves, marks or flags mails, the mail asks whether to do that
now; Frieda otherwise only does it for new mail.

**Buttons in notifications:** with the Companion app as notify service, the notification of an important mail
carries *Read* and *Archive*; a tap does that like the panel would.

**Rate again:** after changing the categories you select mails under *Activity* (single ones, a whole day or
everything a view shows) or open one mail, and choose **Rate again**. The messages go to the AI once more with the
current categories – the kill switch and the hourly limit apply as always – and messages that were moved since are
found in their new folder by their Message-ID. On request the actions of the new category run afterwards. The
re-rating runs in the background with progress and can be cancelled at once – also while the AI is still answering or
the batch waits for new mail to be sorted; when the hourly limit is used up it waits for the
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
| Parcels on their way | parcels not yet delivered; attributes: how many arrive today, and the list with carrier, number, shop, status, expected day, time window and tracking link |

And a binary sensor **Problem** (diagnostic) that is on while something does not work, with the reasons as the
attribute `problems` – each with its kind, since when and a detail:

| Kind | When |
|---|---|
| `push` | push has not been listening for more than 15 minutes (reconnects during a router or iCloud restart are fine) |
| `look` | the read/flagged look failed |
| `ai` | AI sorting is on and its last rating failed (AI task not reachable, timeout) |
| `pass_slow` | a pass of new mail has been running for more than 10 minutes |
| `throttled` | iCloud asked to slow down; the attribute `throttle` shows until when the background work pauses |
| `for_you` | the last *For you* refresh failed |

A problem that lasts an hour also shows up under *Settings → Repairs*, with the account and the reasons; the repair
goes away by itself once everything works again. When iCloud answers with `[THROTTLED]`, `[LIMIT]` or “too many
connections”, the timer, the push passes and the look pause for 5 minutes (doubled with every further throttled
answer, up to an hour) instead of logging in again at once; mail that arrived meanwhile is picked up by the next pass.

Automations can react to these events (data stays on the Home Assistant event bus):

| Event | When | Data |
|---|---|---|
| `friedafetch_mail_rule_matched` | a rule acted on a message (real runs only, at most 25 per run) | `account`, `rule`, `rule_id`, `trigger`, `mailbox`, `uid`, `subject`, `from`, `move_to`, `delete`, `mark_seen`, `flag` |
| `friedafetch_mail_rated` | the AI rated a mail | `account`, `uid`, `subject`, `from`, `from_domain`, `category`, `importance`, `reason`, `mode`, `applied` |
| `friedafetch_mail_important` | like `rated`, from the importance threshold on | same as `rated` |
| `friedafetch_mail_package` | a parcel changed its status (from a new shipping mail) | `account`, `status`, `previous`, `carrier`, `number`, `url`, `shop`, `order`, `eta`, `window`, `subject`, `updated` |

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

## For you

The tab **For you** in the panel collects what Frieda notices for you. Everything is worked out in Home Assistant from
the mailbox, the activity and the contacts; nothing of it goes to an AI, and nothing happens without your click.

- **Your week** – what arrived (compared with the week before), what rules handled, how often the AI was right (rated
  minus corrected), what is still unread. Small lines show the last eight weeks of mails, rules and accuracy
  (Frieda Postfach keeps a summary of every completed week; the activity itself keeps 30 days). *Handled without
  you* counts what rules and the AI sorted (with a rough time at 10 seconds per mail). With *Weekly review on* it
  also comes as a notification on that day.
- **Dates from e-mails** – needs the AI sorting: the AI names an appointment or deadline it reads in a mail it rates
  anyway (same data, no extra request). You check title and time and add it to a calendar with one click; the
  notification of an important mail gets a button *Add to calendar* (the calendar of the options). Calendars Frieda
  protects are never offered.
- **Waiting for a reply** – mails you sent to people (not to no-reply addresses or yourself) that got no answer after
  *Waiting for a reply after* days (default 3, 0 = off). An answer counts when it refers to your mail (In-Reply-To /
  References) or comes from that person since then, in the inbox, the archive or a folder of your rules and categories.
- **Rule suggestions** – a sender whose mails you moved to the same folder (or deleted) at least three times and in
  80 % of the cases over 30 days, and that no rule handles yet. *Create rule* opens the editor with it filled in.
- **Subscriptions** – newsletters of the last 30 days, the least read first. *Unsubscribe* works like Frieda's
  `icloud_unsubscribe`: one-click link, else the unsubscribe e-mail (needs *Allow sending e-mails*), else the page
  opens for you – and Frieda asks afterwards whether it worked there. One entry per sender site (shop@ and support@ of
  a shop are one newsletter). Two tabs keep them apart: *Subscribed* and *Unsubscribed*; one that still sends three days after
  unsubscribing comes back with a note and *Unsubscribe again*. Hiding (the eye) takes it off the list at once.
- **Parcels** – recognised in shipping mails without AI: carrier (DHL, DPD, Hermes, GLS, UPS, Amazon Logistics),
  tracking number, status (on its way, arrives today with the time window, ready for pick-up, delivered, problem) and
  the expected day. A shipping mail is read once, right after it arrives; tracking numbers count only next to a word
  like “Sendungsnummer”, in a carrier's tracking link or in an unmistakable form, so order numbers are not taken for
  parcels. Updates without a number join their parcel (same sender within a week), and a carrier's mail that names
  the shop (“from APPLE”) joins the shop's order. *Track* opens the carrier's own tracking page, *Order* the shop's
  order page (Amazon, eBay, Apple) when no carrier is known – never a link from the mail. Delivered parcels stay for two
  days. The sensor *Parcels on their way* and the event `friedafetch_mail_package` make automations possible.
  **Where from?** (the ⓘ button of a parcel) lists the mails it was put together from, newest first, with what Frieda
  read in each (number, order, expected day, the shop it names). If something went wrong you can correct it there:
  *Make it a parcel of its own* takes a mail out, *Belongs to* + *Merge* joins two parcels, *Not a parcel* hides it,
  and *Never parcels from …* ignores the sender's domain from then on (*Undo* next to *No parcels from* in the card).
  Every parcel shows how far it got – on its way → today → delivered (or ready for pick-up → picked up) – and one that
  arrives today with a time window shows the window on the day with a mark for now.
- **Important senders** – contact groups (or every contact) and addresses or domains you name. Their mail is never lost
  among the rest: the AI rates it at least as important, and it is announced right away also without AI sorting.
  The activity marks them with a star.

Moving an AI-sorted mail into the folder of another category teaches the AI too: Frieda takes it as a correction
(shown in the mail's timeline as *Corrected by you (moved)*), just like a correction in the panel.

| Option (For you) | Effect |
|------------------|--------|
| Important senders: contact groups | groups of your iCloud contacts, or *All contacts* |
| Important senders: addresses and domains | one per line |
| Announce their mail right away | with the notification service of the daily overview (default: on) |
| Propose calendar entries from e-mails | the AI names dates it reads (default: on; needs AI sorting) |
| Calendar for entries from the notification | empty = the first calendar Frieda may write to |
| Waiting for a reply after (days) | default 3, 0 = off |
| Weekly review on | a weekday or off, at the time of the daily overview (else 18:00) |

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

`tests_imap/` runs Frieda's IMAP client and the read/flagged look against a real IMAP server: Dovecot as a process of
your user (`brew install dovecot` or `apt install dovecot-imapd`; skipped without it, CI has its own job). Its random
walks (`test_random.py`) let another mail program read, flag, move and delete at random while Frieda looks and acts,
and compare every line of the activity with what the server really has; `RANDOM_WALKS=25 RANDOM_STEPS=120` makes them
more and longer before a release that touches the look, and a failure names the seed that repeats it. The type
check is `basedpyright` (requirements/types.txt); findings from before it came are in `.basedpyright/baseline.json`.

### Releases

`scripts/release.py VERSION --notes NOTES.md` releases from a clean `dev`: it stops if `origin/main` has commits
`dev` lacks, sets the version in the manifest, runs ruff and the tests, moves `main` on by fast-forward and pushes
it, waits until every CI run of that commit has passed, creates the GitHub release with the notes (German, `---`,
English), and then checks the zip the release workflow attached – checksum, version and every file against the
tagged source. `--dry-run` only checks and tests; `--draft` prints a notes skeleton from the commits since the last
release. A CI run that GitHub still shows as running five minutes after its last job finished counts by its jobs
(GitHub sometimes never closes a run). If the script stops while waiting anyway, `--resume` continues the same
version later: it checks that the tag does not exist yet and `main` is the pushed commit, waits for CI again, creates
the release and checks the zip.

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
