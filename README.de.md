<p align="center">
  <img src="https://raw.githubusercontent.com/nadeo360/friedafetch-mail/main/assets/logo@2x.png" alt="Frieda Postfach" width="720">
</p>

<p align="center">
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml"><img alt="hassfest & HACS" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/validate.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml"><img alt="Sicherheitsprüfungen" src="https://github.com/nadeo360/friedafetch-mail/actions/workflows/security.yml/badge.svg"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nadeo360/friedafetch-mail?display_name=tag"></a>
  <a href="https://github.com/nadeo360/friedafetch-mail/blob/main/LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center"><a href="https://github.com/nadeo360/friedafetch-mail/blob/main/README.md">English</a> · <b>Deutsch</b></p>

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
- **KI-Sortierung (optional, standardmäßig aus):** Eine KI deiner Wahl bewertet neue Mails – Kategorie, Wichtigkeit
  1–5 und eine kurze Begründung – und sortiert sie, wenn du es erlaubst, in Ordner. Siehe [KI-Sortierung](#ki-sortierung).
- **Sensoren und Ereignisse** für Automationen: ungelesene Mails, Regeltreffer, Push-Status, wichtige Mails und KI-Nutzung; Ereignisse für jeden Regeltreffer und jede KI-Bewertung. Dazu ein Geburtstags-Sensor.
- **KI-Tools** für die Regeln (`icloud_list_rules`, `icloud_create_rule`, …) und `icloud_daily_overview`; sie
  erscheinen bei den Frieda-Tools des Kontos, also in jedem MCP-Client und Sprachassistenten, der Frieda nutzt.

Durch die Trennung bleibt Frieda selbst ein reiner Connector: ohne Hintergrundverbindungen, ohne zeitgesteuerte
Aufgaben und ohne Dateizugriffe – solange Frieda Postfach nicht installiert ist.

## Voraussetzungen

- Home Assistant 2026.10 oder neuer
- **Frieda 2.0.18 oder neuer** (`friedafetch`; bei älteren Versionen bittet eine Reparatur ums Update, und Teile des Panels fehlen) mit mindestens einem eingerichteten iCloud-Konto. Frieda Postfach nutzt
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

Die Optionen haben drei Bereiche: **Automatik und Tagesüberblick** (unten), **KI-Sortierung** (siehe
[KI-Sortierung](#ki-sortierung)) und **Für dich** (siehe [Für dich](#für-dich)).

| Option | Wirkung |
|--------|---------|
| Regeln automatisch anwenden | Regeln auf neue Mails anwenden (Standard: an) |
| Intervall | Minuten zwischen den Takt-Läufen (Standard 5, 1–240); der Takt ist Rückfallebene und deckt andere Postfächer als den Posteingang ab |
| Push | IMAP IDLE: Regeln wenige Sekunden nach Eingang einer Mail im Posteingang anwenden (Standard: an) |
| Tagesüberblick um | `HH:MM`, leer = aus |
| Überblick senden mit | ein `notify`-Dienst wie die Companion-App; leer = Benachrichtigung in Home Assistant |
| KI-Aufgabe für den Überblick | optionale `ai_task`-Entität |
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

**Grenzen.** Unbeaufsichtigte Läufe (Takt, Push) und von einer KI gestartete Läufe ändern höchstens 100 Mails, davon
50 Löschungen, pro Lauf und zählen gegen Friedas Stundenkontingent für Mail-Änderungen; der Rest folgt im nächsten
Lauf. Legt eine KI eine Regel an oder schaltet sie ein, die löscht oder verschiebt, oder wendet sie die Regeln auf das
ganze Postfach an, gelten Friedas Freigaben („Löschen freigeben“, Massenschwelle) und Friedas Injection-Sperre.
Regex-Bedingungen, die Home Assistant bei ungünstigen Betreffzeilen blockieren könnten – verschachtelte Wiederholung
wie `(a+)+` oder Ketten wie `a+a+a+` –, werden beim Speichern abgelehnt; Regex-Bedingungen sehen die ersten
300 Zeichen einer Kopfzeile.

## Panel

**Frieda Postfach** in der Seitenleiste (nur Admins, Deutsch/Englisch). Es nutzt die Design-Bibliothek von Frieda und
sieht daher aus wie Friedas eigenes Panel. Vier Tabs halten es übersichtlich: **Aktivität**, **Regeln**,
**KI-Sortierung** und **KI-Protokoll**; jede Tabelle hat Suche, Filter und ein Menü **Spalten** (gespeichert pro
Home-Assistant-Benutzer).

**Aktivität** sieht aus wie ein Mailprogramm: links Ansichten und Ordner, in der Mitte die geprüften Mails, rechts
die gewählte Mail (auf dem Handy öffnet sich die Mail in einem Blatt über der Liste, das du nach unten wegwischst).

- **Eine Zeile pro Mail**, die Frieda Postfach geprüft hat: Absender, Uhrzeit, Betreff und in leisem Grau, was
  passiert ist – die Regel, Kategorie und Wichtigkeit der KI, ein Killswitch-Stopp oder „keine Aktion“; ein Ordner
  nur, wenn die Mail verschoben wurde. Die Tage sind gruppiert (und lassen sich einklappen), die Liste lädt beim
  Scrollen je 50 Mails nach, die Suche umfasst alle. Sie reicht 30 Tage zurück (höchstens 3.000 Mails).
- **Gelesen und markiert** so, wie es das Postfach gerade hat: ungelesene Mails fallen mit einem Punkt auf, markierte
  tragen eine Fahne – liest oder markierst du eine Mail am iPhone, zeigt die Aktivität das. Verlässt eine Mail ihren
  Ordner (am iPhone archiviert, von einer Regel oder der KI verschoben, gelöscht), findet Frieda sie über ihre
  Message-ID wieder und verfolgt sie dort weiter. Änderungen im Posteingang sieht Frieda mit Push binnen Sekunden;
  alle 10 Minuten schaut sie in alle Ordner mit verfolgten Mails. Unterstützt der IMAP-Server CONDSTORE (RFC 7162) –
  iCloud tut das –, fragt Frieda nur, ob sich in einem Ordner etwas geändert hat und welche Markierungen seit dem
  letzten Blick anders sind; ohne CONDSTORE liest sie die Markierungen der neuesten 500 Mails mit einer Anfrage je
  Ordner.
- **Ansichten:** alle Mails, nach Ergebnis (KI, Regel, Killswitch, keine Aktion) und nach dem Ordner, in den Frieda
  sie abgelegt hat. Das ist, was Frieda getan hat – beim Öffnen einer Mail sieht Frieda nach, wo sie wirklich liegt
  (eine Suche über ihre Message-ID): noch dort, inzwischen verschoben oder nicht mehr gefunden.
- **Die Mail** zeigt ihren ganzen Weg als Zeitleiste – eingegangen, Regeln geprüft, an die KI übermittelt oder vom
  Killswitch zurückgehalten, Bewertung, Aktion, jede Korrektur. Die Kategorie lässt sich direkt dort korrigieren.
  Jede Mail der Aktivität hält ihre Schritte fest, sobald sie passieren – so bleibt die Zeitleiste vollständig, auch
  wenn der Laufverlauf schon weiter ist; bei älteren Mails werden die Schritte über die Message-ID (sie bleibt beim
  Verschieben erhalten) oder über Betreff und Absender zugeordnet. Auch das Änderungsprotokoll von Frieda verlinkt
  dorthin.
- **Mit Mails arbeiten** wie im Mailprogramm: in der geöffneten Mail (oder für die ausgewählten) *gelesen /
  ungelesen*, *markieren*, *archivieren* (zurück *in den Posteingang*) und *Papierkorb* – mit Friedas Leitplanken:
  nichts im Nur-Lesen-Modus, geschützte und verborgene Ordner bleiben unberührt, das Stundenlimit für
  Mail-Änderungen gilt, der Papierkorb nur, wenn Löschen erlaubt ist, und endgültig gelöscht wird nie. Jede Aktion
  steht in Friedas Änderungsprotokoll und im Verlauf der Mail. **Text anzeigen** lädt den Text der Mail (bereinigt,
  ohne sie als gelesen zu markieren). **Regel erstellen** öffnet den Regel-Editor mit dem Absender als Bedingung.
  Mit Tastatur: j/k nächste/vorige Mail, u gelesen, s markieren, e archivieren, # Papierkorb.
- **Ansichten** *Ungelesen* und *Markiert* (unter *Im Postfach*) zeigen, was das Postfach gerade so hat.
- **Auswählen** (oder ⌘/Strg-Klick, ⇧-Klick für einen Bereich) wählt Mails für **Neu bewerten**: alle einer Ansicht,
  einen ganzen Tag (Heute, Gestern, …) oder einzelne; Mails, die eine Regel erledigt hat, sind nicht für die KI.
  Während des Laufs zeigt jede Mail, ob sie wartet, gerade bewertet wird oder fertig ist.
- **Durchgänge** (unter *Technik*) ist die technische Sicht: ein Eintrag pro Durchgang von Regeln und KI-Sortierung
  (automatische Durchgänge ohne neue Mails werden zusammengefasst); ein Push-Durchgang erscheint sofort als
  „Neue Mail – wird bewertet …“.
- Kleine Statushinweise sagen, wie neue Mails verarbeitet werden (Push, Takt, KI-Modus), und führen dorthin, wo man
  es einstellt.

**Regeln** enthält die Regeln und alles, um sie auszuführen:

- **Eine Statuszeile** sagt, wie neue Mails verarbeitet werden: *sofort per Push* (der Takt läuft als Sicherheitsnetz
  mit), *Prüfung alle N Min.* (Push aus), *Push gestört* (der Takt läuft weiter) oder *Automatik aus*.
- Eine Regeltabelle (Position, Schalter, Name, Bedingungen, Aktionen, Treffer) zum Aufklappen, **+** für eine neue
  Regel und ein ⋮-Menü pro Regel für Bearbeiten, Probelauf nur mit dieser Regel, Reihenfolge, Kopieren und Löschen.
- **Ausführen** öffnet ein Menü: Probelauf oder echter Lauf über das ganze Postfach oder nur neue Mails; der Bericht
  pro Mail erscheint über den Regeln.

**KI-Sortierung** enthält Modus und Kategorien, **KI-Protokoll** alles, was an eine KI ging. Bei mehreren Konten
erscheint oben eine Kontoauswahl. Freigaben und Änderungsprotokoll bleiben im Panel von Frieda, dessen Überblick
auch zeigt, ob Frieda Postfach läuft.

## KI-Sortierung

Die KI-Sortierung ist **aus** und analysiert nichts, bis du sie bewusst einschaltest: *Einstellungen → Geräte &
Dienste → Frieda Postfach → Konfigurieren → KI-Sortierung*, dort **KI-Sortierung verwenden** einschalten und eine
**KI-Entität** wählen (eine `ai_task`-Entität, z. B. von Google Generative AI, OpenAI oder einem lokalen
Ollama-Modell). Fehlt eines von beiden, geht keine Mail an eine KI.

So funktioniert es:

1. Neue Mails im Posteingang laufen zuerst durch deine Regeln. Bewertet wird nur, was danach noch im Posteingang
   liegt, per Push oder im Takt (bei ausgeschalteter Automatik nur über **Neueste bewerten** im Panel). Der erste
   Lauf setzt nur einen Startpunkt; ältere Mails werden nie automatisch bewertet.
2. Die KI erhält Absender, Empfänger und Betreff – die ersten 1.000 Zeichen des Textes nur, wenn du es erlaubst.
3. **Killswitch:** Mails von gesperrten Absendern oder Domains (z. B. Bank, Arzt) und Mails mit einem Sperrbegriff
   (z. B. Diagnose, Gehalt, Passwort) in Betreff, Absender oder Text erreichen nie eine KI – auch nicht bei
   eingeschalteter KI-Sortierung. Die Prüfung läuft lokal in Home Assistant, bevor etwas gesendet wird, und gilt auch
   für den KI-Tagesüberblick.
4. Sie antwortet mit einer deiner **Kategorien**, einer **Wichtigkeit** von 1 (unwichtig) bis 5 (braucht heute
   Aufmerksamkeit) und einer kurzen Begründung. Kategorien sind Beschreibungen in Alltagssprache, die du im Panel
   bearbeitest.
5. Im Modus **Nur bewerten** (Standard) wird nichts verändert; die Bewertungen erscheinen im Panel. Im Modus
   **Aktionen der Kategorie ausführen** kann jede Kategorie die Mail in einen Ordner verschieben, als gelesen und als
   markiert setzen; ab einer gewählten Wichtigkeit wird sie markiert und gemeldet (über den `notify`-Dienst des
   Tagesüberblicks, sonst als Benachrichtigung in Home Assistant). Löschen oder Senden kann die KI nie.

Im Panel korrigierst du eine Bewertung, indem du die richtige Kategorie wählst; bis zu 30 Korrekturen gehen als
Beispiele an die KI. Ein Stundenlimit (Standard 30) begrenzt die KI-Aufrufe; jede Mail wird automatisch höchstens
einmal bewertet.

**Korrigieren mit Aktion:** Verschiebt, markiert oder kennzeichnet die gewählte Kategorie Mails, fragt die Mail,
ob das jetzt passieren soll; von selbst macht Frieda das nur bei neuen Mails.

**Knöpfe in Benachrichtigungen:** Ist die Companion-App der Benachrichtigungsdienst, trägt die Benachrichtigung
einer wichtigen Mail *Gelesen* und *Archivieren*; ein Tippen erledigt das wie im Panel.

**Neu bewerten:** Nach geänderten Kategorien wählst du unter *Aktivität* Mails aus (einzelne, einen ganzen Tag
oder alles, was eine Ansicht zeigt) oder öffnest eine einzelne Mail und wählst **Neu bewerten**. Die Mails gehen mit
den aktuellen Kategorien erneut an die KI – Killswitch und Stundenlimit gelten wie immer –, und inzwischen verschobene
Mails werden über ihre Message-ID im neuen Ordner gefunden. Auf Wunsch laufen danach die Aktionen der neuen
Kategorie. Die Neubewertung läuft im Hintergrund mit Fortschritt und lässt sich abbrechen; ist das Stundenlimit
aufgebraucht, wartet sie auf die nächste Stunde und macht dann von selbst weiter. Die frühere Bewertung bleibt im
Verlauf der Mail sichtbar. Aktionen, die Mails verändert haben, stehen in Friedas Änderungsprotokoll.

**Unsichere Bewertungen:** Zu jeder Bewertung sagt die KI, wie sicher sie ist. Bewertungen, bei denen sie unsicher war,
sind in der Liste markiert und haben unter *Aktivität* eine eigene Ansicht, *Unsicher* – dort lohnt der erste Blick.
Korrigierst du eine, verschwindet sie aus der Ansicht.

**Treffsicherheit:** Unter *KI-Sortierung* schickt *Treffsicherheit prüfen* deine zuletzt korrigierten Mails (bis zu
20) mit den aktuellen Kategorien noch einmal an die KI – jede ohne ihre eigene Korrektur unter den Beispielen – und
zeigt, wie viele dort landen, wo du sie hingelegt hast, und welche noch daneben liegen. Für den Vergleich von Modellen
lässt sich eine andere KI-Entität wählen. Nichts wird gespeichert oder verändert; die Prüfung zählt aufs Stundenlimit,
der Killswitch gilt.

**Mit Frieda beschreiben:** Neben **+** für eine neue Kategorie öffnet *Mit Frieda beschreiben* ein kurzes Gespräch:
Du sagst in eigenen Worten, welche Mails dazugehören und was mit ihnen passieren soll, und die gewählte KI-Entität
macht daraus einen Vorschlag – Name, Beschreibung für die sortierende KI, Ordner, Markieren, Als gelesen markieren –,
den du von Hand ändern und in bis zu fünf Runden verfeinern kannst. Sie weist auf eine ähnliche bestehende Kategorie
hin und fasst die Beschreibung so, dass beide getrennt bleiben. An die KI gehen nur deine Nachrichten sowie Namen und
Beschreibungen deiner Kategorien und die Ordnernamen, keine Mails; jede Runde steht als *Kategorie-Assistent* im
KI-Protokoll und zählt aufs Stundenlimit. Ein optionaler **Probelauf** bewertet deine letzten 20 bewerteten Mails mit
der vorgeschlagenen Kategorie erneut (Limit und Killswitch gelten, nichts wird gespeichert oder verschoben). Gespeichert
wird erst mit **Übernehmen**.

Die Panel-Karte **An KI übermittelt** zeigt, was an eine KI ging: Aufrufe und Zeichen heute, in 7 und 30 Tagen,
wie viele davon mit Mailtext, je KI-Entität und Zweck (Sortierung, Tagesüberblick), und ein Protokoll jeder
Übermittlung mit den gesendeten Feldern – dazu jede Mail, die der Killswitch zurückgehalten hat, mit Grund. Das
Protokoll bleibt lokal.

| Option | Wirkung |
|--------|---------|
| KI-Sortierung verwenden | Hauptschalter, standardmäßig aus |
| KI-Entität | die bewertende `ai_task`-Entität; Pflicht |
| Was die KI darf | *Nur bewerten* (Standard) oder *Aktionen der Kategorie ausführen* |
| Auch den Text senden | die ersten 1.000 Zeichen (Standard: aus – nur Absender, Empfänger und Betreff) |
| Höchstens so viele Bewertungen pro Stunde | 1–200, Standard 30 |
| Bei wichtigen Mails benachrichtigen | aus, ab Wichtigkeit 3, 4 oder nur 5 (nur im Aktionsmodus) |
| Killswitch: Absender/Domains | Mails von ihnen nie an eine KI senden, eine pro Zeile |
| Killswitch: Begriffe | Mails mit einem dieser Begriffe nie an eine KI senden, einer pro Zeile |

## Sensoren und Ereignisse

Neben dem Geburtstags-Sensor bekommt jedes Konto diese Sensoren (wenn Mail in Frieda aktiviert ist):

| Sensor | Wert |
|---|---|
| Ungelesen im Posteingang | ungelesene Mails im Posteingang (alle 5 Minuten und nach jedem Regellauf geprüft) |
| Regeltreffer heute | Mails, auf die Regeln heute angewendet wurden; Attribute: Läufe heute, letzter und nächster Lauf |
| Push | `listening`, `connecting`, `error`, `unsupported`, `stopped` oder `off` (Diagnose); die Attribute `state_*` zeigen den Blick auf gelesen/markiert (CONDSTORE, Modus, letzter Blick, Fehler) |
| Wichtige Mails heute | nur mit KI-Sortierung: Mails ab der Benachrichtigungsschwelle (sonst ab 4), die letzten fünf als Attribute |
| KI-Bewertungen diese Stunde | nur mit KI-Sortierung: Bewertungen in der laufenden Stunde, Limit und Modus als Attribute (Diagnose) |

Automationen können auf diese Ereignisse reagieren (die Daten bleiben auf dem Ereignisbus von Home Assistant):

| Ereignis | Wann | Daten |
|---|---|---|
| `friedafetch_mail_rule_matched` | eine Regel wurde auf eine Mail angewendet (nur echte Läufe, höchstens 25 pro Lauf) | `account`, `rule`, `rule_id`, `trigger`, `mailbox`, `uid`, `subject`, `from`, `move_to`, `delete`, `mark_seen`, `flag` |
| `friedafetch_mail_rated` | die KI hat eine Mail bewertet | `account`, `uid`, `subject`, `from`, `from_domain`, `category`, `importance`, `reason`, `mode`, `applied` |
| `friedafetch_mail_important` | wie `rated`, ab der Wichtigkeits-Schwelle | wie bei `rated` |

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

## Tagesüberblick

Zur eingestellten Uhrzeit sammelt Frieda Postfach ungelesene Mails seit gestern (ohne Newsletter), die
Regelaktivität der letzten 24 Stunden, die heutigen Termine und Geburtstage der nächsten 7 Tage und schickt sie über
den gewählten `notify`-Dienst. Mit einer `ai_task`-Entität wird daraus ein kurzer Text; Betreffzeilen gehen dabei als
Daten mit der Anweisung hinein, darin enthaltenen Aufforderungen nicht zu folgen. Die Aktion
`friedafetch_mail.send_digest` sendet den Überblick auf Abruf (optional für ein `account`) und liefert den Text zurück.

## Für dich

Der Tab **Für dich** im Panel sammelt, was Frieda dir abnimmt. Alles wird in Home Assistant aus dem Postfach, der
Aktivität und den Kontakten ermittelt; davon geht nichts an eine KI, und ohne deinen Klick passiert nichts.

- **Deine Woche** – was angekommen ist (im Vergleich zur Woche davor), was Regeln erledigt haben, wie oft die KI richtig
  lag (bewertet minus korrigiert), was noch ungelesen ist. Mit *Wochenrückblick am* kommt das an dem Tag auch als
  Benachrichtigung.
- **Termine aus Mails** – braucht die KI-Sortierung: Die KI nennt einen Termin oder eine Frist, die sie in einer Mail
  liest, die sie ohnehin bewertet (dieselben Daten, keine zusätzliche Anfrage). Du prüfst Titel und Zeit und trägst
  ihn mit einem Klick in einen Kalender ein; die Benachrichtigung zu einer wichtigen Mail bekommt den Knopf *In
  Kalender* (der Kalender aus den Optionen). Kalender, die Frieda schützt, werden nie angeboten.
- **Wartet auf Antwort** – Mails von dir an Menschen (nicht an No-Reply-Adressen oder dich selbst), auf die nach
  *Wartet auf Antwort nach* Tagen keine Antwort kam (Standard 3, 0 = aus). Als Antwort zählt eine Mail, die sich auf
  deine bezieht (In-Reply-To / References) oder seitdem von dieser Person kam – im Posteingang, im Archiv oder in einem
  Ordner deiner Regeln und Kategorien.
- **Regelvorschläge** – ein Absender, dessen Mails du mindestens dreimal und in 80 % der Fälle innerhalb von 30 Tagen
  in denselben Ordner verschoben (oder gelöscht) hast und den noch keine Regel erledigt. *Regel anlegen* öffnet den
  Editor damit ausgefüllt.
- **Abos** – Newsletter der letzten 30 Tage, die am seltensten gelesenen zuerst. *Abmelden* arbeitet wie Friedas
  `icloud_unsubscribe`: Ein-Klick-Link, sonst die Abmelde-Mail (braucht *E-Mails senden erlauben*), sonst öffnet sich
  die Seite für dich.
- **Wichtige Absender** – Kontaktgruppen (oder alle Kontakte) und Adressen oder Domains, die du nennst. Ihre Mails gehen
  nie unter: Die KI stuft sie mindestens als wichtig ein, und sie werden sofort gemeldet, auch ohne KI-Sortierung.
  In der Aktivität tragen sie einen Stern.

Verschiebst du eine von der KI einsortierte Mail in den Ordner einer anderen Kategorie, lernt die KI auch daraus:
Frieda nimmt das als Korrektur (in der Zeitleiste der Mail als *Von dir korrigiert (verschoben)*), genau wie eine
Korrektur im Panel.

| Option (Für dich) | Wirkung |
|-------------------|---------|
| Wichtige Absender: Kontaktgruppen | Gruppen deiner iCloud-Kontakte, oder *Alle Kontakte* |
| Wichtige Absender: Adressen und Domains | eine pro Zeile |
| Ihre Mails sofort melden | mit dem Benachrichtigungsdienst des Tagesüberblicks (Standard: an) |
| Kalendereinträge aus Mails vorschlagen | die KI nennt Daten, die sie liest (Standard: an; braucht die KI-Sortierung) |
| Kalender für Einträge aus der Benachrichtigung | leer = der erste Kalender, in den Frieda schreiben darf |
| Wartet auf Antwort nach (Tagen) | Standard 3, 0 = aus |
| Wochenrückblick am | ein Wochentag oder aus, zur Uhrzeit des Tagesüberblicks (sonst 18:00) |

## Sicherheit

Frieda Postfach bringt keine eigenen Zugangsdaten und keine eigenen Netzwerk-Endpunkte mit. Es nutzt Friedas
Verbindung, Leitplanken und Änderungsprotokoll; die Push-Verbindung ist eine zweite IMAP-Sitzung, die nur auf neue
Mails wartet. Die Tools von Frieda Postfach folgen Friedas Optionen: Schreibende Regel-Tools verschwinden im
Nur-Lesen-Modus, und Freigaben gelten wie für jedes andere Frieda-Tool. Siehe [SECURITY.md](https://github.com/nadeo360/friedafetch-mail/blob/main/SECURITY.md).

**Diagnose** (Einstellungen → Geräte & Dienste → Frieda Postfach → ⋮ → Diagnose herunterladen) enthält Versionen,
Optionen, den Aufbau der Regeln, Automatik- und Push-Status, Läufe und KI-Nutzung als Zahlen sowie die Größe der
Aktivität und ob der Server CONDSTORE anbietet – keine Betreffs, Absender, Namen, Message-IDs, Regelwerte,
Killswitch-Begriffe oder den Benachrichtigungsdienst.
Ist Frieda älter, als diese Version braucht, weist eine Reparatur unter Einstellungen → Reparaturen darauf hin, bis
Frieda aktualisiert ist.

## Entwicklung

Wie du Fehler meldest, Ideen einbringst und Pull Requests schickst: [CONTRIBUTING.md](https://github.com/nadeo360/friedafetch-mail/blob/main/CONTRIBUTING.md).

Die Architektur von Frieda und Frieda Postfach beschreibt das arc42-Dokument im Repository von Frieda: [docs/architecture.de.md](https://github.com/nadeo360/friedafetch/blob/main/docs/architecture.de.md).

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements_dev.txt
git clone --depth 1 https://github.com/nadeo360/friedafetch /tmp/frieda
ln -s /tmp/frieda/custom_components/friedafetch custom_components/friedafetch
pytest && ruff check . && ruff format --check .
```

`tests_imap/` prüft Friedas IMAP-Client und den Blick auf gelesen/markiert gegen einen echten IMAP-Server: Dovecot
als Prozess deines Benutzers (`brew install dovecot` oder `apt install dovecot-imapd`; ohne ihn übersprungen, die CI
hat einen eigenen Job). Die Typprüfung ist `basedpyright` (requirements/types.txt); Befunde von vor ihrer Einführung
stehen in `.basedpyright/baseline.json`.

### Releases

`scripts/release.py VERSION --notes NOTES.md` veröffentlicht aus einem sauberen `dev`: Es hält an, wenn `origin/main`
Commits hat, die `dev` fehlen, setzt die Version im Manifest, führt ruff und die Tests aus, schiebt `main` per
Fast-Forward nach und pusht, wartet, bis jeder CI-Lauf dieses Commits bestanden hat, legt das GitHub-Release mit den
Notizen an (Deutsch, `---`, Englisch) und prüft danach das Zip, das der Release-Workflow anhängt – Prüfsumme, Version
und jede Datei gegen den getaggten Quellstand. `--dry-run` prüft und testet nur; `--draft` gibt ein Gerüst für die
Notizen aus den Commits seit dem letzten Release aus.

## Hinweis zum Einsatz von KI

Diese Integration wurde mit erheblicher Unterstützung eines KI-Programmierassistenten (Claude von Anthropic)
entwickelt, auf Grundlage der Anforderungen und Entscheidungen des Maintainers. Jede Änderung ist durch die
automatisierten Tests und Sicherheitsprüfungen abgedeckt, und Releases testet der Maintainer gegen ein echtes
iCloud-Konto. Fehler und Ideen bitte als GitHub-Issue melden – sie werden von einem Menschen gelesen.

## Rechtliche Hinweise

Apple und iCloud sind Marken der Apple Inc.; Home Assistant ist eine Marke der Open Home Foundation. **Dies ist ein
unabhängiges Community-Projekt und steht in keiner Verbindung zu Apple, der Open Home Foundation, Nabu Casa, Anthropic
oder HACS.** Die Nutzung von iCloud unterliegt den iCloud-Bedingungen von Apple. Die Software kommt ohne Gewähr und
verändert dein Postfach in deinem Auftrag. Details: [NOTICE.md](https://github.com/nadeo360/friedafetch-mail/blob/main/NOTICE.md).

## Lizenz

MIT – siehe [LICENSE](https://github.com/nadeo360/friedafetch-mail/blob/main/LICENSE).
