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

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 4,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  retryAfterJitterMs: 250,
};

const RETRYABLE_API_CODES = new Set<string>([
  APIErrorCode.RateLimited,
  APIErrorCode.InternalServerError,
  APIErrorCode.ServiceUnavailable,
]);

const RETRYABLE_CLIENT_CODES = new Set<string>([
  ClientErrorCode.RequestTimeout,
  ClientErrorCode.ResponseError,
]);

type RetryOptions = Partial<typeof DEFAULT_RETRY_OPTIONS>;

function isRetryableNotionError(error: unknown): boolean {
  if (!isNotionClientError(error)) return false;

  if (RETRYABLE_API_CODES.has(error.code)) return true;
  if (RETRYABLE_CLIENT_CODES.has(error.code)) return true;

  const status = (error as { status?: number }).status;
  if (status && (status === 429 || status >= 500)) return true;

  return false;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!isNotionClientError(error)) return undefined;

  const headers = (error as { headers?: unknown }).headers;
  let headerValue: string | undefined;

  if (headers && typeof headers === 'object') {
    if ('get' in headers && typeof (headers as { get: (name: string) => string | null }).get === 'function') {
      headerValue = (headers as { get: (name: string) => string | null }).get('retry-after') ?? undefined;
    } else {
      const record = headers as Record<string, string | undefined>;
      headerValue = record['retry-after'] || record['Retry-After'];
    }
  }

  if (!headerValue) {
    const retryAfter = (error as { body?: { retry_after?: number } }).body?.retry_after;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
      return Math.max(0, retryAfter * 1000);
    }
    return undefined;
  }

  const seconds = Number.parseFloat(headerValue);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function computeDelayMs(retryCount: number, retryAfterMs: number | undefined, options: typeof DEFAULT_RETRY_OPTIONS): number {
  if (retryAfterMs !== undefined) {
    const jitter = Math.floor(Math.random() * (options.retryAfterJitterMs + 1));
    return retryAfterMs + jitter;
  }

  const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (retryCount - 1));
  return Math.floor(Math.random() * (exponential + 1));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withNotionRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const resolvedOptions = { ...DEFAULT_RETRY_OPTIONS, ...(options || {}) };
  let retryCount = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableNotionError(error) || retryCount >= resolvedOptions.maxRetries) {
        if (isNotionClientError(error)) {
          const message = getUserFriendlyMessage(error.code);
          throw new OverNotionError(error.code, message, error);
        }
        throw error;
      }

      retryCount += 1;
      const retryAfterMs = getRetryAfterMs(error);
      const delayMs = computeDelayMs(retryCount, retryAfterMs, resolvedOptions);
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }
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
