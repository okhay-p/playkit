#!/usr/bin/env bash
set -euo pipefail

: "${CHECKS_RESULT:?Missing quality-check result}"
: "${BROWSER_RESULT:?Missing browser-matrix result}"

printf 'Quality checks: %s\nBrowser matrix: %s\n' "$CHECKS_RESULT" "$BROWSER_RESULT"

if [[ "$CHECKS_RESULT" != success || "$BROWSER_RESULT" != success ]]; then
  printf 'Every required validation job must succeed before merging.\n' >&2
  exit 1
fi
