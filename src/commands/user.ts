import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentUser, getUser, listUsers } from '../lib/client.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, outputLine, parseFieldsInput } from '../lib/output.js';
import type { GlobalOptions, UserObjectResponse } from '../types/index.js';

export function createUserCommand(): Command {
  const user = new Command('user')
    .description('User operations');

  user
    .command('list')
    .description('List all workspace users')
    .action(async () => {
      const globalOpts = user.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (globalOpts.stream) {
          if (outputFormat !== 'json' && outputFormat !== 'compact') {
            console.error(chalk.red('Error: --stream is only supported with -o json or -o compact.'));
            process.exit(1);
          }

          let cursor: string | undefined;
          do {
            const response = await listUsers(
              { page_size: 100, start_cursor: cursor },
              apiKey,
              globalOpts.config
            ) as { results: UserObjectResponse[]; has_more: boolean; next_cursor: string | null };

            for (const item of response.results) {
              outputLine(item, outputFormat, globalOpts.fields);
            }

            cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
          } while (cursor);

          return;
        }

        const users = await fetchAllUsers(apiKey, globalOpts.config);

        if (users.length === 0) {
          if (outputFormat === 'plain' || outputFormat === 'table') {
            console.log(chalk.yellow('No users found.'));
          } else if (outputFormat === 'json') {
            output([], 'json');
          }
          return;
        }

        if (outputFormat !== 'table' || fields) {
          output(users, outputFormat, { fields: globalOpts.fields });
          return;
        }

        output(users, 'table');

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  user
    .command('get <user-id>')
    .description('Get a user by ID')
    .action(async (userId: string) => {
      const globalOpts = user.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const userData = await getUser(userId, apiKey, globalOpts.config) as UserObjectResponse;
        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          output(userData, outputFormat, { fields: globalOpts.fields });
          return;
        }

        output(userData, 'table');

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  user
    .command('me')
    .description('Get the current bot user')
    .action(async () => {
      const globalOpts = user.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const userData = await getCurrentUser(apiKey, globalOpts.config) as UserObjectResponse;
        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          output(userData, outputFormat, { fields: globalOpts.fields });
          return;
        }

        output(userData, 'table');

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return user;
}

async function fetchAllUsers(apiKey?: string, configPath?: string): Promise<UserObjectResponse[]> {
  const users: UserObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await listUsers(
      { page_size: 100, start_cursor: cursor },
      apiKey,
      configPath
    ) as { results: UserObjectResponse[]; has_more: boolean; next_cursor: string | null };

    users.push(...response.results);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return users;
}

