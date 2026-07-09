import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Mocked } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';
import type { ApiTokenRecord, UserRecord } from '#/db/types.js';
import { hashToken } from '#/server/auth/apiTokens.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';
import { registerProtectedRoutes } from '#/server/routes/index.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';
import type { ReloadResult } from '#/server/runtimeContext.js';

export const validBearerToken = 'hbk_valid-token';

/**
 * Sample user record used by protected route tests.
 */
export const sampleUserRecord: UserRecord = {
  id: 'user-1',
  name: 'Test user',
  role: 'user',
  collectionAccess: ['*'],
  environmentAccess: ['*'],
  snippetAccess: ['*'],
  llmAccess: false,
  llmModels: [],
  llmMonthlyTokenLimit: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...sampleAttribution
};

/**
 * Sample API token record matching {@link validBearerToken}.
 */
export const sampleApiTokenRecord: ApiTokenRecord = {
  id: 'token-1',
  userId: sampleUserRecord.id,
  name: 'Test token',
  tokenHash: hashToken(validBearerToken),
  tokenPrefix: 'hbk_valid-',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastUsedAt: null,
  revokedAt: null,
  ...sampleAttribution
};

/**
 * Options for building a protected-route test Fastify instance.
 */
export interface CreateProtectedTestAppOptions {
  /**
   * Database stub wired into bearer auth and entity routes.
   */
  db: Mocked<IDatabase>;

  /**
   * Throttle store stub wired into bearer auth; defaults to a permissive stub.
   */
  throttleStore?: Mocked<IThrottleStore>;

  /**
   * When true, configures auth lookup to accept {@link validBearerToken}.
   */
  withValidAuth?: boolean;

  /**
   * User record returned by auth lookup; defaults to {@link sampleUserRecord}.
   */
  user?: UserRecord;

  /**
   * LLM configuration passed to protected routes; defaults to null (LLM disabled).
   */
  llm?: import('#/config/llmConfig.js').LlmConfig | null;

  /**
   * Plugin source configuration passed to protected routes; defaults to null.
   */
  plugins?: import('#/config/pluginsConfig.js').PluginsConfig | null;

  /**
   * Documentation search configuration passed to protected routes; defaults to null.
   */
  docs?: import('#/config/docsConfig.js').DocsConfig | null;

  /**
   * Config reload handler for admin reload route tests.
   */
  reloadConfig?: () => Promise<ReloadResult>;
}

/**
 * Builds a Fastify app with protected entity routes and optional valid bearer auth.
 *
 * @param options - Database stub and auth configuration.
 * @returns Fastify instance ready for inject-based route tests.
 */
export async function createProtectedTestApp(
  options: CreateProtectedTestAppOptions
): Promise<FastifyInstance> {
  const user = options.user ?? sampleUserRecord;
  const throttleStore = options.throttleStore ?? createDefaultThrottleStoreStub();
  const llm = options.llm ?? null;
  const plugins = options.plugins ?? null;
  const docs = options.docs ?? null;

  if (options.withValidAuth) {
    options.db.findActiveApiTokenByHash.mockResolvedValue(sampleApiTokenRecord);
    options.db.findUserById.mockResolvedValue(user);
    options.db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  }

  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(async (protectedApp) => {
    await registerProtectedRoutes(protectedApp, {
      version: '0.1.0',
      db: options.db,
      throttleStore,
      getLlm: () => llm,
      getPlugins: () => plugins,
      getDocs: () => docs,
      reloadConfig: options.reloadConfig ?? (async () => ({ sections: [] }))
    });
  });

  return app;
}

/**
 * Authorization header value for {@link validBearerToken}.
 */
export function authHeader(): { authorization: string } {
  return { authorization: `Bearer ${validBearerToken}` };
}

/**
 * Creates a permissive throttle store stub for route tests.
 */
function createDefaultThrottleStoreStub(): Mocked<IThrottleStore> {
  const throttleStore = createStubThrottleStore();
  throttleStore.isBlocked.mockResolvedValue(false);
  throttleStore.recordFailure.mockResolvedValue(false);
  throttleStore.reset.mockResolvedValue(undefined);
  return throttleStore;
}
