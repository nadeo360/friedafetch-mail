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
