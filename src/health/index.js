#!/usr/bin/env node

/**
 * infiniteDEV Health Monitor API
 * Provides real-time status and control endpoints
 */

const express = require('express');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const StateManager = require('../daemon/state-manager');

const PORT = process.env.PORT || 3030;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const PROJECT_ROOT = process.cwd();

const app = express();

// Initialize state manager for session tracking
let stateManager = null;

async function initStateManager() {
  stateManager = new StateManager(path.join(PROJECT_ROOT, '.infinitedev', 'state.db'));
  await stateManager.init();
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  if (LOG_LEVEL === 'debug') {
    console.log(`[Health] ${req.method} ${req.path}`);
  }
  next();
});

// Helper functions
const pm2Describe = (appName) => {
  try {
    const result = execSync(`pm2 describe ${appName} --silent`, {
      encoding: 'utf8'
    });
    return JSON.parse(result);
  } catch (error) {
    return null;
  }
};

const executeCommand = (cmd, cwd = PROJECT_ROOT) => {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 5000
    });
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr ? error.stderr.toString() : null
    };
  }
};

const getTaskStatus = () => {
  try {
    const result = executeCommand('bd list --json');
    if (result.success) {
      const tasks = JSON.parse(result.data);
      return {
        total: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          type: t.type
        }))
      };
    }
  } catch (error) {
    console.error('[Health] Error getting task status:', error.message);
  }
  return { total: 0, tasks: [] };
};

const getReadyTasks = () => {
  try {
    const result = executeCommand('bd ready --json');
    if (result.success) {
      return JSON.parse(result.data);
    }
  } catch (error) {
    console.error('[Health] Error getting ready tasks:', error.message);
  }
  return [];
};

const getAgentStatus = () => {
  try {
    const result = executeCommand('pm2 list --json');
    if (result.success) {
      const processes = JSON.parse(result.data);
      return processes.filter((p) => p.name.startsWith('infinitedev')).map((p) => ({
        name: p.name,
        status: p.pm2_env.status,
        memory: p.monit.memory,
        cpu: p.monit.cpu,
        restarts: p.pm2_env.restart_time,
        uptime: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0
      }));
    }
  } catch (error) {
    console.error('[Health] Error getting agent status:', error.message);
  }
  return [];
};

// Helper function to check if daemon is paused
async function isDaemonPaused() {
  if (!stateManager) return false;
  const pauseState = await stateManager.getState('pause');
  return pauseState && pauseState.resumeAt && pauseState.resumeAt > Date.now();
}

// Routes

/**
 * GET /health
 * Basic health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * GET /status
 * Comprehensive system status
 */
app.get('/status', (req, res) => {
  try {
    const daemon = pm2Describe('infinitedev-daemon');
    const health = pm2Describe('infinitedev-health');
    const mayor = pm2Describe('infinitedev-mayor');

    const tasks = getTaskStatus();
    const readyTasks = getReadyTasks();
    const agents = getAgentStatus();

    const status = {
      timestamp: Date.now(),
      system: {
        daemon: daemon ? 'running' : 'stopped',
        health: health ? 'running' : 'stopped',
        mayor: mayor ? 'running' : 'stopped'
      },
      tasks: {
        total: tasks.total,
        ready: readyTasks.length,
        byStatus: {
          open: tasks.tasks.filter((t) => t.status === 'open').length,
          inProgress: tasks.tasks.filter((t) => t.status === 'in_progress').length,
          closed: tasks.tasks.filter((t) => t.status === 'closed').length,
          blocked: tasks.tasks.filter((t) => t.status === 'blocked').length
        }
      },
      agents: agents.map((a) => ({
        name: a.name,
        status: a.status,
        memory: `${(a.memory / 1024 / 1024).toFixed(2)}MB`,
        uptime: a.uptime
      })),
      readyTasks: readyTasks.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority
      }))
    };

    res.json(status);
  } catch (error) {
    console.error('[Health] Error generating status:', error.message);
    res.status(500).json({
      error: 'Error generating status',
      message: error.message
    });
  }
});

/**
 * GET /metrics
 * Performance metrics and usage statistics
 */
app.get('/metrics', (req, res) => {
  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const tasks = getTaskStatus();

    const metrics = {
      timestamp: Date.now(),
      uptime: uptime,
      memory: {
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB`
      },
      tasks: {
        total: tasks.total,
        completed: tasks.tasks.filter((t) => t.status === 'closed').length,
        active: tasks.tasks.filter((t) => t.status === 'in_progress').length
      }
    };

    res.json(metrics);
  } catch (error) {
    console.error('[Health] Error generating metrics:', error.message);
    res.status(500).json({
      error: 'Error generating metrics',
      message: error.message
    });
  }
});

/**
 * POST /pause
 * Manually pause operations
 */
app.post('/pause', (req, res) => {
  try {
    // Send SIGSTOP to daemon and mayor processes
    const daemon = pm2Describe('infinitedev-daemon');
    const mayor = pm2Describe('infinitedev-mayor');

    if (daemon && mayor) {
      executeCommand('pm2 stop infinitedev-daemon infinitedev-mayor');
      res.json({
        status: 'paused',
        timestamp: Date.now(),
        message: 'System paused successfully'
      });
    } else {
      res.status(400).json({
        error: 'Cannot pause - daemon or mayor not running'
      });
    }
  } catch (error) {
    console.error('[Health] Error pausing system:', error.message);
    res.status(500).json({
      error: 'Error pausing system',
      message: error.message
    });
  }
});

/**
 * POST /resume
 * Resume operations after pause
 */
app.post('/resume', (req, res) => {
  try {
    executeCommand('pm2 restart infinitedev-daemon infinitedev-mayor');

    res.json({
      status: 'resumed',
      timestamp: Date.now(),
      message: 'System resumed successfully'
    });
  } catch (error) {
    console.error('[Health] Error resuming system:', error.message);
    res.status(500).json({
      error: 'Error resuming system',
      message: error.message
    });
  }
});

/**
 * GET /tasks
 * List all tasks with optional filtering
 */
app.get('/tasks', (req, res) => {
  try {
    const status = req.query.status; // e.g., ?status=open
    const limit = parseInt(req.query.limit) || 50;

    const result = executeCommand(`bd list --json ${status ? `--status ${status}` : ''}`);

    if (result.success) {
      const tasks = JSON.parse(result.data).slice(0, limit);
      res.json({
        count: tasks.length,
        tasks: tasks
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('[Health] Error listing tasks:', error.message);
    res.status(500).json({
      error: 'Error listing tasks',
      message: error.message
    });
  }
});

/**
 * GET /logs/:service
 * Get recent logs from a service
 */
app.get('/logs/:service', (req, res) => {
  try {
    const service = req.params.service; // daemon, health, mayor, etc
    const lines = parseInt(req.query.lines) || 50;

    // Security: only allow specific services
    const allowedServices = ['daemon', 'health', 'mayor', 'architect', 'builder', 'tester'];
    if (!allowedServices.includes(service)) {
      return res.status(400).json({
        error: 'Invalid service',
        allowed: allowedServices
      });
    }

    const result = executeCommand(`pm2 logs infinitedev-${service} --lines ${lines} --nostream`);

    if (result.success) {
      const logs = result.data.split('\n').filter((l) => l.trim());
      res.json({
        service: service,
        count: logs.length,
        logs: logs
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('[Health] Error retrieving logs:', error.message);
    res.status(500).json({
      error: 'Error retrieving logs',
      message: error.message
    });
  }
});

/**
 * POST /api/session/register
 * Register a Claude Code session with the daemon
 */
app.post('/api/session/register', async (req, res) => {
  try {
    if (!stateManager) {
      return res.status(503).json({ error: 'State manager not initialized' });
    }

    const { sessionId, workingDir, pid, startTime } = req.body;

    if (!sessionId || !pid) {
      return res.status(400).json({ error: 'sessionId and pid are required' });
    }

    // Record in agent_sessions table
    await stateManager.recordAgentSession(
      'claude-code',
      startTime || Date.now(),
      null,
      'active',
      0
    );

    // Store detailed session info in kv_store
    await stateManager.setState(`session:${sessionId}`, {
      sessionId,
      workingDir: workingDir || process.cwd(),
      pid,
      startTime: startTime || Date.now(),
      lastActivity: Date.now(),
      promptCount: 0,
      status: 'active'
    });

    // Track as current active session
    await stateManager.setState('active_session', sessionId);

    console.log(`[SessionAPI] Registered Claude Code session: ${sessionId} (PID: ${pid})`);

    const isPaused = await isDaemonPaused();

    res.json({
      success: true,
      sessionId,
      daemonStatus: 'running',
      isPaused
    });
  } catch (error) {
    console.error('[SessionAPI] Error registering session:', error.message);
    res.status(500).json({
      error: 'Error registering session',
      message: error.message
    });
  }
});

/**
 * POST /api/session/heartbeat
 * Send periodic updates from Claude Code session
 */
app.post('/api/session/heartbeat', async (req, res) => {
  try {
    if (!stateManager) {
      return res.status(503).json({ error: 'State manager not initialized' });
    }

    const { sessionId, promptCount, status } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await stateManager.getState(`session:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update session data
    await stateManager.setState(`session:${sessionId}`, {
      ...session,
      lastActivity: Date.now(),
      promptCount: promptCount !== undefined ? promptCount : session.promptCount,
      status: status || session.status
    });

    console.log(`[SessionAPI] Heartbeat from session: ${sessionId} (prompts: ${promptCount || session.promptCount})`);

    const isPaused = await isDaemonPaused();

    res.json({
      success: true,
      isPaused
    });
  } catch (error) {
    console.error('[SessionAPI] Error sending heartbeat:', error.message);
    res.status(500).json({
      error: 'Error processing heartbeat',
      message: error.message
    });
  }
});

/**
 * POST /api/session/end
 * End a Claude Code session
 */
app.post('/api/session/end', async (req, res) => {
  try {
    if (!stateManager) {
      return res.status(503).json({ error: 'State manager not initialized' });
    }

    const { sessionId, reason, finalPromptCount } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await stateManager.getState(`session:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Mark as completed in agent_sessions
    await stateManager.recordAgentSession(
      'claude-code',
      session.startTime,
      Date.now(),
      'completed',
      finalPromptCount || session.promptCount
    );

    // Update session state
    await stateManager.setState(`session:${sessionId}`, {
      ...session,
      endTime: Date.now(),
      status: 'completed',
      exitReason: reason
    });

    // Clear active session if this was it
    const activeSessId = await stateManager.getState('active_session');
    if (activeSessId === sessionId) {
      await stateManager.setState('active_session', null);
    }

    console.log(`[SessionAPI] Session ${sessionId} ended: ${reason || 'unknown'}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[SessionAPI] Error ending session:', error.message);
    res.status(500).json({
      error: 'Error ending session',
      message: error.message
    });
  }
});

/**
 * GET /api/session/status
 * Check daemon pause status (for wrapper script)
 */
app.get('/api/session/status', async (req, res) => {
  try {
    if (!stateManager) {
      return res.status(503).json({ error: 'State manager not initialized' });
    }

    const pauseState = await stateManager.getState('pause');
    const isPaused = pauseState && pauseState.resumeAt && pauseState.resumeAt > Date.now();

    res.json({
      isPaused,
      pausedAt: pauseState?.pausedAt || null,
      resumeAt: pauseState?.resumeAt || null,
      reason: pauseState?.reason || null,
      daemonStatus: 'running'
    });
  } catch (error) {
    console.error('[SessionAPI] Error checking session status:', error.message);
    res.status(500).json({
      error: 'Error checking status',
      message: error.message
    });
  }
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('[Health] Unhandled error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Start server
async function startServer() {
  try {
    await initStateManager();
    console.log('[Health] State manager initialized');
  } catch (error) {
    console.error('[Health] Failed to initialize state manager:', error.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`[Health] Health monitor listening on port ${PORT}`);
    console.log(`[Health] Endpoints:`);
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log(`  GET  http://localhost:${PORT}/status`);
    console.log(`  GET  http://localhost:${PORT}/metrics`);
    console.log(`  GET  http://localhost:${PORT}/tasks`);
    console.log(`  GET  http://localhost:${PORT}/logs/:service`);
    console.log(`  POST http://localhost:${PORT}/pause`);
    console.log(`  POST http://localhost:${PORT}/resume`);
    console.log(`[Health] Session Tracking Endpoints:`);
    console.log(`  POST http://localhost:${PORT}/api/session/register`);
    console.log(`  POST http://localhost:${PORT}/api/session/heartbeat`);
    console.log(`  POST http://localhost:${PORT}/api/session/end`);
    console.log(`  GET  http://localhost:${PORT}/api/session/status`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Health] Shutting down...');
    if (stateManager) {
      stateManager.close().then(() => {
        server.close(() => {
          process.exit(0);
        });
      });
    } else {
      server.close(() => {
        process.exit(0);
      });
    }
  });

  // Unhandled promise rejection
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Health] Unhandled rejection:', reason);
  });
}

// Start the server if this is the main module
if (require.main === module) {
  startServer();
}

module.exports = app;
