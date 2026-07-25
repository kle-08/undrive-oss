#!/usr/bin/env bash
# Auto-restart wrapper for the API worker (wrangler dev --remote).
# The root wrangler.toml is a Pages project, so the worker must be run with
# its own config. Usage: ./dev.sh [extra wrangler args...]

DELAY=3

while true; do
  echo "[dev.sh] Starting worker: wrangler dev --config worker/wrangler.toml --port 8787 --remote $*"
  npx wrangler dev --config worker/wrangler.toml --port 8787 --remote "$@"
  EXIT_CODE=$?
  echo "[dev.sh] wrangler exited with code $EXIT_CODE — restarting in ${DELAY}s..."
  sleep "$DELAY"
done
