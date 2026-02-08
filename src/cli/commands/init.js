/**
 * Init Command
 * Initialize infiniteDEV
 */

const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');

async function initCommand(projectRoot, options) {
  const infinitedevDir = path.join(projectRoot, '.infinitedev');

  console.log(chalk.blue('Initializing infiniteDEV...'));

  try {
    // Create .infinitedev directory
    await fs.mkdir(infinitedevDir, { recursive: true });

    // Create config.json if it doesn't exist
    const configPath = path.join(infinitedevDir, 'config.json');
    const configExists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);

    if (!configExists) {
      const defaultConfig = {
        version: '1.0.0',
        tier: options.tier || 'pro-20',
        limits: {
          window: 18000000,
          prompts: 45,
          weeklyHours: 60
        },
        personas: {
          architect: { enabled: true, instances: 1 },
          builder: { enabled: true, instances: 2 },
          tester: { enabled: true, instances: 1 },
          reviewer: { enabled: true, instances: 1 },
          'lead-dev': { enabled: true, instances: 1 }
        },
        mayor: {
          pollInterval: 30,
          maxConcurrentTasks: 5
        },
        daemon: {
          checkInterval: 5,
          preemptivePause: true,
          preemptiveThreshold: 0.9
        }
      };

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(chalk.green('✓ Configuration created'));
    } else {
      console.log(chalk.yellow('⚠ Configuration already exists'));
    }

    // Create logs directory
    await fs.mkdir(path.join(infinitedevDir, 'logs'), { recursive: true });

    console.log(chalk.green('\n✓ infiniteDEV initialized successfully!\n'));
    console.log('Next steps:');
    console.log(`  ${chalk.cyan('idev start')}   - Start the daemon and Mayor`);
    console.log(`  ${chalk.cyan('idev status')}  - Check system status`);
    console.log(`  ${chalk.cyan('idev task create "Task"')} - Create your first task\n`);
  } catch (error) {
    console.error(chalk.red('✗ Initialization failed:'), error.message);
    process.exit(1);
  }
}

module.exports = initCommand;
