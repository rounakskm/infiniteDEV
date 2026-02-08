# infiniteDEV

24/7 autonomous development with Claude Code, intelligent rate limit management, and multi-agent orchestration.

## Overview

infiniteDEV solves the 5-hour limit problem by:

- **Continuous Operation**: Runs 24/7 across rate limit windows
- **Automatic Pause/Resume**: Detects limits, pauses work, auto-resumes when quota refreshes
- **Multi-Agent Orchestration**: Specialized agents (Architect, Builders, Tester, Reviewer, LeadDev) work in parallel
- **Smart Task Management**: Beads git-backed issue tracker with dependency graphs
- **Easy Onboarding**: Single `./install.sh` script sets up everything

## Quick Start

### Prerequisites

- Node.js 16+
- Git
- Go 1.23+
- tmux 3.0+

### Installation

```bash
git clone https://github.com/yourusername/infiniteDEV.git
cd infiniteDEV
./install.sh
```

This installs all dependencies, initializes services, and starts the daemon.

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

### Architecture

```
┌─ User creates task via idev CLI
│
├─ Beads tracks task (git-backed ledger with dependencies)
│
├─ Mayor polls "ready tasks" every 30s
│
├─ Mayor routes tasks to specialized agents:
│  ├─ Architect: designs, decomposes work
│  ├─ Builders: implement features (2 instances)
│  ├─ Tester: validates, writes tests
│  ├─ Reviewer: quality gate
│  └─ LeadDev: coordinates, chills when idle
│
├─ Daemon monitors rate limits (5-hour, weekly)
│  └─ On limit: pauses Mayor
│  └─ On reset: auto-resumes Mayor
│
└─ Agents update tasks as they complete
```

### Rate Limit Detection

Three-layer hybrid detection:

1. **Log Monitoring**: Tail logs for "rate limit exceeded" errors
2. **API Headers**: Check `X-RateLimit-Remaining` from Claude API
3. **Heuristic**: Count prompts, preemptively pause at 90% of limit

Tiers supported (customizable):
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

### Automatic Detection

The daemon automatically detects when you hit rate limits and:
1. Logs the event
2. Pauses the Mayor (stops task assignment)
3. Calculates when limits refresh
4. Schedules automatic resume

### Manual Override

```bash
# Manually pause
idev pause

# Check status
idev status

# Resume when ready
idev resume
```

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
- ✅ Automatic rate limit detection and pause/resume
- ✅ Multi-agent orchestration with role specialization
- ✅ Git-backed task tracking with dependencies
- ✅ Zero manual intervention (mostly)
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
