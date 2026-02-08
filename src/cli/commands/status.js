/**
 * Status Command
 * Display system status
 */

const axios = require('axios');
const chalk = require('chalk');

async function statusCommand(projectRoot, options) {
  try {
    const response = await axios.get('http://localhost:3030/status', {
      timeout: 5000
    });

    const data = response.data;

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log('\n' + chalk.blue('═'.repeat(70)));
    console.log(chalk.blue('  infiniteDEV System Status'));
    console.log(chalk.blue('═'.repeat(70)));

    console.log('\n' + chalk.bold('Services:'));
    console.log(`  ${getStatusIcon(data.system.daemon)} Daemon:     ${chalk.cyan(data.system.daemon)}`);
    console.log(`  ${getStatusIcon(data.system.health)} Health API: ${chalk.cyan(data.system.health)}`);
    console.log(`  ${getStatusIcon(data.system.mayor)} Mayor:      ${chalk.cyan(data.system.mayor)}`);

    console.log('\n' + chalk.bold('Tasks:'));
    console.log(`  Total:       ${data.tasks.total}`);
    console.log(`  Ready:       ${chalk.green(data.tasks.ready)}`);
    console.log(`  Open:        ${data.tasks.byStatus.open}`);
    console.log(`  In Progress: ${data.tasks.byStatus.inProgress}`);
    console.log(`  Blocked:     ${data.tasks.byStatus.blocked}`);
    console.log(`  Closed:      ${data.tasks.byStatus.closed}`);

    if (data.readyTasks && data.readyTasks.length > 0) {
      console.log('\n' + chalk.bold('Next Tasks:'));
      data.readyTasks.forEach((t) => {
        console.log(`  • ${t.id}: ${t.title.substring(0, 50)}`);
      });
    }

    console.log('\n' + chalk.blue('═'.repeat(70)) + '\n');
  } catch (error) {
    console.error(chalk.red('✗ Error retrieving status:'), error.message);
    console.log('\nMake sure infiniteDEV is running:');
    console.log('  idev start');
    process.exit(1);
  }
}

function getStatusIcon(status) {
  return status === 'running' ? chalk.green('✓') : chalk.red('✗');
}

module.exports = statusCommand;
