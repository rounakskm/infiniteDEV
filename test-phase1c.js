#!/usr/bin/env node

/**
 * Test script for Phase 1C automatic resume functionality
 * Tests the resume strategy detection, stdin approach, and restart approach
 */

const ClaudeController = require('./src/daemon/claude-controller');
const ClaudeDetector = require('./src/daemon/claude-detector');

async function testResumeStrategy() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Phase 1C Auto-Resume Tests');
  console.log('═══════════════════════════════════════════════════════\n');

  const controller = new ClaudeController({
    resumePrompt: 'continue',
    resumeStrategy: 'auto'
  });

  // Test 1: Detect resume strategy
  console.log('Test 1: Detecting resume strategy...');
  try {
    const strategy = await controller.detectResumeStrategy();
    console.log('✓ Resume strategy detected:', strategy);
    console.log(`  - Strategy: ${strategy.strategy}`);
    console.log(`  - Reason: ${strategy.reason}`);
    console.log(`  - Can resume: ${strategy.canResume}`);
  } catch (error) {
    console.error('✗ Error detecting strategy:', error.message);
  }

  // Test 2: Check for tmux sessions
  console.log('\nTest 2: Checking for tmux sessions...');
  try {
    const tmuxSession = await controller.findClaudeTmuxSession();
    if (tmuxSession) {
      console.log('✓ Found tmux session:', tmuxSession);
    } else {
      console.log('⊘ No tmux session found (this is OK if Claude is not running in tmux)');
    }
  } catch (error) {
    console.error('✗ Error finding tmux session:', error.message);
  }

  // Test 3: Detect Claude processes
  console.log('\nTest 3: Detecting Claude Code processes...');
  try {
    const detector = new ClaudeDetector();
    const processes = await detector.detectProcesses();
    console.log('✓ Process detection complete:');
    console.log(`  - Running: ${processes.running}`);
    console.log(`  - Count: ${processes.count}`);
    if (processes.processes.length > 0) {
      processes.processes.forEach((proc, i) => {
        console.log(`  - Process ${i + 1}: PID=${proc.pid}, Command=${proc.command.substring(0, 50)}...`);
      });
    }
  } catch (error) {
    console.error('✗ Error detecting processes:', error.message);
  }

  // Test 4: Check for active sessions
  console.log('\nTest 4: Checking for active Claude Code sessions...');
  try {
    const detector = new ClaudeDetector();
    const session = await detector.getActiveSessions();
    if (session) {
      console.log('✓ Found active session:');
      console.log(`  - Session ID: ${session.sessionId}`);
      console.log(`  - Timestamp: ${new Date(session.timestamp).toISOString()}`);
      console.log(`  - Is recent: ${session.isRecent}`);
    } else {
      console.log('⊘ No active session found');
    }
  } catch (error) {
    console.error('✗ Error checking sessions:', error.message);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Tests Complete');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Next Steps:');
  console.log('1. To test stdin resume: Run Claude Code in tmux');
  console.log('   - tmux new -s claude');
  console.log('   - claude-code');
  console.log('2. Let it run and trigger this test again');
  console.log('3. The test should detect the Claude process in tmux\n');
}

// Run tests
testResumeStrategy().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
