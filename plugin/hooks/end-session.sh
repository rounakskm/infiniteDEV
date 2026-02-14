#!/bin/bash
set -euo pipefail

# infiniteDEV Stop Hook - Deregisters Claude Code session from daemon
# This script is called automatically by Claude Code's hook system when session ends

# Read hook input from stdin
HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Get daemon URL
DAEMON_URL="${INFINITEDEV_DAEMON_URL:-http://localhost:3030}"
COUNT_FILE="/tmp/infinitedev-count-${SESSION_ID}"

# Read final prompt count before cleanup
FINAL_COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo "0")

# Clean up temporary files
rm -f "/tmp/infinitedev-registered-${SESSION_ID}"
rm -f "$COUNT_FILE"

# Deregister session (best effort - don't fail if daemon is down)
curl -s -X POST "${DAEMON_URL}/api/session/end" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"reason\": \"session_end\",
    \"finalPromptCount\": ${FINAL_COUNT}
  }" >/dev/null 2>&1 || true

exit 0
