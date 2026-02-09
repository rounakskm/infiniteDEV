#!/bin/bash
# infiniteDEV Unified Startup Script
# Usage: idev-start.sh [start|stop|restart|status]

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

DAEMON_PID_FILE=".infinitedev/daemon.pid"
HEALTH_PID_FILE=".infinitedev/health.pid"

start_services() {
  echo "Starting infiniteDEV services..."

  # Create logs directory
  mkdir -p .infinitedev

  # Start daemon in background
  nohup node src/daemon/index.js > .infinitedev/daemon.log 2>&1 &
  echo $! > "$DAEMON_PID_FILE"
  echo "✓ Daemon started (PID: $(cat $DAEMON_PID_FILE))"

  # Start health API server in background
  nohup node src/health/index.js > .infinitedev/health.log 2>&1 &
  echo $! > "$HEALTH_PID_FILE"
  echo "✓ Health server started (PID: $(cat $HEALTH_PID_FILE))"

  # Give services time to start
  sleep 2

  echo ""
  echo "infiniteDEV is running!"
  echo "  - Daemon logs: tail -f .infinitedev/daemon.log"
  echo "  - Health logs: tail -f .infinitedev/health.log"
  echo "  - Health API: http://localhost:3030/health"
  echo ""
}

stop_services() {
  echo "Stopping infiniteDEV services..."

  if [ -f "$DAEMON_PID_FILE" ]; then
    kill $(cat "$DAEMON_PID_FILE") 2>/dev/null || true
    rm "$DAEMON_PID_FILE"
    echo "✓ Daemon stopped"
  fi

  if [ -f "$HEALTH_PID_FILE" ]; then
    kill $(cat "$HEALTH_PID_FILE") 2>/dev/null || true
    rm "$HEALTH_PID_FILE"
    echo "✓ Health server stopped"
  fi
}

status_services() {
  echo "infiniteDEV Service Status:"
  echo ""

  if [ -f "$DAEMON_PID_FILE" ] && kill -0 $(cat "$DAEMON_PID_FILE") 2>/dev/null; then
    echo "  Daemon: ✓ Running (PID: $(cat $DAEMON_PID_FILE))"
  else
    echo "  Daemon: ✗ Not running"
  fi

  if [ -f "$HEALTH_PID_FILE" ] && kill -0 $(cat "$HEALTH_PID_FILE") 2>/dev/null; then
    echo "  Health: ✓ Running (PID: $(cat $HEALTH_PID_FILE))"
  else
    echo "  Health: ✗ Not running"
  fi

  echo ""

  # Check if daemon is responding
  if curl -s http://localhost:3030/health > /dev/null 2>&1; then
    echo "  API Health: ✓ Responding"
  else
    echo "  API Health: ✗ Not responding"
  fi
}

case "${1:-start}" in
  start)
    stop_services  # Stop any existing services first
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    stop_services
    sleep 1
    start_services
    ;;
  status)
    status_services
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
