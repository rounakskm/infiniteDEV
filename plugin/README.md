# infiniteDEV Claude Code Plugin

Automatic session tracking for infiniteDEV rate limit management.

## What It Does

This plugin uses Claude Code's built-in hook system to automatically register and deregister your Claude Code sessions with the infiniteDEV daemon. This enables:

- **Automatic rate limit blocking** - If you hit rate limits, Claude Code won't start until the daemon gives clearance
- **Session tracking** - The daemon knows when you're working and can resume context properly
- **Zero manual steps** - Just run `claude-code` normally; everything happens behind the scenes

## Installation

### Automatic Installation

```bash
cd /path/to/infiniteDEV
./bin/install-plugin.sh
```

This will:
1. Copy plugin files to `~/.claude/plugins/infiniteDEV/`
2. Make hook scripts executable
3. Set environment variables for auto-start
4. Provide setup instructions

### Manual Installation

If you prefer to install manually:

```bash
# Create plugin directory
mkdir -p ~/.claude/plugins/infiniteDEV/hooks

# Copy files
cp plugin/manifest.json ~/.claude/plugins/infiniteDEV/
cp plugin/hooks/* ~/.claude/plugins/infiniteDEV/hooks/

# Make hooks executable
chmod +x ~/.claude/plugins/infiniteDEV/hooks/*.sh

# Set environment variable for auto-start (optional)
export INFINITEDEV_DAEMON_PATH="/path/to/infiniteDEV"
```

## After Installation

**Restart Claude Code** for the plugin to take effect. The hooks will be automatically loaded.

## How It Works

### SessionStart Hook

When you run `claude-code`:
1. Hook reads your session ID, working directory, and transcript path from Claude Code
2. Registers session with infiniteDEV daemon at `http://localhost:3030`
3. Checks if daemon has paused due to rate limits
4. **If paused**: Blocks Claude Code from starting with a clear message
5. **If not paused**: Allows session to continue normally

### SessionEnd Hook

When you exit Claude Code:
1. Hook deregisters your session from the daemon
2. Daemon records that session has ended
3. Session-specific rate limit data is preserved for potential resume

## Configuration

### Environment Variables

These can be set in your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
# Default daemon URL (optional - defaults to http://localhost:3030)
export INFINITEDEV_DAEMON_URL="http://localhost:3030"

# Path to infiniteDEV installation (enables auto-start of daemon)
export INFINITEDEV_DAEMON_PATH="/Users/you/AI-projects/infiniteDEV"
```

### Plugin Settings

You can customize plugin behavior in `~/.claude/settings.json`:

```json
{
  "plugins": {
    "infiniteDEV": {
      "daemonUrl": "http://localhost:3030",
      "autoStart": true,
      "daemonPath": "/Users/you/AI-projects/infiniteDEV"
    }
  }
}
```

## Usage

Once installed and Claude Code is restarted:

### Normal Usage

```bash
# Just run Claude Code normally
claude-code

# Behind the scenes:
# - SessionStart hook registers with daemon
# - Checks pause state
# - If not paused, session starts
# - On exit, SessionEnd hook deregisters
```

### When Rate Limit is Active

```bash
$ claude-code

infiniteDEV: Daemon not running, starting...
infiniteDEV: Session xyz-123 registered with infiniteDEV daemon.

============================================================
⚠️  Rate limit is active - Cannot start session
============================================================

The daemon will notify you when the rate limit resets.

Session blocked by infiniteDEV hook.
```

The daemon will send notifications when it's safe to resume (notification feature coming in Phase 2).

## Troubleshooting

### Plugin Not Loading

**Problem**: You run `claude-code` but don't see the registration message.

**Solution**:
1. Verify plugin was installed: `ls -la ~/.claude/plugins/infiniteDEV/`
2. Restart Claude Code (hooks only load on new sessions)
3. Check Claude Code logs for hook errors

### Daemon Not Found

**Problem**: Hook tries to auto-start daemon but fails.

**Solution**:
1. Set `INFINITEDEV_DAEMON_PATH` to your infiniteDEV installation
2. Or manually start daemon: `./bin/idev-start.sh start`
3. Or disable auto-start and start daemon yourself

### Registration Failing

**Problem**: Hook can't connect to daemon API.

**Solution**:
1. Check daemon is running: `./bin/idev-start.sh status`
2. Check daemon URL is correct: `curl http://localhost:3030/health`
3. Try manually: `curl -X POST http://localhost:3030/api/session/register ...`

## Uninstallation

To remove the plugin:

```bash
rm -rf ~/.claude/plugins/infiniteDEV
```

You can also remove the environment variable from your shell profile.

## Differences from Phase 1B Wrapper

| Feature | Phase 1B | Plugin |
|---------|----------|--------|
| Entry point | `./bin/claude-with-tracking.sh` | `claude-code` |
| User setup | Create alias | Run install script once |
| Transparency | Visible wrapper | Completely transparent |
| Works for all sessions | Only with wrapper | Always automatic |
| Integration | External wrapper | Native Claude hooks |

## Technical Details

### Hook Input Format

Claude Code provides hook scripts with JSON input on stdin:

```json
{
  "session_id": "abc-123-def",
  "transcript_path": "/path/to/transcript.txt",
  "cwd": "/current/working/directory",
  "permission_mode": "ask|allow",
  "hook_event_name": "SessionStart"
}
```

### API Requests

The hooks make these requests to the daemon:

**SessionStart** - `POST /api/session/register`
```json
{
  "sessionId": "abc-123-def",
  "workingDir": "/path/to/work",
  "pid": 12345,
  "startTime": 1707533000000,
  "transcriptPath": "/path/to/transcript.txt"
}
```

Response includes `isPaused` field to block if rate limited.

**SessionEnd** - `POST /api/session/end`
```json
{
  "sessionId": "abc-123-def",
  "reason": "session_end",
  "finalPromptCount": 0
}
```

### Files

- `manifest.json` - Plugin metadata and configuration schema
- `hooks/hooks.json` - Hook trigger configuration
- `hooks/register-session.sh` - SessionStart hook implementation
- `hooks/end-session.sh` - SessionEnd hook implementation

## Support

For issues or questions about the infiniteDEV plugin, see the main infiniteDEV documentation.
