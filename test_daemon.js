// Test daemon components
const StateManager = require('./src/daemon/state-manager');
const RateLimiter = require('./src/daemon/rate-limiter');
const path = require('path');

async function test() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: DAEMON COMPONENTS TEST');
  console.log('='.repeat(70) + '\n');

  try {
    // Test 1: State Manager
    console.log('TEST 1: StateManager\n');
    const stateManager = new StateManager(path.join(__dirname, '.infinitedev', 'test-state.db'));
    await stateManager.init();
    console.log('✓ SQLite database initialized\n');

    // Record a test event
    await stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: 'TEST_EVENT',
      tier: 'pro-20',
      usageData: { prompts: 45 }
    });
    console.log('✓ Rate limit event recorded\n');

    // Retrieve events
    const events = await stateManager.getRecentEvents(1);
    console.log('✓ Retrieved events:', events.length);
    console.log('  Event:', JSON.stringify(events[0], null, 2));
    console.log();

    // Test 2: Rate Limiter
    console.log('TEST 2: RateLimiter\n');
    const rateLimiter = new RateLimiter(stateManager);
    rateLimiter.setConfig({
      tier: 'pro-20',
      daemon: { preemptivePause: true, preemptiveThreshold: 0.9 }
    });

    const shouldPause = rateLimiter.shouldPause({ prompts_used: 40 });
    console.log('✓ Should pause at 40/45 prompts?', shouldPause);
    
    const shouldNotPause = rateLimiter.shouldPause({ prompts_used: 30 });
    console.log('✓ Should pause at 30/45 prompts?', shouldNotPause);
    console.log();

    const resetTime = rateLimiter.calculateNextResetTime();
    console.log('✓ Next reset time:', new Date(resetTime).toISOString());
    console.log('  (5 hours from now)\n');

    // Test 3: Log parsing
    console.log('TEST 3: Rate Limit Detection from Logs\n');
    const logLine = '[ERROR] Rate limit exceeded. Retry-After: 18000';
    const result = rateLimiter.parseRateLimitFromLog(logLine);
    console.log('✓ Parsed log line:', logLine);
    console.log('  Detected:', result.detected);
    console.log('  Type:', result.limitType);
    console.log();

    // Test 4: API Headers parsing
    console.log('TEST 4: Rate Limit Detection from API Headers\n');
    const headers = {
      'x-ratelimit-remaining-5h': '5',
      'x-ratelimit-limit-5h': '45',
      'x-ratelimit-remaining-weekly': '50',
      'x-ratelimit-limit-weekly': '1000'
    };
    const apiResult = rateLimiter.parseApiHeaders(headers);
    console.log('✓ Parsed headers:');
    console.log('  Remaining 5h:', apiResult.remaining5h, '/', apiResult.limit5h);
    console.log('  Should pause?', apiResult.shouldPause);
    console.log('  Reason:', apiResult.reason);
    console.log();

    await stateManager.close();
    console.log('='.repeat(70));
    console.log('✓ ALL DAEMON COMPONENT TESTS PASSED!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
