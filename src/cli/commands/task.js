/**
 * Task Command
 * Manage tasks (create, list, ready, show)
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

function taskCommand(projectRoot, subcommand, arg, options) {
  try {
    switch (subcommand) {
      case 'create': {
        const title = arg;
        if (!title) {
          console.error(chalk.red('Error: Task title is required'));
          console.log('Usage: idev task create "Task title" [options]');
          process.exit(1);
        }

        let cmd = `bd create "${title}"`;
        if (options.type) cmd += ` --type ${options.type}`;
        if (options.priority) {
          const priorityMap = { high: 0, medium: 1, low: 2 };
          cmd += ` --priority ${priorityMap[options.priority] || 1}`;
        }
        if (options.labels) cmd += ` --labels ${options.labels}`;
        if (options.parent) cmd += ` --parent ${options.parent}`;

        cmd += ' --json';

        const result = execSync(cmd, {
          cwd: projectRoot,
          encoding: 'utf8'
        });

        const task = JSON.parse(result);
        console.log(chalk.green(`✓ Task created: ${chalk.cyan(task.id)}`));
        console.log(`  Title: ${task.title}`);
        break;
      }

      case 'list': {
        let cmd = 'bd list --json';
        if (options.json) {
          cmd = cmd.replace('--json', '');
        }

        const result = execSync(cmd, {
          cwd: projectRoot,
          encoding: 'utf8'
        });

        if (options.json) {
          console.log(result);
        } else {
          const tasks = JSON.parse(result);
          console.log(`\nFound ${tasks.length} tasks:\n`);
          tasks.forEach((t) => {
            const statusColor = {
              open: 'cyan',
              'in_progress': 'yellow',
              closed: 'green',
              blocked: 'red'
            }[t.status] || 'white';

            console.log(
              `  ${chalk.cyan(t.id)} ${chalk[statusColor](t.status.padEnd(12))} ${t.title}`
            );
          });
          console.log();
        }
        break;
      }

      case 'ready': {
        const result = execSync('bd ready --json', {
          cwd: projectRoot,
          encoding: 'utf8'
        });

        const tasks = JSON.parse(result);
        console.log(`\n${chalk.green(tasks.length)} tasks ready for assignment:\n`);
        tasks.forEach((t) => {
          console.log(`  ${chalk.cyan(t.id)} [${t.type}] ${t.title}`);
        });
        console.log();
        break;
      }

      case 'show': {
        if (!arg) {
          console.error(chalk.red('Error: Task ID is required'));
          process.exit(1);
        }

        const result = execSync(`bd show ${arg} --json`, {
          cwd: projectRoot,
          encoding: 'utf8'
        });

        const task = JSON.parse(result);

        console.log(`\n${chalk.bold('Task Details')}`);
        console.log(chalk.blue('─'.repeat(70)));
        console.log(`ID:     ${chalk.cyan(task.id)}`);
        console.log(`Title:  ${task.title}`);
        console.log(`Status: ${task.status}`);
        console.log(`Type:   ${task.type}`);
        console.log(`Priority: ${task.priority || 'medium'}`);
        if (task.description) {
          console.log(`\nDescription:\n${task.description}`);
        }
        console.log(chalk.blue('─'.repeat(70)) + '\n');
        break;
      }

      default:
        console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
        console.log('Valid subcommands: create, list, ready, show');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('✗ Error:'), error.message);
    process.exit(1);
  }
}

module.exports = taskCommand;
