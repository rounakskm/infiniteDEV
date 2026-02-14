#!/bin/bash
set -euo pipefail

HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
WORKING_DIR=$(echo "$HOOK_INPUT" | jq -r '.cwd')
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

DAEMON_URL="${INFINITEDEV_DAEMON_URL:-http://localhost:3030}"
REGISTRATION_FLAG="/tmp/infinitedev-registered-${SESSION_ID}"

# If already registered, send heartbeat and exit
if [ -f "$REGISTRATION_FLAG" ]; then
  curl -s -X POST "${DAEMON_URL}/api/session/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"${SESSION_ID}\"}" >/dev/null 2>&1 || true
  exit 0
fi

# First message — auto-start daemon if needed
if ! curl -s "${DAEMON_URL}/health" > /dev/null 2>&1; then
  DAEMON_PATH="${INFINITEDEV_DAEMON_PATH:-}"
  if [ -n "$DAEMON_PATH" ] && [ -f "${DAEMON_PATH}/bin/idev-start.sh" ]; then
    "${DAEMON_PATH}/bin/idev-start.sh" start >/dev/null 2>&1 || true
    sleep 2
  fi
fi

# Register session
RESPONSE=$(curl -s -X POST "${DAEMON_URL}/api/session/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"workingDir\": \"${WORKING_DIR}\",
    \"pid\": $$,
    \"startTime\": $(date +%s)000,
    \"transcriptPath\": \"${TRANSCRIPT_PATH}\"
  }" 2>/dev/null) || exit 0

# Check pause state
IS_PAUSED=$(echo "$RESPONSE" | jq -r '.isPaused // false')
if [ "$IS_PAUSED" = "true" ]; then
  echo "infiniteDEV: Rate limit active. Cannot start session." >&2
  exit 2
fi

# Mark as registered
touch "$REGISTRATION_FLAG"
exit 0
