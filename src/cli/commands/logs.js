/**
 * Logs Command
 * View service logs
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

function logsCommand(projectRoot, options) {
  try {
    let cmd = 'pm2 logs';

    if (options.component) {
      const validComponents = ['daemon', 'health', 'mayor'];
      if (!validComponents.includes(options.component)) {
        console.error(chalk.red('Invalid component. Valid options:'), validComponents.join(', '));
        process.exit(1);
      }
      cmd += ` infinitedev-${options.component}`;
    }

    if (options.lines) {
      cmd += ` --lines ${options.lines}`;
    } else {
      cmd += ' --lines 50';
    }

    cmd += ' --nostream';

    const result = execSync(cmd, {
      cwd: projectRoot,
      encoding: 'utf8'
    });

    console.log(result);
  } catch (error) {
    console.error(chalk.red('✗ Error:'), error.message);
    process.exit(1);
  }
}

module.exports = logsCommand;
