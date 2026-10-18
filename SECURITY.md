# Security

*English · [Deutsch weiter unten](#sicherheit)*

## Reporting a vulnerability

Please do **not** open public issues for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** in this repository. You will get a response within 7 days.

## Supported versions

Only the latest release is supported, together with the latest release of Frieda.

## Security model

Frieda Postfach extends a Frieda account and inherits its security model
([Frieda's SECURITY.md](https://github.com/nadeo360/friedafetch/blob/main/SECURITY.md)):

- **No own credentials or endpoints.** It reuses the connection of the Frieda account; the Apple ID and the
  app-specific password stay in Frieda's config entry. The push connection is a second IMAP session that selects the
  inbox and only waits for new-mail notifications.
- **Frieda's guard rails apply** to every rule run: quotas, protected and hidden mailboxes, "Allow deleting", and
  the read-only mode (no automatic runs, only dry runs). Unattended runs (timer, push) and runs requested by an AI
  change at most 100 messages (50 deletions) per run and count against Frieda's hourly quota for mail changes; the
  rest is deferred to the next run (runs the admin starts in the panel are counted, not capped). Runs with hits or
  errors are written to Frieda's change log and fire `friedafetch_action`.
- **Rule tools are treated as mass actions:** creating or enabling a rule that deletes or moves, and a real run
  over the whole mailbox, follow Frieda's approvals ("approve deleting", mass threshold) and Frieda's injection lock.
- **AI tools** of Frieda Postfach are registered through Frieda and follow its options and approvals; writing rule
  tools are hidden in read-only mode.
- **Attachments** are only stored through Frieda's attachment store (allowed folder, safe file names, no path
  traversal, size limit).
- **Daily overview:** mail subjects are passed to an optional AI task as data with the instruction to ignore
  instructions inside them; without an AI task the text is assembled locally.
- **AI sorting** is off until an administrator switches it on and chooses an `ai_task` entity; without both no
  mail data reaches any AI. By default only sender, recipients and subject are sent; the text (first 1,000
  characters) only with a separate option. A kill switch (blocked senders/domains and blocked terms, checked
  locally in subject, sender and text) keeps matching mail away from every AI, including the AI daily overview;
  every transmission and every held-back mail is logged locally in the panel ("Sent to AI"). With a cloud AI this data leaves
  Home Assistant. The mail is passed as untrusted data between markers with the instruction to ignore requests in
  it; the AI gets no tools, its answer is checked against the user's category list and an importance of 1–5, and
  the only possible actions are moving into the category folder (subject to Frieda's hidden/protected mailboxes),
  marking read and flagging – never deleting or sending. A manipulated mail can at worst be sorted into the wrong
  category. The default mode only rates; an hourly limit caps AI calls.
- **Admin only:** the panel and its websocket commands require an administrator.
- **Events stay local but are recorded:** the events `friedafetch_mail_rule_matched`, `friedafetch_mail_rated` and
  `friedafetch_mail_important` carry subject and sender for automations. Like all events they are stored by Home
  Assistant's recorder; exclude them there (`recorder: exclude: event_types:`) if that is unwanted. Rule events are
  capped at 25 per run.

## Checks in the repository

Every pull request runs the tests (against the pinned Home Assistant release and the current Frieda), Ruff with the
Bandit rule set, Bandit, hassfest and the HACS validation. GitHub Actions are pinned to commit SHAs; Dependabot keeps
them current.

## Verifying a release

Release assets are built by GitHub Actions with a signed build provenance attestation:

```bash
gh attestation verify friedafetch_mail.zip --repo nadeo360/friedafetch-mail
```

The signature also comes with the release: `friedafetch_mail.zip.sigstore.json` (Sigstore bundle, for offline checks
with `--bundle`) and `friedafetch_mail.zip.intoto.jsonl` (the SLSA provenance).

---

# Sicherheit

## Sicherheitslücke melden

Bitte **keine** öffentlichen Issues für Sicherheitsprobleme anlegen, sondern GitHubs private Meldung nutzen:
**Security → Report a vulnerability** in diesem Repository. Du bekommst innerhalb von 7 Tagen eine Antwort.

## Unterstützte Versionen

Unterstützt wird nur das jeweils neueste Release, zusammen mit dem neuesten Release von Frieda.

## Sicherheitsmodell

Frieda Postfach erweitert ein Frieda-Konto und übernimmt dessen Sicherheitsmodell
([SECURITY.md von Frieda](https://github.com/nadeo360/friedafetch/blob/main/SECURITY.md)):

- **Keine eigenen Zugangsdaten oder Endpunkte.** Es nutzt die Verbindung des Frieda-Kontos; Apple-ID und App-Passwort
  bleiben im Config-Entry von Frieda. Die Push-Verbindung ist eine zweite IMAP-Sitzung, die den Posteingang auswählt
  und nur auf Neueingangs-Meldungen wartet.
- **Friedas Leitplanken gelten** für jeden Regellauf: Kontingente, geschützte und verborgene Postfächer, „Löschen
  erlauben“ und der Nur-Lesen-Modus (keine automatischen Läufe, nur Probeläufe). Unbeaufsichtigte Läufe (Takt, Push)
  und von einer KI angestoßene Läufe ändern höchstens 100 Mails (50 Löschungen) pro Lauf und zählen gegen Friedas
  Stundenkontingent für Mail-Änderungen; der Rest folgt im nächsten Lauf (vom Admin im Panel gestartete Läufe werden
  gezählt, aber nicht begrenzt). Läufe mit Treffern oder Fehlern landen in Friedas Änderungsprotokoll und lösen
  `friedafetch_action` aus.
- **Regel-Tools gelten als Massenaktionen:** Eine Regel anlegen oder einschalten, die löscht oder verschiebt, und ein
  echter Lauf über das ganze Postfach folgen Friedas Freigaben („Löschen freigeben“, Massenschwelle) und Friedas
  Injection-Sperre.
- **KI-Tools** von Frieda Postfach werden über Frieda angemeldet und folgen deren Optionen und Freigaben; schreibende
  Regel-Tools sind im Nur-Lesen-Modus ausgeblendet.
- **Anhänge** werden ausschließlich über Friedas Anhang-Ablage gespeichert (erlaubter Ordner, sichere Dateinamen,
  kein Pfad-Ausbruch, Größenlimit).
- **Tagesüberblick:** Betreffzeilen gehen an eine optionale KI-Aufgabe nur als Daten mit der Anweisung, darin
  enthaltene Aufforderungen zu ignorieren; ohne KI-Aufgabe wird der Text lokal zusammengesetzt.
- **KI-Sortierung** ist aus, bis ein Admin sie einschaltet und eine `ai_task`-Entität wählt; ohne beides erreichen
  keine Maildaten eine KI. Standardmäßig gehen nur Absender, Empfänger und Betreff hinaus; der Text (erste 1.000
  Zeichen) nur mit eigener Option. Ein Killswitch (gesperrte Absender/Domains und Sperrbegriffe, lokal in Betreff,
  Absender und Text geprüft) hält passende Mails von jeder KI fern, auch vom KI-Tagesüberblick; jede Übermittlung
  und jede zurückgehaltene Mail wird lokal im Panel protokolliert („An KI übermittelt“). Bei einer Cloud-KI verlassen diese Daten
  Home Assistant. Die Mail wird als nicht vertrauenswürdige Daten zwischen Markierungen übergeben, mit der Anweisung,
  Aufforderungen darin zu ignorieren; die KI bekommt keine Werkzeuge, ihre Antwort wird gegen die Kategorienliste und
  eine Wichtigkeit von 1–5 geprüft, und mögliche Aktionen sind nur Verschieben in den Kategorie-Ordner (unter Friedas
  verborgenen/geschützten Postfächern), Gelesen und Markieren – nie Löschen oder Senden. Eine manipulierte Mail kann
  schlimmstenfalls falsch einsortiert werden. Standard ist reines Bewerten; ein Stundenlimit begrenzt die KI-Aufrufe.
- **Nur Admins:** Panel und WebSocket-Befehle erfordern Administratorrechte.
- **Ereignisse bleiben lokal, werden aber aufgezeichnet:** Die Ereignisse `friedafetch_mail_rule_matched`,
  `friedafetch_mail_rated` und `friedafetch_mail_important` enthalten Betreff und Absender für Automationen. Wie alle
  Ereignisse speichert sie der Recorder von Home Assistant; wer das nicht möchte, schließt sie dort aus
  (`recorder: exclude: event_types:`). Regel-Ereignisse sind auf 25 pro Lauf begrenzt.

## Prüfungen im Repository

Jeder Pull Request führt die Tests (gegen das gepinnte Home-Assistant-Release und das aktuelle Frieda), Ruff mit dem
Bandit-Regelsatz, Bandit, hassfest und die HACS-Validierung aus. GitHub Actions sind auf Commit-SHAs gepinnt;
Dependabot hält sie aktuell.

## Release prüfen

```bash
gh attestation verify friedafetch_mail.zip --repo nadeo360/friedafetch-mail
```

Die Signatur liegt auch am Release: `friedafetch_mail.zip.sigstore.json` (Sigstore-Bundle, für die Prüfung ohne Netz
mit `--bundle`) und `friedafetch_mail.zip.intoto.jsonl` (die SLSA-Provenance).
