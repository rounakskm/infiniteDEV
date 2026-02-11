# infiniteDEV

24/7 autonomous development with Claude Code, intelligent rate limit management, and multi-agent orchestration.

## Overview

infiniteDEV solves the 5-hour limit problem by:

- **Standalone Daemon**: Monitors Claude Code without any dependencies (not tied to Gastown/Beads)
- **Smart Notifications**: Detects rate limits, alerts user to pause, notifies when ready to resume
- **Crash Recovery**: Persists pause state in SQLite for automatic recovery
- **Optional Orchestration**: Works alone OR integrates with Beads/Gastown for multi-agent task coordination
- **Easy Onboarding**: Single `./install.sh` script sets up everything

## Quick Start

### Prerequisites

- Node.js 16+
- Git
- Go 1.23+
- tmux 3.0+ (recommended for Phase 1C auto-resume, but optional)

### Installation

```bash
git clone https://github.com/yourusername/infiniteDEV.git
cd infiniteDEV
./install.sh
```

This installs all dependencies, initializes services, and starts the daemon.

### Testing Phase 1C: Automatic Resume

To test the automatic resume functionality:

**Terminal 1: Start the daemon**
```bash
cd /Users/rounakskm/AI-projects/infiniteDEV
node src/daemon/index.js
```

**Terminal 2: Start Claude Code (with tmux for optimal experience)**
```bash
cd /Users/rounakskm/AI-projects/infiniteDEV
tmux new -s claude
claude-code
```

**Terminal 3: Continue development**
```bash
cd /Users/rounakskm/AI-projects/infiniteDEV
# Use Claude Code in Terminal 2 to continue developing
# Daemon will auto-detect rate limit and pause
# When rate limit resets, daemon auto-resumes Claude Code!
```

**What to watch for:**
- Terminal 1 (daemon): `[Daemon] Rate limit threshold reached, pausing operations`
- Terminal 1 (daemon): `[Daemon] Will attempt automatic resume in ~5.0 hours`
- After 5 hours: `[Daemon] Claude Code resumed automatically via stdin` (or `restart`)

**Note:** If you don't have tmux installed, the daemon will automatically fall back to the restart strategy (`claude --resume`).

### First Task

```bash
# Check status
idev status

# Create a task
idev task create "Build user authentication" --type feature --priority high

# View logs
idev logs
```

The Mayor will automatically assign this task to the Architect agent, which will decompose it into sub-tasks for builders to implement in parallel.

## How It Works

### Architecture (Phase 1C: Automatic Resume)

```
┌─ Daemon (Standalone) - Independent of Gastown/Beads
│  ├─ Monitors ~/.claude/debug/*.txt for rate limit errors
│  ├─ Detects running Claude Code processes (via ps aux)
│  ├─ Notifies user when rate limit hit
│  └─ AUTOMATICALLY RESUMES when rate limit resets
│     ├─ Strategy 1: Send "continue" via tmux (if available)
│     ├─ Strategy 2: Restart with `claude --resume` (fallback)
│     └─ Strategy 3: Show notification (final fallback)
│
├─ Claude Code (Your Work) - Runs continuously
│  ├─ Automatically stops when rate limit is reached
│  └─ Automatically resumes via daemon when limit resets
│
└─ Beads + Gastown (Optional) - Task orchestration layer
   ├─ Mayor polls "ready tasks" every 30s
   ├─ Routes tasks to specialized agents:
   │  ├─ Architect: designs, decomposes work
   │  ├─ Builders: implement features (2 instances)
   │  ├─ Tester: validates, writes tests
   │  ├─ Reviewer: quality gate
   │  └─ LeadDev: coordinates
   └─ Agents update tasks as they complete
```

### Rate Limit Detection (Phase 1A)

The daemon monitors Claude Code directly:

1. **Log Monitoring**: Tails `~/.claude/debug/*.txt` for rate limit errors
2. **Process Detection**: Identifies running Claude Code processes
3. **User Notification**: Console + desktop alerts for pause/resume

On rate limit detection:
- Console and desktop notification: "RATE LIMIT REACHED - Please pause Claude Code"
- User manually pauses Claude Code (Ctrl+C)
- Daemon waits for 5-hour window to reset
- On reset: "RATE LIMIT REFRESHED - Ready to resume"
- User manually resumes Claude Code

**Tiers supported** (customizable in `.infinitedev/config.json`):
- Pro $20: 45 prompts per 5 hours
- Max $100: 250 prompts per 5 hours
- Max $200: 800 prompts per 5 hours

## Commands

```bash
# System control
idev init              # Initialize infiniteDEV (first-time setup)
idev start             # Start daemon + Mayor
idev stop              # Stop all services
idev status            # Show system status
idev logs              # View logs

# Task management
idev task create "title" --type feature --priority high
idev task list         # List all tasks
idev task ready        # Show actionable tasks (no blockers)
idev task show ID      # Show task details

# Configuration
idev config show       # Display current config
idev config set tier max-100  # Change subscription tier
idev config set personas.builder.instances 3  # Scale builders

# Monitoring
idev metrics           # Show usage stats
idev agents            # List all agents and status
```

## Configuration

Edit `.infinitedev/config.json` to customize:

```json
{
  "tier": "pro-20",
  "limits": {
    "window": 18000000,      // 5 hours in ms
    "prompts": 45,           // per window
    "weeklyHours": 60        // estimated weekly
  },
  "personas": {
    "architect": { "enabled": true, "instances": 1 },
    "builder": { "enabled": true, "instances": 2 },
    "tester": { "enabled": true, "instances": 1 },
    "reviewer": { "enabled": true, "instances": 1 },
    "lead-dev": { "enabled": true, "instances": 1 }
  }
}
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture Deep Dive](docs/architecture.md)
- [Agent Personas](docs/personas.md)
- [Rate Limit Management](docs/rate-limits.md)
- [API Reference](docs/api.md)
- [Troubleshooting](docs/troubleshooting.md)

## Components

- **Beads**: Git-backed issue tracker with dependency graphs (https://github.com/steveyegge/beads)
- **Gastown**: Multi-agent orchestration system (https://github.com/steveyegge/gastown)
- **PM2**: Process manager for 24/7 operation
- **SQLite**: State persistence for rate limit history

## Rate Limiting

### Phase 1C: Automatic Resume (Current)

The daemon now automatically resumes Claude Code when rate limits reset! ✨

**How it works:**
1. Detects rate limit errors in `~/.claude/debug/*.txt`
2. Shows console notification: "RATE LIMIT REACHED - Please pause Claude Code"
3. Records event in SQLite for recovery
4. Waits for 5-hour window to reset
5. **Automatically resumes Claude Code** using smart strategy selection:
   - **Strategy 1 (Preferred):** Sends "continue" prompt via tmux if Claude still running
   - **Strategy 2 (Fallback):** Restarts Claude Code with `claude --resume`
   - **Strategy 3 (Final):** Shows user notification if both fail

**No user action required for resume!** The daemon handles everything automatically.

### Automatic Resume Strategies

**Stdin Strategy** (requires tmux):
- Claude Code continues running after rate limit hit
- Daemon sends "continue" prompt via tmux
- Session state maintained, development resumes seamlessly

**Restart Strategy** (fallback):
- Claude Code exited after rate limit
- Daemon runs `claude --resume` in project directory
- User selects previous session to continue
- All context available via session history

**Notification Strategy** (final fallback):
- Both automatic strategies fail (edge case)
- Daemon shows notification asking user to resume manually
- Always available as last resort

### Configuration

Enable/disable auto-resume in `.infinitedev/config.json`:

```json
{
  "daemon": {
    "autoResume": true,
    "resumePrompt": "continue",
    "resumeStrategy": "auto"
  }
}
```

### Manual Status Check

```bash
# Check daemon status
idev status

# View rate limit history
sqlite3 .infinitedev/state.db "SELECT * FROM rate_limit_events ORDER BY timestamp DESC LIMIT 5;"

# Run test suite
node test-phase1c.js

# Debug mode
LOG_LEVEL=debug node src/daemon/index.js
```

### Future Phases

**Phase 1C-Beta** (Coming soon): Direct PTY write (no tmux required), automatic session selection
**Phase 1B** (Coming later): Working directory persistence, session ID tracking

## Multi-Agent Workflow

### Example: Building Authentication

```bash
$ idev task create "Build user authentication system" --type feature

# Mayor assigns to Architect
# Architect analyzes, creates design, decomposes into:
#   - Design auth schema (architecture task)
#   - Implement JWT service (blocks implementation)
#   - Add auth middleware (blocks implementation)
#   - Write auth tests (blocks on JWT + middleware)

# Mayor assigns schema design to Builder-1
# Builder-1 completes, unblocks JWT and middleware
# Mayor assigns to Builder-2 and available builders in parallel

# Tester validates, creates bug reports if needed
# Reviewer checks quality, approves

# System tracks all work in Beads with dependency graph
```

## Features

- ✅ 24/7 autonomous development
- ✅ **Automatic rate limit detection AND auto-resume** (Phase 1C)
  - Smart strategy selection (tmux stdin → restart → notify)
  - No manual "claude-code" commands needed
  - Works even while you sleep!
- ✅ Multi-agent orchestration with role specialization
- ✅ Git-backed task tracking with dependencies
- ✅ Zero manual intervention for pause/resume cycle
- ✅ Crash recovery with state persistence
- ✅ Real-time monitoring and manual control
- ✅ Customizable agent count and rate limits

## Troubleshooting

### Daemon not running
```bash
pm2 list
pm2 logs infinitedev-daemon
```

### Tasks not being assigned
```bash
# Check Mayor is running
pm2 status

# Check tasks in queue
idev task ready

# Check Mayor logs
idev logs
```

### Rate limit false positives
```bash
# Check daemon rate limit history
idev status

# Manually resume if needed
idev resume

# Adjust preemptive threshold
idev config set daemon.preemptiveThreshold 0.8
```

See [Troubleshooting Guide](docs/troubleshooting.md) for more details.

## Contributing

infiniteDEV is built on Gastown and Beads. Contributions welcome!

- Report issues on GitHub
- Submit PRs for improvements
- Share custom personas

## License

MIT - See LICENSE file

## Support

- GitHub Issues: Report bugs
- Discussions: Ask questions
- Docs: Read comprehensive guides

---

**Made with ❤️ to solve the rate limit problem** ⚡
