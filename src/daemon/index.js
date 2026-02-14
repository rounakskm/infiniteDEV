#!/usr/bin/env node

/**
 * infiniteDEV Rate Limit Daemon
 * Monitors Claude Code usage and automatically pauses/resumes work on rate limits
 */

const path = require('path');
const os = require('os');
const cron = require('node-cron');
const StateManager = require('./state-manager');
const RateLimiter = require('./rate-limiter');
const LogMonitor = require('./log-monitor');
const ClaudeController = require('./claude-controller');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

class RateLimitDaemon {
  constructor() {
    this.projectRoot = process.cwd();
    this.stateManager = new StateManager(path.join(this.projectRoot, '.infinitedev', 'state.db'));
    this.rateLimiter = new RateLimiter(this.stateManager);

    // Watch Claude Code debug directory instead of Gastown logs
    const claudeDebugDir = path.join(os.homedir(), '.claude', 'debug');
    this.logMonitor = new LogMonitor(claudeDebugDir, { watchLatestFile: true });

    // Initialize with empty config, will be updated after loading config
    this.claudeController = new ClaudeController({
      stateManager: this.stateManager
    });
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

      // Update ClaudeController with config for resume prompts and options
      this.claudeController.config = {
        resumePrompt: this.config.daemon?.resumePrompt || 'continue',
        resumeStrategy: this.config.daemon?.resumeStrategy || 'auto',
        workingDir: this.config.claude?.workingDir
      };

      // Initialize rate limiter with current config
      this.rateLimiter.setConfig(this.config);

      // Check state on startup (recover from previous pause if needed)
      await this.checkPauseState();

      // Do an immediate limit check on startup
      console.log('[Daemon] Running initial limit check...');
      await this.checkLimits();

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

    // Notify user that rate limit was hit and Claude Code should be paused
    try {
      await this.claudeController.notifyUserToPause();
      console.log('[Daemon] User notified about rate limit');
    } catch (error) {
      console.error('[Daemon] Error notifying user:', error.message);
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
    console.log(`[Daemon] System paused. Will attempt automatic resume in ${hours} hours at ${new Date(resetTime).toISOString()}`);

    // Schedule automatic resume
    setTimeout(() => this.resumeOperations(), resumeDelay);
  }

  async resumeOperations() {
    console.log('[Daemon] Resuming operations...');
    this.isPaused = false;

    // Clear pause state so the hook allows new sessions
    await this.stateManager.setState('pause', null);

    // Try to auto-resume Claude Code (send "continue" to its terminal)
    try {
      const result = await this.claudeController.resumeClaudeCode({
        customPrompt: this.config.daemon?.resumePrompt || 'continue'
      });
      if (result.success) {
        console.log(`[Daemon] Claude Code auto-resumed via ${result.method}`);
      } else {
        console.log(`[Daemon] Auto-resume failed (${result.reason}), user notified`);
      }
    } catch (error) {
      console.error('[Daemon] Error during auto-resume:', error.message);
      await this.claudeController.notifyUserToResume();
    }

    // Record resume event
    await this.stateManager.recordLimitEvent({
      timestamp: Date.now(),
      type: 'RESUMED',
      tier: this.config.tier,
      usageData: await this.stateManager.getCurrentUsage()
    });

    console.log('[Daemon] Operations resumed.');
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
