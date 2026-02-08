/**
 * Config Command
 * Manage configuration
 */

const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');

async function configCommand(projectRoot, subcommand, arg, options) {
  const configPath = path.join(projectRoot, '.infinitedev', 'config.json');

  try {
    switch (subcommand) {
      case 'show': {
        const content = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        if (options.json) {
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log('\n' + chalk.bold('infiniteDEV Configuration\n'));
          console.log(`Tier: ${chalk.cyan(config.tier)}`);
          console.log(`Limits: ${config.limits.prompts} prompts per ${config.limits.window / (1000 * 60 * 60)}h`);
          console.log('\nPersonas:');
          Object.entries(config.personas).forEach(([name, settings]) => {
            console.log(`  ${name}: ${settings.enabled ? '✓' : '✗'} (${settings.instances} instance)`);
          });
          console.log();
        }
        break;
      }

      case 'set': {
        if (!arg) {
          console.error(chalk.red('Error: key=value pair required'));
          console.log('Usage: idev config set key value');
          process.exit(1);
        }

        const content = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        const keys = arg.split('.');
        let current = config;

        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        current[lastKey] = isNaN(arg) ? arg : Number(arg);

        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(chalk.green(`✓ Config updated: ${arg}`));
        break;
      }

      case 'reset': {
        const defaultConfig = {
          version: '1.0.0',
          tier: 'pro-20',
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
        console.log(chalk.green('✓ Configuration reset to defaults'));
        break;
      }

      default:
        console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
        console.log('Valid subcommands: show, set, reset');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('✗ Error:'), error.message);
    process.exit(1);
  }
}

module.exports = configCommand;
