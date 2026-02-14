/**
 * State Manager for infiniteDEV
 * Manages SQLite database for rate limit events, agent sessions, and configuration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class StateManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    // Create directory if it doesn't exist
    const dir = path.dirname(this.dbPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) return reject(err);

        try {
          await this.createTables();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      `
        CREATE TABLE IF NOT EXISTS rate_limit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          tier TEXT,
          usage_data TEXT,
          reset_time INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON rate_limit_events(timestamp);
      `,
      `
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          status TEXT,
          prompts_used INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_name, start_time);
      `,
      `
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `
    ];

    for (const sql of tables) {
      await this.run(sql);
    }
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async recordLimitEvent(event) {
    const {
      timestamp,
      type,
      tier = 'unknown',
      usageData = null,
      resetTime = null
    } = event;

    await this.run(
      `INSERT INTO rate_limit_events (timestamp, event_type, tier, usage_data, reset_time)
       VALUES (?, ?, ?, ?, ?)`,
      [timestamp, type, tier, JSON.stringify(usageData), resetTime]
    );
  }

  async recordAgentSession(agentName, startTime, endTime = null, status = 'active', promptsUsed = 0) {
    if (endTime === null) {
      // Start new session
      const result = await this.run(
        `INSERT INTO agent_sessions (agent_name, start_time, status, prompts_used)
         VALUES (?, ?, ?, ?)`,
        [agentName, startTime, status, promptsUsed]
      );
      return result.lastID;
    } else {
      // Update existing session
      await this.run(
        `UPDATE agent_sessions
         SET end_time = ?, status = ?, prompts_used = ?
         WHERE agent_name = ? AND start_time = ?`,
        [endTime, status, promptsUsed, agentName, startTime]
      );
    }
  }

  async updateSessionPrompts(startTime, promptsUsed) {
    await this.run(
      `UPDATE agent_sessions SET prompts_used = ? WHERE agent_name = 'claude-code' AND start_time = ?`,
      [promptsUsed, startTime]
    );
  }

  async getCurrentUsage() {
    // Get usage from most recent session
    const row = await this.get(
      `SELECT prompts_used FROM agent_sessions
       ORDER BY start_time DESC LIMIT 1`
    );
    return row ? { prompts_used: row.prompts_used } : { prompts_used: 0 };
  }

  async getRecentEvents(limit = 50) {
    return await this.all(
      `SELECT * FROM rate_limit_events
       ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
  }

  async setState(key, value) {
    if (value === null) {
      // Delete state
      await this.run('DELETE FROM kv_store WHERE key = ?', [key]);
    } else {
      // Insert or update
      await this.run(
        `INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)`,
        [key, JSON.stringify(value)]
      );
    }
  }

  async getState(key) {
    const row = await this.get('SELECT value FROM kv_store WHERE key = ?', [key]);
    if (row) {
      try {
        return JSON.parse(row.value);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async cleanup(olderThanMs) {
    const cutoffTime = Date.now() - olderThanMs;
    await this.run(
      'DELETE FROM rate_limit_events WHERE timestamp < ?',
      [cutoffTime]
    );
    await this.run(
      'DELETE FROM agent_sessions WHERE start_time < ?',
      [cutoffTime]
    );
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = StateManager;
