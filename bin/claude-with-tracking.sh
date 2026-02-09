#!/bin/bash
# Claude Code Wrapper with Session Tracking
# Usage: claude-with-tracking.sh [claude-code arguments]

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAEMON_URL="${INFINITEDEV_DAEMON_URL:-http://localhost:3030}"
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "session-$(date +%s)")
WORKING_DIR="$(pwd)"
PID=$$

# Auto-start infiniteDEV services if not running
if ! curl -s "${DAEMON_URL}/health" > /dev/null 2>&1; then
  echo "[infiniteDEV] Services not running, starting..."
  "${PROJECT_ROOT}/bin/idev-start.sh" start 2>/dev/null
  sleep 2  # Give services time to start
fi

# Function to register session
register_session() {
  curl -s -X POST "${DAEMON_URL}/api/session/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"sessionId\": \"${SESSION_ID}\",
      \"workingDir\": \"${WORKING_DIR}\",
      \"pid\": ${PID},
      \"startTime\": $(date +%s)000
    }" 2>/dev/null
}

# Function to end session
end_session() {
  local reason="${1:-user_exit}"
  curl -s -X POST "${DAEMON_URL}/api/session/end" \
    -H "Content-Type: application/json" \
    -d "{
      \"sessionId\": \"${SESSION_ID}\",
      \"reason\": \"${reason}\"
    }" > /dev/null 2>&1
}

# Function to check pause state
check_pause_state() {
  curl -s -X GET "${DAEMON_URL}/api/session/status" 2>/dev/null
}

# Set up trap to deregister on exit
trap 'end_session "user_exit"' EXIT
trap 'end_session "sigint"' INT
trap 'end_session "sigterm"' TERM

# Register session with daemon and check pause state
echo "[infiniteDEV] Registering session ${SESSION_ID} with daemon..."
DAEMON_RESPONSE=$(register_session)

IS_PAUSED=$(echo "$DAEMON_RESPONSE" | grep -o '"isPaused":[^,}]*' | cut -d: -f2)

if [ "$IS_PAUSED" = "true" ]; then
  echo ""
  echo "============================================================"
  echo "⚠️  Rate limit is active - Claude Code is paused"
  echo "============================================================"
  echo ""

  # Get resume time
  RESUME_AT=$(echo "$DAEMON_RESPONSE" | grep -o '"resumeAt":"[^"]*' | cut -d'"' -f4)
  if [ -n "$RESUME_AT" ]; then
    echo "Estimated resume time: $RESUME_AT"
  else
    echo "Check back soon for rate limit reset."
  fi

  echo ""
  echo "The daemon will notify you when the rate limit resets."
  echo ""

  # Deregister happens via trap
  exit 0
fi

# Run actual Claude Code
echo "[infiniteDEV] Starting Claude Code (tracked session)"
claude-code "$@"

# Exit code from Claude Code
EXIT_CODE=$?

# Deregister happens via trap
exit $EXIT_CODE
