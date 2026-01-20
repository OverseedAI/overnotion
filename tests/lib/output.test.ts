import { describe, it, expect } from 'vitest';
import {
  extractPageTitle,
  extractDatabaseTitle,
  extractPropertyValue,
  extractBlockContent,
} from '../../src/lib/output.js';
import type {
  PageObjectResponse,
  DatabaseObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

describe('output utilities', () => {
  describe('extractPageTitle', () => {
    it('should extract title from page with title property', () => {
      const page = {
        object: 'page',
        id: 'test-id',
        properties: {
          Name: {
            type: 'title',
            title: [{ plain_text: 'Test Page' }],
          },
        },
      } as unknown as PageObjectResponse;

      expect(extractPageTitle(page)).toBe('Test Page');
    });

    it('should return Untitled for page without title', () => {
      const page = {
        object: 'page',
        id: 'test-id',
        properties: {},
      } as unknown as PageObjectResponse;

      expect(extractPageTitle(page)).toBe('Untitled');
    });

    it('should concatenate multiple title segments', () => {
      const page = {
        object: 'page',
        id: 'test-id',
        properties: {
          Title: {
            type: 'title',
            title: [
              { plain_text: 'Hello ' },
              { plain_text: 'World' },
            ],
          },
        },
      } as unknown as PageObjectResponse;

      expect(extractPageTitle(page)).toBe('Hello World');
    });
  });

  describe('extractDatabaseTitle', () => {
    it('should extract title from database', () => {
      const db = {
        object: 'database',
        id: 'test-id',
        title: [{ plain_text: 'My Database' }],
      } as unknown as DatabaseObjectResponse;

      expect(extractDatabaseTitle(db)).toBe('My Database');
    });

    it('should return Untitled for database without title', () => {
      const db = {
        object: 'database',
        id: 'test-id',
        title: [],
      } as unknown as DatabaseObjectResponse;

      expect(extractDatabaseTitle(db)).toBe('Untitled');
    });
  });

  describe('extractPropertyValue', () => {
    it('should extract rich_text value', () => {
      const prop = {
        type: 'rich_text',
        rich_text: [{ plain_text: 'Some text' }],
      };

      expect(extractPropertyValue(prop as any)).toBe('Some text');
    });

    it('should extract number value', () => {
      const prop = {
        type: 'number',
        number: 42,
      };

      expect(extractPropertyValue(prop as any)).toBe('42');
    });

    it('should extract select value', () => {
      const prop = {
        type: 'select',
        select: { name: 'Option A' },
      };

      expect(extractPropertyValue(prop as any)).toBe('Option A');
    });

    it('should extract multi_select value', () => {
      const prop = {
        type: 'multi_select',
        multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }],
      };

      expect(extractPropertyValue(prop as any)).toBe('Tag1, Tag2');
    });

    it('should extract checkbox value', () => {
      const propTrue = { type: 'checkbox', checkbox: true };
      const propFalse = { type: 'checkbox', checkbox: false };

      expect(extractPropertyValue(propTrue as any)).toBe('Yes');
      expect(extractPropertyValue(propFalse as any)).toBe('No');
    });

    it('should extract date value', () => {
      const prop = {
        type: 'date',
        date: { start: '2024-01-15' },
      };

      expect(extractPropertyValue(prop as any)).toBe('2024-01-15');
    });

    it('should handle empty values', () => {
      const prop = {
        type: 'url',
        url: null,
      };

      expect(extractPropertyValue(prop as any)).toBe('');
    });
  });

  describe('extractBlockContent', () => {
    it('should extract paragraph content', () => {
      const block = {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Paragraph content' }],
        },
      } as unknown as BlockObjectResponse;

      expect(extractBlockContent(block)).toBe('Paragraph content');
    });

    it('should extract heading content', () => {
      const block = {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ plain_text: 'Heading' }],
        },
      } as unknown as BlockObjectResponse;

      expect(extractBlockContent(block)).toBe('Heading');
    });

    it('should return empty string for blocks without rich_text', () => {
      const block = {
        object: 'block',
        type: 'divider',
        divider: {},
      } as unknown as BlockObjectResponse;

      expect(extractBlockContent(block)).toBe('');
    });
  });
});
