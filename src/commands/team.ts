import { Command } from 'commander';
import chalk from 'chalk';
import { listTeams } from '../lib/client.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, parseFieldsInput, warn } from '../lib/output.js';
import type { GlobalOptions } from '../types/index.js';

export function createTeamCommand(): Command {
  const team = new Command('team')
    .description('Team operations');

  team
    .command('list')
    .description('List teams (enterprise-only)')
    .action(async () => {
      const globalOpts = team.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const response = await listTeams(apiKey, globalOpts.config);

        if (!response) {
          warn('Teams are only available to enterprise workspaces (or this token lacks access).');
          console.log(chalk.gray('This endpoint is not available for most Notion integrations.'));
          return;
        }

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          output(response, outputFormat, { fields: globalOpts.fields });
          return;
        }

        // Default table output: show just the results if present.
        const results = typeof response === 'object' && response !== null && 'results' in response
          ? (response as { results?: unknown }).results
          : undefined;

        if (Array.isArray(results)) {
          output(results, 'table');
        } else {
          output(response, 'table');
        }
      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return team;
}

