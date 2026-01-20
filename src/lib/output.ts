import chalk from 'chalk';
import Table from 'cli-table3';
import type { OutputFormat, PropertyValue } from '../types/index.js';
import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  BlockObjectResponse,
  UserObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

export function output(data: unknown, format: OutputFormat = 'table'): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2));
      break;
    case 'plain':
      console.log(formatPlain(data));
      break;
    case 'table':
    default:
      console.log(formatTable(data));
      break;
  }
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

function formatTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return 'No results found.';
    const first = data[0];
    if (isPageObject(first)) return formatPagesTable(data as PageObjectResponse[]);
    if (isDatabaseObject(first)) return formatDatabasesTable(data as DatabaseObjectResponse[]);
    if (isBlockObject(first)) return formatBlocksTable(data as BlockObjectResponse[]);
    if (isUserObject(first)) return formatUsersTable(data as UserObjectResponse[]);
  }

  if (typeof data === 'object' && data !== null) {
    if (isPageObject(data)) return formatPageDetail(data);
    if (isDatabaseObject(data)) return formatDatabaseDetail(data);
    if (isBlockObject(data)) return formatBlockDetail(data);
    if (isUserObject(data)) return formatUserDetail(data);
  }

  return formatPlain(data);
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
