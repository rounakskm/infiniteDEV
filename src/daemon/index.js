#!/usr/bin/env node

/**
 * infiniteDEV Rate Limit Daemon
 * Monitors Claude Code usage and automatically pauses/resumes work on rate limits
 */

const path = require('path');
const cron = require('node-cron');
const StateManager = require('./state-manager');
const RateLimiter = require('./rate-limiter');
const LogMonitor = require('./log-monitor');
const GastownController = require('./gastown-controller');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

class RateLimitDaemon {
  constructor() {
    this.projectRoot = process.cwd();
    this.stateManager = new StateManager(path.join(this.projectRoot, '.infinitedev', 'state.db'));
    this.rateLimiter = new RateLimiter(this.stateManager);
    this.logMonitor = new LogMonitor(path.join(this.projectRoot, '.gastown', 'logs', 'mayor.log'));
    this.gastownController = new GastownController(this.projectRoot);
    this.config = null;
    this.isPaused = false;
  }

  async start() {
    console.log('[Daemon] Starting rate limit daemon...');

    try {
      // Initialize state database
      await this.stateManager.init();
      console.log('[Daemon] State database initialized');

      // Load configuration
      this.config = await this.loadConfig();
      console.log('[Daemon] Configuration loaded:', { tier: this.config.tier });

      // Initialize rate limiter with current config
      this.rateLimiter.setConfig(this.config);

      // Check state on startup (recover from previous pause if needed)
      await this.checkPauseState();

      // Start cron job: check limits every 5 minutes
      cron.schedule('*/5 * * * *', () => this.checkLimits());
      console.log('[Daemon] Scheduled limit checks every 5 minutes');

      // Watch logs in real-time for rate limit signals
      this.logMonitor.watch((signal) => {
        if (signal.type === 'RATE_LIMIT') {
          console.log('[Daemon] Rate limit signal detected in logs');
          this.handleRateLimit(signal);
        }
      });

      console.log('[Daemon] Rate limit daemon started successfully');

      // Graceful shutdown
      process.on('SIGINT', async () => {
        console.log('[Daemon] Shutting down...');
        await this.stateManager.close();
        process.exit(0);
      });
    } catch (error) {
      console.error('[Daemon] Fatal error:', error);
      process.exit(1);
    }
  }

  async loadConfig() {
    const configPath = path.join(this.projectRoot, '.infinitedev', 'config.json');
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('[Daemon] Config not found, using defaults');
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      version: '1.0.0',
      tier: 'pro-20',
      limits: {
        window: 18000000, // 5 hours in ms
        prompts: 45,
        weeklyHours: 60
      },
      personas: {
        architect: { enabled: true, instances: 1 },
        builder: { enabled: true, instances: 2 },
        tester: { enabled: true, instances: 1 },
        reviewer: { enabled: true, instances: 1 },
        'lead-dev': { enabled: true, instances: 1 }
      },
      mayor: {
        pollInterval: 30,
        maxConcurrentTasks: 5
      },
      daemon: {
        checkInterval: 5,
        preemptivePause: true,
        preemptiveThreshold: 0.9
      }
    };
  }

  async checkPauseState() {
    const state = await this.stateManager.getState('pause');
    if (state && state.resumeAt) {
      const now = Date.now();
      if (now < state.resumeAt) {
        this.isPaused = true;
        const waitMs = state.resumeAt - now;
        const waitHours = (waitMs / (1000 * 60 * 60)).toFixed(1);
        console.log(`[Daemon] Recovering paused state. Will resume in ${waitHours} hours`);

        // Schedule automatic resume
        setTimeout(() => this.resumeOperations(), waitMs);
      } else {
        // Resume time has passed, proceed with resume
        await this.resumeOperations();
      }
    }
  }

  async checkLimits() {
    if (this.isPaused) {
      if (LOG_LEVEL === 'debug') {
        console.log('[Daemon] Skipping limit check - currently paused');
      }
      return;
    }

    try {
      const usage = await this.stateManager.getCurrentUsage();
      const shouldPause = this.rateLimiter.shouldPause(usage);

      if (shouldPause) {
        console.log('[Daemon] Rate limit threshold reached, pausing operations');
        await this.handleRateLimit({
          type: 'THRESHOLD',
          resetTime: this.rateLimiter.calculateNextResetTime()
        });
      }
    } catch (error) {
      console.error('[Daemon] Error checking limits:', error.message);
    }
  }

  async handleRateLimit(signal) {
    console.log('[Daemon] Handling rate limit signal:', signal.type);

    this.isPaused = true;
    const resetTime = signal.resetTime || this.rateLimiter.calculateNextResetTime();
    const resumeDelay = resetTime - Date.now();

    // Pause Mayor
    try {
      await this.gastownController.pauseMayor();
      console.log('[Daemon] Mayor paused');
    } catch (error) {
      console.error('[Daemon] Error pausing Mayor:', error.message);
    }

    // Record event
    await this.stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: signal.type,
      tier: this.config.tier,
      usageData: await this.stateManager.getCurrentUsage(),
      resetTime: resetTime
    });

    // Save pause state for recovery
    await this.stateManager.setState('pause', {
      pausedAt: Date.now(),
      resumeAt: resetTime,
      reason: signal.type
    });

    const hours = (resumeDelay / (1000 * 60 * 60)).toFixed(1);
    console.log(`[Daemon] System paused. Resuming in ${hours} hours at ${new Date(resetTime).toISOString()}`);

    // Schedule automatic resume
    setTimeout(() => this.resumeOperations(), resumeDelay);
  }

  async resumeOperations() {
    console.log('[Daemon] Resuming operations...');
    this.isPaused = false;

    // Resume Mayor
    try {
      await this.gastownController.resumeMayor();
      console.log('[Daemon] Mayor resumed');
    } catch (error) {
      console.error('[Daemon] Error resuming Mayor:', error.message);
    }

    // Record resume event
    await this.stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: 'RESUMED',
      tier: this.config.tier,
      usageData: await this.stateManager.getCurrentUsage()
    });

    // Clear pause state
    await this.stateManager.setState('pause', null);

    console.log('[Daemon] Operations resumed successfully');
  }
}

// Start daemon
if (require.main === module) {
  const daemon = new RateLimitDaemon();
  daemon.start().catch((error) => {
    console.error('[Daemon] Startup error:', error);
    process.exit(1);
  });
}

module.exports = RateLimitDaemon;
