import { isNotionClientError, APIErrorCode, ClientErrorCode } from '@notionhq/client';
import chalk from 'chalk';

export class OverNotionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'OverNotionError';
  }
}

const errorMessages: Record<string, string> = {
  [APIErrorCode.Unauthorized]: 'Invalid API token. Run `onotion auth login` to set a valid token.',
  [APIErrorCode.RestrictedResource]: 'This integration does not have access to the requested resource. Check your integration permissions in Notion.',
  [APIErrorCode.ObjectNotFound]: 'The requested page, database, or block was not found. Verify the ID is correct and the integration has access.',
  [APIErrorCode.RateLimited]: 'Rate limited by Notion API. Please wait a moment and try again.',
  [APIErrorCode.InvalidJSON]: 'Invalid request format.',
  [APIErrorCode.ValidationError]: 'Invalid request parameters.',
  [APIErrorCode.ConflictError]: 'Conflict with current state. The resource may have been modified.',
  [APIErrorCode.InternalServerError]: 'Notion API internal error. Please try again later.',
  [APIErrorCode.ServiceUnavailable]: 'Notion API is temporarily unavailable. Please try again later.',
  [ClientErrorCode.RequestTimeout]: 'Request timed out. Check your internet connection.',
  [ClientErrorCode.ResponseError]: 'Invalid response from Notion API.',
};

export function getUserFriendlyMessage(code: string): string {
  return errorMessages[code] || `Notion API error: ${code}`;
}

export async function withNotionError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isNotionClientError(error)) {
      const message = getUserFriendlyMessage(error.code);
      throw new OverNotionError(error.code, message, error);
    }
    throw error;
  }
}

export function formatError(error: unknown, verbose = false): string {
  if (error instanceof OverNotionError) {
    let message = chalk.red(`Error: ${error.message}`);
    if (verbose && error.originalError) {
      message += `\n\n${chalk.gray('Details:')}\n${chalk.gray(error.originalError.message)}`;
    }
    return message;
  }

  if (error instanceof Error) {
    let message = chalk.red(`Error: ${error.message}`);
    if (verbose && error.stack) {
      message += `\n\n${chalk.gray('Stack trace:')}\n${chalk.gray(error.stack)}`;
    }
    return message;
  }

  return chalk.red(`Error: ${String(error)}`);
}

export function handleError(error: unknown, verbose = false): never {
  console.error(formatError(error, verbose));
  process.exit(1);
}

export function requireAuth(apiKey: string | undefined): asserts apiKey is string {
  if (!apiKey) {
    throw new OverNotionError(
      'NO_AUTH',
      'Not authenticated. Run `onotion auth login` first.'
    );
  }
}
