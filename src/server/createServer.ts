import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import { DEFAULT_LOGGING_CONFIG } from '#/config/loggingConfig.js';
import type { IDatabase } from '#/db/IDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { registerHttpLogging } from '#/server/logging/httpLogging.js';
import { createLogger, type Logger } from '#/server/logging/logger.js';
import { readPackageVersion } from '#/packageVersion.js';
import { registerRoutes } from '#/server/routes/index.js';
import type { ReloadResult, RuntimeContext } from '#/server/runtimeContext.js';

export interface CreateServerOptions {
  /**
   * When true, enables Fastify's built-in request logger.
   */
  verbose?: boolean;

  /**
   * Package version exposed on the health endpoint (defaults to package.json).
   */
  version?: string;

  /**
   * Database used for bearer token validation on protected routes.
   */
  db?: IDatabase;

  /**
   * Redis-backed store for authentication throttling on protected routes.
   */
  throttleStore?: IThrottleStore;

  /**
   * Reloads server.yaml and returns a per-section report.
   */
  reloadConfig?: () => Promise<ReloadResult>;

  /**
   * Winston logger for HTTP request and error logging; defaults from config.
   */
  logger?: Logger;
}

/**
 * Builds a configured Fastify instance with Zod validation and registered routes.
 *
 * Does not call `listen`; use {@link runServer} or test inject for that.
 *
 * When a {@link RuntimeContext} is supplied, its stable db and throttle proxies are
 * wired automatically. Explicit `db` and `throttleStore` options override those defaults
 * for tests.
 *
 * @param ctxOrConfig - Runtime context, or legacy server config object for tests.
 * @param options - Logger, version, and optional dependency overrides.
 * @returns Fastify app with type provider and routes attached.
 */
export async function createServer(
  ctxOrConfig: RuntimeContext | import('#/config/serverConfig.js').ServerConfig,
  options: CreateServerOptions = {}
): Promise<FastifyInstance> {
  const isRuntimeContext = 'getLlm' in ctxOrConfig && 'configPath' in ctxOrConfig;
  const ctx = isRuntimeContext ? (ctxOrConfig as RuntimeContext) : null;
  const legacyConfig = isRuntimeContext
    ? null
    : (ctxOrConfig as import('#/config/serverConfig.js').ServerConfig);

  const db = options.db ?? ctx?.db;
  const throttleStore = options.throttleStore ?? ctx?.throttleStore;

  if (!db || !throttleStore) {
    throw new Error('createServer requires db and throttleStore.');
  }

  const logger =
    options.logger ?? ctx?.logger ?? createLogger(legacyConfig?.logging ?? DEFAULT_LOGGING_CONFIG);

  const app = Fastify({
    logger: options.verbose ?? false
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerHttpLogging(app, logger);

  await registerRoutes(app, {
    version: options.version ?? readPackageVersion(),
    db,
    throttleStore,
    getLlm: ctx ? () => ctx.getLlm() : () => legacyConfig?.llm ?? null,
    getPlugins: ctx ? () => ctx.getPlugins() : () => legacyConfig?.plugins ?? null,
    getDocs: ctx ? () => ctx.getDocs() : () => legacyConfig?.docs ?? null,
    reloadConfig: options.reloadConfig ?? (async () => ({ sections: [] }))
  });

  return app;
}
