<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="Frieda" width="720">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml"><img alt="hassfest & HACS" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml"><img alt="Sicherheitsprüfungen" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nadeo360/friedafetch-mail?display_name=tag"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Deutsch</b></p>

# Frieda Postfach – Posteingangs-Automatik für Frieda

**Frieda Postfach** (technischer Name `friedafetch_mail`) ist die Begleit-Integration zu
[**Frieda**](https://github.com/nadeo360/friedafetch), dem MCP-Connector für iCloud. Frieda gibt KI-Assistenten
kontrollierten Zugriff auf Kalender, Kontakte, Mails und Notizen in iCloud und handelt nur, wenn sie gefragt wird.
Frieda Postfach ist der Teil, der **selbstständig handelt**:

- **Posteingangsregeln** mit Bedingungen und Aktionen, angewendet auf neue Mails – per **Push** (IMAP IDLE) innerhalb
  von Sekunden oder im Takt – und auf Abruf auf ein ganzes Postfach, mit Probelauf, Verlauf und Verwaltungs-Panel.
- **Belege:** eine Regel-Aktion, die Anhänge (z. B. Rechnungen) in einem Ordner ablegt.
- **Tagesüberblick:** morgens eine Zusammenfassung mit ungelesenen Mails, Regelaktivität, heutigen Terminen und
  Geburtstagen aufs Handy, auf Wunsch von einer KI-Aufgabe in Home Assistant formuliert.
- **Geburtstags-Sensor** für den nächsten Geburtstag unter deinen Kontakten.
- **KI-Tools** für die Regeln (`icloud_list_rules`, `icloud_create_rule`, …) und `icloud_daily_overview`; sie
  erscheinen bei den Frieda-Tools des Kontos, also in jedem MCP-Client und Sprachassistenten, der Frieda nutzt.

Durch die Trennung bleibt Frieda selbst ein reiner Connector: ohne Hintergrundverbindungen, ohne zeitgesteuerte
Aufgaben und ohne Dateizugriffe – solange Frieda Postfach nicht installiert ist.

## Voraussetzungen

- Home Assistant 2026.10 oder neuer
- **Frieda 2.0 oder neuer** (`friedafetch`) mit mindestens einem eingerichteten iCloud-Konto. Frieda Postfach nutzt
  dessen Verbindung und fragt selbst nie nach Apple-ID oder Passwort.

## Installation

1. HACS → ⋮ → Benutzerdefinierte Repositories → `https://github.com/nadeo360/friedafetch-mail`, Typ *Integration*.
2. **Frieda Postfach** herunterladen und Home Assistant neu starten.
3. Einstellungen → Geräte & Dienste → Integration hinzufügen → **Frieda Postfach**, Frieda-Konto auswählen.

**Umstieg von Frieda 1.x:** Regeln, Trefferzähler und Verlauf bleiben, wo sie sind
(`.storage/friedafetch.rules.<konto>`), und werden automatisch übernommen – ebenso die Automatik-Einstellungen
(Intervall, Push, Tagesüberblick). Solange Frieda Postfach fehlt, zeigt Frieda 2.0 für Konten mit gespeicherten
Regeln eine Reparaturmeldung, und es laufen keine Regeln.

## Optionen

| Option | Wirkung |
|--------|---------|
| Posteingangsregeln automatisch anwenden | Regeln auf neue Mails anwenden (Standard: an) |
| Intervall | Minuten zwischen den Takt-Läufen (Standard 5, 1–240); der Takt ist Rückfallebene und deckt andere Postfächer als den Posteingang ab |
| Push | IMAP IDLE: Regeln wenige Sekunden nach Eingang einer Mail im Posteingang anwenden (Standard: an) |
| Tagesüberblick um | `HH:MM`, leer = aus |
| Überblick senden mit | ein `notify`-Dienst wie die Companion-App; leer = Benachrichtigung in Home Assistant |
| Überblick formulieren mit | optionale `ai_task`-Entität |
| Geburtstags-Sensor | `sensor.frieda_postfach_<konto>_nachster_geburtstag` anlegen |

Auf Konten, die Frieda im Nur-Lesen-Modus betreibt, läuft nichts automatisch; Probeläufe gehen dort trotzdem.

## Posteingangsregeln

- **Bedingungen** auf `from`, `to`, `cc`, `subject` oder `any` mit `contains`, `equals`, `starts_with`, `ends_with`,
  `domain` (Absender-Domain inkl. Subdomains) oder `regex`; Verknüpfung `all` (Standard) oder `any`.
- **Aktionen:** `move_to` (Ordner), `mark_seen`, `flag`, `delete` (Papierkorb), `save_attachments` (mit optionalem
  `attachments_folder`, z. B. `Belege`) und `stop` (Standard: weitere Regeln für diese Mail überspringen). Löschen
  braucht Friedas Option „Löschen erlauben“; Anhänge werden vor dem Verschieben oder Löschen gespeichert und brauchen
  Friedas Anhang-Ordner (Frieda → Konfigurieren → Tools und Konto).
- **Nur neue Mails** seit dem letzten Lauf werden automatisch verarbeitet. Der allererste Lauf setzt nur die
  Ausgangsbasis. Für Bestandsmails gibt es das Panel oder `icloud_run_rules` mit `scope: "all"` (neueste 2000 Mails)
  und `dry_run: true`.
- **Gebündelte Ausführung:** Treffer werden pro Aktion gesammelt und in wenigen IMAP-Befehlen erledigt.
- Friedas Leitplanken gelten: Kontingente, geschützte und verborgene Postfächer; jeder Lauf mit Treffern oder Fehlern
  landet in Friedas Änderungsprotokoll (markiert als manuell, automatisch oder Push).

Beispiel (als Tool-Aufruf):

```json
{
  "name": "Newsletter archivieren",
  "conditions": [{"field": "from", "op": "domain", "value": "newsletter.example.com"}],
  "actions": {"move_to": "Archive", "mark_seen": true}
}
```

## Panel

**Frieda Postfach** in der Seitenleiste (nur Admins, Deutsch/Englisch). Eine Karte enthält die Regeln und alles, um
sie auszuführen:

- **Eine Statuszeile** sagt, wie neue Mails verarbeitet werden: *sofort per Push* (der Takt läuft als Sicherheitsnetz
  mit), *Prüfung alle N Min.* (Push aus), *Push gestört* (der Takt läuft weiter) oder *Automatik aus*.
- Eine kompakte Regelliste zum Aufklappen, **+** für eine neue Regel (und im Editor für eine weitere Bedingung) und
  **Testen** an jeder Regel für einen Probelauf nur mit dieser Regel.
- **Ausführen** öffnet ein Menü: Probelauf oder echter Lauf über das ganze Postfach oder nur neue Mails; der Bericht
  pro Mail erscheint unter den Regeln.
- Der Verlauf **Ausführungen** (aufeinanderfolgende automatische Läufe ohne Treffer werden zusammengefasst) mit Filtern
  pro Spalte.

Bei mehreren Konten erscheint oben eine Kontoauswahl. Freigaben und Änderungsprotokoll bleiben im Panel von Frieda,
dessen Überblick auch zeigt, ob Frieda Postfach läuft.

## Tagesüberblick

Zur eingestellten Uhrzeit sammelt Frieda Postfach ungelesene Mails seit gestern (ohne Newsletter), die
Regelaktivität der letzten 24 Stunden, die heutigen Termine und Geburtstage der nächsten 7 Tage und schickt sie über
den gewählten `notify`-Dienst. Mit einer `ai_task`-Entität wird daraus ein kurzer Text; Betreffzeilen gehen dabei als
Daten mit der Anweisung hinein, darin enthaltenen Aufforderungen nicht zu folgen. Die Aktion
`friedafetch_mail.send_digest` sendet den Überblick auf Abruf (optional für ein `account`) und liefert den Text zurück.

## Sicherheit

Frieda Postfach bringt keine eigenen Zugangsdaten und keine eigenen Netzwerk-Endpunkte mit. Es nutzt Friedas
Verbindung, Leitplanken und Änderungsprotokoll; die Push-Verbindung ist eine zweite IMAP-Sitzung, die nur auf neue
Mails wartet. Die Tools von Frieda Postfach folgen Friedas Optionen: Schreibende Regel-Tools verschwinden im
Nur-Lesen-Modus, und Freigaben gelten wie für jedes andere Frieda-Tool. Siehe [SECURITY.md](SECURITY.md).

## Entwicklung

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements_dev.txt
git clone --depth 1 https://github.com/nadeo360/friedafetch /tmp/frieda
ln -s /tmp/frieda/custom_components/friedafetch custom_components/friedafetch
pytest && ruff check . && ruff format --check .
```

## Hinweis zum Einsatz von KI

Diese Integration wurde mit erheblicher Unterstützung eines KI-Programmierassistenten (Claude von Anthropic)
entwickelt, auf Grundlage der Anforderungen und Entscheidungen des Maintainers. Jede Änderung ist durch die
automatisierten Tests und Sicherheitsprüfungen abgedeckt, und Releases testet der Maintainer gegen ein echtes
iCloud-Konto. Fehler und Ideen bitte als GitHub-Issue melden – sie werden von einem Menschen gelesen.

## Rechtliche Hinweise

Apple und iCloud sind Marken der Apple Inc.; Home Assistant ist eine Marke der Open Home Foundation. **Dies ist ein
unabhängiges Community-Projekt und steht in keiner Verbindung zu Apple, der Open Home Foundation, Nabu Casa, Anthropic
oder HACS.** Die Nutzung von iCloud unterliegt den iCloud-Bedingungen von Apple. Die Software kommt ohne Gewähr und
verändert dein Postfach in deinem Auftrag. Details: [NOTICE.md](NOTICE.md).

## Lizenz

MIT – siehe [LICENSE](LICENSE).
