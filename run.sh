#!/usr/bin/env bash
# Run a script in the neverranked repo with API keys loaded from the
# shared outreach .env. Single source of truth — no duplicate key
# management. Same UX as the outreach repo's run.sh.
#
#   ./run.sh scripts/decision-indexer.mjs --file=<path>
#   ./run.sh dashboard/scripts/<whatever>.js
#
# Keys live in ../neverranked-outreach/.env (gitignored).
# You never export or paste them again.

set -euo pipefail

# The outreach repo is the canonical .env location for both projects.
# If the file is missing, point Lance at the one-time setup pattern.
SHARED_ENV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/neverranked-outreach/.env"

if [ ! -f "$SHARED_ENV" ]; then
  echo "No shared .env found at $SHARED_ENV" >&2
  echo "One-time setup:" >&2
  echo "  cd ~/Desktop/neverranked-outreach && cp .env.example .env" >&2
  echo "  then paste your keys into that file." >&2
  exit 1
fi

# Load every KEY=value line from the shared .env into the environment.
set -a
# shellcheck disable=SC1091
. "$SHARED_ENV"
set +a

exec node "$@"
