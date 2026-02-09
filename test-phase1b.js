#!/usr/bin/env node

/**
 * Phase 1B Testing Script
 * Tests session registration, tracking, and pause detection
 */

const axios = require('axios');
const { execSync } = require('child_process');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DAEMON_URL = 'http://localhost:3030';
const TEST_SESSION_ID = `test-session-${Date.now()}`;
const PROJECT_ROOT = process.cwd();

let testsPassed = 0;
let testsFailed = 0;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('');
  console.log('========================================');
  console.log('Phase 1B: Session Tracking Tests');
  console.log('========================================');
  console.log('');

  // Test 1: Health check
  await test('Health API is responding', async () => {
    const response = await axios.get(`${DAEMON_URL}/health`);
    if (!response.data || response.data.status !== 'ok') {
      throw new Error('Health check failed');
    }
  });

  // Test 2: Register session
  let sessionResponse;
  await test('POST /api/session/register works', async () => {
    sessionResponse = await axios.post(`${DAEMON_URL}/api/session/register`, {
      sessionId: TEST_SESSION_ID,
      workingDir: PROJECT_ROOT,
      pid: process.pid,
      startTime: Date.now()
    });

    if (!sessionResponse.data.success) {
      throw new Error('Session registration failed');
    }
  });

  // Test 3: Verify session is registered
  await test('Session is stored in database', async () => {
    const db = new sqlite3.Database(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value FROM kv_store WHERE key = ?',
        [`session:${TEST_SESSION_ID}`],
        (err, row) => {
          db.close();
          if (err) reject(err);
          if (!row) reject(new Error('Session not found in database'));

          try {
            const session = JSON.parse(row.value);
            if (session.sessionId !== TEST_SESSION_ID) {
              reject(new Error('Session ID mismatch'));
            }
            if (session.workingDir !== PROJECT_ROOT) {
              reject(new Error('Working dir mismatch'));
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  });

  // Test 4: Check active session is set
  await test('Active session is tracked', async () => {
    const db = new sqlite3.Database(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value FROM kv_store WHERE key = ?',
        ['active_session'],
        (err, row) => {
          db.close();
          if (err) reject(err);
          if (!row) reject(new Error('Active session not set'));

          try {
            const activeSessId = JSON.parse(row.value);
            if (activeSessId !== TEST_SESSION_ID) {
              reject(new Error(`Active session mismatch: expected ${TEST_SESSION_ID}, got ${activeSessId}`));
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  });

  // Test 5: Send heartbeat
  await test('POST /api/session/heartbeat works', async () => {
    const response = await axios.post(`${DAEMON_URL}/api/session/heartbeat`, {
      sessionId: TEST_SESSION_ID,
      promptCount: 10,
      status: 'active'
    });

    if (!response.data.success) {
      throw new Error('Heartbeat failed');
    }
  });

  // Test 6: Verify heartbeat updated session
  await test('Heartbeat updates prompt count', async () => {
    const db = new sqlite3.Database(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value FROM kv_store WHERE key = ?',
        [`session:${TEST_SESSION_ID}`],
        (err, row) => {
          db.close();
          if (err) reject(err);
          if (!row) reject(new Error('Session not found'));

          try {
            const session = JSON.parse(row.value);
            if (session.promptCount !== 10) {
              reject(new Error(`Prompt count mismatch: expected 10, got ${session.promptCount}`));
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  });

  // Test 7: Check pause status
  await test('GET /api/session/status returns pause info', async () => {
    const response = await axios.get(`${DAEMON_URL}/api/session/status`);
    if (!response.data || typeof response.data.isPaused !== 'boolean') {
      throw new Error('Pause status not returned correctly');
    }
  });

  // Test 8: End session
  await test('POST /api/session/end works', async () => {
    const response = await axios.post(`${DAEMON_URL}/api/session/end`, {
      sessionId: TEST_SESSION_ID,
      reason: 'test_complete',
      finalPromptCount: 10
    });

    if (!response.data.success) {
      throw new Error('Session end failed');
    }
  });

  // Test 9: Verify session is marked as completed
  await test('Ended session is marked as completed', async () => {
    const db = new sqlite3.Database(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value FROM kv_store WHERE key = ?',
        [`session:${TEST_SESSION_ID}`],
        (err, row) => {
          db.close();
          if (err) reject(err);
          if (!row) reject(new Error('Session not found'));

          try {
            const session = JSON.parse(row.value);
            if (session.status !== 'completed') {
              reject(new Error(`Session status mismatch: expected completed, got ${session.status}`));
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  });

  // Test 10: Verify active session is cleared
  await test('Active session is cleared on end', async () => {
    const db = new sqlite3.Database(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value FROM kv_store WHERE key = ?',
        ['active_session'],
        (err, row) => {
          db.close();
          if (err) reject(err);
          if (row) {
            try {
              const activeSessId = JSON.parse(row.value);
              if (activeSessId !== null) {
                reject(new Error(`Active session should be null, got ${activeSessId}`));
              }
            } catch (e) {
              reject(e);
            }
          }
          resolve();
        }
      );
    });
  });

  console.log('');
  console.log('========================================');
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('========================================');
  console.log('');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Start tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
