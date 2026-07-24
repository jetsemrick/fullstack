#!/usr/bin/env sh
set -eu

PY="${PYTHON:-python3}"
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
fi

exec "$PY" "$@"
