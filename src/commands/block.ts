import { Command } from 'commander';
import chalk from 'chalk';
import {
  getBlock,
  getBlockChildren,
  appendBlockChildren,
  deleteBlock,
} from '../lib/client.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, extractBlockContent } from '../lib/output.js';
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

        if (globalOpts.output === 'json') {
          const result: { block: BlockObjectResponse; children?: BlockObjectResponse[] } = { block: blockData };

          if (options.children && blockData.has_children) {
            const depth = parseInt(options.depth || '1', 10);
            const children = await fetchAllBlockChildren(blockId, depth, apiKey, globalOpts.config);
            result.children = children;
          }

          output(result, 'json');
        } else {
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
    .requiredOption('-c, --content <text>', 'Content to append')
    .option('--type <type>', 'Block type (paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, to_do, toggle, quote, callout, code, divider)', 'paragraph')
    .option('--language <lang>', 'Language for code blocks', 'plain text')
    .action(async (blockId: string, options: {
      content: string;
      type?: string;
      language?: string;
    }) => {
      const globalOpts = block.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

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

        const newBlock = createBlock(blockType, options.content, options.language);
        const response = await appendBlockChildren(blockId, [newBlock], apiKey, globalOpts.config);

        if (globalOpts.output === 'json') {
          output(response, 'json');
        } else {
          console.log(chalk.green('✓'), 'Block appended successfully!');
          console.log(`\n${chalk.cyan('New block count:')} ${response.results.length}`);
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
        const blocks = await fetchAllBlockChildren(parentId, depth, apiKey, globalOpts.config);

        if (globalOpts.output === 'json') {
          output(blocks, 'json');
        } else {
          if (blocks.length === 0) {
            console.log(chalk.yellow('No blocks found.'));
            return;
          }

          console.log(chalk.bold(`\nBlocks (${blocks.length}):\n`));

          for (const block of blocks) {
            printBlockTree(block, 0);
          }
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
