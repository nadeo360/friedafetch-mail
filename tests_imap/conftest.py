"""IMAP tests against a real server (Dovecot, see dovecot.py); skipped where no Dovecot is installed.

Locally: brew install dovecot (or apt install dovecot-imapd). CI runs them in the job "IMAP against Dovecot".
"""

from __future__ import annotations

import email.utils
import imaplib
import os
import re
import uuid
from collections.abc import Generator
from typing import Any

import aioimaplib
import pytest
import pytest_socket

from custom_components.friedafetch.mail import ICloudMail

from .dovecot import PASSWORD, Dovecot, binary

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    return


class _PlainImap(aioimaplib.IMAP4):
    """IMAP4_SSL's signature over a plain connection (the test server has no TLS)."""

    def __init__(self, host: str, port: int, timeout: float = 30, ssl_context: Any = None, **kwargs: Any) -> None:
        super().__init__(host=host, port=port, timeout=timeout, **kwargs)


def _local_sockets() -> None:
    """Home Assistant's test plugin blocks sockets; these tests talk to the server on 127.0.0.1 only."""
    pytest_socket.enable_socket()
    pytest_socket.socket_allow_hosts(["127.0.0.1"], allow_unix_socket=True)


@pytest.fixture(autouse=True)
def local_sockets() -> None:
    _local_sockets()


@pytest.fixture(autouse=True)
def plain_imap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("custom_components.friedafetch.mail.aioimaplib.IMAP4_SSL", _PlainImap)
    monkeypatch.setattr("custom_components.friedafetch_mail.idle.aioimaplib.IMAP4_SSL", _PlainImap)


@pytest.fixture(scope="session")
def dovecot() -> Generator[Dovecot]:
    path = binary()
    if path is None:
        if os.environ.get("IMAP_TESTS_REQUIRED"):  # the CI job: a skip there would look like a pass
            pytest.fail("Dovecot is required here but not installed")
        pytest.skip("Dovecot is not installed (brew install dovecot / apt install dovecot-imapd)")
    _local_sockets()
    server = Dovecot(path)
    server.start()
    yield server
    server.stop()


class Device:
    """Another mail program on the same account (the iPhone): appends, reads, flags, moves, deletes."""

    def __init__(self, server: Dovecot, user: str) -> None:
        self.imap = imaplib.IMAP4(server.host, server.port)
        self.imap.login(user, PASSWORD)

    def append(self, mailbox: str, message_id: str, subject: str = "Hallo", flags: str = "") -> int:
        msg = (
            f"From: Anna <anna@example.com>\r\nTo: me@example.com\r\nSubject: {subject}\r\n"
            f"Message-ID: {message_id}\r\nDate: {email.utils.formatdate()}\r\n\r\nHallo Welt\r\n"
        ).encode()
        typ, data = self.imap.append(f'"{mailbox}"', f"({flags})" if flags else None, None, msg)
        assert typ == "OK", data
        return int(data[0].split()[2].rstrip(b"]"))  # [APPENDUID validity uid]

    def _select(self, mailbox: str) -> None:
        typ, data = self.imap.select(f'"{mailbox}"')
        assert typ == "OK", data

    def flags(self, mailbox: str, uid: int, add: str = "", remove: str = "") -> None:
        self._select(mailbox)
        if add:
            self.imap.uid("STORE", str(uid), "+FLAGS", f"({add})")
        if remove:
            self.imap.uid("STORE", str(uid), "-FLAGS", f"({remove})")

    def move(self, mailbox: str, uid: int, target: str) -> int:
        self._select(mailbox)
        typ, data = self.imap.uid("MOVE", str(uid), f'"{target}"')
        assert typ == "OK", data
        for line in [*data, *self.imap.untagged_responses.get("OK", [])]:
            text = line.decode() if isinstance(line, bytes) else str(line)
            if "COPYUID" in text:
                return int(text.split("COPYUID")[1].split()[2].rstrip("]"))
        raise AssertionError(f"no COPYUID in {data}")

    def delete(self, mailbox: str, uid: int) -> None:
        self._select(mailbox)
        self.imap.uid("STORE", str(uid), "+FLAGS", "(\\Deleted)")
        self.imap.expunge()

    def copy(self, mailbox: str, uid: int, target: str) -> None:
        self._select(mailbox)
        typ, data = self.imap.uid("COPY", str(uid), f'"{target}"')
        assert typ == "OK", data

    def create(self, mailbox: str) -> None:
        typ, data = self.imap.create(f'"{mailbox}"')
        assert typ == "OK", data

    def remove(self, mailbox: str) -> None:
        self.imap.select("INBOX")  # a folder that is open cannot be deleted everywhere
        typ, data = self.imap.delete(f'"{mailbox}"')
        assert typ == "OK", data

    def folders(self) -> list[str]:
        """The folders as the server names them (modified UTF-7)."""
        typ, data = self.imap.list()
        assert typ == "OK", data
        names = []
        for line in data:
            m = re.match(rb'\((?P<flags>[^)]*)\) (?:"[^"]*"|NIL) (?P<name>.+)$', line or b"")
            if m and b"\\Noselect" not in m.group("flags"):
                names.append(m.group("name").decode().strip('"'))
        return names

    def messages(self) -> dict[str, list[tuple[str, int, set[str]]]]:
        """The truth: every Message-ID on the account with its places (folder, UID, flags), read with another client."""
        out: dict[str, list[tuple[str, int, set[str]]]] = {}
        for folder in self.folders():
            typ, data = self.imap.select(f'"{folder}"', readonly=True)
            assert typ == "OK", data
            if int(data[0] or 0) == 0:
                continue
            typ, data = self.imap.uid("FETCH", "1:*", "(UID FLAGS BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
            assert typ == "OK", data
            for part in data:
                if not isinstance(part, tuple):
                    continue
                head, body = part[0].decode(), part[1].decode()
                uid = int(re.search(r"UID (\d+)", head).group(1))  # type: ignore[union-attr]
                flags = set(re.search(r"FLAGS \(([^)]*)\)", head).group(1).split())  # type: ignore[union-attr]
                mid = re.search(r"Message-ID:\s*(\S+)", body, re.IGNORECASE)
                if mid:
                    out.setdefault(mid.group(1), []).append((folder, uid, flags))
        return out

    def close(self) -> None:
        try:
            self.imap.logout()
        except Exception:  # noqa: BLE001, S110
            pass


@pytest.fixture
def account(dovecot: Dovecot) -> Generator[dict[str, Any]]:
    """A fresh, empty account on the test server; .device is another mail program on it."""
    user = f"t{uuid.uuid4().hex[:10]}@example.com"
    device = Device(dovecot, user)
    yield {"user": user, "host": dovecot.host, "port": dovecot.port, "device": device, "server": dovecot}
    device.close()


@pytest.fixture
async def mail(account: dict[str, Any]) -> Any:
    client = ICloudMail(
        account["user"],
        PASSWORD,
        from_address=account["user"],
        imap_host=account["host"],
        imap_port=account["port"],
        smtp_host="127.0.0.1",
        smtp_port=1,
        timeout=10,
    )
    yield client
    await client.async_close()
