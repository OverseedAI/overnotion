import { NotionToMarkdown } from 'notion-to-md';
import { markdownToBlocks } from '@tryfabric/martian';
import type { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

export async function exportPageToMarkdown(pageId: string, client: Client): Promise<string> {
  const n2m = new NotionToMarkdown({ notionClient: client });
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdResult = n2m.toMarkdownString(mdBlocks);
  // notion-to-md returns { parent: string } object
  return typeof mdResult === 'string' ? mdResult : (mdResult as { parent: string }).parent;
}

export function importMarkdownToBlocks(markdownContent: string): BlockObjectRequest[] {
  return markdownToBlocks(markdownContent) as unknown as BlockObjectRequest[];
}

