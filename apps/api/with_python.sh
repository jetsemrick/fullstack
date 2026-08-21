#!/bin/sh
# Prefer apps/api/.venv when present so bun scripts work after a local venv install.
cd "$(dirname "$0")" || exit 1
if [ -x .venv/bin/python ]; then
  exec .venv/bin/python "$@"
fi
exec python3 "$@"
