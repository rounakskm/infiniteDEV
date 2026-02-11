# infiniteDEV Plugin - Quick Start Guide

## What Is This?

The infiniteDEV Claude Code plugin automatically registers your Claude Code sessions with the infiniteDEV daemon, enabling automatic rate limit blocking and session tracking.

## Installation (One-Time Setup)

```bash
cd /Users/rounakskm/AI-projects/infiniteDEV
./bin/install-plugin.sh
```

Then **restart Claude Code** (exit and start a new session).

That's it! No aliases, no wrappers, no additional configuration needed.

## Usage

Just run Claude Code normally:

```bash
claude-code
```

Behind the scenes:
1. **SessionStart hook** auto-registers your session with the daemon
2. If rate limit is active → blocks with clear message
3. If not paused → session starts normally
4. **SessionEnd hook** auto-deregisters when you exit

## What Changed from Phase 1B

| Before (Phase 1B) | After (Plugin) |
|------------------|----------------|
| `./bin/claude-with-tracking.sh` | `claude-code` |
| Manual alias setup | Automatic (plugin) |
| External wrapper | Built-in hooks |

## Features

✅ **Automatic** - No manual steps after installation
✅ **Transparent** - Nothing visible to the user
✅ **Non-blocking** - Daemon errors don't prevent Claude Code
✅ **Smart** - Auto-starts daemon if needed
✅ **Compatible** - Phase 1B wrapper still works as backup

## When Rate Limit is Active

When you try to run `claude-code` and rate limit is active:

```
infiniteDEV: Session xyz-123 registered with infiniteDEV daemon.

============================================================
⚠️  Rate limit is active - Cannot start session
============================================================

The daemon will notify you when the rate limit resets.

Session blocked by infiniteDEV hook.
```

The hook prevents Claude Code from starting until the rate limit is reset.

## Troubleshooting

### Plugin not working?

1. **Verify installation**: `ls -la ~/.claude/plugins/infiniteDEV/`
2. **Restart Claude Code**: Hooks only load on new sessions
3. **Check daemon running**: `./bin/idev-start.sh status`

### See full guide

See `PLUGIN_IMPLEMENTATION_GUIDE.md` for detailed documentation.

## Files

```
~/.claude/plugins/infiniteDEV/
├── manifest.json              Plugin metadata
├── hooks/
│   ├── hooks.json            Hook configuration
│   ├── register-session.sh   Runs on session start
│   └── end-session.sh        Runs on session end
└── README.md                 Plugin documentation
```

## Need Help?

See the full documentation at `plugin/README.md` or `PLUGIN_IMPLEMENTATION_GUIDE.md`.

---

**TL;DR**: Run `./bin/install-plugin.sh`, restart Claude Code, done.
