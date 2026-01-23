import { Client } from '@notionhq/client';
import type {
  SearchParameters,
  QueryDatabaseParameters,
  CreatePageParameters,
  UpdatePageParameters,
  CreateDatabaseParameters,
  AppendBlockChildrenParameters,
} from '@notionhq/client/build/src/api-endpoints';
import { withNotionRetry, requireAuth } from './errors.js';
import { getApiKey } from './config.js';

let clientInstance: Client | null = null;

export function getClient(apiKey?: string, configPath?: string): Client {
  const key = apiKey || getApiKey(configPath);
  requireAuth(key);

  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = new Client({
    auth: key,
    notionVersion: '2022-06-28',
  });

  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
}

// User operations
export async function getCurrentUser(apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.users.me({}));
}

export async function listUsers(apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.users.list({}));
}

// Search operations
export async function search(
  query: string,
  options?: Partial<SearchParameters>,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.search({
      query,
      ...options,
    })
  );
}

// Database operations
export async function listDatabases(apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.search({
      filter: { property: 'object', value: 'database' },
    })
  );
}

export async function getDatabase(databaseId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.databases.retrieve({ database_id: databaseId })
  );
}

export async function queryDatabase(
  databaseId: string,
  options?: Partial<Omit<QueryDatabaseParameters, 'database_id'>>,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.databases.query({
      database_id: databaseId,
      ...options,
    })
  );
}

export async function createDatabase(
  params: Omit<CreateDatabaseParameters, 'parent'> & {
    parentPageId: string;
  },
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  const { parentPageId, ...rest } = params;
  return withNotionRetry(() =>
    client.databases.create({
      ...rest,
      parent: { type: 'page_id', page_id: parentPageId },
    })
  );
}

// Page operations
export async function getPage(pageId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.pages.retrieve({ page_id: pageId }));
}

export async function createPage(
  params: CreatePageParameters,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.pages.create(params));
}

export async function updatePage(
  pageId: string,
  params: Omit<UpdatePageParameters, 'page_id'>,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.pages.update({
      page_id: pageId,
      ...params,
    })
  );
}

export async function archivePage(pageId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.pages.update({
      page_id: pageId,
      archived: true,
    })
  );
}

// Block operations
export async function getBlock(blockId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.blocks.retrieve({ block_id: blockId }));
}

export async function getBlockChildren(
  blockId: string,
  startCursor?: string,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.blocks.children.list({
      block_id: blockId,
      start_cursor: startCursor,
    })
  );
}

export async function appendBlockChildren(
  blockId: string,
  children: AppendBlockChildrenParameters['children'],
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.blocks.children.append({
      block_id: blockId,
      children,
    })
  );
}

export async function deleteBlock(blockId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.blocks.delete({ block_id: blockId }));
}

// Helper to validate API key by making a test request
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Client({ auth: apiKey });
    await client.users.me({});
    return true;
  } catch {
    return false;
  }
}
