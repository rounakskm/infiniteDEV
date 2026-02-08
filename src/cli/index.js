#!/usr/bin/env node

/**
 * infiniteDEV CLI Tool
 * Main user interface for 24/7 Claude Code orchestration
 */

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { version } = require('../../package.json');

const PROJECT_ROOT = process.cwd();

// Import command modules
const initCommand = require('./commands/init');
const startCommand = require('./commands/start');
const stopCommand = require('./commands/stop');
const statusCommand = require('./commands/status');
const taskCommand = require('./commands/task');
const configCommand = require('./commands/config');
const logsCommand = require('./commands/logs');

// Setup CLI
program
  .name('idev')
  .description('24/7 Claude Code Orchestration System')
  .version(version, '-v, --version')
  .helpOption('-h, --help');

// System commands
program
  .command('init')
  .description('Initialize infiniteDEV in current repository')
  .option('--tier <tier>', 'Set subscription tier (pro-20, max-100, max-200)')
  .action((options) => initCommand(PROJECT_ROOT, options));

program
  .command('start')
  .description('Start daemon and Mayor')
  .action(() => startCommand(PROJECT_ROOT));

program
  .command('stop')
  .description('Stop all services')
  .action(() => stopCommand(PROJECT_ROOT));

program
  .command('restart')
  .description('Restart all services')
  .action(() => {
    stopCommand(PROJECT_ROOT);
    setTimeout(() => startCommand(PROJECT_ROOT), 2000);
  });

program
  .command('pause')
  .description('Manually pause orchestration')
  .action(() => {
    const axios = require('axios');
    axios
      .post('http://localhost:3030/pause')
      .then((res) => {
        console.log('✓ System paused');
        console.log(res.data.message);
      })
      .catch((error) => {
        console.error('✗ Error pausing system:', error.message);
        process.exit(1);
      });
  });

program
  .command('resume')
  .description('Resume orchestration after pause')
  .action(() => {
    const axios = require('axios');
    axios
      .post('http://localhost:3030/resume')
      .then((res) => {
        console.log('✓ System resumed');
        console.log(res.data.message);
      })
      .catch((error) => {
        console.error('✗ Error resuming system:', error.message);
        process.exit(1);
      });
  });

program
  .command('status')
  .description('Show system status')
  .option('--json', 'Output as JSON')
  .action((options) => statusCommand(PROJECT_ROOT, options));

// Task management
program
  .command('task <subcommand>')
  .description('Manage tasks (create, list, ready, show, assign)')
  .option('--type <type>', 'Task type (feature, bug, task, architecture, implementation, test, review)')
  .option('--priority <priority>', 'Priority (high, medium, low)')
  .option('--labels <labels>', 'Comma-separated labels')
  .option('--parent <id>', 'Parent task ID')
  .option('--json', 'Output as JSON')
  .action((subcommand, options, command) => {
    taskCommand(PROJECT_ROOT, subcommand, command.args[1], options);
  });

// Configuration
program
  .command('config <subcommand>')
  .description('Manage configuration (show, set, reset)')
  .option('--json', 'Output as JSON')
  .action((subcommand, options, command) => {
    configCommand(PROJECT_ROOT, subcommand, command.args[1], options);
  });

// Logs
program
  .command('logs')
  .description('View logs')
  .option('-c, --component <component>', 'Component to view logs for (daemon, mayor, health)')
  .option('--lines <lines>', 'Number of lines to display')
  .action((options) => logsCommand(PROJECT_ROOT, options));

// Agent management
program
  .command('agents')
  .description('List all agents')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const { execSync } = require('child_process');
    try {
      const result = execSync('pm2 list --json', {
        encoding: 'utf8'
      });
      const processes = JSON.parse(result).filter((p) => p.name.startsWith('infinitedev'));

      if (options.json) {
        console.log(JSON.stringify(processes, null, 2));
      } else {
        console.log('\nActive agents:');
        console.log('─'.repeat(70));
        processes.forEach((p) => {
          console.log(`  ${p.name.padEnd(25)} ${p.pm2_env.status.padEnd(15)} Memory: ${(p.monit.memory / 1024 / 1024).toFixed(0)}MB`);
        });
        console.log('─'.repeat(70));
      }
    } catch (error) {
      console.error('✗ Error listing agents:', error.message);
      process.exit(1);
    }
  });

// Metrics
program
  .command('metrics')
  .description('Show usage metrics')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const axios = require('axios');
    axios
      .get('http://localhost:3030/metrics')
      .then((res) => {
        if (options.json) {
          console.log(JSON.stringify(res.data, null, 2));
        } else {
          console.log('\nSystem Metrics');
          console.log('─'.repeat(50));
          console.log(`  Uptime: ${(res.data.uptime / 3600).toFixed(1)} hours`);
          console.log(`  Memory: ${res.data.memory.heapUsed} / ${res.data.memory.heapTotal}`);
          console.log(`  Tasks: ${res.data.tasks.total} total, ${res.data.tasks.completed} completed`);
          console.log('─'.repeat(50));
        }
      })
      .catch((error) => {
        console.error('✗ Error retrieving metrics:', error.message);
        process.exit(1);
      });
  });

// Help command
program
  .command('help [command]')
  .description('Show help for a command')
  .action((command) => {
    if (command) {
      program.parse(['node', 'idev', command, '-h']);
    } else {
      program.outputHelp();
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

module.exports = program;
