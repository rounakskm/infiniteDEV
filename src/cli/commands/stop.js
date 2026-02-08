/**
 * Stop Command
 * Stop all services
 */

const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

function stopCommand(projectRoot) {
  const spinner = ora('Stopping services...').start();

  try {
    execSync('pm2 stop infinitedev-daemon infinitedev-health infinitedev-mayor', {
      cwd: projectRoot,
      stdio: 'pipe'
    });

    spinner.succeed('Services stopped');
    console.log(chalk.green('\n✓ All services have been stopped\n'));
  } catch (error) {
    spinner.fail('Error stopping services');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = stopCommand;
