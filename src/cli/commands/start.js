/**
 * Start Command
 * Start daemon and Mayor
 */

const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

function startCommand(projectRoot) {
  const spinner = ora('Starting services...').start();

  try {
    execSync('pm2 start ecosystem.config.js', {
      cwd: projectRoot,
      stdio: 'pipe'
    });

    spinner.succeed('Services started');
    console.log('\n' + chalk.green('✓ All services are running\n'));

    try {
      const status = execSync('pm2 status --silent', {
        encoding: 'utf8'
      });
      console.log(status);
    } catch (e) {
      // PM2 status output format varies
    }

    console.log(chalk.cyan('\nTip:') + ' Use "idev status" to check the system\n');
  } catch (error) {
    spinner.fail('Failed to start services');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = startCommand;
