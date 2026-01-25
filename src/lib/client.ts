import { APIErrorCode, Client, ClientErrorCode } from '@notionhq/client';
import type {
  SearchParameters,
  QueryDatabaseParameters,
  CreatePageParameters,
  UpdatePageParameters,
  CreateDatabaseParameters,
  AppendBlockChildrenParameters,
  BlockObjectRequest,
  BlockObjectResponse,
  ListUsersParameters,
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

// RichTextItemRequest is not exported, define compatible type
type NotionColor = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red' | 'default_background' | 'gray_background' | 'brown_background' | 'orange_background' | 'yellow_background' | 'green_background' | 'blue_background' | 'purple_background' | 'pink_background' | 'red_background';
type RichTextItemRequest = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: NotionColor;
  };
};
import { withNotionRetry, requireAuth, OverNotionError } from './errors.js';
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

export async function getUser(userId: string, apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.users.retrieve({ user_id: userId }));
}

export async function listUsers(apiKey?: string, configPath?: string): Promise<unknown>;
export async function listUsers(
  options: Partial<ListUsersParameters>,
  apiKey?: string,
  configPath?: string
): Promise<unknown>;
export async function listUsers(
  optionsOrApiKey?: Partial<ListUsersParameters> | string,
  apiKeyOrConfigPath?: string,
  configPathMaybe?: string
) {
  const options = typeof optionsOrApiKey === 'object' && optionsOrApiKey !== null ? optionsOrApiKey : undefined;
  const apiKey = typeof optionsOrApiKey === 'string' || typeof optionsOrApiKey === 'undefined'
    ? optionsOrApiKey
    : apiKeyOrConfigPath;
  const configPath = typeof optionsOrApiKey === 'string' || typeof optionsOrApiKey === 'undefined'
    ? apiKeyOrConfigPath
    : configPathMaybe;

  const client = getClient(apiKey, configPath);
  return withNotionRetry(() => client.users.list({ ...(options ?? {}) }));
}

// Teams operations (enterprise-only)
export async function listTeams(apiKey?: string, configPath?: string) {
  const client = getClient(apiKey, configPath);

  try {
    return await withNotionRetry(() =>
      client.request({
        path: 'teams',
        method: 'get',
      })
    );
  } catch (error) {
    // Enterprise-only endpoint: treat "not available" errors as non-fatal.
    if (
      error instanceof OverNotionError &&
      (error.code === APIErrorCode.RestrictedResource ||
        error.code === APIErrorCode.ObjectNotFound ||
        error.code === ClientErrorCode.ResponseError)
    ) {
      return null;
    }
    throw error;
  }
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

export async function movePage(
  pageId: string,
  newParentId: string,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);

  const attempt = async (parentType: 'page_id' | 'database_id') => {
    const parent =
      parentType === 'page_id'
        ? { type: 'page_id' as const, page_id: newParentId }
        : { type: 'database_id' as const, database_id: newParentId };

    // Notion's TS types may lag behind API support for `parent` on pages.update.
    return withNotionRetry(() =>
      (client.pages.update as unknown as (args: unknown) => Promise<unknown>)({
        page_id: pageId,
        parent,
      })
    );
  };

  try {
    return await attempt('page_id');
  } catch (error) {
    // If the target is a database, the first attempt can fail with a validation error.
    if (error instanceof OverNotionError && error.code === APIErrorCode.ValidationError) {
      return attempt('database_id');
    }
    throw error;
  }
}

export async function duplicatePage(
  pageId: string,
  options?: { title?: string },
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);

  const sourcePage = (await withNotionRetry(() =>
    client.pages.retrieve({ page_id: pageId })
  )) as PageObjectResponse;

  const titleKey = getTitlePropertyKey(sourcePage) ?? 'title';
  const sourceTitle = extractTitleFromPage(sourcePage) ?? 'Untitled';
  const newTitle = options?.title ?? `Copy of ${sourceTitle}`;

  const createParams: CreatePageParameters = {
    // @ts-expect-error Notion types do not cover every parent variant
    parent: sourcePage.parent,
    properties: {
      [titleKey]: {
        title: [{ type: 'text', text: { content: newTitle } }],
      },
    },
  };

  const icon = normalizePageIcon(sourcePage.icon);
  if (icon) {
    (createParams as unknown as { icon?: unknown }).icon = icon;
  }

  const cover = normalizePageCover(sourcePage.cover);
  if (cover) {
    (createParams as unknown as { cover?: unknown }).cover = cover;
  }

  const newPage = (await withNotionRetry(() =>
    client.pages.create(createParams)
  )) as PageObjectResponse;

  await copyBlockTree(client, pageId, newPage.id);

  return newPage;
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

// Comment operations
export async function listComments(
  blockId: string,
  startCursor?: string,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.comments.list({
      block_id: blockId,
      ...(startCursor ? { start_cursor: startCursor } : {}),
    })
  );
}

export async function createComment(
  pageId: string,
  richText: Array<RichTextItemRequest>,
  apiKey?: string,
  configPath?: string
) {
  const client = getClient(apiKey, configPath);
  return withNotionRetry(() =>
    client.comments.create({
      parent: { page_id: pageId },
      rich_text: richText,
    })
  );
}

async function copyBlockTree(
  client: Client,
  sourceParentId: string,
  targetParentId: string
): Promise<void> {
  const sourceChildren = await listAllBlockChildren(client, sourceParentId);

  const batchSize = 50;
  let pending: BlockObjectResponse[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);

      const created = await withNotionRetry(() =>
        client.blocks.children.append({
          block_id: targetParentId,
          children: batch.map(blockToCreateRequest),
        })
      );

      const createdBlocks = created.results.filter(
        (r): r is BlockObjectResponse => typeof r === 'object' && r !== null && 'type' in r
      );

      for (let j = 0; j < batch.length; j++) {
        const sourceBlock = batch[j];
        const createdBlock = createdBlocks[j];
        if (!createdBlock) continue;

        if (sourceBlock.has_children) {
          await copyBlockTree(client, sourceBlock.id, createdBlock.id);
        }
      }
    }
    pending = [];
  };

  for (const sourceBlock of sourceChildren) {
    if (sourceBlock.type !== 'column_list' && sourceBlock.type !== 'table') {
      pending.push(sourceBlock);
      continue;
    }

    await flush();

    if (sourceBlock.type === 'table') {
      await copyTableContents(client, sourceBlock.id, targetParentId, sourceBlock);
      continue;
    }

    const sourceColumns = await listAllBlockChildren(client, sourceBlock.id);
    const columnCount = sourceColumns.length > 0 ? sourceColumns.length : 2;

    const created = await withNotionRetry(() =>
      client.blocks.children.append({
        block_id: targetParentId,
        children: [createColumnListRequest(columnCount)],
      })
    );

    const createdColumnList = created.results.find(
      (r): r is BlockObjectResponse => typeof r === 'object' && r !== null && 'type' in r && r.type === 'column_list'
    );

    if (!createdColumnList) continue;
    await copyColumnListContents(client, sourceBlock.id, createdColumnList.id);
  }

  await flush();
}

async function copyTableContents(
  client: Client,
  sourceTableId: string,
  targetParentId: string,
  sourceTableBlock: BlockObjectResponse
): Promise<void> {
  const sourceRows = (await listAllBlockChildren(client, sourceTableId)).filter(
    (b) => b.type === 'table_row'
  );

  const created = await withNotionRetry(() =>
    client.blocks.children.append({
      block_id: targetParentId,
      children: [createTableRequest(sourceTableBlock, sourceRows[0])],
    })
  );

  const createdTable = created.results.find(
    (r): r is BlockObjectResponse => typeof r === 'object' && r !== null && 'type' in r && r.type === 'table'
  );

  if (!createdTable) return;

  if (sourceRows.length <= 1) return;

  const batchSize = 50;
  for (let i = 1; i < sourceRows.length; i += batchSize) {
    const batch = sourceRows.slice(i, i + batchSize);
    await withNotionRetry(() =>
      client.blocks.children.append({
        block_id: createdTable.id,
        children: batch.map(tableRowToRequest),
      })
    );
  }
}

async function copyColumnListContents(
  client: Client,
  sourceColumnListId: string,
  targetColumnListId: string
): Promise<void> {
  const sourceColumns = await listAllBlockChildren(client, sourceColumnListId);
  const targetColumns = await listAllBlockChildren(client, targetColumnListId);

  const pairs = Math.min(sourceColumns.length, targetColumns.length);
  for (let i = 0; i < pairs; i++) {
    await copyBlockTree(client, sourceColumns[i].id, targetColumns[i].id);
  }
}

async function listAllBlockChildren(client: Client, blockId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await withNotionRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      })
    );

    const batch = response.results.filter(
      (r): r is BlockObjectResponse => typeof r === 'object' && r !== null && 'type' in r
    );
    blocks.push(...batch);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

function blockToCreateRequest(block: BlockObjectResponse): BlockObjectRequest {
  const type = block.type;
  const raw = (block as unknown as Record<string, unknown>)[type] as Record<string, unknown> | undefined;

  switch (type) {
    case 'paragraph':
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          color: (raw as { color?: unknown })?.color,
        },
      } as unknown as BlockObjectRequest;

    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return {
        object: 'block',
        type,
        [type]: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          color: (raw as { color?: unknown })?.color,
          is_toggleable: (raw as { is_toggleable?: unknown })?.is_toggleable,
        },
      } as unknown as BlockObjectRequest;

    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'quote':
    case 'toggle':
    case 'template':
      return {
        object: 'block',
        type,
        [type]: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          color: (raw as { color?: unknown })?.color,
        },
      } as unknown as BlockObjectRequest;

    case 'to_do':
      return {
        object: 'block',
        type,
        to_do: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          color: (raw as { color?: unknown })?.color,
          checked: (raw as { checked?: unknown })?.checked,
        },
      } as unknown as BlockObjectRequest;

    case 'callout':
      return {
        object: 'block',
        type,
        callout: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          color: (raw as { color?: unknown })?.color,
          icon: normalizeCalloutIcon((raw as { icon?: unknown })?.icon),
        },
      } as unknown as BlockObjectRequest;

    case 'code':
      return {
        object: 'block',
        type: 'code',
        code: {
          rich_text: toRichTextRequest((raw as { rich_text?: unknown })?.rich_text),
          language: (raw as { language?: unknown })?.language,
          caption: toRichTextRequest((raw as { caption?: unknown })?.caption),
        },
      } as unknown as BlockObjectRequest;

    case 'equation':
      return {
        object: 'block',
        type,
        equation: {
          expression: (raw as { expression?: unknown })?.expression as string,
        },
      } as unknown as BlockObjectRequest;

    case 'divider':
    case 'breadcrumb':
      return { object: 'block', type, [type]: {} } as unknown as BlockObjectRequest;

    case 'table_of_contents':
      return {
        object: 'block',
        type,
        table_of_contents: {
          color: (raw as { color?: unknown })?.color,
        },
      } as unknown as BlockObjectRequest;

    case 'embed':
    case 'bookmark': {
      const url = (raw as { url?: unknown })?.url;
      return {
        object: 'block',
        type,
        [type]: {
          url,
          caption: toRichTextRequest((raw as { caption?: unknown })?.caption),
        },
      } as unknown as BlockObjectRequest;
    }

    case 'link_to_page':
      return {
        object: 'block',
        type,
        link_to_page: normalizeLinkToPage(raw),
      } as unknown as BlockObjectRequest;

    case 'image':
    case 'video':
    case 'pdf':
    case 'file':
    case 'audio':
      return {
        object: 'block',
        type,
        [type]: normalizeMediaBlock(raw),
      } as unknown as BlockObjectRequest;

    case 'table':
      // Table blocks are handled specially in copyBlockTree() to preserve rows.
      return createTableRequest(block);

    case 'column_list':
      // Column lists are handled specially in copyBlockTree() to preserve column count.
      return createColumnListRequest(2);

    case 'synced_block':
      return {
        object: 'block',
        type,
        synced_block: normalizeSyncedBlock(raw),
      } as unknown as BlockObjectRequest;

    // Not creatable via API; preserve content as a placeholder.
    case 'child_page':
    case 'child_database':
    case 'unsupported':
    default:
      return placeholderBlock(`Unsupported block type: ${type}`);
  }
}

function createColumnListRequest(columnCount: number): BlockObjectRequest {
  const safeCount = Number.isFinite(columnCount) && columnCount > 0 ? Math.floor(columnCount) : 2;
  return {
    object: 'block',
    type: 'column_list',
    column_list: {
      children: Array.from({ length: safeCount }, () => ({ column: { children: [] } })),
    },
  } as unknown as BlockObjectRequest;
}

function createTableRequest(tableBlock: BlockObjectResponse, firstRow?: BlockObjectResponse): BlockObjectRequest {
  const table = (tableBlock as unknown as { table?: { table_width?: number; has_column_header?: boolean; has_row_header?: boolean } }).table;
  const tableWidth = typeof table?.table_width === 'number' && table.table_width > 0 ? table.table_width : 1;
  const initialRow = firstRow?.type === 'table_row'
    ? tableRowToRequest(firstRow)
    : emptyTableRowRequest(tableWidth);

  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: tableWidth,
      has_column_header: table?.has_column_header,
      has_row_header: table?.has_row_header,
      children: [initialRow as unknown as { table_row: { cells: Array<Array<RichTextItemRequest>> } }],
    },
  } as unknown as BlockObjectRequest;
}

function tableRowToRequest(row: BlockObjectResponse): BlockObjectRequest {
  const raw = (row as unknown as { table_row?: { cells?: unknown } }).table_row;
  const cells = Array.isArray(raw?.cells)
    ? (raw?.cells as unknown[]).map((cell) => toRichTextRequest(cell))
    : [];

  return {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells,
    },
  } as unknown as BlockObjectRequest;
}

function emptyTableRowRequest(tableWidth: number): BlockObjectRequest {
  const width = Number.isFinite(tableWidth) && tableWidth > 0 ? Math.floor(tableWidth) : 1;
  return {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: Array.from({ length: width }, () => []),
    },
  } as unknown as BlockObjectRequest;
}

function placeholderBlock(message: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: message } }],
    },
  } as unknown as BlockObjectRequest;
}

function normalizeMediaBlock(value?: Record<string, unknown>): Record<string, unknown> {
  if (!value) return {};
  const externalUrl =
    typeof (value as { external?: { url?: unknown } }).external?.url === 'string'
      ? ((value as { external: { url: string } }).external.url as string)
      : typeof (value as { file?: { url?: unknown } }).file?.url === 'string'
        ? ((value as { file: { url: string } }).file.url as string)
        : undefined;

  if (!externalUrl) return {};

  const caption = toRichTextRequest((value as { caption?: unknown })?.caption);
  const name = (value as { name?: unknown })?.name;

  return {
    type: 'external',
    external: { url: externalUrl },
    ...(caption.length > 0 ? { caption } : {}),
    ...(typeof name === 'string' && name.length > 0 ? { name } : {}),
  };
}

function normalizeLinkToPage(value?: Record<string, unknown>): Record<string, unknown> {
  if (!value) return {};
  const type = (value as { type?: unknown }).type;
  if (type === 'page_id') {
    return { type: 'page_id', page_id: (value as { page_id?: unknown }).page_id };
  }
  if (type === 'database_id') {
    return { type: 'database_id', database_id: (value as { database_id?: unknown }).database_id };
  }
  if (type === 'comment_id') {
    return { type: 'comment_id', comment_id: (value as { comment_id?: unknown }).comment_id };
  }
  return {};
}

function normalizeSyncedBlock(value?: Record<string, unknown>): Record<string, unknown> {
  if (!value) return { synced_from: null };
  const syncedFrom = (value as { synced_from?: unknown }).synced_from;
  if (!syncedFrom || typeof syncedFrom !== 'object') {
    return { synced_from: null };
  }
  const blockId = (syncedFrom as { block_id?: unknown }).block_id;
  if (typeof blockId === 'string' && blockId.length > 0) {
    return { synced_from: { type: 'block_id', block_id: blockId } };
  }
  return { synced_from: null };
}

function normalizeCalloutIcon(icon: unknown): Record<string, unknown> | undefined {
  if (!icon || typeof icon !== 'object') return undefined;
  const t = (icon as { type?: unknown }).type;

  if (t === 'emoji') {
    const emoji = (icon as { emoji?: unknown }).emoji;
    if (typeof emoji === 'string') return { type: 'emoji', emoji };
  }

  if (t === 'external') {
    const url = (icon as { external?: { url?: unknown } }).external?.url;
    if (typeof url === 'string') return { type: 'external', external: { url } };
  }

  if (t === 'custom_emoji') {
    const custom = (icon as { custom_emoji?: { id?: unknown; name?: unknown; url?: unknown } }).custom_emoji;
    const id = custom?.id;
    if (typeof id === 'string') {
      const payload: Record<string, unknown> = { id };
      if (typeof custom?.name === 'string') payload.name = custom.name;
      if (typeof custom?.url === 'string') payload.url = custom.url;
      return { type: 'custom_emoji', custom_emoji: payload };
    }
  }

  return undefined;
}

function toRichTextRequest(value: unknown): Array<RichTextItemRequest> {
  if (!Array.isArray(value)) return [];
  const items: Array<RichTextItemRequest> = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const t = (item as { type?: unknown }).type;

    if (t === 'text') {
      const content = (item as { text?: { content?: unknown } }).text?.content;
      if (typeof content !== 'string') continue;

      const linkUrl = (item as { text?: { link?: { url?: unknown } | null } }).text?.link?.url;
      const link = typeof linkUrl === 'string' ? { url: linkUrl } : ((item as { text?: { link?: null } }).text?.link ?? undefined);

      items.push({
        type: 'text',
        text: {
          content,
          ...(link !== undefined ? { link } : {}),
        },
        ...(normalizeAnnotations((item as { annotations?: unknown }).annotations) ?? {}),
      } as unknown as RichTextItemRequest);
      continue;
    }

    if (t === 'equation') {
      const expression = (item as { equation?: { expression?: unknown } }).equation?.expression;
      if (typeof expression !== 'string') continue;
      items.push({
        type: 'equation',
        equation: { expression },
        ...(normalizeAnnotations((item as { annotations?: unknown }).annotations) ?? {}),
      } as unknown as RichTextItemRequest);
      continue;
    }

    const plain = (item as { plain_text?: unknown }).plain_text;
    if (typeof plain === 'string' && plain.length > 0) {
      items.push({
        type: 'text',
        text: { content: plain },
      } as unknown as RichTextItemRequest);
    }
  }

  return items;
}

function normalizeAnnotations(value: unknown): { annotations: Record<string, unknown> } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const a = value as Record<string, unknown>;
  const annotations: Record<string, unknown> = {};

  for (const key of ['bold', 'italic', 'strikethrough', 'underline', 'code']) {
    if (typeof a[key] === 'boolean') annotations[key] = a[key];
  }
  if (typeof a.color === 'string') annotations.color = a.color;

  return Object.keys(annotations).length > 0 ? { annotations } : undefined;
}

function getTitlePropertyKey(page: PageObjectResponse): string | null {
  const properties = page.properties as Record<string, { type?: string }>;
  for (const [key, prop] of Object.entries(properties)) {
    if (prop?.type === 'title') return key;
  }
  return null;
}

function extractTitleFromPage(page: PageObjectResponse): string | null {
  const properties = page.properties as Record<
    string,
    { type?: string; title?: Array<{ plain_text?: string; text?: { content?: string } }> }
  >;
  for (const prop of Object.values(properties)) {
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      const parts = prop.title
        .map((t) => t.plain_text ?? t.text?.content ?? '')
        .filter((s) => s.length > 0);
      return parts.join('');
    }
  }
  return null;
}

function normalizePageIcon(icon: PageObjectResponse['icon']): unknown | null {
  if (!icon) return null;
  if (icon.type === 'emoji') return { type: 'emoji', emoji: icon.emoji };
  if (icon.type === 'external') return { type: 'external', external: { url: icon.external.url } };
  return null;
}

function normalizePageCover(cover: PageObjectResponse['cover']): unknown | null {
  if (!cover) return null;
  if (cover.type === 'external') return { type: 'external', external: { url: cover.external.url } };
  return null;
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
