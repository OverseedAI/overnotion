import { describe, it, expect } from 'vitest';
import { OverNotionError, getUserFriendlyMessage, formatError } from '../../src/lib/errors.js';
import { APIErrorCode } from '@notionhq/client';

describe('errors utilities', () => {
  describe('OverNotionError', () => {
    it('should create error with code and message', () => {
      const error = new OverNotionError('TEST_CODE', 'Test message');

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('OverNotionError');
    });

    it('should store original error', () => {
      const originalError = new Error('Original');
      const error = new OverNotionError('TEST_CODE', 'Test message', originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return friendly message for unauthorized', () => {
      const message = getUserFriendlyMessage(APIErrorCode.Unauthorized);
      expect(message).toContain('Invalid API token');
    });

    it('should return friendly message for not found', () => {
      const message = getUserFriendlyMessage(APIErrorCode.ObjectNotFound);
      expect(message).toContain('not found');
    });

    it('should return friendly message for rate limited', () => {
      const message = getUserFriendlyMessage(APIErrorCode.RateLimited);
      expect(message).toContain('Rate limited');
    });

    it('should return default message for unknown code', () => {
      const message = getUserFriendlyMessage('UNKNOWN_CODE');
      expect(message).toContain('Notion API error');
    });
  });

  describe('formatError', () => {
    it('should format OverNotionError', () => {
      const error = new OverNotionError('TEST', 'Test error message');
      const formatted = formatError(error);

      expect(formatted).toContain('Test error message');
    });

    it('should format regular Error', () => {
      const error = new Error('Regular error');
      const formatted = formatError(error);

      expect(formatted).toContain('Regular error');
    });

    it('should format unknown error type', () => {
      const formatted = formatError('string error');

      expect(formatted).toContain('string error');
    });

    it('should include details in verbose mode', () => {
      const originalError = new Error('Original details');
      const error = new OverNotionError('TEST', 'Test error', originalError);
      const formatted = formatError(error, true);

      expect(formatted).toContain('Test error');
      expect(formatted).toContain('Original details');
    });
  });
});
