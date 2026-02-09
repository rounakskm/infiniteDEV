/**
 * Log Monitor
 * Watches log files for rate limit signals in real-time
 * Supports both single files and directories (watches latest file)
 */

const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');

class LogMonitor {
  constructor(logPathOrDir, options = {}) {
    this.logPathOrDir = logPathOrDir;
    this.watchLatestFile = options.watchLatestFile || false;
    this.currentLogPath = null;
    this.tail = null;
    this.rateLimitPatterns = [
      /rate.?limit.?(exceeded|error)/i,
      /429.*rate_limit_error/i,
      /quota.?exceeded/i,
      /\[ERROR\].*rate.?limit/i,
      /This request would exceed your account's rate limit/i
    ];
  }

  /**
   * Get the log file path (resolves to latest file if watching directory)
   */
  async getLogPath() {
    if (!this.watchLatestFile) {
      return this.logPathOrDir;
    }

    // Watch most recent file in directory
    if (!fs.existsSync(this.logPathOrDir)) {
      throw new Error(`Directory not found: ${this.logPathOrDir}`);
    }

    const files = fs
      .readdirSync(this.logPathOrDir)
      .filter(f => f.endsWith('.txt'))
      .map(f => ({
        name: f,
        path: path.join(this.logPathOrDir, f),
        mtime: fs.statSync(path.join(this.logPathOrDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      throw new Error('No .txt log files found in ' + this.logPathOrDir);
    }

    return files[0].path;
  }

  /**
   * Start watching log file(s)
   */
  watch(callback) {
    this.start()
      .then(() => this.startTailing(callback))
      .catch(error => {
        console.error('[LogMonitor] Error starting watch:', error.message);
        // Retry after delay
        setTimeout(() => this.watch(callback), 5000);
      });
  }

  /**
   * Initialize log path and wait for file to exist
   */
  async start() {
    try {
      this.currentLogPath = await this.getLogPath();
      console.log(`[LogMonitor] Watching: ${this.currentLogPath}`);

      // Check if file exists, wait if needed
      if (!fs.existsSync(this.currentLogPath)) {
        console.log(`[LogMonitor] Waiting for log file to exist: ${this.currentLogPath}`);
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (fs.existsSync(this.currentLogPath)) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 1000);

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Log file did not appear within timeout'));
          }, 30000);
        });
      }
    } catch (error) {
      console.error('[LogMonitor] Error starting:', error.message);
      throw error;
    }
  }

  startTailing(callback) {
    try {
      const logPath = this.currentLogPath || this.logPathOrDir;
      this.tail = new Tail(logPath, {
        follow: true,
        useWatchFile: true,
        nLines: 10 // Start from last 10 lines
      });

      this.tail.on('line', (line) => {
        const signal = this.analyzeLine(line);
        if (signal) {
          console.log('[LogMonitor] Rate limit signal detected:', signal);
          callback(signal);
        }
      });

      this.tail.on('error', (error) => {
        console.error('[LogMonitor] Error tailing log file:', error.message);
        // Reconnect after delay
        setTimeout(() => this.startTailing(callback), 5000);
      });

      console.log('[LogMonitor] Watching log file:', logPath);
    } catch (error) {
      console.error('[LogMonitor] Error starting tail:', error.message);
    }
  }

  analyzeLine(line) {
    for (const pattern of this.rateLimitPatterns) {
      if (pattern.test(line)) {
        return {
          type: 'RATE_LIMIT',
          timestamp: Date.now(),
          rawLine: line,
          limitType: this.determineLimitType(line),
          resetTime: this.extractResetTime(line)
        };
      }
    }
    return null;
  }

  determineLimitType(line) {
    if (line.includes('5 hour') || line.includes('5-hour')) {
      return '5_hour';
    }
    if (line.includes('weekly') || line.includes('week')) {
      return 'weekly';
    }
    return 'unknown';
  }

  extractResetTime(line) {
    // Look for "Retry-After: 18000" or similar
    const retryMatch = line.match(/Retry-After[:\s]+(\d+)/i);
    if (retryMatch) {
      const seconds = parseInt(retryMatch[1]);
      return Date.now() + seconds * 1000;
    }

    // Look for "try again in X hours"
    const hoursMatch = line.match(/try again in (\d+)\s*hours?/i);
    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1]);
      return Date.now() + hours * 3600 * 1000;
    }

    // Default to 5 hours
    return Date.now() + 5 * 3600 * 1000;
  }

  stop() {
    if (this.tail) {
      this.tail.unwatch();
      this.tail = null;
    }
  }
}

module.exports = LogMonitor;
