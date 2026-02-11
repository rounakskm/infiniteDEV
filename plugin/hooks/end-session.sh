#!/bin/bash
set -euo pipefail

# infiniteDEV SessionEnd Hook - Deregisters Claude Code session from daemon
# This script is called automatically by Claude Code's hook system

# Read hook input from stdin
HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Get daemon URL
DAEMON_URL="${INFINITEDEV_DAEMON_URL:-http://localhost:3030}"

# Deregister session (best effort - don't fail if daemon is down)
curl -s -X POST "${DAEMON_URL}/api/session/end" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"reason\": \"session_end\",
    \"finalPromptCount\": 0
  }" >/dev/null 2>&1 || true

exit 0
