/**
 * Rate Limiter - Hybrid detection strategy
 * Monitors Claude API rate limits using logs, headers, and heuristics
 */

class RateLimiter {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.config = null;
    this.tierLimits = {
      'pro-20': {
        window: 5 * 60 * 60 * 1000, // 5 hours
        prompts: 45,
        weeklyHours: 60
      },
      'max-100': {
        window: 5 * 60 * 60 * 1000,
        prompts: 250,
        weeklyHours: 300
      },
      'max-200': {
        window: 5 * 60 * 60 * 1000,
        prompts: 800,
        weeklyHours: 1000
      }
    };
  }

  setConfig(config) {
    this.config = config;
  }

  getTierLimits(tier) {
    return this.tierLimits[tier] || this.tierLimits['pro-20'];
  }

  shouldPause(usage) {
    if (!this.config) return false;

    const limits = this.getTierLimits(this.config.tier);
    const { preemptivePause, preemptiveThreshold } = this.config.daemon || {};

    if (!preemptivePause) return false;

    const usedPrompts = usage.prompts_used || 0;
    const threshold = limits.prompts * (preemptiveThreshold || 0.9);

    return usedPrompts >= threshold;
  }

  calculateNextResetTime() {
    const limits = this.getTierLimits(this.config.tier);
    const now = new Date();

    // For 5-hour window: next reset is now + 5 hours
    if (limits.window === 5 * 60 * 60 * 1000) {
      return now.getTime() + limits.window;
    }

    // For weekly limit: reset on Monday 00:00 UTC
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7 || 7));
    nextMonday.setUTCHours(0, 0, 0, 0);

    return nextMonday.getTime();
  }

  parseRateLimitFromLog(logLine) {
    // Check for rate limit indicators
    const patterns = [
      /rate limit exceeded/i,
      /429 Too Many Requests/i,
      /quota exceeded/i,
      /retry-after:\s*(\d+)/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(logLine)) {
        return {
          detected: true,
          type: this.extractLimitType(logLine),
          resetTime: this.extractResetTime(logLine)
        };
      }
    }

    return { detected: false };
  }

  extractLimitType(logLine) {
    if (logLine.includes('5 hour') || logLine.includes('5-hour')) {
      return '5_hour';
    }
    if (logLine.includes('weekly') || logLine.includes('week')) {
      return 'weekly';
    }
    return 'unknown';
  }

  extractResetTime(logLine) {
    // Try to extract Retry-After value
    const retryMatch = logLine.match(/retry-after:\s*(\d+)/i);
    if (retryMatch) {
      return Date.now() + parseInt(retryMatch[1]) * 1000;
    }

    // Try to extract time in "X hours" format
    const hoursMatch = logLine.match(/(\d+)\s*hours?/i);
    if (hoursMatch) {
      return Date.now() + parseInt(hoursMatch[1]) * 3600 * 1000;
    }

    // Default to 5 hours for unknown
    return Date.now() + 5 * 3600 * 1000;
  }

  parseApiHeaders(headers = {}) {
    const remaining5h = parseInt(headers['x-ratelimit-remaining-5h']) || null;
    const limit5h = parseInt(headers['x-ratelimit-limit-5h']) || null;
    const remainingWeekly = parseInt(headers['x-ratelimit-remaining-weekly']) || null;
    const limitWeekly = parseInt(headers['x-ratelimit-limit-weekly']) || null;

    const result = {
      remaining5h,
      limit5h,
      remainingWeekly,
      limitWeekly,
      shouldPause: false,
      reason: null
    };

    // Check if approaching 5-hour limit
    if (limit5h && remaining5h !== null) {
      const threshold = limit5h * 0.1; // 10% remaining
      if (remaining5h <= threshold) {
        result.shouldPause = true;
        result.reason = '5-hour limit approaching';
      }
    }

    // Check if approaching weekly limit
    if (limitWeekly && remainingWeekly !== null) {
      const threshold = limitWeekly * 0.05; // 5% remaining
      if (remainingWeekly <= threshold) {
        result.shouldPause = true;
        result.reason = 'Weekly limit approaching';
      }
    }

    return result;
  }

  formatWaitTime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

module.exports = RateLimiter;
