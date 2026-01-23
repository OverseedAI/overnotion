import Conf from 'conf';
import type { AppConfig, OutputFormat } from '../types/index.js';

const CONFIG_SCHEMA = {
  apiKey: {
    type: 'string' as const,
  },
  defaultOutput: {
    type: 'string' as const,
    default: 'table' as OutputFormat,
    enum: ['table', 'json', 'plain', 'compact'],
  },
  defaultDatabase: {
    type: 'string' as const,
  },
};

let configInstance: Conf<AppConfig> | null = null;

export function getConfig(configPath?: string): Conf<AppConfig> {
  if (configInstance && !configPath) {
    return configInstance;
  }

  configInstance = new Conf<AppConfig>({
    projectName: 'onotion',
    schema: CONFIG_SCHEMA,
    defaults: {
      defaultOutput: 'table',
    },
    ...(configPath ? { cwd: configPath } : {}),
  });
  return configInstance;
}

export function getApiKey(configPath?: string): string | undefined {
  const config = getConfig(configPath);
  return config.get('apiKey');
}

export function setApiKey(apiKey: string, configPath?: string): void {
  const config = getConfig(configPath);
  config.set('apiKey', apiKey);
}

export function clearApiKey(configPath?: string): void {
  const config = getConfig(configPath);
  config.delete('apiKey');
}

export function getDefaultOutput(configPath?: string): OutputFormat {
  const config = getConfig(configPath);
  return config.get('defaultOutput') || 'table';
}

export function setDefaultOutput(format: OutputFormat, configPath?: string): void {
  const config = getConfig(configPath);
  config.set('defaultOutput', format);
}

export function getDefaultDatabase(configPath?: string): string | undefined {
  const config = getConfig(configPath);
  return config.get('defaultDatabase');
}

export function setDefaultDatabase(databaseId: string, configPath?: string): void {
  const config = getConfig(configPath);
  config.set('defaultDatabase', databaseId);
}

export function clearDefaultDatabase(configPath?: string): void {
  const config = getConfig(configPath);
  config.delete('defaultDatabase');
}

export function getConfigPath(configPath?: string): string {
  const config = getConfig(configPath);
  return config.path;
}

export function getAllConfig(configPath?: string): AppConfig {
  const config = getConfig(configPath);
  return {
    apiKey: config.get('apiKey'),
    defaultOutput: config.get('defaultOutput') || 'table',
    defaultDatabase: config.get('defaultDatabase'),
  };
}
