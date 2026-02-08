# Local Testing Guide for infiniteDEV

## Prerequisites Check

```bash
# You have:
✓ Node.js v20.19.6
✓ Git 2.50.1

# You need (for full testing):
- Go 1.23+ (for Gastown)
- tmux 3.0+ (for agent sessions)
- PM2 (will be installed via npm)
- Claude Code CLI (optional, for full integration)
- Beads (optional, for full integration)
```

## Phase 1: Test Core Components (No External Dependencies)

### 1.1 Test Daemon Components

```bash
# Create a test script
cat > test_daemon.js << 'EOF'
// Test daemon components
const StateManager = require('./src/daemon/state-manager');
const RateLimiter = require('./src/daemon/rate-limiter');
const path = require('path');

async function test() {
  console.log('Testing daemon components...\n');

  // Test 1: State Manager
  console.log('Test 1: StateManager');
  const stateManager = new StateManager(path.join(__dirname, '.infinitedev', 'test-state.db'));
  await stateManager.init();
  console.log('✓ SQLite database initialized');

  // Record a test event
  await stateManager.recordLimitEvent({
    timestamp: Date.now(),
    type: 'TEST_EVENT',
    tier: 'pro-20',
    usageData: { prompts: 45 }
  });
  console.log('✓ Rate limit event recorded');

  // Retrieve events
  const events = await stateManager.getRecentEvents(1);
  console.log('✓ Retrieved events:', events.length);
  console.log(events[0]);

  // Test 2: Rate Limiter
  console.log('\nTest 2: RateLimiter');
  const rateLimiter = new RateLimiter(stateManager);
  rateLimiter.setConfig({
    tier: 'pro-20',
    daemon: { preemptivePause: true, preemptiveThreshold: 0.9 }
  });

  const shouldPause = rateLimiter.shouldPause({ prompts_used: 40 });
  console.log('✓ Should pause at 40/45 prompts:', shouldPause);

  const resetTime = rateLimiter.calculateNextResetTime();
  console.log('✓ Next reset time:', new Date(resetTime).toISOString());

  // Test 3: Log parsing
  console.log('\nTest 3: Rate Limit Detection');
  const logLine = '[ERROR] Rate limit exceeded. Retry-After: 18000';
  const result = rateLimiter.parseRateLimitFromLog(logLine);
  console.log('✓ Parsed log:', result);

  await stateManager.close();
  console.log('\n✓ All daemon tests passed!\n');
}

test().catch(console.error);
EOF

node test_daemon.js
```

### 1.2 Test CLI Tool

```bash
# Test CLI is properly configured
node src/cli/index.js --version

# Test CLI help
node src/cli/index.js --help

# Test individual commands (without external tools)
node src/cli/index.js init
```

### 1.3 Test Health API

```bash
# Start health monitor in background
npm run start src/health/index.js &

# Wait for it to start
sleep 2

# Test endpoints
curl http://localhost:3030/health
curl http://localhost:3030/status
curl http://localhost:3030/metrics

# Kill background process
kill %1
```

## Phase 2: Install Optional Dependencies (For Full Integration)

If you want full testing with agents and task tracking:

### 2.1 Install Beads (Optional)

```bash
# Using npm
npm install -g @beads/bd

# Or using Go (if you have Go installed)
go install github.com/steveyegge/beads/cmd/bd@latest
```

### 2.2 Install Gastown (Optional)

Requires Go 1.23+. If you don't have Go:

```bash
# On macOS with Homebrew
brew install go
brew install tmux

# Then install Gastown
go install github.com/steveyegge/gastown/cmd/gt@latest
```

### 2.3 Install PM2 (Recommended)

```bash
npm install -g pm2
```

### 2.4 Install Claude Code CLI (Optional)

```bash
npm install -g @anthropic-ai/claude-code

# Authenticate
claude-code login
```

## Phase 3: Full Integration Testing

Once all dependencies are installed, run:

```bash
# Full installation
./install.sh

# Verify services started
pm2 list

# Check status
idev status

# Create first task
idev task create "Test task" --type feature

# View logs
pm2 logs infinitedev-daemon
```

## Testing Checklist

### Phase 1: Core Components ✓
- [ ] NPM dependencies install
- [ ] StateManager creates SQLite database
- [ ] RateLimiter calculates correctly
- [ ] CLI commands display help
- [ ] Health API responds to requests

### Phase 2: Dependencies ✓
- [ ] PM2 installed and working
- [ ] Beads CLI is available
- [ ] Gastown CLI is available

### Phase 3: Full System ✓
- [ ] `./install.sh` completes successfully
- [ ] All 3 PM2 processes running
- [ ] `idev status` shows running services
- [ ] `idev task create` works
- [ ] `bd ready` returns ready tasks
- [ ] Mayor assigns tasks to agents
- [ ] Rate limit daemon monitors logs

## Quick Reference Commands

### Check What's Installed
```bash
echo "=== System Status ==="
echo "Node: $(node --version)"
echo "Git: $(git --version)"
command -v go >/dev/null && echo "Go: $(go version)" || echo "Go: NOT INSTALLED"
command -v tmux >/dev/null && echo "tmux: $(tmux -V)" || echo "tmux: NOT INSTALLED"
command -v pm2 >/dev/null && echo "PM2: installed" || echo "PM2: NOT INSTALLED"
command -v bd >/dev/null && echo "Beads: installed" || echo "Beads: NOT INSTALLED"
command -v gt >/dev/null && echo "Gastown: installed" || echo "Gastown: NOT INSTALLED"
```

### Run Phase 1 Tests
```bash
node test_daemon.js
```

### Run Health API Test
```bash
PORT=3030 node src/health/index.js &
sleep 2
curl http://localhost:3030/status | jq .
kill %1
```

### Test CLI
```bash
node src/cli/index.js init
node src/cli/index.js status
```

## Troubleshooting

### SQLite Errors
If you get SQLite errors, make sure the `.infinitedev` directory exists:
```bash
mkdir -p .infinitedev
```

### CLI Not Working
Make sure dependencies are installed:
```bash
npm install
```

### Health API Port Already In Use
Change the port:
```bash
PORT=8080 node src/health/index.js
```

## Next Steps

1. **Complete Phase 1** to verify core components work
2. **Install missing dependencies** if you want full integration
3. **Run full installation** with `./install.sh`
4. **Create tasks** and watch agents work
5. **Monitor with** `idev status` and `idev logs`

---

**Start with Phase 1 to test what you have right now!**
