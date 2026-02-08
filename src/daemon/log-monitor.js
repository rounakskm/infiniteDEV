/**
 * Log Monitor
 * Watches log files for rate limit signals in real-time
 */

const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');

class LogMonitor {
  constructor(logPath) {
    this.logPath = logPath;
    this.tail = null;
    this.rateLimitPatterns = [
      /rate limit exceeded/i,
      /429 Too Many Requests/i,
      /quota exceeded/i,
      /\[ERROR\].*rate limit/i
    ];
  }

  watch(callback) {
    // Wait for log file to exist
    const checkFileExists = setInterval(() => {
      if (fs.existsSync(this.logPath)) {
        clearInterval(checkFileExists);
        this.startTailing(callback);
      }
    }, 1000);
  }

  startTailing(callback) {
    try {
      this.tail = new Tail(this.logPath, {
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

      console.log('[LogMonitor] Watching log file:', this.logPath);
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
