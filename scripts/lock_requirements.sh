#!/bin/sh
# Regenerates the hash-pinned requirement files that CI installs with "pip install --require-hashes".
# Needs uv (https://docs.astral.sh/uv/). Run from the repository root after changing requirements_dev.txt or a
# requirements/*.in file.
set -e
OPTS="--generate-hashes --python-version 3.14.2 --python-platform x86_64-unknown-linux-gnu --quiet"
for name in lint bandit; do
  uv pip compile "requirements/$name.in" $OPTS --custom-compile-command "scripts/lock_requirements.sh" -o "requirements/$name.txt"
done
uv pip compile requirements_dev.txt $OPTS --custom-compile-command "scripts/lock_requirements.sh" -o requirements/test.txt
# the same tests against the oldest Home Assistant that hacs.json allows and the newest one (CI matrix): bump
# requirements/ha-minimum/test.in together with hacs.json; Dependabot moves requirements/ha-next on
for name in ha-minimum ha-next; do
  uv pip compile "requirements/$name/test.in" $OPTS --custom-compile-command "scripts/lock_requirements.sh" -o "requirements/$name/test.txt"
done
