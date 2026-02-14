# infiniteDEV

24/7 autonomous development with Claude Code — intelligent rate limit management with automatic pause, resume, and a real-time web dashboard.

## What It Does

infiniteDEV monitors your Claude Code sessions and manages rate limits automatically:

1. **Tracks usage** via native Claude Code hooks (invisible to you)
2. **Detects rate limits** before they hit (preemptive threshold at 90%)
3. **Pauses sessions** when limits are reached (blocks new prompts)
4. **Auto-resumes** after the cooldown window expires
5. **Web dashboard** shows real-time status, usage, and history

## Quick Start

### Prerequisites

- Node.js 16+
- Git

### Install

```bash
git clone https://github.com/yourusername/infiniteDEV.git
cd infiniteDEV
npm install
```

### Start Services

```bash
./bin/idev-start.sh start
```

This starts three services:
- **Daemon** — Rate limit monitoring and auto-pause/resume
- **Health API** — Session tracking endpoints (port 3030)
- **Web Dashboard** — Real-time UI (port 3031)

### Install Claude Code Plugin

```bash
./bin/install-plugin.sh
# Restart Claude Code
```

That's it. Now just run `claude-code` as normal — session tracking is automatic.

### Check Status

```bash
./bin/idev-start.sh status
```

### Open Dashboard

Visit `http://localhost:3031` in your browser.

## How It Works

```
User runs: claude-code
  │
  ├─ Hook fires on each prompt (UserPromptSubmit)
  │   ├─ First prompt: registers session with daemon
  │   ├─ Subsequent: sends heartbeat with prompt count
  │   └─ If paused: blocks session (exit 2)
  │
  ├─ Daemon monitors usage
  │   ├─ Every 5 min: checks prompt count vs threshold
  │   ├─ Watches ~/.claude/debug/ for 429 errors
  │   └─ On rate limit:
  │       ├─ Sets pause state in SQLite
  │       ├─ Blocks new sessions via hook
  │       └─ Schedules auto-resume after cooldown
  │
  └─ After cooldown window:
      ├─ Daemon clears pause state
      ├─ Next hook call allows session
      └─ Desktop notification: "Ready to resume"
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Daemon | — | Rate limit detection, auto-pause/resume |
| Health API | 3030 | Session registration, heartbeats, status |
| Web Dashboard | 3031 | Real-time UI with pause/resume controls |

## Configuration

Edit `.infinitedev/config.json`:

```json
{
  "tier": "pro-20",
  "limits": {
    "prompts": 45,
    "window": 300000
  },
  "daemon": {
    "preemptivePause": true,
    "preemptiveThreshold": 0.9,
    "autoResume": true
  }
}
```

**Supported tiers**: `pro-20` (45 prompts), `max-100` (250 prompts), `max-200` (800 prompts)

## Commands

```bash
# Service management
./bin/idev-start.sh start    # Start all services
./bin/idev-start.sh stop     # Stop all services
./bin/idev-start.sh status   # Check service status
./bin/idev-start.sh restart  # Restart all services

# Plugin
./bin/install-plugin.sh      # Install Claude Code hooks (one-time)

# Manual control
curl -X POST http://localhost:3031/api/v2/pause   # Manual pause
curl -X POST http://localhost:3031/api/v2/resume   # Manual resume

# Debug
sqlite3 .infinitedev/state.db "SELECT * FROM rate_limit_events ORDER BY timestamp DESC LIMIT 5;"
tail -f .infinitedev/daemon.log
tail -f .infinitedev/health.log
tail -f .infinitedev/web.log
```

## API Endpoints

### Health API (port 3030)
- `GET /health` — Health check
- `GET /status` — System status
- `POST /api/session/register` — Register session
- `POST /api/session/heartbeat` — Session heartbeat
- `POST /api/session/end` — End session
- `GET /api/session/status` — Check pause state

### Dashboard API (port 3031)
- `GET /api/v2/dashboard` — All dashboard data
- `POST /api/v2/pause` — Manual pause
- `POST /api/v2/resume` — Manual resume
- `GET /api/v2/sessions` — Session list
- `GET /api/v2/events` — Rate limit events

## Implementation Phases

- **Phase 1A** ✅ Standalone daemon with notifications
- **Phase 1B** ✅ Active session tracking with heartbeats
- **Phase 1C** ✅ Hook-based automatic registration (no wrapper needed)
- **Phase 2** 🚧 Web dashboard (core features complete, enhancements in progress)

See [PROGRESS.md](PROGRESS.md) for detailed status.

## License

MIT
