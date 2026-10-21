"""A throwaway Dovecot for the IMAP tests: one process of the current user, plain IMAP on 127.0.0.1.

The tests are about IMAP behaviour (CONDSTORE, QRESYNC, IDLE, moves) that mocks cannot show – the kind of thing that
broke before (a SELECT form a server refused, answers that left messages out). TLS is left out on purpose: it is not
what these tests look at, and Dovecot's login proxy for TLS does not work as a user process on macOS.

Dovecot 2.3 (Ubuntu, CI) and 2.4 (Homebrew) need different configuration syntax; both are written here.
"""

from __future__ import annotations

import grp
import os
import pwd
import re
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

CANDIDATES = ["/opt/homebrew/opt/dovecot/sbin/dovecot", "/usr/local/opt/dovecot/sbin/dovecot", "/usr/sbin/dovecot"]
PASSWORD = "pass"  # every user name logs in with it (a fresh name is a fresh, empty account)


def binary() -> str | None:
    found = os.environ.get("DOVECOT") or shutil.which("dovecot")
    return found or next((c for c in CANDIDATES if Path(c).exists()), None)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _config(version: str, base: Path, port: int) -> str:
    user = pwd.getpwuid(os.getuid()).pw_name
    group = grp.getgrgid(os.getgid()).gr_name
    home = base / "home"
    common_services = f"""
service imap-login {{
  inet_listener imap {{
    port = {port}
  }}
  inet_listener imaps {{
    port = 0
  }}
  chroot =
}}
service anvil {{
  chroot =
}}
"""
    folders = """
  mailbox Archive {
    special_use = \\Archive
    auto = create
  }
  mailbox "Deleted Messages" {
    special_use = \\Trash
    auto = create
  }
"""
    if version.startswith("2.3"):
        return f"""
base_dir = {base}/run
state_dir = {base}/state
log_path = {base}/dovecot.log
protocols = imap
listen = 127.0.0.1
default_internal_user = {user}
default_internal_group = {group}
default_login_user = {user}
ssl = no
disable_plaintext_auth = no
{common_services}
passdb {{
  driver = static
  args = password={PASSWORD}
}}
userdb {{
  driver = static
  args = uid={os.getuid()} gid={os.getgid()} home={home}/%u
}}
mail_location = maildir:~/Maildir
namespace inbox {{
  inbox = yes
  separator = /
{folders}
}}
"""
    return f"""
dovecot_config_version = 2.4.0
dovecot_storage_version = 2.4.0
base_dir = {base}/run
state_dir = {base}/state
log_path = {base}/dovecot.log
protocols = imap
listen = 127.0.0.1
default_internal_user = {user}
default_internal_group = {group}
default_login_user = {user}
default_vsz_limit = 1T
ssl = no
auth_allow_cleartext = yes
{common_services}
passdb static {{
  password = {PASSWORD}
}}
userdb static {{
  fields {{
    uid = {os.getuid()}
    gid = {os.getgid()}
    home = {home}/%{{user}}
  }}
}}
mail_driver = maildir
mail_path = ~/Maildir
namespace inbox {{
  inbox = yes
  separator = /
{folders}
}}
"""


class Dovecot:
    """Started by start(), stopped by stop(); host and port of its plain IMAP listener."""

    def __init__(self, path: str) -> None:
        self.path = path
        # the UNIX sockets need a short path (macOS allows 104 characters)
        self.base = Path(tempfile.mkdtemp(prefix="fdv", dir="/tmp" if Path("/tmp").is_dir() else None))
        self.host = "127.0.0.1"
        self.port = _free_port()
        self._proc: subprocess.Popen | None = None

    def start(self) -> None:
        version = subprocess.run([self.path, "--version"], capture_output=True, text=True, check=True).stdout.strip()  # noqa: S603
        for sub in ("run", "state", "home"):
            (self.base / sub).mkdir(parents=True, exist_ok=True)
        conf = self.base / "dovecot.conf"
        conf.write_text(_config(version, self.base, self.port), encoding="utf-8")
        self._proc = subprocess.Popen(  # noqa: S603
            [self.path, "-F", "-c", str(conf)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if self._proc.poll() is not None:
                raise RuntimeError(f"Dovecot {version} did not start: {self._proc.stdout.read().decode()[-2000:]}")  # type: ignore[union-attr]
            try:
                with socket.create_connection((self.host, self.port), timeout=0.5) as s:
                    if re.match(rb"\* OK", s.recv(200)):
                        return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError(f"Dovecot {version} did not answer on port {self.port}")

    def log(self) -> str:
        path = self.base / "dovecot.log"
        return path.read_text(encoding="utf-8", errors="replace")[-4000:] if path.exists() else ""

    def stop(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        shutil.rmtree(self.base, ignore_errors=True)
