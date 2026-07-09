import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod/v4';
import { normalizeDocsConfig, type DocsConfig } from '#/config/docsConfig.js';
import { normalizeLlmConfig, type LlmConfig } from '#/config/llmConfig.js';
import {
  DEFAULT_LOGGING_CONFIG,
  normalizeLoggingConfig,
  type LoggingConfig
} from '#/config/loggingConfig.js';
import { normalizePluginsConfig, type PluginsConfig } from '#/config/pluginsConfig.js';
import {
  dbSectionSchema,
  docsSectionSchema,
  llmSectionSchema,
  loggingSectionSchema,
  pluginsSectionSchema,
  redisSectionSchema,
  serverConfigDocumentSchema,
  serverSectionSchema
} from '#/config/serverConfig.schema.js';

/**
 * Default relative path to the server YAML config file.
 */
export const DEFAULT_CONFIG_PATH = 'server.yaml';

export interface ServerConfig {
  /**
   * TCP port the server listens on.
   */
  port: number;

  /**
   * Bind address (e.g. `127.0.0.1` or `0.0.0.0`).
   */
  host: string;

  /**
   * Raw `db` section from server.yaml; validated per driver by {@link createDatabase}.
   */
  db: Record<string, unknown>;

  /**
   * Raw `redis` section from server.yaml; validated by {@link RedisThrottleStore.fromConfig}.
   */
  redis: Record<string, unknown>;

  /**
   * Normalized LLM provider settings when the optional `llm` section is present.
   */
  llm: LlmConfig | null;

  /**
   * Normalized plugin source URLs when the optional `plugins` section is present.
   */
  plugins: PluginsConfig | null;

  /**
   * Normalized documentation search settings when the optional `docs` section is present.
   */
  docs: DocsConfig | null;

  /**
   * Normalized logging settings (defaults apply when the section is omitted).
   */
  logging: LoggingConfig;
}

/**
 * Error thrown when a config file cannot be read or fails validation.
 */
export class ConfigError extends Error {
  /**
   * Creates a config error with a user-facing message.
   *
   * @param message - Description of what went wrong.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Resolves a config path relative to the current working directory when needed.
 *
 * @param configPath - User-supplied config path (relative or absolute).
 * @returns Absolute filesystem path to the config file.
 */
/**
 * Resolves a config path relative to the current working directory when needed.
 *
 * @param configPath - User-supplied config path (relative or absolute).
 * @returns Absolute filesystem path to the config file.
 */
export function resolveConfigPath(configPath: string): string {
  return path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
}

/**
 * Ensures the parsed YAML document has the expected top-level structure.
 *
 * Provides clearer error messages than Zod alone when required keys are missing.
 *
 * @param document - Parsed YAML value.
 * @throws {ConfigError} When the document shape is invalid.
 */
function assertDocumentShape(document: unknown): void {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new ConfigError('Config must be a YAML mapping.');
  }

  const root = document as Record<string, unknown>;
  const server = root.server;

  if (server === null || typeof server !== 'object' || Array.isArray(server)) {
    throw new ConfigError('Config must include a "server" mapping.');
  }

  const serverSection = server as Record<string, unknown>;

  if (!('port' in serverSection)) {
    throw new ConfigError('Config must include server.port.');
  }

  if (!('host' in serverSection)) {
    throw new ConfigError('Config must include server.host.');
  }

  const db = root.db;

  if (db === null || typeof db !== 'object' || Array.isArray(db)) {
    throw new ConfigError('Config must include a "db" mapping.');
  }

  const dbSection = db as Record<string, unknown>;

  if (!('driver' in dbSection)) {
    throw new ConfigError('Config must include db.driver.');
  }

  const redis = root.redis;

  if (redis === null || typeof redis !== 'object' || Array.isArray(redis)) {
    throw new ConfigError('Config must include a "redis" mapping.');
  }

  const redisSection = redis as Record<string, unknown>;

  if (!('host' in redisSection)) {
    throw new ConfigError('Config must include redis.host.');
  }

  if (!('port' in redisSection)) {
    throw new ConfigError('Config must include redis.port.');
  }
}

/**
 * Formats the first Zod validation issue into a short user-facing message.
 *
 * @param error - Zod validation error from schema parsing.
 * @returns Human-readable error string.
 */
function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'Invalid config file.';
  }

  if (issue.message) {
    return issue.message;
  }

  return 'Invalid config file.';
}

/**
 * Validates and extracts server settings from a parsed YAML document.
 *
 * @param document - Parsed YAML root value.
 * @returns Normalized host and port settings.
 * @throws {ConfigError} When validation fails.
 */
function parseServerConfig(document: unknown): ServerConfig {
  assertDocumentShape(document);

  const root = document as Record<string, unknown>;
  const parsedSection = serverSectionSchema.safeParse(root.server);

  if (!parsedSection.success) {
    throw new ConfigError(formatZodError(parsedSection.error));
  }

  const parsedDbSection = dbSectionSchema.safeParse(root.db);

  if (!parsedDbSection.success) {
    throw new ConfigError(formatZodError(parsedDbSection.error));
  }

  const parsedRedisSection = redisSectionSchema.safeParse(root.redis);

  if (!parsedRedisSection.success) {
    throw new ConfigError(formatZodError(parsedRedisSection.error));
  }

  const parsedDocument = serverConfigDocumentSchema.safeParse(document);
  if (!parsedDocument.success) {
    throw new ConfigError(formatZodError(parsedDocument.error));
  }

  let llm: LlmConfig | null = null;
  if (root.llm !== undefined) {
    const parsedLlmSection = llmSectionSchema.safeParse(root.llm);
    if (!parsedLlmSection.success) {
      throw new ConfigError(formatZodError(parsedLlmSection.error));
    }
    llm = normalizeLlmConfig(parsedLlmSection.data);
  }

  let plugins: PluginsConfig | null = null;
  if (root.plugins !== undefined) {
    const parsedPluginsSection = pluginsSectionSchema.safeParse(root.plugins);
    if (!parsedPluginsSection.success) {
      throw new ConfigError(formatZodError(parsedPluginsSection.error));
    }
    plugins = normalizePluginsConfig(parsedPluginsSection.data);
  }

  let docs: DocsConfig | null = null;
  if (root.docs !== undefined) {
    const parsedDocsSection = docsSectionSchema.safeParse(root.docs);
    if (!parsedDocsSection.success) {
      throw new ConfigError(formatZodError(parsedDocsSection.error));
    }
    docs = normalizeDocsConfig(parsedDocsSection.data);
  }

  let logging = DEFAULT_LOGGING_CONFIG;
  if (root.logging !== undefined) {
    const parsedLoggingSection = loggingSectionSchema.safeParse(root.logging);
    if (!parsedLoggingSection.success) {
      throw new ConfigError(formatZodError(parsedLoggingSection.error));
    }
    logging = normalizeLoggingConfig(parsedLoggingSection.data);
  }

  return {
    port: parsedDocument.data.server.port,
    host: parsedDocument.data.server.host,
    db: parsedDbSection.data as Record<string, unknown>,
    redis: parsedRedisSection.data as Record<string, unknown>,
    llm,
    plugins,
    docs,
    logging
  };
}

/**
 * Loads and validates server settings from a YAML config file.
 *
 * @param configPath - Path to the config file (relative to cwd or absolute).
 * @returns Parsed host and port settings.
 * @throws {ConfigError} When the file is missing, unreadable, or invalid.
 */
export function loadServerConfig(configPath: string): ServerConfig {
  const resolvedPath = resolveConfigPath(configPath);

  if (!existsSync(resolvedPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  let document: unknown;
  try {
    document = parseYaml(readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse config file: ${message}`);
  }

  try {
    return parseServerConfig(document);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(message);
  }
}
