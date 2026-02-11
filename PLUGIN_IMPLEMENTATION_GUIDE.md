# Plugin Implementation Guide

## Overview

This document describes the implementation of automatic session registration for Claude Code using the infiniteDEV plugin system.

## What Was Implemented

Created a complete Claude Code plugin that automatically registers/deregisters sessions using hooks, eliminating the need for wrapper scripts.

### Files Created

```
infiniteDEV/
├── plugin/
│   ├── manifest.json                    (Plugin metadata & settings schema)
│   ├── hooks/
│   │   ├── hooks.json                  (Hook event configuration)
│   │   ├── register-session.sh         (SessionStart hook - registers with daemon)
│   │   └── end-session.sh              (SessionEnd hook - deregisters from daemon)
│   └── README.md                        (Plugin user guide)
└── bin/
    └── install-plugin.sh               (One-time installation script)
```

## Architecture

### Plugin Structure

The plugin follows Claude Code's standard plugin format:

```
~/.claude/plugins/infiniteDEV/
├── manifest.json              (required - plugin metadata)
├── hooks/
│   ├── hooks.json            (hook event triggers)
│   ├── register-session.sh   (executable script)
│   └── end-session.sh        (executable script)
└── README.md                 (documentation)
```

### How It Works

```
User runs: claude-code
    ↓
Claude Code initializes
    ↓
[SessionStart hook triggers]
    ↓
register-session.sh runs
    - Reads session info from stdin (JSON)
    - Calls daemon POST /api/session/register
    - Checks if pause/rate limit is active
    - Blocks (exit 2) if paused, allows (exit 0) if not
    ↓
Session starts (if not blocked)
    ↓
User uses Claude Code
    ↓
Session ends
    ↓
[SessionEnd hook triggers]
    ↓
end-session.sh runs
    - Reads session info from stdin
    - Calls daemon POST /api/session/end
    - Non-blocking (always exit 0)
    ↓
Claude Code exits
```

## Hook Configuration Details

### SessionStart Hook

**File**: `plugin/hooks/hooks.json` (SessionStart section)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/register-session.sh",
          "timeout": 10,
          "description": "Register session with infiniteDEV daemon"
        }]
      }
    ]
  }
}
```

**Key Points**:
- `matcher: "*"` - Apply hook to ALL sessions (all projects, all directories)
- `timeout: 10` - Give hook 10 seconds to complete (enough for auto-start + registration)
- `type: "command"` - Execute a bash script
- `${CLAUDE_PLUGIN_ROOT}` - Path variable automatically expanded by Claude Code

**Hook Input** (stdin):
```json
{
  "session_id": "abc-123-def",
  "transcript_path": "/full/path/to/transcript.txt",
  "cwd": "/current/working/directory",
  "permission_mode": "ask|allow",
  "hook_event_name": "SessionStart"
}
```

**Hook Output** (stdout):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Session abc-123 registered with infiniteDEV daemon.",
    "blocked": false
  }
}
```

**Exit Codes**:
- `0` - Success (allow session to continue)
- `2` - Blocking error (prevent session start)

### SessionEnd Hook

**File**: `plugin/hooks/hooks.json` (SessionEnd section)

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/end-session.sh",
          "timeout": 5,
          "description": "Deregister session from infiniteDEV daemon"
        }]
      }
    ]
  }
}
```

**Key Points**:
- Runs when session ends (user exits or error)
- Non-blocking (always `exit 0`)
- Shorter timeout (5s) since it's best-effort

## Hook Scripts Implementation

### register-session.sh

**Purpose**: Register session with daemon and check pause state

**Steps**:
1. Read hook input from stdin (session ID, working dir, transcript path)
2. Get daemon URL from environment variable `INFINITEDEV_DAEMON_URL` (default: `http://localhost:3030`)
3. Check if daemon is running (`GET /health`)
4. If daemon not running:
   - Get daemon path from environment variable `INFINITEDEV_DAEMON_PATH`
   - Auto-start daemon if path is configured: `${DAEMON_PATH}/bin/idev-start.sh start`
   - Wait 2 seconds for daemon to start
5. Register session: `POST /api/session/register` with:
   - `sessionId`: Claude's session ID
   - `workingDir`: Current working directory
   - `pid`: Hook process PID ($$)
   - `startTime`: Current timestamp in milliseconds
   - `transcriptPath`: Path to transcript file
6. Parse response and check `isPaused` field
7. If paused:
   - Output JSON with `"blocked": true`
   - Exit with code 2 (blocking error) - prevents Claude Code from starting
8. If not paused:
   - Output JSON with success message
   - Exit with code 0 (allow session)
9. If daemon unreachable:
   - Exit with code 0 (non-blocking - let session continue)
   - Log error message to stderr

**Environment Variables**:
- `INFINITEDEV_DAEMON_URL` - Daemon API URL (default: `http://localhost:3030`)
- `INFINITEDEV_DAEMON_PATH` - Path to infiniteDEV project (for auto-start)

**Dependencies**:
- `bash` - Script interpreter
- `jq` - JSON parsing (to extract hook input fields)
- `curl` - HTTP requests to daemon API
- `date` - Generate timestamps

### end-session.sh

**Purpose**: Deregister session from daemon

**Steps**:
1. Read hook input from stdin
2. Extract session ID
3. Get daemon URL from environment variable (default: `http://localhost:3030`)
4. Deregister session: `POST /api/session/end` with:
   - `sessionId`: Claude's session ID
   - `reason`: "session_end"
   - `finalPromptCount`: 0
5. Ignore any errors (best-effort)
6. Always exit with code 0 (non-blocking)

**Dependencies**:
- `bash` - Script interpreter
- `jq` - JSON parsing
- `curl` - HTTP requests

## API Endpoints Used

### Registration Endpoint

**Request**: `POST /api/session/register`

```json
{
  "sessionId": "abc-123-def",
  "workingDir": "/Users/you/AI-projects/myproject",
  "pid": 12345,
  "startTime": 1707533000000,
  "transcriptPath": "/Users/you/.claude/sessions/abc-123-def/transcript.txt"
}
```

**Response**:
```json
{
  "sessionId": "abc-123-def",
  "isPaused": false,
  "pauseReason": null,
  "registeredAt": 1707533000000,
  "message": "Session registered"
}
```

If `isPaused: true`, the session should be blocked (hook exits with code 2).

### Deregistration Endpoint

**Request**: `POST /api/session/end`

```json
{
  "sessionId": "abc-123-def",
  "reason": "session_end",
  "finalPromptCount": 0
}
```

**Response**:
```json
{
  "sessionId": "abc-123-def",
  "message": "Session ended"
}
```

### Health Endpoint

**Request**: `GET /health`

**Response**: `200 OK` (or error)

Used to check if daemon is running before attempting registration.

## Installation Process

### Automatic Installation

```bash
cd /path/to/infiniteDEV
./bin/install-plugin.sh
```

**What it does**:
1. Creates `~/.claude/plugins/infiniteDEV/` directory
2. Copies all plugin files from `plugin/` to plugin directory
3. Sets execute permissions on hook scripts
4. Adds `INFINITEDEV_DAEMON_PATH` to shell profile (for auto-start)

### Manual Installation

```bash
# Create directory
mkdir -p ~/.claude/plugins/infiniteDEV/hooks

# Copy files
cp plugin/manifest.json ~/.claude/plugins/infiniteDEV/
cp plugin/hooks/* ~/.claude/plugins/infiniteDEV/hooks/
cp plugin/README.md ~/.claude/plugins/infiniteDEV/

# Make executable
chmod +x ~/.claude/plugins/infiniteDEV/hooks/*.sh

# Set environment variable (optional)
export INFINITEDEV_DAEMON_PATH="/path/to/infiniteDEV"
```

## Configuration

### Environment Variables

Users can set environment variables to customize behavior:

```bash
# In ~/.bashrc, ~/.zshrc, or ~/.profile
export INFINITEDEV_DAEMON_URL="http://localhost:3030"          # Default
export INFINITEDEV_DAEMON_PATH="/Users/you/AI-projects/infiniteDEV"  # For auto-start
```

### Plugin Settings

Alternative: Users can configure in `~/.claude/settings.json`:

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

(Note: Hook input parameter support for plugin settings depends on Claude Code version)

## Manifest.json

**File**: `plugin/manifest.json`

```json
{
  "schemaVersion": "1.0",
  "name": "infiniteDEV",
  "displayName": "infiniteDEV Session Tracking",
  "version": "1.0.0",
  "description": "Automatically tracks Claude Code sessions with infiniteDEV daemon",
  "author": "infiniteDEV",
  "capabilities": {
    "hooks": true
  },
  "settings": {
    "daemonUrl": {
      "type": "string",
      "default": "http://localhost:3030",
      "description": "infiniteDEV daemon API URL"
    },
    "autoStart": {
      "type": "boolean",
      "default": true,
      "description": "Auto-start daemon if not running"
    },
    "daemonPath": {
      "type": "string",
      "default": "",
      "description": "Path to infiniteDEV installation"
    }
  }
}
```

**Key Sections**:
- `name`: Internal identifier (used in settings)
- `displayName`: User-friendly name
- `version`: Plugin version
- `capabilities.hooks`: Declares this plugin uses hooks
- `settings`: Configuration schema (shown to users in Claude Code UI)

## Testing the Plugin

### Prerequisite Setup

1. Install plugin: `./bin/install-plugin.sh`
2. Start daemon: `./bin/idev-start.sh start`
3. Restart Claude Code (new session)

### Test 1: Verify Plugin Installation

```bash
# Check files exist
ls -la ~/.claude/plugins/infiniteDEV/
# Should show:
# - manifest.json
# - hooks/hooks.json
# - hooks/register-session.sh (executable)
# - hooks/end-session.sh (executable)
# - README.md
```

### Test 2: Verify Session Registration

```bash
# Start Claude Code (in new session)
claude-code

# In another terminal, check daemon logs
tail -f .infinitedev/health.log
# Should show something like:
# [SessionAPI] Registered Claude Code session: abc-123-def (PID: 12345)

# Check database
sqlite3 .infinitedev/state.db \
  "SELECT * FROM kv_store WHERE key LIKE 'session:%';"
# Should show registered session
```

### Test 3: Pause Blocking

```bash
# Set pause state in database
sqlite3 .infinitedev/state.db << EOF
INSERT OR REPLACE INTO kv_store (key, value) VALUES (
  'pause',
  '{"pausedAt": $(date +%s)000, "resumeAt": $(($(date +%s) + 300))000, "reason": "TEST"}'
);
EOF

# Try to start Claude Code in new session
# Should show message: "Rate limit is active - Cannot start session"

# Clear pause state
sqlite3 .infinitedev/state.db "DELETE FROM kv_store WHERE key='pause';"
```

### Test 4: Session Deregistration

```bash
# Start Claude Code
claude-code

# Use it normally, then exit gracefully

# Check logs
tail .infinitedev/health.log
# Should show:
# [SessionAPI] Session abc-123 ended: session_end

# Check database
sqlite3 .infinitedev/state.db "SELECT * FROM kv_store WHERE key='active_session';"
# Should be different or null
```

## Differences from Phase 1B Wrapper

| Aspect | Phase 1B Wrapper | Plugin (New) |
|--------|------------------|--------------|
| **User Command** | `./bin/claude-with-tracking.sh` | `claude-code` |
| **Setup** | Create alias in shell profile | One-time: `./bin/install-plugin.sh` |
| **How It Works** | External wrapper script | Built-in Claude Code hooks |
| **Session ID** | Wrapper-generated | Claude Code's native ID |
| **Transparency** | Visible wrapper in help | Completely transparent |
| **Auto-start** | Built into wrapper | Built into hook scripts |
| **Works for** | Only with wrapper | All Claude Code sessions |
| **Installation** | Manual alias setup | Automated script |
| **PATH Issues** | Can fail if claude-code not in PATH | None (uses Claude's internal session data) |

## Implementation Quality

### Code Quality
- ✅ All bash scripts validate syntax with `bash -n`
- ✅ Proper error handling (set -euo pipefail)
- ✅ Non-blocking failures (exit 0 on daemon errors)
- ✅ Clear error messages to stderr
- ✅ Proper JSON output format
- ✅ Comments explain each step

### Robustness
- ✅ Handles daemon not running (auto-start)
- ✅ Handles daemon not reachable (non-blocking)
- ✅ Handles missing jq (script will still work)
- ✅ Handles missing curl (script will fail safely)
- ✅ Handles invalid JSON (jq handles gracefully)

### Integration
- ✅ Uses Claude Code's standard hook system
- ✅ Uses standard plugin directory structure
- ✅ Uses standard manifest.json format
- ✅ Compatible with Claude Code's plugin UI
- ✅ No changes to Phase 1B daemon API required

### User Experience
- ✅ Zero configuration needed (works out-of-box)
- ✅ Optional configuration via environment variables
- ✅ Clear messages when rate limited
- ✅ No visible wrapper script
- ✅ Works for all Claude Code sessions
- ✅ One-time installation

## Future Enhancements

### Phase 2 Features
1. **Per-session pause states** - Different pause states for different sessions
2. **Notifications** - Notify when rate limit resets (native Claude notification API)
3. **Session priority** - Allow some sessions to bypass rate limits
4. **Detailed stats** - Show prompt usage in real-time

### Phase 3 Features
1. **Web UI for rate limit management** - Graphical pause/resume
2. **Slack integration** - Notifications and commands via Slack
3. **Team mode** - Share rate limits across team members
4. **Advanced scheduling** - Pause on specific hours/days

## Troubleshooting Guide

### Plugin Not Loading

**Symptoms**: Run `claude-code`, don't see infiniteDEV messages

**Causes & Solutions**:
1. Plugin not installed: Run `./bin/install-plugin.sh`
2. Old Claude Code session: Restart Claude Code (hooks load on session start)
3. Plugin directory permission: Check `ls -la ~/.claude/plugins/infiniteDEV/`
4. Hooks not executable: Run `chmod +x ~/.claude/plugins/infiniteDEV/hooks/*.sh`

### Daemon Auto-start Not Working

**Symptoms**: Hook tries to start daemon but fails

**Causes & Solutions**:
1. `INFINITEDEV_DAEMON_PATH` not set: Run `./bin/install-plugin.sh` or manually set it
2. `idev-start.sh` not found: Check path is correct
3. Daemon won't start: Try manually: `./bin/idev-start.sh start`

### Registration Fails

**Symptoms**: Hook can't connect to daemon

**Causes & Solutions**:
1. Daemon not running: `./bin/idev-start.sh start`
2. Wrong URL: Check `INFINITEDEV_DAEMON_URL` (default OK)
3. Port 3030 in use: `lsof -i :3030` to check
4. Firewall/network: Check connectivity: `curl http://localhost:3030/health`

### Pause Doesn't Block

**Symptoms**: Session starts even though pause is set

**Causes & Solutions**:
1. Pause format wrong: Check database directly
2. Time comparison off: Verify timestamps in milliseconds
3. Hook not running: Check Claude Code version supports SessionStart hooks

## Summary

The infiniteDEV plugin provides automatic session tracking using Claude Code's native hooks system. Users run `claude-code` normally, and the plugin handles everything behind the scenes - registration, pause detection, and deregistration. No wrapper scripts, no aliases, no configuration needed.

Key files:
- `plugin/manifest.json` - Plugin metadata
- `plugin/hooks/hooks.json` - Hook triggers
- `plugin/hooks/register-session.sh` - SessionStart hook
- `plugin/hooks/end-session.sh` - SessionEnd hook
- `bin/install-plugin.sh` - Installation script

The implementation is backward compatible with Phase 1B (wrapper still works) and requires no changes to the existing daemon API.
