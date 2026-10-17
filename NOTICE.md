# Notices

## Trademarks

Apple, iCloud, iPhone, iPad, Mac and macOS are trademarks of Apple Inc., registered in the U.S. and other
countries and regions. Home Assistant is a trademark of the Open Home Foundation. "Model Context Protocol" and
"Claude" are trademarks of Anthropic, PBC. HACS is a project of the HACS contributors.

**This project is an independent, community-developed integration. It is not affiliated with, endorsed, sponsored
or supported by Apple Inc., the Open Home Foundation, Nabu Casa, Anthropic or HACS.** Product names are used
solely to describe compatibility. The icon and logo of this project are original artwork released under the MIT
license; they do not reproduce Apple's logos or icons.

## Use of iCloud services

The integration connects to Apple's publicly documented interfaces for iCloud Mail (IMAP/SMTP), iCloud Calendar
(CalDAV) and iCloud Contacts (CardDAV) using an app-specific password that the user creates and can revoke at any
time. Using these services is subject to Apple's terms, in particular the
[iCloud Terms and Conditions](https://www.apple.com/legal/internet-services/icloud/) and the
[Apple Media Services / Apple ID](https://www.apple.com/legal/internet-services/itunes/) terms applicable in your
region. **You are responsible for complying with these terms and with applicable law when you use this
integration.** The maintainers have no control over Apple's services and cannot guarantee that the interfaces remain
available or unchanged.

## No warranty, data and liability

The software is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)). It reads and modifies
personal data (calendars, contacts, e-mail, notes) on your behalf and passes it to the AI assistants and MCP
clients you connect. Review the permissions you grant (options such as read-only mode, sending and deleting), keep
your Home Assistant instance and access tokens secure, and be aware of the data-processing terms of any AI provider
you connect. The maintainers accept no liability for lost or altered data, sent messages or costs caused by
connected clients.

## Third-party components

Frieda Postfach has no Python requirements of its own. It runs inside Home Assistant (Apache-2.0) and uses the
Frieda integration and its dependencies (see [Frieda's NOTICE.md](https://github.com/nadeo360/friedafetch/blob/main/NOTICE.md)),
including the GPL-3.0 licensed `aioimaplib`, which it uses unmodified as a separately installed library.

## Project name

“Frieda”, “Frieda Postfach”, “friedafetch” and “friedafetch_mail” are the names of this community project. They are not registered trademarks; a
trademark search is advisable before any commercial use or registration.

## Copyright

Copyright (c) 2026 nadeo360 and contributors. Licensed under the MIT License, see [LICENSE](LICENSE).
