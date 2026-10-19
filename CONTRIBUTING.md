# Contributing to Frieda Postfach

*Deutsche Fassung weiter unten.*

Thanks for wanting to help! Frieda Postfach is maintained by one person in their spare time – bug reports, ideas and
pull requests are welcome, answers may take a few days.

## Reporting bugs and ideas

- Please use the issue templates (**Issues → New issue**). They ask for the versions of Frieda Postfach, Frieda and
  Home Assistant, what you did and what happened.
- A log excerpt helps a lot: **Settings → System → Logs**, filter for `friedafetch_mail`.
- **Never post** app-specific passwords, tokens, mail contents, rule conditions with private addresses or the reasons
  of AI ratings you do not want to make public. Remove personal data from logs and screenshots.
- **Security problems do not belong in an issue** – please report them privately as described in
  [SECURITY.md](SECURITY.md).
- Problems with the MCP endpoint, the tools or the Frieda panel belong to
  [Frieda](https://github.com/nadeo360/friedafetch/issues).

## Pull requests

- For larger changes please open an issue first, so we can agree on the approach before you invest time.
- Fork the repository, create a branch from `main` and open the pull request against `main`. Small, focused pull
  requests are easier to review.
- The CI must be green: Ruff (lint and format), the test suite (against the current Frieda), hassfest, HACS
  validation, Bandit and CodeQL.
- Changes in behaviour come with tests. Please update the README (English and German); architecture decisions are
  recorded in Frieda's [docs/architecture.md](https://github.com/nadeo360/friedafetch/blob/main/docs/architecture.md).
- Texts of the options flow live in `strings.json`, `translations/en.json` and `translations/de.json` – keep all three
  in sync.
- The AI sorting must stay opt-in: nothing may reach an AI unless it was switched on and an AI entity was chosen, and
  the kill switch is checked locally before anything is sent.
- The panel uses Frieda's shared design library *Frieda UI*; changes are checked in light and dark themes and at phone
  width. Information must not depend on hovering.
- By contributing you agree that your contribution is published under the [MIT license](LICENSE).

## Development setup

Home Assistant 2026.10 needs Python ≥ 3.14.2. The tests run against Frieda, which is linked in from a checkout:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements_dev.txt
git clone --depth 1 https://github.com/nadeo360/friedafetch /tmp/frieda
ln -s /tmp/frieda/custom_components/friedafetch custom_components/friedafetch
pytest
ruff check custom_components tests && ruff format custom_components tests
```

CI installs its tools from hash-pinned lock files in `requirements/`. After changing `requirements_dev.txt` or a
`requirements/*.in` file, run `scripts/lock_requirements.sh` (needs [uv](https://docs.astral.sh/uv/)) and commit the
updated `requirements/*.txt`.

## Code of conduct

Please be friendly and constructive – see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

# Mitmachen bei Frieda Postfach

Danke, dass du helfen möchtest! Frieda Postfach wird von einer Person in der Freizeit gepflegt – Fehlermeldungen,
Ideen und Pull Requests sind willkommen, Antworten können ein paar Tage dauern.

## Fehler und Ideen melden

- Bitte nutze die Vorlagen (**Issues → New issue**). Sie fragen nach den Versionen von Frieda Postfach, Frieda und
  Home Assistant, was du gemacht hast und was passiert ist.
- Ein Log-Auszug hilft sehr: **Einstellungen → System → Protokolle**, nach `friedafetch_mail` filtern.
- **Niemals posten:** app-spezifische Passwörter, Tokens, Mail-Inhalte, Regelbedingungen mit privaten Adressen oder
  Begründungen von KI-Bewertungen, die nicht öffentlich werden sollen. Entferne persönliche Daten aus Logs und
  Screenshots.
- **Sicherheitsprobleme gehören nicht in ein Issue** – bitte privat melden, wie in [SECURITY.md](SECURITY.md)
  beschrieben.
- Probleme mit dem MCP-Endpunkt, den Tools oder dem Frieda-Panel gehören zu
  [Frieda](https://github.com/nadeo360/friedafetch/issues).

## Pull Requests

- Bei größeren Änderungen bitte zuerst ein Issue öffnen, damit wir den Weg abstimmen, bevor du Zeit investierst.
- Repository forken, Zweig von `main` anlegen und den Pull Request gegen `main` stellen. Kleine, fokussierte Pull
  Requests lassen sich leichter prüfen.
- Die CI muss grün sein: Ruff (Lint und Format), Tests (gegen das aktuelle Frieda), hassfest, HACS-Validierung,
  Bandit und CodeQL.
- Geändertes Verhalten kommt mit Tests. Bitte README (englisch und deutsch) aktualisieren; Architekturentscheidungen
  stehen in Friedas [docs/architecture.de.md](https://github.com/nadeo360/friedafetch/blob/main/docs/architecture.de.md).
- Texte der Options-Dialoge stehen in `strings.json`, `translations/en.json` und `translations/de.json` – alle drei
  synchron halten.
- Die KI-Sortierung bleibt Opt-in: Nichts darf an eine KI gehen, solange sie nicht eingeschaltet und eine KI-Entität
  gewählt ist, und der Killswitch wird lokal geprüft, bevor etwas gesendet wird.
- Das Panel nutzt Friedas gemeinsame Design-Bibliothek *Frieda UI*; Änderungen werden hell, dunkel und in Handybreite
  geprüft. Informationen dürfen nicht nur beim Überfahren mit der Maus sichtbar sein.
- Mit deinem Beitrag stimmst du zu, dass er unter der [MIT-Lizenz](LICENSE) veröffentlicht wird.

## Entwicklungsumgebung

Home Assistant 2026.10 braucht Python ≥ 3.14.2. Die Tests laufen gegen Frieda, das aus einem Checkout eingebunden
wird:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements_dev.txt
git clone --depth 1 https://github.com/nadeo360/friedafetch /tmp/frieda
ln -s /tmp/frieda/custom_components/friedafetch custom_components/friedafetch
pytest
ruff check custom_components tests && ruff format custom_components tests
```

Die CI installiert ihre Werkzeuge aus hash-gesperrten Dateien in `requirements/`. Nach Änderungen an
`requirements_dev.txt` oder einer `requirements/*.in` bitte `scripts/lock_requirements.sh` ausführen (braucht
[uv](https://docs.astral.sh/uv/)) und die aktualisierten `requirements/*.txt` mit committen.

## Verhaltenskodex

Bitte freundlich und konstruktiv bleiben – siehe [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
