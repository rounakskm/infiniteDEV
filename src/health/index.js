#!/usr/bin/env node

/**
 * infiniteDEV Health Monitor API
 * Provides real-time status and control endpoints
 */

const express = require('express');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3030;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const PROJECT_ROOT = process.cwd();

const app = express();

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
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Health] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

// Unhandled promise rejection
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Health] Unhandled rejection:', reason);
});

module.exports = app;
