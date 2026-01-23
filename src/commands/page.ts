import { Command } from 'commander';
import chalk from 'chalk';
import {
  getPage,
  createPage,
  updatePage,
  archivePage,
  getBlockChildren,
} from '../lib/client.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELAY_MS,
  appendBlockChildrenInBatches,
  parseBatchSize,
  parseBlockChildrenInput,
  parseDelayMs,
} from '../lib/blocks.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, parseFieldsInput, success, extractBlockContent, extractPageTitle } from '../lib/output.js';
import type { GlobalOptions, PageObjectResponse, BlockObjectResponse } from '../types/index.js';
import type { CreatePageParameters, BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

export function createPageCommand(): Command {
  const page = new Command('page')
    .description('Page operations');

  page
    .command('get <page-id>')
    .description('Get page details and content')
    .option('--content', 'Include page content (blocks)')
    .option('--depth <number>', 'Depth of nested blocks to fetch', '1')
    .action(async (pageId: string, options: { content?: boolean; depth?: string }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const pageData = await getPage(pageId, apiKey, globalOpts.config) as PageObjectResponse;

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          const result: { page: PageObjectResponse; blocks?: BlockObjectResponse[] } = { page: pageData };

          if (options.content) {
            const blocks = await fetchAllBlocks(pageId, parseInt(options.depth || '1', 10), apiKey, globalOpts.config);
            result.blocks = blocks;
          }

          output(options.content ? result : pageData, outputFormat, { fields: globalOpts.fields });
          return;
        }

        output(pageData, 'table');

        if (options.content) {
          console.log('');
          console.log(chalk.bold('Content:'));
          console.log('');

          const blocks = await fetchAllBlocks(pageId, parseInt(options.depth || '1', 10), apiKey, globalOpts.config);
          for (const block of blocks) {
            const content = extractBlockContent(block);
            const indent = '  ';
            console.log(`${indent}${chalk.gray(`[${block.type}]`)} ${content || chalk.gray('(empty)')}`);
          }
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  page
    .command('create')
    .description('Create a new page')
    .requiredOption('-p, --parent <id>', 'Parent page or database ID')
    .option('-t, --title <title>', 'Page title')
    .option('--database', 'Parent is a database (default is page)')
    .option('--properties <json>', 'Page properties in JSON format (for database pages)')
    .option('--content <text>', 'Initial page content (paragraph)')
    .action(async (options: {
      parent: string;
      title?: string;
      database?: boolean;
      properties?: string;
      content?: string;
    }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const params: CreatePageParameters = options.database
          ? {
              parent: { type: 'database_id', database_id: options.parent },
              properties: {},
            }
          : {
              parent: { type: 'page_id', page_id: options.parent },
              properties: {},
            };

        // Handle properties
        if (options.database) {
          if (options.properties) {
            try {
              params.properties = JSON.parse(options.properties);
            } catch {
              console.error(chalk.red('Error: Invalid JSON for properties'));
              process.exit(1);
            }
          }

          // Add title if provided (for database pages, title is typically "Name" property)
          if (options.title) {
            params.properties = {
              ...params.properties,
              Name: {
                title: [{ type: 'text', text: { content: options.title } }],
              },
            };
          }
        } else {
          // For regular pages, set the title property
          if (options.title) {
            params.properties = {
              title: {
                title: [{ type: 'text', text: { content: options.title } }],
              },
            };
          }
        }

        // Add initial content if provided
        if (options.content) {
          params.children = [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: options.content } }],
              },
            },
          ];
        }

        const newPage = await createPage(params, apiKey, globalOpts.config) as PageObjectResponse;

        success(`Page created successfully!`);
        console.log(`\n${chalk.cyan('ID:')} ${newPage.id}`);
        console.log(`${chalk.cyan('URL:')} ${newPage.url}`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  page
    .command('update <page-id>')
    .description('Update page properties')
    .option('--properties <json>', 'Properties to update in JSON format')
    .option('--icon <emoji-or-url>', 'Page icon (emoji or external URL)')
    .option('--cover <url>', 'Page cover image URL')
    .action(async (pageId: string, options: {
      properties?: string;
      icon?: string;
      cover?: string;
    }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const params: {
          properties?: Record<string, unknown>;
          icon?: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } };
          cover?: { type: 'external'; external: { url: string } };
        } = {};

        if (options.properties) {
          try {
            params.properties = JSON.parse(options.properties);
          } catch {
            console.error(chalk.red('Error: Invalid JSON for properties'));
            process.exit(1);
          }
        }

        if (options.icon) {
          if (options.icon.startsWith('http')) {
            params.icon = { type: 'external', external: { url: options.icon } };
          } else {
            params.icon = { type: 'emoji', emoji: options.icon };
          }
        }

        if (options.cover) {
          params.cover = { type: 'external', external: { url: options.cover } };
        }

        if (!options.properties && !options.icon && !options.cover) {
          console.error(chalk.red('Error: At least one of --properties, --icon, or --cover is required'));
          process.exit(1);
        }

        const updatedPage = await updatePage(pageId, params as Parameters<typeof updatePage>[1], apiKey, globalOpts.config) as PageObjectResponse;

        success(`Page updated successfully!`);
        console.log(`\n${chalk.cyan('ID:')} ${updatedPage.id}`);
        console.log(`${chalk.cyan('URL:')} ${updatedPage.url}`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  page
    .command('move <page-id>')
    .description('Move page to a new parent (limited support in current Notion API)')
    .requiredOption('-p, --parent <id>', 'New parent page or database ID')
    .option('--database', 'New parent is a database')
    .action(async (pageId: string, options: { parent: string; database?: boolean }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        // First get the current page to show what we're moving
        const currentPage = await getPage(pageId, apiKey, globalOpts.config) as PageObjectResponse;
        const title = extractPageTitle(currentPage);

        // Notion API has limited support for moving pages
        // The 2022-06-28 API version doesn't support changing parent directly
        // This is a placeholder that attempts the operation
        console.log(chalk.yellow(`Attempting to move "${title}" to parent ${options.parent}...`));

        if (options.database) {
          console.log(chalk.gray('Target is a database.'));
        }

        // Currently, Notion's API doesn't support directly changing a page's parent
        // This operation will succeed but won't actually move the page
        // Future API versions may support this
        const updatedPage = await updatePage(pageId, {}, apiKey, globalOpts.config) as PageObjectResponse;

        console.log(chalk.yellow('\nNote: The Notion API (2022-06-28) does not support moving pages between parents.'));
        console.log(chalk.yellow('This command is included for forward compatibility with future API versions.'));
        console.log(`\n${chalk.cyan('Page ID:')} ${updatedPage.id}`);
        console.log(`${chalk.cyan('URL:')} ${updatedPage.url}`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  page
    .command('delete <page-id>')
    .description('Archive/delete a page')
    .option('--force', 'Skip confirmation')
    .action(async (pageId: string, options: { force?: boolean }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        // Get page info first
        const pageData = await getPage(pageId, apiKey, globalOpts.config) as PageObjectResponse;
        const title = extractPageTitle(pageData);

        if (!options.force) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to archive "${title}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }

        await archivePage(pageId, apiKey, globalOpts.config);
        success(`Page "${title}" archived successfully.`);

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  page
    .command('append <page-id>')
    .description('Append content to a page')
    .option('-c, --content <text>', 'Content to append')
    .option('--type <type>', 'Block type (paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, to_do, toggle, quote, callout, code)', 'paragraph')
    .option('--children <json>', 'JSON array (or {"children":[...]}) of Notion blocks to append')
    .option('--children-file <path>', 'Path to JSON file with array (or {"children":[...]}) of Notion blocks')
    .option('--batch-size <number>', 'Max children per request (1-100)', String(DEFAULT_BATCH_SIZE))
    .option('--delay-ms <number>', 'Delay between batch requests in ms', String(DEFAULT_DELAY_MS))
    .action(async (pageId: string, options: {
      content?: string;
      type?: string;
      children?: string;
      childrenFile?: string;
      batchSize?: string;
      delayMs?: string;
    }) => {
      const globalOpts = page.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const bulkChildren = parseBlockChildrenInput(options.children, options.childrenFile);
        if (bulkChildren && options.content) {
          throw new Error('Provide either --content or --children/--children-file, not both.');
        }

        let children = bulkChildren;
        if (!children) {
          if (!options.content) {
            throw new Error('Provide --content or --children/--children-file.');
          }

          const blockType = options.type || 'paragraph';
          const validTypes = [
            'paragraph', 'heading_1', 'heading_2', 'heading_3',
            'bulleted_list_item', 'numbered_list_item', 'to_do',
            'toggle', 'quote', 'callout', 'code',
          ];

          if (!validTypes.includes(blockType)) {
            console.error(chalk.red(`Error: Invalid block type "${blockType}". Valid types: ${validTypes.join(', ')}`));
            process.exit(1);
          }

          const block: BlockObjectRequest = createBlock(blockType, options.content);
          children = [block];
        }

        const batchSize = parseBatchSize(options.batchSize, DEFAULT_BATCH_SIZE);
        const delayMs = parseDelayMs(options.delayMs, DEFAULT_DELAY_MS);

        const responses = await appendBlockChildrenInBatches(
          pageId,
          children,
          batchSize,
          delayMs,
          apiKey,
          globalOpts.config
        );

        const totalAppended = responses.reduce((sum, response) => sum + response.results.length, 0);
        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat === 'json') {
          if (responses.length === 1) {
            output(responses[0], 'json', { fields: globalOpts.fields });
          } else {
            output({
              total_appended: totalAppended,
              batches: responses.length,
              batch_size: batchSize,
              responses,
            }, 'json', { fields: globalOpts.fields });
          }
        } else if (outputFormat !== 'table' || fields) {
          if (outputFormat === 'compact' && responses.length > 1) {
            const blocks = responses.flatMap((response) => response.results);
            output(blocks, outputFormat, { fields: globalOpts.fields });
          } else {
            const payload = responses.length === 1 ? responses[0] : {
              total_appended: totalAppended,
              batches: responses.length,
              batch_size: batchSize,
              responses,
            };
            output(payload, outputFormat, { fields: globalOpts.fields });
          }
        } else {
          success('Content appended successfully!');
          console.log(`${chalk.cyan('Blocks appended:')} ${totalAppended}`);
          if (responses.length > 1) {
            console.log(`${chalk.cyan('Batches:')} ${responses.length}`);
            console.log(`${chalk.cyan('Batch size:')} ${batchSize}`);
            if (delayMs > 0) {
              console.log(`${chalk.cyan('Delay (ms):')} ${delayMs}`);
            }
          }
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return page;
}

async function fetchAllBlocks(
  blockId: string,
  depth: number,
  apiKey: string,
  configPath?: string
): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await getBlockChildren(blockId, cursor, apiKey, configPath);
    const blockResults = response.results.filter(
      (r): r is BlockObjectResponse => 'type' in r
    );
    blocks.push(...blockResults);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  // Recursively fetch children if depth > 1
  if (depth > 1) {
    for (const block of blocks) {
      if (block.has_children) {
        const children = await fetchAllBlocks(block.id, depth - 1, apiKey, configPath);
        blocks.push(...children);
      }
    }
  }

  return blocks;
}

function createBlock(type: string, content: string): BlockObjectRequest {
  const richText = [{ type: 'text' as const, text: { content } }];

  switch (type) {
    case 'heading_1':
      return { object: 'block', type: 'heading_1', heading_1: { rich_text: richText } };
    case 'heading_2':
      return { object: 'block', type: 'heading_2', heading_2: { rich_text: richText } };
    case 'heading_3':
      return { object: 'block', type: 'heading_3', heading_3: { rich_text: richText } };
    case 'bulleted_list_item':
      return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } };
    case 'numbered_list_item':
      return { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: richText } };
    case 'to_do':
      return { object: 'block', type: 'to_do', to_do: { rich_text: richText, checked: false } };
    case 'toggle':
      return { object: 'block', type: 'toggle', toggle: { rich_text: richText } };
    case 'quote':
      return { object: 'block', type: 'quote', quote: { rich_text: richText } };
    case 'callout':
      return { object: 'block', type: 'callout', callout: { rich_text: richText } };
    case 'code':
      return { object: 'block', type: 'code', code: { rich_text: richText, language: 'plain text' } };
    case 'paragraph':
    default:
      return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
  }
}
