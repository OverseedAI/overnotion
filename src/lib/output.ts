import chalk from 'chalk';
import Table from 'cli-table3';
import type { OutputFormat, PropertyValue } from '../types/index.js';
import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  BlockObjectResponse,
  UserObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

export interface OutputOptions {
  fields?: string | string[];
}

export function parseFieldsInput(fields?: string | string[]): string[] | undefined {
  if (!fields) return undefined;
  const list = Array.isArray(fields) ? fields : fields.split(',');
  const normalized = list
    .map((value) => normalizeKey(value.trim()))
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export function output(data: unknown, format: OutputFormat = 'table', options: OutputOptions = {}): void {
  const fields = parseFieldsInput(options.fields);

  if (format === 'compact') {
    outputCompact(data, fields);
    return;
  }

  const processed = fields ? applyFields(data, fields) : data;

  switch (format) {
    case 'json':
      console.log(JSON.stringify(processed, null, 2));
      break;
    case 'plain':
      console.log(formatPlain(processed));
      break;
    case 'table':
    default:
      console.log(formatTable(processed, fields));
      break;
  }
}

export function outputLine(data: unknown, format: OutputFormat, fields?: string | string[]): void {
  const parsedFields = parseFieldsInput(fields);

  if (format === 'compact') {
    const record = flattenRecord(data);
    if (!record) return;
    const line = JSON.stringify(parsedFields ? pickFields(record, parsedFields) : record);
    console.log(line);
    return;
  }

  const processed = parsedFields ? applyFields(data, parsedFields) : data;
  if (format === 'json') {
    console.log(JSON.stringify(processed));
    return;
  }

  console.log(formatPlain(processed));
}

function formatPlain(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(formatPlain).join('\n');
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${formatPlain(value)}`)
      .join('\n');
  }
  return String(data);
}

function formatTable(data: unknown, fields?: string[]): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return 'No results found.';
    const first = data[0];
    if (isPageObject(first)) return formatPagesTable(data as PageObjectResponse[]);
    if (isDatabaseObject(first)) return formatDatabasesTable(data as DatabaseObjectResponse[]);
    if (isBlockObject(first)) return formatBlocksTable(data as BlockObjectResponse[]);
    if (isUserObject(first)) return formatUsersTable(data as UserObjectResponse[]);
    if (isPlainObject(first)) return formatObjectsTable(data as Record<string, unknown>[], fields);
  }

  if (typeof data === 'object' && data !== null) {
    if (isPageObject(data)) return formatPageDetail(data);
    if (isDatabaseObject(data)) return formatDatabaseDetail(data);
    if (isBlockObject(data)) return formatBlockDetail(data);
    if (isUserObject(data)) return formatUserDetail(data);
    if (isPlainObject(data)) return formatObjectDetail(data as Record<string, unknown>);
  }

  return formatPlain(data);
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickFields(record: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const field of fields) {
    selected[field] = record[field] ?? null;
  }
  return selected;
}

function applyFields(data: unknown, fields: string[]): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => applyFields(item, fields));
  }

  const flat = flattenRecord(data);
  if (flat) {
    return pickFields(flat, fields);
  }

  if (isPlainObject(data)) {
    if ('results' in data && Array.isArray(data.results)) {
      return (data.results as unknown[]).map((item) => applyFields(item, fields));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'page' || key === 'block' || key === 'database' || key === 'user') {
        result[key] = applyFields(value, fields);
        continue;
      }
      if (key === 'blocks' && Array.isArray(value)) {
        result[key] = value.map((item) => applyFields(item, fields));
        continue;
      }
      result[key] = value;
    }
    return result;
  }

  return data;
}

function outputCompact(data: unknown, fields?: string[]): void {
  const records = collectCompactRecords(data);
  if (records.length === 0) return;

  for (const record of records) {
    const line = JSON.stringify(fields ? pickFields(record, fields) : record);
    console.log(line);
  }
}

function collectCompactRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => collectCompactRecords(item));
  }

  if (isPlainObject(data)) {
    if ('results' in data && Array.isArray(data.results)) {
      return (data.results as unknown[]).flatMap((item) => collectCompactRecords(item));
    }

    const records: Record<string, unknown>[] = [];
    if ('page' in data && data.page) {
      records.push(...collectCompactRecords(data.page));
    }
    if ('block' in data && data.block) {
      records.push(...collectCompactRecords(data.block));
    }
    if ('database' in data && data.database) {
      records.push(...collectCompactRecords(data.database));
    }
    if ('user' in data && data.user) {
      records.push(...collectCompactRecords(data.user));
    }
    if ('blocks' in data && Array.isArray(data.blocks)) {
      records.push(...collectCompactRecords(data.blocks));
    }

    if (records.length > 0) {
      return records;
    }
  }

  const flat = flattenRecord(data);
  if (flat) {
    return [flat];
  }

  return [];
}

function flattenRecord(data: unknown): Record<string, unknown> | null {
  if (isPageObject(data)) return flattenPage(data);
  if (isDatabaseObject(data)) return flattenDatabase(data);
  if (isBlockObject(data)) return flattenBlock(data);
  if (isUserObject(data)) return flattenUser(data);
  if (isPlainObject(data)) {
    if ('results' in data || 'page' in data || 'block' in data || 'blocks' in data || 'database' in data || 'user' in data) {
      return null;
    }
    return data;
  }
  return null;
}

// Type guards
function isPageObject(obj: unknown): obj is PageObjectResponse {
  return typeof obj === 'object' && obj !== null && 'object' in obj && (obj as { object: string }).object === 'page';
}

function isDatabaseObject(obj: unknown): obj is DatabaseObjectResponse {
  return typeof obj === 'object' && obj !== null && 'object' in obj && (obj as { object: string }).object === 'database';
}

function isBlockObject(obj: unknown): obj is BlockObjectResponse {
  return typeof obj === 'object' && obj !== null && 'object' in obj && (obj as { object: string }).object === 'block';
}

function isUserObject(obj: unknown): obj is UserObjectResponse {
  return typeof obj === 'object' && obj !== null && 'object' in obj && (obj as { object: string }).object === 'user';
}

// Page formatting
function formatPagesTable(pages: PageObjectResponse[]): string {
  const table = new Table({
    head: [chalk.cyan('Title'), chalk.cyan('ID'), chalk.cyan('Last Edited')],
    colWidths: [40, 38, 22],
  });

  for (const page of pages) {
    table.push([
      truncate(extractPageTitle(page), 38),
      page.id,
      formatDate(page.last_edited_time),
    ]);
  }

  return table.toString();
}

function formatPageDetail(page: PageObjectResponse): string {
  const lines: string[] = [
    chalk.bold('Page Details'),
    '',
    `${chalk.cyan('ID:')} ${page.id}`,
    `${chalk.cyan('Title:')} ${extractPageTitle(page)}`,
    `${chalk.cyan('URL:')} ${page.url}`,
    `${chalk.cyan('Created:')} ${formatDate(page.created_time)}`,
    `${chalk.cyan('Last Edited:')} ${formatDate(page.last_edited_time)}`,
    '',
    chalk.bold('Properties:'),
  ];

  for (const [name, value] of Object.entries(page.properties)) {
    lines.push(`  ${chalk.yellow(name)}: ${extractPropertyValue(value)}`);
  }

  return lines.join('\n');
}

// Database formatting
function formatDatabasesTable(databases: DatabaseObjectResponse[]): string {
  const table = new Table({
    head: [chalk.cyan('Title'), chalk.cyan('ID'), chalk.cyan('Last Edited')],
    colWidths: [40, 38, 22],
  });

  for (const db of databases) {
    table.push([
      truncate(extractDatabaseTitle(db), 38),
      db.id,
      formatDate(db.last_edited_time),
    ]);
  }

  return table.toString();
}

function formatDatabaseDetail(db: DatabaseObjectResponse): string {
  const lines: string[] = [
    chalk.bold('Database Details'),
    '',
    `${chalk.cyan('ID:')} ${db.id}`,
    `${chalk.cyan('Title:')} ${extractDatabaseTitle(db)}`,
    `${chalk.cyan('URL:')} ${db.url}`,
    `${chalk.cyan('Created:')} ${formatDate(db.created_time)}`,
    `${chalk.cyan('Last Edited:')} ${formatDate(db.last_edited_time)}`,
    '',
    chalk.bold('Schema:'),
  ];

  for (const [name, prop] of Object.entries(db.properties)) {
    lines.push(`  ${chalk.yellow(name)}: ${prop.type}`);
  }

  return lines.join('\n');
}

// Block formatting
function formatBlocksTable(blocks: BlockObjectResponse[]): string {
  const table = new Table({
    head: [chalk.cyan('Type'), chalk.cyan('ID'), chalk.cyan('Content')],
    colWidths: [15, 38, 50],
  });

  for (const block of blocks) {
    table.push([
      block.type,
      block.id,
      truncate(extractBlockContent(block), 48),
    ]);
  }

  return table.toString();
}

function formatBlockDetail(block: BlockObjectResponse): string {
  const lines: string[] = [
    chalk.bold('Block Details'),
    '',
    `${chalk.cyan('ID:')} ${block.id}`,
    `${chalk.cyan('Type:')} ${block.type}`,
    `${chalk.cyan('Has Children:')} ${block.has_children}`,
    `${chalk.cyan('Created:')} ${formatDate(block.created_time)}`,
    `${chalk.cyan('Last Edited:')} ${formatDate(block.last_edited_time)}`,
    '',
    chalk.bold('Content:'),
    extractBlockContent(block),
  ];

  return lines.join('\n');
}

// User formatting
function formatUsersTable(users: UserObjectResponse[]): string {
  const table = new Table({
    head: [chalk.cyan('Name'), chalk.cyan('ID'), chalk.cyan('Type')],
    colWidths: [30, 38, 15],
  });

  for (const user of users) {
    table.push([
      user.name || 'Unknown',
      user.id,
      user.type,
    ]);
  }

  return table.toString();
}

function formatUserDetail(user: UserObjectResponse): string {
  const lines: string[] = [
    chalk.bold('User Details'),
    '',
    `${chalk.cyan('ID:')} ${user.id}`,
    `${chalk.cyan('Name:')} ${user.name || 'Unknown'}`,
    `${chalk.cyan('Type:')} ${user.type}`,
  ];

  if (user.type === 'person' && user.person?.email) {
    lines.push(`${chalk.cyan('Email:')} ${user.person.email}`);
  }

  if (user.type === 'bot' && user.bot) {
    lines.push(`${chalk.cyan('Bot Owner:')} ${JSON.stringify(user.bot.owner)}`);
  }

  return lines.join('\n');
}

function formatObjectsTable(rows: Record<string, unknown>[], fields?: string[]): string {
  const columns = fields && fields.length > 0
    ? fields
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const table = new Table({
    head: columns.map((col) => chalk.cyan(col)),
    colWidths: columns.map(() => 24),
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(columns.map((col) => formatPlain(row[col] ?? '')));
  }

  return table.toString();
}

function formatObjectDetail(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => `${chalk.cyan(key)}: ${formatPlain(value)}`)
    .join('\n');
}

// Helper functions
export function extractPageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

export function extractDatabaseTitle(db: DatabaseObjectResponse): string {
  if (db.title && db.title.length > 0) {
    return db.title.map(t => t.plain_text).join('');
  }
  return 'Untitled';
}

export function extractPropertyValue(prop: PropertyValue): string {
  switch (prop.type) {
    case 'title':
      return prop.title.map(t => t.plain_text).join('');
    case 'rich_text':
      return prop.rich_text.map(t => t.plain_text).join('');
    case 'number':
      return prop.number?.toString() || '';
    case 'select':
      return prop.select?.name || '';
    case 'multi_select':
      return prop.multi_select.map(s => s.name).join(', ');
    case 'date':
      return prop.date?.start || '';
    case 'checkbox':
      return prop.checkbox ? 'Yes' : 'No';
    case 'url':
      return prop.url || '';
    case 'email':
      return prop.email || '';
    case 'phone_number':
      return prop.phone_number || '';
    case 'status':
      return prop.status?.name || '';
    case 'formula':
      return formatFormulaValue(prop.formula);
    case 'relation':
      return `${prop.relation.length} linked`;
    case 'rollup':
      return formatRollupValue(prop.rollup);
    case 'people':
      return prop.people.map(p => ('name' in p ? p.name : 'Unknown')).join(', ');
    case 'files':
      return `${prop.files.length} file(s)`;
    case 'created_time':
      return formatDate(prop.created_time);
    case 'created_by':
      return 'name' in prop.created_by ? (prop.created_by.name || 'Unknown') : 'Unknown';
    case 'last_edited_time':
      return formatDate(prop.last_edited_time);
    case 'last_edited_by':
      return 'name' in prop.last_edited_by ? (prop.last_edited_by.name || 'Unknown') : 'Unknown';
    default:
      return JSON.stringify(prop);
  }
}

function formatFormulaValue(formula: { type: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start: string } | null }): string {
  switch (formula.type) {
    case 'string':
      return formula.string || '';
    case 'number':
      return formula.number?.toString() || '';
    case 'boolean':
      return formula.boolean ? 'Yes' : 'No';
    case 'date':
      return formula.date?.start || '';
    default:
      return '';
  }
}

function formatRollupValue(rollup: { type: string; number?: number | null; date?: { start: string } | null; array?: unknown[] }): string {
  switch (rollup.type) {
    case 'number':
      return rollup.number?.toString() || '';
    case 'date':
      return rollup.date?.start || '';
    case 'array':
      return `${rollup.array?.length || 0} items`;
    default:
      return '';
  }
}

export function extractBlockContent(block: BlockObjectResponse): string {
  const blockData = block as Record<string, unknown>;
  const typeData = blockData[block.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;

  if (typeData && typeData.rich_text) {
    return typeData.rich_text.map(t => t.plain_text).join('');
  }

  return '';
}

function flattenPage(page: PageObjectResponse): Record<string, unknown> {
  const record: Record<string, unknown> = {
    type: 'page',
    id: page.id,
    title: extractPageTitle(page),
    url: page.url,
    created: formatIsoDate(page.created_time),
    updated: formatIsoDate(page.last_edited_time),
  };

  for (const [name, prop] of Object.entries(page.properties)) {
    if (prop.type === 'title') continue;
    const key = normalizeKey(name);
    if (!key) continue;
    setUniqueField(record, key, extractPropertyValue(prop));
  }

  return record;
}

function flattenDatabase(db: DatabaseObjectResponse): Record<string, unknown> {
  return {
    type: 'database',
    id: db.id,
    title: extractDatabaseTitle(db),
    url: db.url,
    created: formatIsoDate(db.created_time),
    updated: formatIsoDate(db.last_edited_time),
    properties: Object.keys(db.properties || {}).join(', '),
  };
}

function flattenBlock(block: BlockObjectResponse): Record<string, unknown> {
  const parentId = block.parent && 'page_id' in block.parent ? block.parent.page_id
    : block.parent && 'block_id' in block.parent ? block.parent.block_id
      : undefined;

  return {
    type: 'block',
    id: block.id,
    block_type: block.type,
    content: extractBlockContent(block),
    has_children: block.has_children,
    parent_id: parentId,
    created: formatIsoDate(block.created_time),
    updated: formatIsoDate(block.last_edited_time),
  };
}

function flattenUser(user: UserObjectResponse): Record<string, unknown> {
  return {
    type: 'user',
    id: user.id,
    name: user.name || 'Unknown',
    user_type: user.type,
  };
}

function setUniqueField(record: Record<string, unknown>, key: string, value: unknown): void {
  let finalKey = key;
  let suffix = 2;
  while (finalKey in record) {
    finalKey = `${key}_${suffix}`;
    suffix += 1;
  }
  record[finalKey] = value;
}

function formatIsoDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// Success and info messages
export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}
