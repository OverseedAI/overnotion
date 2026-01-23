import { readFileSync } from 'node:fs';
import type {
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { appendBlockChildren } from './client.js';

export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_DELAY_MS = 350;
const MAX_CHILDREN_PER_REQUEST = 100;

export function parseBlockChildrenInput(
  childrenJson?: string,
  childrenFile?: string
): AppendBlockChildrenParameters['children'] | undefined {
  if (childrenJson && childrenFile) {
    throw new Error('Provide either --children or --children-file, not both.');
  }

  if (!childrenJson && !childrenFile) {
    return undefined;
  }

  let raw = childrenJson;
  if (!raw && childrenFile) {
    try {
      raw = readFileSync(childrenFile, 'utf8');
    } catch {
      throw new Error(`Unable to read children file: ${childrenFile}`);
    }
  }

  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON for children input.');
  }

  const children = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'children' in parsed
      ? (parsed as { children?: unknown }).children
      : undefined;

  if (!Array.isArray(children) || children.length === 0) {
    throw new Error('Children input must be a non-empty JSON array.');
  }

  return children as AppendBlockChildrenParameters['children'];
}

export function parseBatchSize(value?: string, fallback = DEFAULT_BATCH_SIZE): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Batch size must be a positive integer.');
  }
  if (parsed > MAX_CHILDREN_PER_REQUEST) {
    throw new Error(`Batch size cannot exceed ${MAX_CHILDREN_PER_REQUEST}.`);
  }
  return parsed;
}

export function parseDelayMs(value?: string, fallback = DEFAULT_DELAY_MS): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Delay must be a non-negative integer.');
  }
  return parsed;
}

export async function appendBlockChildrenInBatches(
  blockId: string,
  children: AppendBlockChildrenParameters['children'],
  batchSize: number,
  delayMs: number,
  apiKey?: string,
  configPath?: string
): Promise<AppendBlockChildrenResponse[]> {
  const responses: AppendBlockChildrenResponse[] = [];
  for (let i = 0; i < children.length; i += batchSize) {
    const batch = children.slice(i, i + batchSize);
    const response = await appendBlockChildren(blockId, batch, apiKey, configPath);
    responses.push(response);

    const isLast = i + batchSize >= children.length;
    if (!isLast && delayMs > 0) {
      await wait(delayMs);
    }
  }

  return responses;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
