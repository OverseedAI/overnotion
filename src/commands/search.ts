import { Command } from 'commander';
import chalk from 'chalk';
import { search } from '../lib/client.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, extractPageTitle, extractDatabaseTitle } from '../lib/output.js';
import type { GlobalOptions, PageObjectResponse, DatabaseObjectResponse } from '../types/index.js';
import Table from 'cli-table3';

export function createSearchCommand(): Command {
  const searchCmd = new Command('search')
    .description('Search pages and databases')
    .argument('<query>', 'Search query')
    .option('-t, --type <type>', 'Filter by type: page, database')
    .option('-l, --limit <number>', 'Maximum number of results', '20')
    .option('--start-cursor <cursor>', 'Pagination cursor')
    .option('-s, --sort <direction>', 'Sort direction: ascending, descending (by last_edited_time)')
    .action(async (query: string, options: {
      type?: 'page' | 'database';
      limit?: string;
      startCursor?: string;
      sort?: 'ascending' | 'descending';
    }) => {
      const globalOpts = searchCmd.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const searchOptions: {
          filter?: { property: 'object'; value: 'page' | 'database' };
          page_size?: number;
          start_cursor?: string;
          sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
        } = {};

        if (options.type) {
          searchOptions.filter = { property: 'object', value: options.type };
        }

        if (options.limit) {
          searchOptions.page_size = Math.min(parseInt(options.limit, 10), 100);
        }

        if (options.startCursor) {
          searchOptions.start_cursor = options.startCursor;
        }

        if (options.sort) {
          searchOptions.sort = {
            direction: options.sort,
            timestamp: 'last_edited_time',
          };
        }

        const response = await search(query, searchOptions, apiKey, globalOpts.config);

        if (globalOpts.output === 'json') {
          output(response, 'json');
          return;
        }

        if (response.results.length === 0) {
          console.log(chalk.yellow('No results found.'));
          return;
        }

        // Group results by type
        const pages = response.results.filter(
          (r): r is PageObjectResponse => r.object === 'page'
        );
        const databases = response.results.filter(
          (r): r is DatabaseObjectResponse => r.object === 'database'
        );

        if (pages.length > 0) {
          console.log(chalk.bold(`\nPages (${pages.length}):\n`));

          const pageTable = new Table({
            head: [chalk.cyan('Title'), chalk.cyan('ID'), chalk.cyan('Last Edited')],
            colWidths: [45, 38, 20],
          });

          for (const page of pages) {
            pageTable.push([
              truncate(extractPageTitle(page), 43),
              page.id,
              formatDate(page.last_edited_time),
            ]);
          }

          console.log(pageTable.toString());
        }

        if (databases.length > 0) {
          console.log(chalk.bold(`\nDatabases (${databases.length}):\n`));

          const dbTable = new Table({
            head: [chalk.cyan('Title'), chalk.cyan('ID'), chalk.cyan('Last Edited')],
            colWidths: [45, 38, 20],
          });

          for (const db of databases) {
            dbTable.push([
              truncate(extractDatabaseTitle(db), 43),
              db.id,
              formatDate(db.last_edited_time),
            ]);
          }

          console.log(dbTable.toString());
        }

        if (response.has_more && response.next_cursor) {
          console.log(chalk.gray(`\nMore results available. Use --start-cursor ${response.next_cursor}`));
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return searchCmd;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
