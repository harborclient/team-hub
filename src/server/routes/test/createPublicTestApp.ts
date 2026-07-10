import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Mocked } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';
import { registerPublicRoutes } from '#/server/routes/index.js';

/**
 * Options for building a public-route test Fastify instance.
 */
export interface CreatePublicTestAppOptions {
  /**
   * Database stub wired into invitation routes.
   */
  db: Mocked<IDatabase>;

  /**
   * Throttle store stub; defaults to a permissive stub.
   */
  throttleStore?: Mocked<IThrottleStore>;
}

/**
 * Builds a Fastify app with public routes such as invitation preview and redeem.
 *
 * @param options - Database and throttle configuration.
 * @returns Fastify instance ready for inject-based route tests.
 */
export async function createPublicTestApp(
  options: CreatePublicTestAppOptions
): Promise<FastifyInstance> {
  const throttleStore = options.throttleStore ?? createDefaultThrottleStoreStub();

  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(async (publicApp) => {
    await registerPublicRoutes(publicApp, {
      version: '0.1.0',
      db: options.db,
      throttleStore
    });
  });

  return app;
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
