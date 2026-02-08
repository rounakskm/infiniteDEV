const axios = require('axios');

async function testAPI() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: HEALTH API TEST');
  console.log('='.repeat(70) + '\n');

  const API = 'http://localhost:3030';

  // Start health monitor
  const { spawn } = require('child_process');
  const health = spawn('node', ['src/health/index.js'], {
    env: { ...process.env, PORT: 3030 }
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test 1: Health check
    console.log('TEST 1: Health Check\n');
    const health_res = await axios.get(`${API}/health`);
    console.log('✓ Health endpoint responded');
    console.log('  Response:', JSON.stringify(health_res.data, null, 2));
    console.log();

    // Test 2: Status
    console.log('TEST 2: System Status\n');
    const status_res = await axios.get(`${API}/status`);
    console.log('✓ Status endpoint responded');
    console.log('  Services:', status_res.data.system);
    console.log('  Tasks:', status_res.data.tasks);
    console.log();

    // Test 3: Metrics
    console.log('TEST 3: Metrics\n');
    const metrics_res = await axios.get(`${API}/metrics`);
    console.log('✓ Metrics endpoint responded');
    console.log('  Uptime:', (metrics_res.data.uptime / 60).toFixed(1), 'seconds');
    console.log('  Memory:', metrics_res.data.memory);
    console.log();

    console.log('='.repeat(70));
    console.log('✓ ALL HEALTH API TESTS PASSED!');
    console.log('='.repeat(70) + '\n');

    health.kill();
  } catch (error) {
    console.error('✗ ERROR:', error.message);
    health.kill();
    process.exit(1);
  }
}

testAPI();
