# Phase 1C: Automatic Resume Implementation

## Overview

Phase 1C implements automatic resumption of Claude Code when rate limits reset. This eliminates the need for manual intervention after a rate limit pause.

**Status**: ✅ Phase 1C-Alpha Complete

## Architecture

### Two Resume Strategies

#### Strategy 1: Stdin Resume (Preferred)
- **When**: Claude Code terminal still open after rate limit
- **How**: Daemon detects Claude Code process is running and sends "continue" prompt to its stdin via tmux
- **Advantage**: No need to restart, maintains session state
- **Requirement**: Claude Code must be running in a tmux session

#### Strategy 2: Restart Resume (Fallback)
- **When**: Claude Code has exited completely
- **How**: Daemon runs `claude --resume` in the working directory
- **Advantage**: Works even if user closed terminal
- **Requirement**: Claude Code must have a recent session in `~/.claude/history.jsonl`

#### Strategy 3: User Notification (Final Fallback)
- **When**: Both automatic strategies fail
- **How**: Display notification asking user to manually resume
- **Always works**: User can always manually start Claude Code

## Implementation Details

### New Methods in ClaudeController

#### `detectResumeStrategy()`
Determines which resume strategy to use based on:
- Whether Claude Code is running (`ps aux | grep claude`)
- Whether Claude Code has active sessions (`~/.claude/history.jsonl`)

Returns: `{strategy, processes, lastSession, canResume, reason}`

#### `findClaudeTmuxSession()`
Searches for Claude Code running in tmux sessions:
- Checks `tmux list-sessions` for claude-named sessions
- Checks all sessions for Claude processes
- Returns tmux session name or null

#### `sendStdinToClaude(prompt = 'continue')`
Sends input to Claude Code via tmux:
- Uses `tmux send-keys -t <session> "prompt" Enter`
- Returns success/failure with method details

#### `restartClaude(workingDir)`
Spawns new Claude Code process:
- Runs `spawn('claude', ['--resume'], {cwd: workingDir})`
- Passes stdio through to user's terminal
- Returns PID and success status

#### `resumeClaudeCode(options = {})`
Unified resume logic with automatic fallback:
1. Try stdin strategy (if running)
2. Fall back to restart strategy (if session exists)
3. Fall back to user notification (always succeeds)

### Daemon Integration

**In `daemon/index.js`**:

- `handleRateLimit()`: Notifies user that rate limit was hit, schedules auto-resume
- `resumeOperations()`: Calls `claudeController.resumeClaudeCode()` with options
- Passes configuration: `resumePrompt`, `workingDir`, `resumeStrategy`

## Configuration

**In `.infinitedev/config.json`**:

```json
{
  "daemon": {
    "autoResume": true,
    "resumePrompt": "continue",
    "resumeStrategy": "auto"
  },
  "claude": {
    "workingDir": null,
    "debugLogDir": "~/.claude/debug",
    "historyFile": "~/.claude/history.jsonl"
  }
}
```

**Configuration Options**:
- `autoResume`: Enable/disable automatic resume (default: true)
- `resumePrompt`: Custom prompt to send (default: "continue")
- `resumeStrategy`: "auto", "stdin", "restart", or "notify" (default: "auto")
- `claude.workingDir`: Working directory for `claude --resume` (auto-detected if null)

## Testing

### Test Suite

Run the test script to verify functionality:

```bash
node test-phase1c.js
```

This tests:
- Resume strategy detection
- Tmux session detection
- Claude Code process detection
- Active session detection

### Manual Testing

#### Test 1: Stdin Resume (tmux scenario)
```bash
# Start Claude Code in tmux
tmux new -s claude
claude-code

# In another terminal, trigger rate limit and wait for reset
# Daemon should detect Claude running and send "continue" via tmux
```

#### Test 2: Restart Resume (non-tmux scenario)
```bash
# Start Claude Code normally
claude-code

# Exit immediately after rate limit hit
# Daemon should detect Claude exited and run `claude --resume`
```

#### Test 3: Notification Fallback
```bash
# Start Claude Code and exit before rate limit
# Delete session from history
rm ~/.claude/history.jsonl

# When rate limit resets, daemon shows notification
```

## How It Works

### Timeline Example

```
Time 0:00
- User starts daemon and Claude Code
- [Daemon] Rate limit daemon started
- [Claude] User developing...

Time 4:50 (approaching limit)
- [Daemon] Detecting ~90% usage, preemptive pause enabled
- Claude Code continues (no action yet)

Time 5:00 (rate limit hits)
- [Daemon] Rate limit threshold reached
- [Daemon] User notified to pause Claude Code
- User leaves terminal open or closes it
- Daemon logs: "Will attempt auto-resume in ~5 hours"
- setTimeout(() => resumeOperations(), 18000000ms)

Time 10:00 (5 hours later)
- resumeOperations() triggered
- detectResumeStrategy() checks:
  - Is Claude Code still running? → YES
  - Is it in tmux? → YES (example)
- sendStdinToClaude() executes:
  - tmux send-keys -t claude "continue" Enter
  - [Claude] Processes user input "continue"
  - [Claude] Continues development work
- [Daemon] Auto-resume successful via stdin

Alternative (if Claude exited):
- detectResumeStrategy() checks:
  - Is Claude Code still running? → NO
  - Has recent session? → YES
- restartClaude() executes:
  - spawn('claude', ['--resume'], {cwd: '/path/to/project'})
  - User sees: "Select session to resume:"
  - User selects previous session
  - [Claude] Resumes with full context
- [Daemon] Auto-resume successful via restart
```

## Logs and Debugging

### Phase 1C Log Examples

**Successful stdin resume:**
```
[Daemon] Resuming operations...
[ClaudeController] Attempting automatic resume...
[ClaudeController] Resume strategy detected: stdin
[ClaudeController] Attempting stdin resume strategy...
[ClaudeController] Found tmux session: claude
[ClaudeController] Sent "continue" to tmux session claude
[ClaudeController] Auto-resume successful via stdin
[Daemon] Claude Code resumed automatically via stdin
[Daemon] Sent prompt to tmux session: claude
```

**Successful restart resume:**
```
[Daemon] Resuming operations...
[ClaudeController] Attempting automatic resume...
[ClaudeController] Resume strategy detected: restart
[ClaudeController] Attempting restart resume strategy...
[ClaudeController] Restarting Claude Code in /path/to/project
[ClaudeController] Started Claude Code (PID: 12345)
[ClaudeController] Auto-resume successful via restart
[Daemon] Claude Code resumed automatically via restart
[Daemon] Spawned new Claude Code process (PID: 12345)
```

**Fallback to notification:**
```
[Daemon] Resuming operations...
[ClaudeController] Attempting automatic resume...
[ClaudeController] Resume strategy detected: restart
[ClaudeController] All auto-resume strategies failed, notifying user
[ClaudeController] All auto-resume strategies failed
[Daemon] Automatic resume not possible, user notification sent
```

## Known Limitations

### Limitation 1: Tmux Dependency for Stdin
- **Issue**: Stdin strategy requires tmux
- **Workaround**: Use restart strategy (fallback happens automatically)
- **Mitigation**: Phase 1C-Beta will implement direct PTY write
- **Recommendation**: For best experience, run `tmux new -s claude && claude-code`

### Limitation 2: Interactive Session Selection
- **Issue**: `claude --resume` shows prompt to select session
- **Workaround**: User must select session (acceptable for alpha)
- **Mitigation**: Phase 1B will store session ID for auto-selection
- **Improvement**: Future Claude CLI may support `claude --resume --session <id>`

### Limitation 3: Working Directory
- **Issue**: If daemon restarts, workingDir may be lost
- **Workaround**: Uses `process.cwd()` as default
- **Mitigation**: Phase 1B will persist working directory
- **Improvement**: Read from `~/.claude/history.jsonl` (contains project path)

## Integration with Phase 1B

Phase 1B (future) will enhance Phase 1C by:
1. **Storing working directory** when Claude Code starts
2. **Storing session ID** for auto-selection on resume
3. **Tracking process state** for better recovery
4. **`idev claude-status` command** to see auto-resume status

**Phase 1C works independently** without Phase 1B, but with these limitations:
- Restart uses `process.cwd()` (might be wrong directory)
- User must select session on restart
- No auto-recovery if daemon crashes

## Success Criteria

### ✅ Phase 1C-Alpha Complete

- [x] `detectResumeStrategy()` correctly identifies stdin vs restart
- [x] `findClaudeTmuxSession()` detects Claude in tmux
- [x] `sendStdinToClaude()` successfully sends input via tmux
- [x] `restartClaude()` spawns `claude --resume` in working directory
- [x] `resumeClaudeCode()` with automatic fallback chain
- [x] Daemon `resumeOperations()` calls auto-resume
- [x] Config options work (`resumePrompt`, `resumeStrategy`)
- [x] Test suite passes (process detection, strategy selection)
- [x] Documentation complete
- [x] Fallback to user notification works

### 🚀 Next: Phase 1C-Beta

- [ ] Direct PTY write (no tmux required)
- [ ] Session auto-selection (integrate with Phase 1B)
- [ ] Enhanced error recovery
- [ ] Configuration UI

## Files Modified

1. **src/daemon/claude-controller.js**
   - Added config parameter to constructor
   - Added 5 new methods for resume strategies
   - Added unified `resumeClaudeCode()` method

2. **src/daemon/index.js**
   - Updated constructor to pass config to ClaudeController
   - Updated `handleRateLimit()` to simplify notification
   - Updated `resumeOperations()` to call auto-resume
   - Added logging for resume results

3. **.infinitedev/config.json**
   - Added `daemon.autoResume`, `daemon.resumePrompt`, `daemon.resumeStrategy`
   - Added `claude` section for workingDir, debugLogDir, historyFile

4. **test-phase1c.js** (new)
   - Test suite for Phase 1C functionality
   - Tests strategy detection and process discovery

## Usage

### For End Users

1. **Install and start daemon:**
   ```bash
   node src/daemon/index.js
   ```

2. **Start Claude Code (recommended: in tmux):**
   ```bash
   tmux new -s claude
   claude-code
   ```

3. **Normal development workflow:**
   - Work as usual
   - Daemon monitors rate limits
   - If limit hit: daemon pauses, waits, auto-resumes when ready
   - No manual intervention needed!

### For Developers

1. **Testing resume logic:**
   ```bash
   node test-phase1c.js
   ```

2. **Debugging auto-resume:**
   ```bash
   LOG_LEVEL=debug node src/daemon/index.js
   ```

3. **Configuration:**
   - Edit `.infinitedev/config.json`
   - Customize `resumePrompt` if needed
   - Change `resumeStrategy` for testing different approaches

## Future Enhancements

1. **Phase 1C-Beta**: Direct PTY write (no tmux required)
2. **Phase 1B Integration**: Auto-session selection
3. **Phase 2**: Advanced scheduling and optimization
4. **Phase 3**: Frontend dashboard and user controls

---

**Phase 1C Implementation Complete ✅**

The daemon now automatically resumes Claude Code when rate limits reset, with smart fallback strategies ensuring reliability in all scenarios.
