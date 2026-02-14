#!/usr/bin/env node

/**
 * infiniteDEV Phase 2 - Web Dashboard
 * Real-time UI for pause/resume control, session visibility, and usage stats
 */

const express = require('express');
const path = require('path');
const StateManager = require('../daemon/state-manager');

const PORT = process.env.WEB_PORT || 3031;
const PROJECT_ROOT = process.cwd();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let stateManager = null;

async function initStateManager() {
  stateManager = new StateManager(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));
  await stateManager.init();
}

// --- Phase 2 API Endpoints ---

/**
 * GET /api/v2/dashboard
 * Single endpoint that returns everything the dashboard needs
 */
app.get('/api/v2/dashboard', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    const pauseState = await stateManager.getState('pause');
    const isPaused = pauseState && pauseState.resumeAt && pauseState.resumeAt > Date.now();

    const activeSessionId = await stateManager.getState('active_session');
    let activeSession = null;
    if (activeSessionId) {
      activeSession = await stateManager.getState(`session:${activeSessionId}`);
    }

    const usage = await stateManager.getCurrentUsage();
    const events = await stateManager.getRecentEvents(10);

    // All sessions from kv_store
    const allSessions = await stateManager.all(
      `SELECT key, value FROM kv_store WHERE key LIKE 'session:%' ORDER BY updated_at DESC LIMIT 20`
    );
    const sessions = allSessions.map(row => {
      try { return JSON.parse(row.value); } catch { return null; }
    }).filter(Boolean);

    res.json({
      timestamp: Date.now(),
      pause: {
        isPaused: !!isPaused,
        pausedAt: pauseState?.pausedAt || null,
        resumeAt: pauseState?.resumeAt || null,
        reason: pauseState?.reason || null,
        secondsUntilResume: isPaused ? Math.max(0, Math.ceil((pauseState.resumeAt - Date.now()) / 1000)) : null
      },
      activeSession,
      usage: {
        promptsUsed: usage.prompts_used || 0,
        limit: 45,
        threshold: 40,
        percentUsed: Math.round(((usage.prompts_used || 0) / 45) * 100)
      },
      sessions,
      recentEvents: events.map(e => ({
        id: e.id,
        type: e.event_type,
        timestamp: e.timestamp,
        tier: e.tier,
        resetTime: e.reset_time
      }))
    });
  } catch (error) {
    console.error('[Web] Dashboard error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/pause
 * Manually trigger a pause (for UI button)
 */
app.post('/api/v2/pause', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    const durationMs = req.body.durationMs || 5 * 60 * 1000; // default 5 min
    const resumeAt = Date.now() + durationMs;

    await stateManager.setState('pause', {
      pausedAt: Date.now(),
      resumeAt,
      reason: 'manual_ui'
    });

    await stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: 'MANUAL_PAUSE',
      tier: 'manual',
      usageData: null,
      resetTime: resumeAt
    });

    console.log(`[Web] Manual pause set via UI. Resumes at ${new Date(resumeAt).toISOString()}`);
    res.json({ success: true, resumeAt, secondsUntilResume: Math.ceil(durationMs / 1000) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/resume
 * Manually clear a pause (for UI button)
 */
app.post('/api/v2/resume', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    await stateManager.setState('pause', null);

    await stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: 'MANUAL_RESUME',
      tier: 'manual',
      usageData: null,
      resetTime: null
    });

    console.log('[Web] Manual resume triggered via UI');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/sessions
 * List all known sessions
 */
app.get('/api/v2/sessions', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    const rows = await stateManager.all(
      `SELECT key, value, updated_at FROM kv_store WHERE key LIKE 'session:%' ORDER BY updated_at DESC LIMIT 50`
    );

    const sessions = rows.map(row => {
      try {
        const s = JSON.parse(row.value);
        return { ...s, dbUpdatedAt: row.updated_at };
      } catch { return null; }
    }).filter(Boolean);

    res.json({ count: sessions.length, sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/events
 * Recent rate limit events
 */
app.get('/api/v2/events', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    const limit = parseInt(req.query.limit) || 20;
    const events = await stateManager.getRecentEvents(limit);
    res.json({ count: events.length, events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/inject-usage
 * For testing: artificially set prompt count to trigger rate limit logic
 */
app.post('/api/v2/inject-usage', async (req, res) => {
  try {
    if (!stateManager) return res.status(503).json({ error: 'State manager not initialised' });

    const { promptsUsed } = req.body;
    if (typeof promptsUsed !== 'number') {
      return res.status(400).json({ error: 'promptsUsed (number) is required' });
    }

    const startTime = Date.now() - 1000;
    await stateManager.recordAgentSession('claude-code', startTime, null, 'active', promptsUsed);

    const usage = await stateManager.getCurrentUsage();
    console.log(`[Web] Injected ${promptsUsed} prompts for testing. Current usage: ${usage.prompts_used}`);

    res.json({ success: true, usage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve dashboard for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await initStateManager();
    console.log('[Web] State manager initialised');
  } catch (error) {
    console.error('[Web] State manager init failed:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`[Web] Phase 2 Dashboard running at http://localhost:${PORT}`);
    console.log(`[Web] API endpoints:`);
    console.log(`  GET  http://localhost:${PORT}/api/v2/dashboard`);
    console.log(`  POST http://localhost:${PORT}/api/v2/pause`);
    console.log(`  POST http://localhost:${PORT}/api/v2/resume`);
    console.log(`  GET  http://localhost:${PORT}/api/v2/sessions`);
    console.log(`  GET  http://localhost:${PORT}/api/v2/events`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
