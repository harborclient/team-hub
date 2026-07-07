import type { FastifyInstance } from 'fastify';
import type { LlmConfig } from '#/config/llmConfig.js';
import type { PluginsConfig } from '#/config/pluginsConfig.js';
import type { IDatabase } from '#/db/IDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { registerAdminRoutes } from '#/server/routes/admin.js';
import { registerAuthRoutes } from '#/server/routes/auth.js';
import { registerCollectionRoutes } from '#/server/routes/collections.js';
import { registerEnvironmentRoutes } from '#/server/routes/environments.js';
import { registerSnippetRoutes } from '#/server/routes/snippets.js';
import { registerFolderRoutes } from '#/server/routes/folders.js';
import { registerHealthRoute } from '#/server/routes/health.js';
import { registerRequestRoutes } from '#/server/routes/requests.js';
import { registerLlmRoutes } from '#/server/routes/llm.js';
import { registerPluginsRoutes } from '#/server/routes/plugins.js';
import {
  createBearerAuthHook,
  registerBearerAuthDecorator
} from '#/server/auth/bearerAuthPlugin.js';
import type { ReloadResult } from '#/server/runtimeContext.js';

export interface RegisterRoutesOptions {
  /**
   * Application version reported by the health endpoint.
   */
  version: string;

  /**
   * Database used to validate bearer tokens on protected routes.
   */
  db: IDatabase;

  /**
   * Redis-backed store for authentication throttling on protected routes.
   */
  throttleStore: IThrottleStore;

  /**
   * Returns the current normalized LLM configuration from server.yaml.
   */
  getLlm: () => LlmConfig | null;

  /**
   * Returns the current normalized plugin source configuration from server.yaml.
   */
  getPlugins: () => PluginsConfig | null;

  /**
   * Reloads server.yaml and returns a per-section report.
   */
  reloadConfig: () => Promise<ReloadResult>;
}

/**
 * Registers routes that do not require authentication.
 *
 * @param app - Fastify server or encapsulated scope.
 * @param options - Shared route metadata such as app version.
 */
export async function registerPublicRoutes(
  app: FastifyInstance,
  options: Pick<RegisterRoutesOptions, 'version'>
): Promise<void> {
  await registerHealthRoute(app, options.version);
}

/**
 * Registers routes that require a valid bearer token.
 *
 * @param app - Encapsulated Fastify scope with bearer auth applied.
 * @param options - Shared route metadata and database access.
 */
export async function registerProtectedRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions
): Promise<void> {
  registerBearerAuthDecorator(app);
  app.addHook('onRequest', createBearerAuthHook(options.db, options.throttleStore));

  await registerAuthRoutes(app);
  await registerAdminRoutes(app, {
    db: options.db,
    getLlm: options.getLlm,
    reloadConfig: options.reloadConfig
  });
  await registerCollectionRoutes(app, options.db);
  await registerEnvironmentRoutes(app, options.db);
  await registerSnippetRoutes(app, options.db);
  await registerFolderRoutes(app, options.db);
  await registerRequestRoutes(app, options.db);
  await registerLlmRoutes(app, { db: options.db, getLlm: options.getLlm });
  await registerPluginsRoutes(app, { getPlugins: options.getPlugins });
}

/**
 * Registers all HTTP routes on the Fastify instance.
 *
 * Public routes (such as health checks) and protected API routes are registered
 * in separate encapsulated scopes so authentication can be scoped correctly.
 *
 * @param app - Fastify server to attach routes to.
 * @param options - Shared route metadata and database access.
 */
export async function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions
): Promise<void> {
  await app.register(async (publicApp) => {
    await registerPublicRoutes(publicApp, options);
  });

  await app.register(async (protectedApp) => {
    await registerProtectedRoutes(protectedApp, options);
  });
}
