#!/usr/bin/env bash
set -euo pipefail

# psql wrapper that uses local psql if available, otherwise Docker
# Usage: PSQL_ENV=.env.staging ops/scripts/psql_exec.sh -v ON_ERROR_STOP=1 -f path/to/file.sql
# Loads PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD from $PSQL_ENV (default .env.staging).

ENV_FILE="${PSQL_ENV:-.env.staging}"
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

# Prefer local psql if available
if command -v psql >/dev/null 2>&1; then
  exec psql "$@"
fi

# Fallback: dockerized psql
# Requires Docker daemon on the machine running this script (Rick/Claude runner), not in Codex.
# Mount repo for \i includes; use host networking so PGHOST=127.0.0.1:5434 works.
echo "Local psql not found, using Docker fallback..." >&2
exec docker run --rm --network host \
  -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD \
  -v "$PWD":"$PWD" -w "$PWD" \
  postgres:16 psql "$@"