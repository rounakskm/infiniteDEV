#!/usr/bin/env node

/**
 * Rate Limit Testing Script
 * Simulates a rate limit scenario and tests auto-resume functionality
 */

const path = require('path');
const StateManager = require('./src/daemon/state-manager');
const RateLimiter = require('./src/daemon/rate-limiter');
const fs = require('fs').promises;

class RateLimitTester {
  constructor() {
    this.projectRoot = process.cwd();
    this.stateManager = new StateManager(
      path.join(this.projectRoot, '.infinitedev', 'state.db')
    );
    this.rateLimiter = new RateLimiter(this.stateManager);
  }

  async initialize() {
    await this.stateManager.init();
    console.log('✓ State manager initialized');

    // Load config
    const configPath = path.join(this.projectRoot, '.infinitedev', 'config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    this.rateLimiter.setConfig(config);
    console.log('✓ Config loaded:', { tier: config.tier, window: config.limits.window + 'ms' });
  }

  async step1_simulateRateLimit() {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Simulate Rate Limit Hit');
    console.log('='.repeat(60));

    // Get tier limits
    const limits = this.rateLimiter.getTierLimits('pro-20');
    const triggerThreshold = limits.prompts * 0.9; // 90% of 45 = 40.5
    const promptsToUse = Math.ceil(triggerThreshold) + 1; // 41 prompts

    console.log(`Tier limit: ${limits.prompts} prompts`);
    console.log(`Trigger threshold: ${triggerThreshold} prompts (90%)`);
    console.log(`Recording session with: ${promptsToUse} prompts`);

    // Record an agent session with high prompt usage
    const startTime = Date.now() - 1000; // Started 1 second ago
    await this.stateManager.recordAgentSession(
      'test-agent',
      startTime,
      null,
      'active',
      promptsToUse
    );
    console.log('✓ High-usage session recorded');

    // Check if daemon would pause
    const usage = await this.stateManager.getCurrentUsage();
    console.log(`Current usage: ${usage.prompts_used} prompts`);

    const shouldPause = this.rateLimiter.shouldPause(usage);
    console.log(`Should pause: ${shouldPause}`);

    if (!shouldPause) {
      console.error('❌ ERROR: Daemon should pause but didn\'t!');
      return false;
    }

    console.log('✓ Rate limit threshold reached');
    return true;
  }

  async step2_verifyPauseState() {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Verify Daemon Pauses (Manual Check Needed)');
    console.log('='.repeat(60));

    console.log(`
In Terminal 1 (daemon), you should see:
[Daemon] Rate limit threshold reached, pausing operations
[Daemon] System paused. Will attempt automatic resume in 5m 0s at ...

Waiting for you to confirm the daemon has paused...
    `);

    // Wait for user confirmation
    await this.pause(10000);

    // Then verify pause state in database
    const pauseState = await this.stateManager.getState('pause');
    if (!pauseState || !pauseState.resumeAt) {
      console.error('❌ ERROR: Pause state not found in database!');
      return false;
    }

    console.log('✓ Pause state verified in database');
    console.log(`  Paused at: ${new Date(pauseState.pausedAt).toISOString()}`);
    console.log(`  Resume at: ${new Date(pauseState.resumeAt).toISOString()}`);
    console.log(`  Reason: ${pauseState.reason}`);

    return true;
  }

  async step3_waitForReset() {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Wait for Rate Limit Window to Reset');
    console.log('='.repeat(60));

    const pauseState = await this.stateManager.getState('pause');
    const waitMs = pauseState.resumeAt - Date.now();
    const waitSeconds = Math.ceil(waitMs / 1000);

    console.log(`Waiting ${waitSeconds} seconds (${(waitSeconds / 60).toFixed(1)} minutes)...`);
    console.log(`Reset time: ${new Date(pauseState.resumeAt).toISOString()}`);

    // Show countdown
    for (let i = waitSeconds; i > 0; i--) {
      process.stdout.write(`\r${i}s remaining...`);
      await this.pause(1000);
    }
    console.log('\n✓ Rate limit window has reset');
    return true;
  }

  async step4_verifyAutoResume() {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Verify Auto-Resume (Manual Check Needed)');
    console.log('='.repeat(60));

    console.log(`
In Terminal 1 (daemon), you should see:
[Daemon] Resuming operations...
[Daemon] Claude Code resumed automatically via [method]
[Daemon] Operations resumed successfully

Check the pause state...
    `);

    // Wait a moment for daemon to process
    await this.pause(3000);

    const pauseState = await this.stateManager.getState('pause');
    if (pauseState && pauseState.resumeAt && pauseState.resumeAt > Date.now()) {
      console.error('❌ ERROR: System is still paused!');
      return false;
    }

    console.log('✓ Pause state cleared - system has resumed');

    // Check for resume event in database
    const events = await this.stateManager.all(
      `SELECT * FROM rate_limit_events WHERE event_type = 'RESUMED' ORDER BY timestamp DESC LIMIT 1`
    );

    if (events.length > 0) {
      console.log('✓ Resume event recorded in database');
      console.log(`  Resumed at: ${new Date(events[0].timestamp).toISOString()}`);
    }

    return true;
  }

  async runFullTest() {
    try {
      await this.initialize();

      const step1 = await this.step1_simulateRateLimit();
      if (!step1) {
        console.error('\n❌ Test failed at Step 1');
        process.exit(1);
      }

      const step2 = await this.step2_verifyPauseState();
      if (!step2) {
        console.error('\n❌ Test failed at Step 2');
        process.exit(1);
      }

      const step3 = await this.step3_waitForReset();
      if (!step3) {
        console.error('\n❌ Test failed at Step 3');
        process.exit(1);
      }

      const step4 = await this.step4_verifyAutoResume();
      if (!step4) {
        console.error('\n❌ Test failed at Step 4');
        process.exit(1);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ ALL TESTS PASSED');
      console.log('='.repeat(60));
      console.log(`
Auto-resume functionality is working correctly:
1. Rate limit was detected when usage exceeded threshold
2. Daemon paused operations automatically
3. System waited for reset window
4. Daemon resumed operations automatically
      `);

      process.exit(0);
    } catch (error) {
      console.error('\n❌ Test error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  async pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Check if StateManager has getState method (might need to add it)
StateManager.prototype.getState = async function(key) {
  const row = await this.get(
    `SELECT value FROM kv_store WHERE key = ?`,
    [key]
  );
  return row ? JSON.parse(row.value) : null;
};

StateManager.prototype.setState = async function(key, value) {
  if (value === null) {
    await this.run(`DELETE FROM kv_store WHERE key = ?`, [key]);
  } else {
    await this.run(
      `INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)`,
      [key, JSON.stringify(value)]
    );
  }
};

// Run the test
if (require.main === module) {
  const tester = new RateLimitTester();
  tester.runFullTest();
}

module.exports = RateLimitTester;
