import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { setApiKey, clearApiKey, getApiKey, getConfigPath } from '../lib/config.js';
import { getCurrentUser, validateApiKey } from '../lib/client.js';
import { handleError } from '../lib/errors.js';
import { output, success, info } from '../lib/output.js';
import type { GlobalOptions } from '../types/index.js';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage authentication');

  auth
    .command('login')
    .description('Store API token for Notion')
    .option('-t, --token <token>', 'API token (or use interactive prompt)')
    .action(async (options: { token?: string }) => {
      const globalOpts = auth.optsWithGlobals<GlobalOptions>();

      try {
        let token = options.token;

        if (!token) {
          console.log(chalk.bold('\nNotion API Token Setup\n'));
          console.log('To get your API token:');
          console.log('1. Go to https://www.notion.so/my-integrations');
          console.log('2. Create a new integration or use an existing one');
          console.log('3. Copy the Internal Integration Token\n');

          const answers = await inquirer.prompt([
            {
              type: 'password',
              name: 'token',
              message: 'Enter your Notion API token:',
              mask: '*',
              validate: (input: string) => {
                if (!input || input.trim().length === 0) {
                  return 'Token is required';
                }
                return true;
              },
            },
          ]);
          token = answers.token;
        }

        info('Validating token...');

        const isValid = await validateApiKey(token!);
        if (!isValid) {
          console.error(chalk.red('Error: Invalid API token. Please check your token and try again.'));
          process.exit(1);
        }

        setApiKey(token!, globalOpts.config);
        success('API token saved successfully!');

        const user = await getCurrentUser(token, globalOpts.config);
        console.log(`\nLogged in as: ${chalk.cyan(user.name || 'Unknown')}`);
        console.log(`Workspace: ${chalk.cyan(user.type === 'bot' ? 'Bot Integration' : 'Personal')}`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(async () => {
      const globalOpts = auth.optsWithGlobals<GlobalOptions>();

      try {
        const existingKey = getApiKey(globalOpts.config);
        if (!existingKey) {
          info('No credentials stored.');
          return;
        }

        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to remove your stored credentials?',
            default: false,
          },
        ]);

        if (confirm) {
          clearApiKey(globalOpts.config);
          success('Credentials removed successfully.');
        } else {
          info('Logout cancelled.');
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  auth
    .command('whoami')
    .description('Show current user and workspace info')
    .action(async () => {
      const globalOpts = auth.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        if (!apiKey) {
          console.log(chalk.yellow('Not logged in. Run `onotion auth login` to authenticate.'));
          process.exit(1);
        }

        const user = await getCurrentUser(apiKey, globalOpts.config);

        if (globalOpts.output === 'json') {
          output(user, 'json');
        } else {
          console.log(chalk.bold('\nCurrent User\n'));
          console.log(`${chalk.cyan('Name:')} ${user.name || 'Unknown'}`);
          console.log(`${chalk.cyan('ID:')} ${user.id}`);
          console.log(`${chalk.cyan('Type:')} ${user.type}`);

          if (user.type === 'bot' && user.bot?.owner) {
            const owner = user.bot.owner;
            if (owner.type === 'workspace') {
              console.log(`${chalk.cyan('Workspace:')} ${owner.workspace ? 'true' : 'false'}`);
            } else if (owner.type === 'user' && 'user' in owner) {
              console.log(`${chalk.cyan('Owner:')} ${(owner.user as { name?: string }).name || 'Unknown'}`);
            }
          }

          console.log(`\n${chalk.gray('Config path:')} ${getConfigPath(globalOpts.config)}`);
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return auth;
}
