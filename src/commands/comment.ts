import { Command } from 'commander';
import chalk from 'chalk';
import { createComment, listComments } from '../lib/client.js';
import { getApiKey } from '../lib/config.js';
import { handleError, requireAuth } from '../lib/errors.js';
import { output, outputLine, parseFieldsInput } from '../lib/output.js';
import type { GlobalOptions } from '../types/index.js';
import type {
  CommentObjectResponse,
  ListCommentsResponse,
} from '@notionhq/client/build/src/api-endpoints';

// RichTextItemRequest is not exported, define compatible type
type RichTextItemRequest = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
};

export function createCommentCommand(): Command {
  const comment = new Command('comment')
    .description('Comment operations');

  comment
    .command('list <page-id>')
    .description('List all comments on a page')
    .action(async (pageId: string) => {
      const globalOpts = comment.optsWithGlobals<GlobalOptions>();

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

          await streamAllComments(pageId, apiKey, globalOpts.config, outputFormat, globalOpts.fields);
          return;
        }

        const response = await fetchAllComments(pageId, apiKey, globalOpts.config);

        if (outputFormat === 'json' && !fields) {
          output(response, 'json');
          return;
        }

        if (response.results.length === 0) {
          if (outputFormat === 'plain') {
            console.log(chalk.yellow('No comments found.'));
          } else if (outputFormat === 'json') {
            output([], 'json');
          } else {
            console.log(chalk.yellow('No comments found.'));
          }
          return;
        }

        output(response.results, outputFormat, { fields: globalOpts.fields });
      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  comment
    .command('add <page-id> <text>')
    .description('Add a comment to a page')
    .action(async (pageId: string, text: string) => {
      const globalOpts = comment.optsWithGlobals<GlobalOptions>();

      try {
        const apiKey = getApiKey(globalOpts.config);
        requireAuth(apiKey);

        const outputFormat = globalOpts.output || 'table';
        const fields = parseFieldsInput(globalOpts.fields);

        const richText: Array<RichTextItemRequest> = [{ type: 'text', text: { content: text } }];
        const response = await createComment(pageId, richText, apiKey, globalOpts.config);

        if (outputFormat === 'json' && !fields) {
          output(response, 'json');
          return;
        }

        output(response, outputFormat, { fields: globalOpts.fields });
      } catch (error) {
        handleError(error, globalOpts.verbose);
      }
    });

  return comment;
}

async function fetchAllComments(
  blockId: string,
  apiKey: string,
  configPath?: string
): Promise<ListCommentsResponse> {
  const results: CommentObjectResponse[] = [];
  let cursor: string | undefined;
  let base: ListCommentsResponse | undefined;

  do {
    const response = await listComments(blockId, cursor, apiKey, configPath) as ListCommentsResponse;
    base ||= response;
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return {
    ...(base || {
      object: 'list',
      type: 'comment',
      comment: {},
      has_more: false,
      next_cursor: null,
      results: [],
    }),
    results,
    has_more: false,
    next_cursor: null,
  };
}

async function streamAllComments(
  blockId: string,
  apiKey: string,
  configPath: string | undefined,
  outputFormat: 'json' | 'compact',
  fields?: string
): Promise<void> {
  let cursor: string | undefined;

  do {
    const response = await listComments(blockId, cursor, apiKey, configPath) as ListCommentsResponse;
    for (const comment of response.results) {
      outputLine(comment, outputFormat, fields);
    }
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
}

