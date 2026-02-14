# Real-World Plugin Test Guide

## Test Overview

We'll verify that the plugin automatically registers sessions by:
1. Starting a new Claude Code session in another terminal
2. Monitoring daemon logs and database in real-time
3. Verifying registration, pause blocking, and deregistration

## Prerequisites

✅ Plugin installed: `~/.claude/plugins/infiniteDEV/`
✅ Daemon running: `./bin/idev-start.sh start`

## Test 1: Verify Session Registration

### Setup
Open **TWO terminals** side-by-side. We'll call them:
- **Terminal A** (this one) - Monitor logs & database
- **Terminal B** (new one) - Start Claude Code

### Terminal A: Monitor Logs in Real-Time

Run this to watch logs as they happen:
```bash
cd /Users/rounakskm/AI-projects/infiniteDEV
tail -f .infinitedev/health.log
```

Watch for:
```
[SessionAPI] Registered Claude Code session: <SESSION-ID> (PID: <PID>)
```

### Terminal B: Start New Claude Code Session

In the other terminal, run:
```bash
claude-code
```

**Important**: You MUST start a completely NEW Claude Code session (not resume this one).

### Expected Result

In **Terminal A**, within a few seconds you should see:
```
[SessionAPI] Registered Claude Code session: abc-123-def (PID: 12345)
```

This proves the **SessionStart hook worked** and registered the session!

---

## Test 2: Check SQLite Database

### Terminal A: Query the Database

While your new Claude Code session is running in Terminal B, run this in Terminal A:

```bash
# Check registered sessions
sqlite3 .infinitedev/state.db "SELECT key FROM kv_store WHERE key LIKE 'session:%' ORDER BY key;"

# Should show:
# session:abc-123-def
# session:previous-session-1
# session:previous-session-2
# etc.
```

Then check the active session:
```bash
sqlite3 .infinitedev/state.db "SELECT key, value FROM kv_store WHERE key='active_session';"

# Should show:
# active_session | abc-123-def
```

### Expected Result

You should see:
1. A new session registered in `kv_store`
2. `active_session` key updated to the new session ID

This proves the **session data persisted correctly**!

---

## Test 3: Verify Session Deregistration on Exit

### Terminal B: Exit Claude Code

In Terminal B, exit Claude Code normally:
```
/exit
```

Or press Ctrl+D

### Terminal A: Watch Logs

Back in Terminal A, you should see:
```
[SessionAPI] Session abc-123-def ended: user_exit
```

### Check Database After Exit

```bash
# Check if session is still in database
sqlite3 .infinitedev/state.db "SELECT key FROM kv_store WHERE key='session:abc-123-def';"

# Should still be there (historical record preserved)

# Check active_session
sqlite3 .infinitedev/state.db "SELECT key, value FROM kv_store WHERE key='active_session';"

# Should be empty or null (no active session now)
```

### Expected Result

1. Logs show: `[SessionAPI] Session <id> ended: user_exit`
2. Session record preserved in database
3. `active_session` cleared

This proves the **SessionEnd hook worked** and cleaned up correctly!

---

## Test 4: Test Pause Blocking

### Setup: Enable Pause State

In Terminal A, set the pause state:
```bash
sqlite3 .infinitedev/state.db << EOF
INSERT OR REPLACE INTO kv_store (key, value) VALUES (
  'pause',
  '{
    "pausedAt": $(date +%s)000,
    "resumeAt": $(($(date +%s) + 600))000,
    "reason": "TEST: Pause blocking verification"
  }'
);
EOF

# Verify it was set
sqlite3 .infinitedev/state.db "SELECT value FROM kv_store WHERE key='pause';"
```

### Terminal B: Try to Start Claude Code

Try to start a NEW Claude Code session:
```bash
claude-code
```

### Expected Result

Claude Code should **NOT start** and you should see a message like:
```
infiniteDEV: Session xyz-123 registered with infiniteDEV daemon.

============================================================
⚠️  Rate limit is active - Cannot start session
============================================================

The daemon will notify you when the rate limit resets.

Session blocked by infiniteDEV hook.
```

This proves the **pause blocking works**! The hook successfully blocked the session.

### Clear Pause State

When done testing, clear the pause state:
```bash
# In Terminal A:
sqlite3 .infinitedev/state.db "DELETE FROM kv_store WHERE key='pause';"

# Verify it's gone
sqlite3 .infinitedev/state.db "SELECT value FROM kv_store WHERE key='pause';"
```

---

## Test 5: Verify Auto-Start Daemon

### Setup: Stop the Daemon

```bash
# In Terminal A:
./bin/idev-start.sh stop
sleep 2
./bin/idev-start.sh status

# Should show: Daemon: ✗ Not running
```

### Start Claude Code

In Terminal B, start a new Claude Code session:
```bash
claude-code
```

### Expected Result

1. The hook runs (SessionStart)
2. Hook detects daemon not running
3. Hook auto-starts daemon using `INFINITEDEV_DAEMON_PATH`
4. Waits 2 seconds for daemon to start
5. Claude Code session starts and registers

Check Terminal A logs:
```bash
tail -20 .infinitedev/health.log
# Should show daemon starting and session registering
```

This proves **auto-start works**!

---

## Quick Test Summary

| Test | Expected Outcome | Pass/Fail |
|------|-----------------|-----------|
| **Test 1: Registration** | New session in logs | ✓ or ✗ |
| **Test 2: Database** | Session in SQLite | ✓ or ✗ |
| **Test 3: Deregistration** | Session end logged | ✓ or ✗ |
| **Test 4: Pause Blocking** | Session blocked | ✓ or ✗ |
| **Test 5: Auto-Start** | Daemon auto-started | ✓ or ✗ |

---

## Troubleshooting

### Hook Not Triggering

**Symptoms**: No log entries when starting Claude Code

**Causes**:
1. Plugin not installed correctly
2. Old Claude Code session (hooks load on new sessions)
3. Hook script not executable

**Solutions**:
```bash
# Verify installation
ls -lh ~/.claude/plugins/infiniteDEV/hooks/

# Should show:
# -rwxr-xr-x register-session.sh  (executable)
# -rwxr-xr-x end-session.sh       (executable)

# If not executable, fix:
chmod +x ~/.claude/plugins/infiniteDEV/hooks/*.sh

# RESTART Claude Code (must be a NEW session)
```

### Daemon Not Reachable

**Symptoms**: Hook errors about daemon not reachable

**Causes**:
1. Daemon not running
2. Wrong daemon URL
3. Port 3030 in use

**Solutions**:
```bash
# Check daemon
./bin/idev-start.sh status

# Start if stopped
./bin/idev-start.sh start

# Check port
lsof -i :3030

# Verify endpoint
curl http://localhost:3030/health
```

### Sessions Not in Database

**Symptoms**: Register hook runs but session not in database

**Causes**:
1. Daemon crashed
2. Database locked
3. Bad JSON response

**Solutions**:
```bash
# Check daemon logs
tail -50 .infinitedev/health.log

# Verify database accessible
sqlite3 .infinitedev/state.db "SELECT COUNT(*) FROM kv_store;"

# Restart daemon
./bin/idev-start.sh restart
```

---

## Manual Hook Testing (If Needed)

If you want to test the hook scripts directly:

### Test register-session.sh

```bash
cat > /tmp/test-hook.json << 'EOF'
{
  "session_id": "manual-test-123",
  "transcript_path": "/tmp/transcript.txt",
  "cwd": "/Users/rounakskm/AI-projects/infiniteDEV",
  "permission_mode": "allow",
  "hook_event_name": "SessionStart"
}
EOF

# Run the hook
cat /tmp/test-hook.json | bash ~/.claude/plugins/infiniteDEV/hooks/register-session.sh

# Should output JSON with registration confirmation
```

### Check Result

```bash
# Verify session was registered
sqlite3 .infinitedev/state.db \
  "SELECT * FROM kv_store WHERE key='session:manual-test-123';"
```

---

## Success Criteria

✅ **All of the following must be true**:

1. Plugin installs without errors
2. New Claude Code sessions register in daemon logs
3. Sessions appear in SQLite database
4. Sessions deregister cleanly on exit
5. Pause state successfully blocks sessions
6. Daemon auto-starts if configured
7. All without user manual intervention

---

## Next Steps After Successful Test

If all tests pass:
1. ✅ Plugin is working correctly
2. ✅ Users can install and use it
3. ✅ Ready for production deployment

If any tests fail:
1. Check troubleshooting section
2. Review logs in `.infinitedev/health.log`
3. Verify SQLite database is accessible
4. Check hook script permissions

---

**Good luck with testing!** The plugin should just work seamlessly once Claude Code restarts.
