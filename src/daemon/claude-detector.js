/**
 * Claude Code Detector
 * Detects running Claude Code processes and sessions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ClaudeDetector {
  constructor() {
    this.claudeBinary = 'claude';
    this.claudeDebugDir = path.join(os.homedir(), '.claude', 'debug');
    this.claudeHistoryFile = path.join(os.homedir(), '.claude', 'history.jsonl');
  }

  /**
   * Detect all running Claude Code processes
   * @returns {Promise<{running: boolean, processes: Array, count: number}>}
   */
  async detectProcesses() {
    try {
      const result = execSync('ps aux | grep -i claude | grep -v grep', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (!result || result.trim().length === 0) {
        return { running: false, processes: [], count: 0 };
      }

      const processes = result
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split(/\s+/);
          return {
            pid: parseInt(parts[1]),
            user: parts[0],
            cpuUsage: parseFloat(parts[2]),
            memUsage: parseFloat(parts[3]),
            command: parts.slice(10).join(' ')
          };
        });

      return {
        running: processes.length > 0,
        processes: processes,
        count: processes.length
      };
    } catch (error) {
      // No processes running
      return { running: false, processes: [], count: 0 };
    }
  }

  /**
   * Check if Claude Code is currently running
   * @returns {Promise<boolean>}
   */
  async isClaudeRunning() {
    const detection = await this.detectProcesses();
    return detection.running;
  }

  /**
   * Get the most recent Claude Code debug log file
   * @returns {Promise<string>} Path to the latest debug log file
   */
  async findDebugLog() {
    try {
      if (!fs.existsSync(this.claudeDebugDir)) {
        console.log(`[ClaudeDetector] Debug directory not found: ${this.claudeDebugDir}`);
        return null;
      }

      const files = fs
        .readdirSync(this.claudeDebugDir)
        .filter(f => f.endsWith('.txt'))
        .map(f => ({
          name: f,
          path: path.join(this.claudeDebugDir, f),
          mtime: fs.statSync(path.join(this.claudeDebugDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) {
        console.log(`[ClaudeDetector] No .txt log files found in ${this.claudeDebugDir}`);
        return null;
      }

      return files[0].path;
    } catch (error) {
      console.error(`[ClaudeDetector] Error finding debug log: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the most recent active Claude Code session
   * @returns {Promise<{sessionId: string, timestamp: number, isRecent: boolean} | null>}
   */
  async getActiveSessions() {
    try {
      if (!fs.existsSync(this.claudeHistoryFile)) {
        console.log(`[ClaudeDetector] History file not found: ${this.claudeHistoryFile}`);
        return null;
      }

      const lines = fs
        .readFileSync(this.claudeHistoryFile, 'utf8')
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      if (lines.length === 0) {
        return null;
      }

      // Parse the last line (most recent session)
      const lastLine = lines[lines.length - 1];
      try {
        const session = JSON.parse(lastLine);
        const now = Date.now();
        const sessionTime = session.timestamp || 0;
        const isRecent = now - sessionTime < 3600000; // Within last hour

        return {
          sessionId: session.session_id || 'unknown',
          timestamp: sessionTime,
          isRecent: isRecent,
          command: session.command || 'unknown'
        };
      } catch (parseError) {
        console.log(`[ClaudeDetector] Could not parse history entry: ${parseError.message}`);
        return null;
      }
    } catch (error) {
      console.error(`[ClaudeDetector] Error getting sessions: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Claude Code binary location
   * @returns {string} Path to Claude Code binary
   */
  getClaudeBinary() {
    const localBinary = path.join(os.homedir(), '.local', 'bin', 'claude');
    if (fs.existsSync(localBinary)) {
      return localBinary;
    }

    // Try global path
    try {
      const result = execSync('which claude', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (result) return result;
    } catch (error) {
      // Not in PATH
    }

    // Return default
    return this.claudeBinary;
  }

  /**
   * Get Claude Code home directory
   * @returns {string} Path to ~/.claude directory
   */
  getClaudeHomeDir() {
    return path.join(os.homedir(), '.claude');
  }
}

module.exports = ClaudeDetector;
