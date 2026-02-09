/**
 * Claude Code Controller
 * Controls Claude Code pause/resume operations
 * Phase 1A: User notifications only (safe approach)
 * Phase 1C: Automatic resume with stdin or restart strategies
 */

const ClaudeDetector = require('./claude-detector');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');

class ClaudeController {
  constructor(config = {}) {
    this.detector = new ClaudeDetector();
    this.pausedProcesses = []; // Track paused processes for Phase 1C
    this.notifier = null;
    this.config = config;
    this.stateManager = config.stateManager || null;

    // Try to load node-notifier for desktop notifications
    try {
      this.notifier = require('node-notifier');
    } catch (error) {
      console.log('[ClaudeController] node-notifier not installed. Desktop notifications disabled.');
      this.notifier = null;
    }
  }

  /**
   * PHASE 1A: Notify user to pause Claude Code
   */
  async notifyUserToPause() {
    const message = [
      '',
      '='.repeat(60),
      '⚠️  RATE LIMIT REACHED - PLEASE PAUSE CLAUDE CODE',
      '='.repeat(60),
      '',
      'Action Required:',
      '  1. Press Ctrl+C in your Claude Code terminal',
      '  2. Or close Claude Code VSCode windows',
      '',
      'Daemon will notify you when ready to resume.',
      '='.repeat(60),
      ''
    ].join('\n');

    console.log(message);
    this.sendDesktopNotification('infiniteDEV', 'Rate limit reached. Please pause Claude Code.');

    return { success: true, userNotified: true };
  }

  /**
   * PHASE 1A: Notify user that Claude Code can resume
   */
  async notifyUserToResume() {
    const message = [
      '',
      '='.repeat(60),
      '✅  RATE LIMIT REFRESHED - READY TO RESUME',
      '='.repeat(60),
      '',
      'You can now resume Claude Code!',
      '  - Start new session: claude-code',
      '  - Continue previous task',
      '',
      '='.repeat(60),
      ''
    ].join('\n');

    console.log(message);
    this.sendDesktopNotification('infiniteDEV', 'Rate limits refreshed! Resume work.');

    return { success: true, userNotified: true };
  }

  /**
   * Send desktop notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  sendDesktopNotification(title, message) {
    if (!this.notifier) {
      return;
    }

    try {
      this.notifier.notify(
        {
          title: title,
          message: message,
          sound: true,
          wait: false
        },
        (error, response) => {
          if (error) {
            console.log(`[ClaudeController] Notification error: ${error.message}`);
          }
        }
      );
    } catch (error) {
      console.log(`[ClaudeController] Failed to send notification: ${error.message}`);
    }
  }

  /**
   * PHASE 1B: Track active Claude Code processes
   */
  async trackProcesses() {
    const detection = await this.detector.detectProcesses();
    console.log(`[ClaudeController] Detected ${detection.count} Claude processes`);
    return detection;
  }

  /**
   * Get current status
   */
  async getStatus() {
    const detection = await this.detector.detectProcesses();
    const isRunning = await this.detector.isClaudeRunning();
    const session = await this.detector.getActiveSessions();

    return {
      running: isRunning,
      processCount: detection.count,
      hasPausedProcesses: this.pausedProcesses.length > 0,
      lastSession: session,
      processes: detection.processes
    };
  }

  /**
   * PHASE 1C: Detect which resume strategy to use
   * Strategy 1: stdin (Claude Code still running, send "continue")
   * Strategy 2: restart (Claude Code exited, run `claude --resume`)
   */
  async detectResumeStrategy() {
    const detection = await this.detector.detectProcesses();

    if (detection.running && detection.count > 0) {
      // Claude Code still running - can try stdin strategy
      return {
        strategy: 'stdin',
        processes: detection.processes,
        canResume: true,
        reason: 'claude_still_running'
      };
    } else {
      // Claude Code exited - need restart strategy
      const lastSession = await this.detector.getActiveSessions();
      return {
        strategy: 'restart',
        lastSession: lastSession,
        canResume: lastSession !== null,
        reason: 'claude_exited'
      };
    }
  }

  /**
   * PHASE 1C-Alpha: Find tmux session running Claude Code
   * Returns session name if found, null otherwise
   */
  async findClaudeTmuxSession() {
    try {
      const sessions = execSync('tmux list-sessions 2>/dev/null || true', {
        encoding: 'utf8'
      });

      if (!sessions || sessions.trim().length === 0) {
        return null;
      }

      // Look for tmux sessions with 'claude' in the name
      const lines = sessions.trim().split('\n');
      for (const line of lines) {
        if (line.includes('claude')) {
          // Extract session name (before the colon)
          const sessionName = line.split(':')[0];
          console.log(`[ClaudeController] Found tmux session: ${sessionName}`);
          return sessionName;
        }
      }

      // If no claude-named session, check all sessions for Claude processes
      for (const line of lines) {
        const sessionName = line.split(':')[0];
        try {
          // Check if this session has any Claude processes
          const windowList = execSync(`tmux list-windows -t ${sessionName} 2>/dev/null || true`, {
            encoding: 'utf8'
          });

          if (windowList.includes('claude')) {
            console.log(`[ClaudeController] Found Claude in tmux session: ${sessionName}`);
            return sessionName;
          }
        } catch (error) {
          // Skip this session
        }
      }

      return null;
    } catch (error) {
      console.error(`[ClaudeController] Error finding tmux session: ${error.message}`);
      return null;
    }
  }

  /**
   * PHASE 1C-Alpha: Send input to Claude Code via tmux
   * Sends a prompt string to the tmux session's stdin
   */
  async sendStdinToClaude(prompt = 'continue') {
    try {
      const detection = await this.detector.detectProcesses();

      if (!detection.running) {
        console.log('[ClaudeController] Claude Code not running, cannot send stdin');
        return { success: false, reason: 'not_running' };
      }

      // Try to find tmux session
      const tmuxSession = await this.findClaudeTmuxSession();
      if (!tmuxSession) {
        console.log('[ClaudeController] No tmux session found for Claude Code');
        return { success: false, reason: 'no_tmux_session' };
      }

      // Send input to tmux session
      execSync(`tmux send-keys -t ${tmuxSession} "${prompt}" Enter`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      console.log(`[ClaudeController] Sent "${prompt}" to tmux session ${tmuxSession}`);
      return { success: true, method: 'tmux', session: tmuxSession, prompt: prompt };
    } catch (error) {
      console.error(`[ClaudeController] Error sending stdin to Claude: ${error.message}`);
      return { success: false, reason: 'send_error', error: error.message };
    }
  }

  /**
   * PHASE 1C-Alpha: Restart Claude Code with `claude --resume`
   * Spawns a new Claude Code process in the working directory
   */
  async restartClaude(workingDir = null, sessionId = null) {
    try {
      const dir = workingDir || process.cwd();
      console.log(`[ClaudeController] Restarting Claude Code in ${dir}`);

      // Spawn claude --resume in the working directory
      // Use stdio: 'inherit' to pass through to user's terminal
      const claudeProcess = spawn('claude', ['--resume'], {
        cwd: dir,
        stdio: 'inherit',
        detached: false,
        shell: true
      });

      console.log(`[ClaudeController] Started Claude Code (PID: ${claudeProcess.pid})`);

      return {
        success: true,
        pid: claudeProcess.pid,
        method: 'restart',
        directory: dir
      };
    } catch (error) {
      console.error(`[ClaudeController] Error restarting Claude: ${error.message}`);
      return { success: false, reason: 'spawn_error', error: error.message };
    }
  }

  /**
   * Helper to check if process exists
   */
  isProcessRunning(pid) {
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists without killing it
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * PHASE 1B: Unified auto-resume logic using session tracking
   * Uses registered session data for reliable resume
   */
  async resumeClaudeCode(options = {}) {
    console.log('[ClaudeController] Attempting automatic resume...');

    try {
      // Phase 1B: Try to use session tracking data first
      if (this.stateManager) {
        const activeSessionId = await this.stateManager.getState('active_session');

        if (activeSessionId) {
          const sessionData = await this.stateManager.getState(`session:${activeSessionId}`);

          if (sessionData) {
            console.log(`[ClaudeController] Found active session: ${activeSessionId}`);
            console.log(`[ClaudeController] Working dir: ${sessionData.workingDir}`);
            console.log(`[ClaudeController] PID: ${sessionData.pid}`);

            // Strategy 1: Check if process still exists
            const isStillRunning = this.isProcessRunning(sessionData.pid);

            if (isStillRunning) {
              console.log('[ClaudeController] Claude Code process still running, attempting stdin strategy');
              const prompt = options.customPrompt || this.config?.resumePrompt || 'continue';
              const result = await this.sendStdinToClaude(prompt);

              if (result.success) {
                console.log('[ClaudeController] Auto-resume successful via stdin');
                return { success: true, method: 'stdin', sessionId: activeSessionId, ...result };
              }
            }

            // Strategy 2: Restart in the correct working directory
            console.log('[ClaudeController] Attempting restart in working directory');
            const result = await this.restartClaude(sessionData.workingDir, activeSessionId);

            if (result.success) {
              console.log('[ClaudeController] Auto-resume successful via restart');
              return { success: true, method: 'restart', sessionId: activeSessionId, ...result };
            }

            // Phase 1B session tracking failed, fall back to passive detection
            console.log('[ClaudeController] Session-based strategies failed, falling back to passive detection');
          }
        }
      }

      // Fallback: Use passive detection if session tracking not available
      console.log('[ClaudeController] Using passive detection for resume strategy');
      const strategy = await this.detectResumeStrategy();
      console.log(`[ClaudeController] Resume strategy detected: ${strategy.strategy} (${strategy.reason})`);

      // Strategy 1: Try to send stdin to running Claude Code
      if (strategy.strategy === 'stdin') {
        const prompt = options.customPrompt || this.config?.resumePrompt || 'continue';
        console.log('[ClaudeController] Attempting stdin resume strategy...');
        const result = await this.sendStdinToClaude(prompt);

        if (result.success) {
          console.log('[ClaudeController] Auto-resume successful via stdin');
          return { success: true, method: 'stdin', ...result };
        }

        console.log('[ClaudeController] Stdin strategy failed, falling back to restart');
      }

      // Strategy 2: Restart Claude Code
      if (strategy.strategy === 'restart' || !strategy.canResume) {
        if (strategy.lastSession || !strategy.canResume) {
          const workingDir = options.workingDir || process.cwd();
          console.log('[ClaudeController] Attempting restart resume strategy...');
          const result = await this.restartClaude(workingDir, strategy.lastSession?.sessionId);

          if (result.success) {
            console.log('[ClaudeController] Auto-resume successful via restart');
            return { success: true, method: 'restart', ...result };
          }
        }
      }

      // All strategies failed - notify user
      console.log('[ClaudeController] All auto-resume strategies failed, notifying user');
      await this.notifyUserToResume();

      return {
        success: false,
        reason: 'all_strategies_failed',
        notified: true
      };
    } catch (error) {
      console.error(`[ClaudeController] Error during auto-resume: ${error.message}`);
      await this.notifyUserToResume(); // Fallback
      return {
        success: false,
        reason: 'unexpected_error',
        error: error.message,
        notified: true
      };
    }
  }
}

module.exports = ClaudeController;
