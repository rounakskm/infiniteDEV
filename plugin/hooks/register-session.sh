#!/bin/bash
set -euo pipefail

# infiniteDEV SessionStart Hook - Registers Claude Code session with daemon
# This script is called automatically by Claude Code's hook system

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract session information
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
WORKING_DIR=$(echo "$HOOK_INPUT" | jq -r '.cwd')
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

# Get daemon URL from environment (default: localhost:3030)
DAEMON_URL="${INFINITEDEV_DAEMON_URL:-http://localhost:3030}"

# Check if daemon is running
if ! curl -s "${DAEMON_URL}/health" > /dev/null 2>&1; then
  # Daemon not running - try to auto-start if configured
  DAEMON_PATH="${INFINITEDEV_DAEMON_PATH:-}"

  if [ -n "$DAEMON_PATH" ] && [ -f "${DAEMON_PATH}/bin/idev-start.sh" ]; then
    echo "infiniteDEV: Daemon not running, starting..." >&2
    "${DAEMON_PATH}/bin/idev-start.sh" start >/dev/null 2>&1 || true
    sleep 2
  fi
fi

# Register session with daemon
RESPONSE=$(curl -s -X POST "${DAEMON_URL}/api/session/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"workingDir\": \"${WORKING_DIR}\",
    \"pid\": $$,
    \"startTime\": $(date +%s)000,
    \"transcriptPath\": \"${TRANSCRIPT_PATH}\"
  }" 2>/dev/null) || {
  echo "infiniteDEV: Failed to register session (daemon not reachable)" >&2
  exit 0  # Non-blocking error
}

# Check if daemon is paused
IS_PAUSED=$(echo "$RESPONSE" | jq -r '.isPaused // false')

if [ "$IS_PAUSED" = "true" ]; then
  # Output blocking error to prevent Claude Code from starting
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "blocked": true,
    "message": "Rate limit is active. infiniteDEV daemon will notify you when ready to resume."
  }
}
EOF
  exit 2  # Blocking error - prevents session from continuing
fi

# Output success
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Session ${SESSION_ID} registered with infiniteDEV daemon."
  }
}
EOF

exit 0
