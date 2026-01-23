import { Command } from 'commander';
import chalk from 'chalk';
import {
  getBlock,
  getBlockChildren,
  deleteBlock,
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
import { output, outputLine, parseFieldsInput, extractBlockContent } from '../lib/output.js';
import type { GlobalOptions, BlockObjectResponse } from '../types/index.js';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

export function createBlockCommand(): Command {
  const block = new Command('block')
    .description('Block operations');

  block
    .command('get <block-id>')
    .description('Get block and optionally its children')
    .option('--children', 'Include child blocks')
    .option('--depth <number>', 'Depth of nested blocks to fetch', '1')
    .action(async (blockId: string, options: { children?: boolean; depth?: string }) => {
      const globalOpts = block.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const blockData = await getBlock(blockId, apiKey, globalOpts.config) as BlockObjectResponse;

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (outputFormat !== 'table' || fields) {
          const result: { block: BlockObjectResponse; children?: BlockObjectResponse[] } = { block: blockData };

          if (options.children && blockData.has_children) {
            const depth = parseInt(options.depth || '1', 10);
            const children = await fetchAllBlockChildren(blockId, depth, apiKey, globalOpts.config);
            result.children = children;
          }

          output(options.children ? result : blockData, outputFormat, { fields: globalOpts.fields });
          return;
        }

        {
          console.log(chalk.bold('\nBlock Details\n'));
          console.log(`${chalk.cyan('ID:')} ${blockData.id}`);
          console.log(`${chalk.cyan('Type:')} ${blockData.type}`);
          console.log(`${chalk.cyan('Has Children:')} ${blockData.has_children}`);
          console.log(`${chalk.cyan('Created:')} ${formatDate(blockData.created_time)}`);
          console.log(`${chalk.cyan('Last Edited:')} ${formatDate(blockData.last_edited_time)}`);

          const content = extractBlockContent(blockData);
          if (content) {
            console.log(`\n${chalk.cyan('Content:')}\n${content}`);
          }

          if (options.children && blockData.has_children) {
            console.log(`\n${chalk.bold('Children:')}\n`);

            const depth = parseInt(options.depth || '1', 10);
            const children = await fetchAllBlockChildren(blockId, depth, apiKey, globalOpts.config);

            for (const child of children) {
              printBlockTree(child, 0);
            }
          }
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  block
    .command('append <block-id>')
    .description('Append child blocks')
    .option('-c, --content <text>', 'Content to append')
    .option('--type <type>', 'Block type (paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, to_do, toggle, quote, callout, code, divider)', 'paragraph')
    .option('--language <lang>', 'Language for code blocks', 'plain text')
    .option('--children <json>', 'JSON array (or {"children":[...]}) of Notion blocks to append')
    .option('--children-file <path>', 'Path to JSON file with array (or {"children":[...]}) of Notion blocks')
    .option('--batch-size <number>', 'Max children per request (1-100)', String(DEFAULT_BATCH_SIZE))
    .option('--delay-ms <number>', 'Delay between batch requests in ms', String(DEFAULT_DELAY_MS))
    .action(async (blockId: string, options: {
      content?: string;
      type?: string;
      language?: string;
      children?: string;
      childrenFile?: string;
      batchSize?: string;
      delayMs?: string;
    }) => {
      const globalOpts = block.optsWithGlobals<GlobalOptions>();

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
            'toggle', 'quote', 'callout', 'code', 'divider',
          ];

          if (!validTypes.includes(blockType)) {
            console.error(chalk.red(`Error: Invalid block type "${blockType}". Valid types: ${validTypes.join(', ')}`));
            process.exit(1);
          }

          children = [createBlock(blockType, options.content, options.language)];
        }

        const batchSize = parseBatchSize(options.batchSize, DEFAULT_BATCH_SIZE);
        const delayMs = parseDelayMs(options.delayMs, DEFAULT_DELAY_MS);

        const responses = await appendBlockChildrenInBatches(
          blockId,
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
          console.log(chalk.green('✓'), 'Block appended successfully!');
          console.log(`\n${chalk.cyan('Blocks appended:')} ${totalAppended}`);
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

  block
    .command('delete <block-id>')
    .description('Delete a block')
    .option('--force', 'Skip confirmation')
    .action(async (blockId: string, options: { force?: boolean }) => {
      const globalOpts = block.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        // Get block info first
        const blockData = await getBlock(blockId, apiKey, globalOpts.config) as BlockObjectResponse;

        if (!options.force) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete this ${blockData.type} block?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }

        await deleteBlock(blockId, apiKey, globalOpts.config);
        console.log(chalk.green('✓'), 'Block deleted successfully.');

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  block
    .command('list <parent-id>')
    .description('List all child blocks of a page or block')
    .option('--depth <number>', 'Depth of nested blocks to fetch', '1')
    .action(async (parentId: string, options: { depth?: string }) => {
      const globalOpts = block.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const depth = parseInt(options.depth || '1', 10);
        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        if (globalOpts.stream) {
          if (outputFormat !== 'json' && outputFormat !== 'compact') {
            console.error(chalk.red('Error: --stream is only supported with -o json or -o compact.'));
            process.exit(1);
          }

          await streamBlockChildren(parentId, depth, apiKey, globalOpts.config, outputFormat, globalOpts.fields);
          return;
        }

        const blocks = await fetchAllBlockChildren(parentId, depth, apiKey, globalOpts.config);

        if (outputFormat !== 'table' || fields) {
          output(blocks, outputFormat, { fields: globalOpts.fields });
          return;
        }

        if (blocks.length === 0) {
          console.log(chalk.yellow('No blocks found.'));
          return;
        }

        console.log(chalk.bold(`\nBlocks (${blocks.length}):\n`));

        for (const block of blocks) {
          printBlockTree(block, 0);
        }

      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return block;
}

async function fetchAllBlockChildren(
  blockId: string,
  _depth: number,
  apiKey: string,
  configPath?: string
): Promise<BlockObjectResponse[]> {
  // Note: depth parameter reserved for future recursive fetching implementation
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

  return blocks;
}

async function streamBlockChildren(
  blockId: string,
  _depth: number,
  apiKey: string,
  configPath: string | undefined,
  outputFormat: 'json' | 'compact',
  fields?: string
): Promise<void> {
  let cursor: string | undefined;

  do {
    const response = await getBlockChildren(blockId, cursor, apiKey, configPath);
    const blockResults = response.results.filter(
      (r): r is BlockObjectResponse => 'type' in r
    );

    for (const block of blockResults) {
      outputLine(block, outputFormat, fields);
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
}

function printBlockTree(block: BlockObjectResponse, indent: number): void {
  const prefix = '  '.repeat(indent);
  const content = extractBlockContent(block);
  const truncatedContent = content.length > 60 ? content.slice(0, 57) + '...' : content;

  console.log(`${prefix}${chalk.gray(`[${block.type}]`)} ${truncatedContent || chalk.gray('(empty)')}`);
  console.log(`${prefix}${chalk.gray('ID:')} ${block.id}`);

  if (block.has_children) {
    console.log(`${prefix}${chalk.gray('Has children')}`);
  }

  console.log('');
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createBlock(type: string, content: string, language?: string): BlockObjectRequest {
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
      return {
        object: 'block',
        type: 'code',
        code: { rich_text: richText, language: (language || 'plain text') as 'plain text' },
      };
    case 'divider':
      return { object: 'block', type: 'divider', divider: {} };
    case 'paragraph':
    default:
      return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
  }
}
