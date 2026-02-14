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
   * Find the TTY of a running Claude Code process
   * Returns /dev/ttysXXX path or null
   */
  findClaudeTTY() {
    try {
      const result = execSync("ps -o pid,tty,command | grep -i claude | grep -v grep | grep -v infinitedev | head -1", {
        encoding: 'utf8'
      }).trim();

      if (!result) return null;

      // Parse: "  36483 ttys002  claude"
      const parts = result.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] !== '??') {
        const tty = `/dev/${parts[1]}`;
        console.log(`[ClaudeController] Found Claude Code on TTY: ${tty} (PID: ${parts[0]})`);
        return tty;
      }
      return null;
    } catch (error) {
      console.error(`[ClaudeController] Error finding Claude TTY: ${error.message}`);
      return null;
    }
  }

  /**
   * Send input to Claude Code by writing to its TTY
   * Works with any terminal (no tmux required)
   */
  async sendStdinToClaude(prompt = 'continue') {
    try {
      const detection = await this.detector.detectProcesses();

      if (!detection.running) {
        console.log('[ClaudeController] Claude Code not running, cannot send stdin');
        return { success: false, reason: 'not_running' };
      }

      const tty = this.findClaudeTTY();
      if (!tty) {
        console.log('[ClaudeController] Could not find Claude Code TTY');
        return { success: false, reason: 'no_tty' };
      }

      // Write the prompt + newline to the TTY
      const fs = require('fs');
      fs.writeFileSync(tty, prompt + '\n');

      console.log(`[ClaudeController] Sent "${prompt}" to ${tty}`);
      return { success: true, method: 'tty', tty, prompt };
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
   * Auto-resume Claude Code after rate limit cooldown.
   * Strategy 1: Find Claude's TTY and write "continue" to it (most common case)
   * Strategy 2: Desktop notification as fallback
   */
  async resumeClaudeCode(options = {}) {
    console.log('[ClaudeController] Attempting automatic resume...');

    try {
      const prompt = options.customPrompt || this.config?.resumePrompt || 'continue';

      // Strategy 1: Send prompt directly to Claude's TTY
      const result = await this.sendStdinToClaude(prompt);
      if (result.success) {
        console.log(`[ClaudeController] Auto-resume successful via ${result.method}`);
        return { success: true, ...result };
      }

      // Strategy 2: Notify user (Claude not running or TTY not found)
      console.log(`[ClaudeController] TTY strategy failed (${result.reason}), notifying user`);
      await this.notifyUserToResume();
      return { success: false, reason: result.reason, notified: true };
    } catch (error) {
      console.error(`[ClaudeController] Error during auto-resume: ${error.message}`);
      await this.notifyUserToResume();
      return { success: false, reason: 'error', error: error.message, notified: true };
    }
  }
}

module.exports = ClaudeController;
