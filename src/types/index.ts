import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  BlockObjectResponse,
  UserObjectResponse,
  SearchResponse,
  QueryDatabaseResponse,
} from '@notionhq/client/build/src/api-endpoints';

export type OutputFormat = 'table' | 'json' | 'plain' | 'compact';

export interface GlobalOptions {
  output?: OutputFormat;
  verbose?: boolean;
  config?: string;
  fields?: string;
  stream?: boolean;
}

export interface AppConfig {
  apiKey?: string;
  defaultOutput: OutputFormat;
  defaultDatabase?: string;
}

export interface CommandContext {
  config: AppConfig;
  options: GlobalOptions;
}

// Re-export useful Notion types
export type {
  DatabaseObjectResponse,
  PageObjectResponse,
  BlockObjectResponse,
  UserObjectResponse,
  SearchResponse,
  QueryDatabaseResponse,
};

// Property value types for easier handling
export type PropertyValue = PageObjectResponse['properties'][string];

// Helper type for extracting title from various object types
export interface TitleExtractable {
  properties?: Record<string, PropertyValue>;
  title?: Array<{ plain_text: string }>;
}

// Database filter types
export interface DatabaseFilter {
  property: string;
  type: string;
  value: unknown;
}

// Sort options
export interface SortOption {
  property?: string;
  timestamp?: 'created_time' | 'last_edited_time';
  direction: 'ascending' | 'descending';
}

// Page creation input
export interface PageCreateInput {
  parentId: string;
  parentType: 'database' | 'page';
  title?: string;
  properties?: Record<string, unknown>;
  content?: string;
}

// Block append input
export interface BlockAppendInput {
  blockId: string;
  children: Array<{
    type: string;
    content: string;
  }>;
}
