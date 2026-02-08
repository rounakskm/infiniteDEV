# Getting Started with infiniteDEV

## Installation

### Prerequisites

- Node.js 16+
- Git
- Go 1.23+
- tmux 3.0+

### Quick Start

```bash
git clone https://github.com/yourusername/infiniteDEV.git
cd infiniteDEV
./install.sh
```

The installation script will:
1. Check all prerequisites
2. Install Claude Code, Beads, Gastown, and PM2
3. Initialize Beads and Gastown
4. Configure default agent personas
5. Start all services automatically

### Verify Installation

```bash
idev status
```

You should see:
- ✓ Daemon running
- ✓ Health API running
- ✓ Mayor running

## Your First Task

### 1. Create a Task

```bash
idev task create "Build a simple REST API" --type feature --priority high
```

This creates a task and the Mayor assigns it to the Architect.

### 2. Check Task Status

```bash
idev task ready
```

This shows tasks ready for implementation (no blockers).

### 3. Check Logs

```bash
idev logs
```

Watch the agents work in real-time.

### 4. Monitor Progress

```bash
idev status
```

Shows system status, active agents, and next ready tasks.

## Understanding the Workflow

### 1. User Creates Task
```bash
idev task create "Build user auth system" --type feature
```

### 2. Mayor Assigns to Architect
- Mayor polls `bd ready` every 30 seconds
- Architect gets the task in its hook
- Architect analyzes requirements

### 3. Architect Decomposes Work
Architect creates sub-tasks:
- Design auth schema (architecture)
- Implement JWT service (blocks implementation)
- Add auth middleware (blocks implementation)
- Write auth tests (blocks on implementation)

### 4. Builders Execute Implementation
- Builder-1: Implements schema design
- Builder-2: Waits for blocker, then implements JWT
- Task dependencies ensure correct order

### 5. Tester Validates
- Writes comprehensive tests
- If bugs found: creates bug reports
- Otherwise: marks tests complete

### 6. Reviewer Approves
- Reviews code quality
- If issues: creates refactor tasks
- If approved: marks complete

### 7. LeadDev Monitors
- Watches task flow
- Unblocks any issues
- Chills when no work available
- Ready for user interaction

## Rate Limit Management

### Automatic Detection

The daemon automatically:
1. Monitors Claude API usage
2. Detects when limits are reached
3. Pauses the Mayor
4. Waits for limits to reset
5. Automatically resumes

No manual intervention needed!

### Manual Control

```bash
# Manually pause
idev pause

# Check status
idev status

# Resume when ready
idev resume
```

### Configuration

```bash
# Change subscription tier
idev config set tier max-100

# Adjust preemptive threshold
idev config set daemon.preemptiveThreshold 0.85

# View current config
idev config show
```

## Common Commands

### Task Management

```bash
# Create tasks
idev task create "Title" --type feature --priority high
idev task create "Bug: Something broke" --type bug

# View tasks
idev task list                    # All tasks
idev task ready                   # Ready to work on
idev task show bd-a1b2c          # Task details

# Update status
bd update bd-a1b2c --status completed  # (direct Beads command)
```

### System Control

```bash
# Service management
idev start                        # Start daemon
idev stop                         # Stop daemon
idev restart                      # Restart daemon

# Monitoring
idev status                       # System status
idev logs                         # View logs
idev logs --component daemon      # Daemon logs only
idev metrics                      # Usage metrics
idev agents                       # List agents
```

### Configuration

```bash
idev config show                  # Show config
idev config set key value        # Update setting
idev config reset                # Reset to defaults
```

## Scaling the System

### Add More Builders

By default, there are 2 builders. Add more for parallelism:

```bash
idev config set personas.builder.instances 4
```

Then restart services:

```bash
idev restart
```

### Adjust Rate Limits

If you have a higher-tier subscription:

```bash
idev config set tier max-200
```

This changes the prompt limit from 45 to 800 per 5 hours.

## Troubleshooting

### Services Won't Start

```bash
# Check PM2 status
pm2 list

# View error logs
pm2 logs infinitedev-daemon
pm2 logs infinitedev-mayor
pm2 logs infinitedev-health
```

### Tasks Not Being Assigned

```bash
# Check ready tasks
idev task ready

# View Mayor logs
idev logs --component mayor

# Check if Mayor is running
pm2 list | grep mayor
```

### Rate Limit False Positives

```bash
# Check daemon rate limit history
idev status

# Manually resume
idev resume

# View daemon logs for details
pm2 logs infinitedev-daemon --lines 100
```

### Need Help?

- Check [docs/architecture.md](architecture.md) for system design
- See [docs/personas.md](personas.md) for agent details
- Read [docs/troubleshooting.md](troubleshooting.md) for common issues

## Next Steps

1. Create your first feature task
2. Watch agents decompose and implement it
3. Monitor progress with `idev status`
4. Iterate and add more tasks
5. Customize personas and rate limits as needed

## Key Files

- `.infinitedev/config.json` - Configuration
- `.infinitedev/state.db` - Rate limit history and state
- `.beads/issues.jsonl` - Task ledger (git-tracked)
- `.gastown/` - Agent worktrees and hooks

## Performance Tips

1. **Batch Tasks**: Create related tasks together so Architect can optimize
2. **Clear Descriptions**: More detail = better decomposition
3. **Monitor Logs**: Watch `idev logs` to understand agent behavior
4. **Adjust Personas**: Customize prompt for your domain
5. **Review Metrics**: Check `idev metrics` to see agent efficiency

---

**Ready to build something awesome?** 🚀

```bash
idev task create "Your next big feature" --type feature --priority high
```
