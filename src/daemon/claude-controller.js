/**
 * Claude Code Controller
 * Controls Claude Code pause/resume operations
 * Phase 1A: User notifications only (safe approach)
 * Phase 1C: Signal-based automation (future)
 */

const ClaudeDetector = require('./claude-detector');

class ClaudeController {
  constructor() {
    this.detector = new ClaudeDetector();
    this.pausedProcesses = []; // Track paused processes for Phase 1C
    this.notifier = null;

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
   * PHASE 1C: Pause Claude Code via SIGTSTP signal
   * WARNING: Experimental - ensure Claude Code handles signals gracefully
   */
  async pauseClaudeCode() {
    const detection = await this.detector.detectProcesses();

    if (!detection.running) {
      console.log('[ClaudeController] No Claude processes to pause');
      return { success: false, reason: 'not_running', paused: 0 };
    }

    const paused = [];
    for (const proc of detection.processes) {
      try {
        process.kill(proc.pid, 'SIGTSTP');
        paused.push(proc.pid);
        console.log(`[ClaudeController] Sent SIGTSTP to PID ${proc.pid}`);
      } catch (error) {
        console.error(`[ClaudeController] Failed to pause PID ${proc.pid}: ${error.message}`);
      }
    }

    this.pausedProcesses = detection.processes;
    console.log(`[ClaudeController] Paused ${paused.length} Claude processes`);

    return { success: paused.length > 0, paused: paused.length, pids: paused };
  }

  /**
   * PHASE 1C: Resume Claude Code via SIGCONT signal
   * WARNING: Experimental - ensure Claude Code handles signals gracefully
   */
  async resumeClaudeCode() {
    if (this.pausedProcesses.length === 0) {
      console.log('[ClaudeController] No paused processes to resume');
      return { success: false, reason: 'no_processes', resumed: 0 };
    }

    const resumed = [];
    for (const proc of this.pausedProcesses) {
      try {
        process.kill(proc.pid, 'SIGCONT');
        resumed.push(proc.pid);
        console.log(`[ClaudeController] Sent SIGCONT to PID ${proc.pid}`);
      } catch (error) {
        console.error(`[ClaudeController] Failed to resume PID ${proc.pid}: ${error.message}`);
      }
    }

    const count = this.pausedProcesses.length;
    this.pausedProcesses = [];
    console.log(`[ClaudeController] Resumed ${resumed.length} Claude processes`);

    return { success: resumed.length > 0, resumed: resumed.length, pids: resumed };
  }
}

module.exports = ClaudeController;
