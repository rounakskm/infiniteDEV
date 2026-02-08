/**
 * Gastown Controller
 * Manages Mayor lifecycle (pause, resume, health checks)
 */

const { execSync, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class GastownController {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.mayorSession = 'infinitedev-mayor';
  }

  async pauseMayor() {
    try {
      // Send Ctrl-C to the Mayor tmux session
      execSync(`tmux send-keys -t ${this.mayorSession} C-c`, {
        cwd: this.projectRoot
      });

      console.log('[GastownController] Mayor pause signal sent');

      // Wait a moment for Mayor to exit gracefully
      await this.sleep(2000);

      return true;
    } catch (error) {
      console.error('[GastownController] Error pausing Mayor:', error.message);
      return false;
    }
  }

  async resumeMayor() {
    try {
      // Start Mayor in tmux session
      const mayorCommand = 'cd .gastown && gt mayor attach --loop --interval 30s';

      execSync(`tmux new-session -d -s ${this.mayorSession} -c ${this.projectRoot} "${mayorCommand}"`, {
        stdio: 'pipe'
      });

      console.log('[GastownController] Mayor resume command sent');

      // Wait for Mayor to fully initialize
      await this.sleep(3000);

      return true;
    } catch (error) {
      // Session might already exist, try to send keys instead
      try {
        execSync(`tmux send-keys -t ${this.mayorSession} "cd .gastown && gt mayor attach --loop --interval 30s" Enter`, {
          cwd: this.projectRoot
        });
        console.log('[GastownController] Mayor resumed via existing session');
        return true;
      } catch (innerError) {
        console.error('[GastownController] Error resuming Mayor:', innerError.message);
        return false;
      }
    }
  }

  async isMayorRunning() {
    try {
      const result = execSync(`tmux list-sessions 2>/dev/null | grep ${this.mayorSession}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  async getMayorStatus() {
    try {
      const isRunning = await this.isMayorRunning();
      return {
        running: isRunning,
        session: this.mayorSession,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        running: false,
        error: error.message
      };
    }
  }

  async getMayorLogs(lines = 50) {
    try {
      const result = execSync(`tmux capture-pane -t ${this.mayorSession} -p | tail -n ${lines}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return result.split('\n');
    } catch (error) {
      return ['Error retrieving Mayor logs:', error.message];
    }
  }

  async getReadyTasks() {
    try {
      const result = execSync('bd ready --json', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      return JSON.parse(result);
    } catch (error) {
      console.error('[GastownController] Error getting ready tasks:', error.message);
      return [];
    }
  }

  async listAgents() {
    try {
      const result = execSync('gt crew list --json', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      return JSON.parse(result);
    } catch (error) {
      console.error('[GastownController] Error listing agents:', error.message);
      return [];
    }
  }

  async getConvoyStatus() {
    try {
      const result = execSync('gt convoy list --json', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      return JSON.parse(result);
    } catch (error) {
      console.error('[GastownController] Error getting convoy status:', error.message);
      return [];
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = GastownController;
