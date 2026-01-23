import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { listDatabases, getDatabase, queryDatabase, createDatabase } from '../lib/client.js';
import { getApiKey, getDefaultDatabase, setDefaultDatabase } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, outputLine, parseFieldsInput, success, extractDatabaseTitle } from '../lib/output.js';
import type { GlobalOptions, DatabaseObjectResponse, PageObjectResponse } from '../types/index.js';

export function createDatabaseCommand(): Command {
  const db = new Command('db')
    .alias('database')
    .description('Database operations');

  db
    .command('list')
    .description('List all databases accessible to the integration')
    .option('--set-default', 'Interactively set a default database')
    .action(async (options: { setDefault?: boolean }) => {
      const globalOpts = db.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const response = await listDatabases(apiKey, globalOpts.config);
        const databases = response.results.filter(
          (r): r is DatabaseObjectResponse => r.object === 'database'
        );

        if (databases.length === 0) {
          console.log(chalk.yellow('No databases found. Make sure your integration has access to at least one database.'));
          return;
        }

        if (options.setDefault) {
          const choices = databases.map(db => ({
            name: `${extractDatabaseTitle(db)} (${db.id})`,
            value: db.id,
          }));

          const { databaseId } = await inquirer.prompt([
            {
              type: 'list',
              name: 'databaseId',
              message: 'Select a default database:',
              choices,
            },
          ]);

          setDefaultDatabase(databaseId, globalOpts.config);
          success(`Default database set to: ${databaseId}`);
        } else {
          output(databases, globalOpts.output || 'table', { fields: globalOpts.fields });
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  db
    .command('query <database-id>')
    .description('Query a database with optional filters')
    .option('-f, --filter <json>', 'Filter in JSON format')
    .option('-s, --sort <json>', 'Sort in JSON format')
    .option('-l, --limit <number>', 'Maximum number of results', '100')
    .option('--start-cursor <cursor>', 'Pagination cursor')
    .action(async (databaseId: string, options: {
      filter?: string;
      sort?: string;
      limit?: string;
      startCursor?: string;
    }) => {
      const globalOpts = db.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        // Use default database if 'default' is passed
        const resolvedId = databaseId === 'default'
          ? getDefaultDatabase(globalOpts.config) || databaseId
          : databaseId;

        const queryOptions: {
          filter?: unknown;
          sorts?: unknown[];
        } = {};

        if (options.filter) {
          try {
            queryOptions.filter = JSON.parse(options.filter);
          } catch {
            console.error(chalk.red('Error: Invalid JSON for filter'));
            process.exit(1);
          }
        }

        if (options.sort) {
          try {
            const parsed = JSON.parse(options.sort);
            queryOptions.sorts = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            console.error(chalk.red('Error: Invalid JSON for sort'));
            process.exit(1);
          }
        }

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);
        const limitValue = options.limit ? parseInt(options.limit, 10) : 100;
        const totalLimit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 100;

        if (globalOpts.stream) {
          if (outputFormat !== 'json' && outputFormat !== 'compact') {
            console.error(chalk.red('Error: --stream is only supported with -o json or -o compact.'));
            process.exit(1);
          }

          let remaining = totalLimit;
          let cursor = options.startCursor;

          do {
            const pageSize = Math.min(remaining, 100);
            const response = await queryDatabase(
              resolvedId,
              {
                ...queryOptions,
                page_size: pageSize,
                start_cursor: cursor,
              },
              apiKey,
              globalOpts.config
            );

            const pages = response.results.filter(
              (r): r is PageObjectResponse => r.object === 'page'
            );

            for (const page of pages) {
              outputLine(page, outputFormat, globalOpts.fields);
            }

            remaining -= pages.length;
            cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
          } while (cursor && remaining > 0);

          return;
        }

        const response = await queryDatabase(
          resolvedId,
          {
            ...queryOptions,
            page_size: Math.min(totalLimit, 100),
            start_cursor: options.startCursor,
          },
          apiKey,
          globalOpts.config
        );

        const pages = response.results.filter(
          (r): r is PageObjectResponse => r.object === 'page'
        );

        if (outputFormat === 'json' && !fields) {
          output(response, 'json');
          return;
        }

        if (pages.length === 0) {
          if (outputFormat === 'table' || outputFormat === 'plain') {
            console.log(chalk.yellow('No results found.'));
          } else if (outputFormat === 'json') {
            output([], 'json');
          }
          return;
        }

        output(pages, outputFormat, { fields: globalOpts.fields });

        if ((outputFormat === 'table' || outputFormat === 'plain') && response.has_more && response.next_cursor) {
          console.log(chalk.gray(`\nMore results available. Use --start-cursor ${response.next_cursor}`));
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  db
    .command('schema <database-id>')
    .description('Show database schema/properties')
    .action(async (databaseId: string) => {
      const globalOpts = db.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const resolvedId = databaseId === 'default'
          ? getDefaultDatabase(globalOpts.config) || databaseId
          : databaseId;

        const database = await getDatabase(resolvedId, apiKey, globalOpts.config) as DatabaseObjectResponse;

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          output(database, outputFormat, { fields: globalOpts.fields });
          return;
        }

        {
          console.log(chalk.bold(`\nDatabase: ${extractDatabaseTitle(database)}\n`));
          console.log(`${chalk.cyan('ID:')} ${database.id}`);
          console.log(`${chalk.cyan('URL:')} ${database.url}`);
          console.log('');
          console.log(chalk.bold('Properties:'));
          console.log('');

          for (const [name, prop] of Object.entries(database.properties)) {
            console.log(`  ${chalk.yellow(name)}`);
            console.log(`    Type: ${chalk.gray(prop.type)}`);
            console.log(`    ID: ${chalk.gray(prop.id)}`);

            // Show additional info for certain property types
            if (prop.type === 'select' && prop.select?.options) {
              const options = prop.select.options.map(o => o.name).join(', ');
              console.log(`    Options: ${chalk.gray(options)}`);
            }

            if (prop.type === 'multi_select' && prop.multi_select?.options) {
              const options = prop.multi_select.options.map(o => o.name).join(', ');
              console.log(`    Options: ${chalk.gray(options)}`);
            }

            if (prop.type === 'status' && prop.status?.options) {
              const options = prop.status.options.map(o => o.name).join(', ');
              console.log(`    Options: ${chalk.gray(options)}`);
            }

            console.log('');
          }
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  db
    .command('create')
    .description('Create a new database')
    .requiredOption('-p, --parent <page-id>', 'Parent page ID')
    .requiredOption('-t, --title <title>', 'Database title')
    .option('--properties <json>', 'Properties schema in JSON format')
    .action(async (options: {
      parent: string;
      title: string;
      properties?: string;
    }) => {
      const globalOpts = db.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        let properties: Record<string, unknown> = {
          Name: { title: {} },
        };

        if (options.properties) {
          try {
            properties = {
              ...properties,
              ...JSON.parse(options.properties),
            };
          } catch {
            console.error(chalk.red('Error: Invalid JSON for properties'));
            process.exit(1);
          }
        }

        const database = await createDatabase(
          {
            parentPageId: options.parent,
            title: [{ type: 'text', text: { content: options.title } }],
            properties: properties as Parameters<typeof createDatabase>[0]['properties'],
          },
          apiKey,
          globalOpts.config
        ) as DatabaseObjectResponse;

        success(`Database created successfully!`);
        console.log(`\n${chalk.cyan('ID:')} ${database.id}`);
        console.log(`${chalk.cyan('URL:')} ${database.url}`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return db;
}
