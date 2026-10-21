"""Browser tests of Frieda Postfach's panel against the dev preview (example data, no Home Assistant needed).

The harness (build, local server, browsers) is Frieda's: tools/preview/harness.py of a Frieda checkout – the one in
FRIEDA_DIR, else ../ha-icloud-mcp next to this repository. Run from tools/preview:

    python -m pytest -n auto --browser chromium --browser webkit
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
FRIEDA = Path(os.environ.get("FRIEDA_DIR") or ROOT.parent / "ha-icloud-mcp")
os.environ["POSTFACH_DIR"] = str(ROOT)  # the harness builds the preview with this repository's panel and pages
sys.path.insert(0, str(FRIEDA / "tools" / "preview"))

from harness import open_panel, site  # noqa: E402, F401 - the fixtures of Frieda's harness
