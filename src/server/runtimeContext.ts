import { isDeepStrictEqual } from 'node:util';
import type { DocsConfig } from '#/config/docsConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import type { PluginsConfig } from '#/config/pluginsConfig.js';
import { ConfigError, loadServerConfig, type ServerConfig } from '#/config/serverConfig.js';
import { createDatabase, type IDatabase } from '#/db/index.js';
import { createThrottleStore } from '#/server/auth/throttle/createThrottleStore.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createLogger, type Logger } from '#/server/logging/logger.js';

/**
 * Outcome for a single config section during reload.
 */
export type ReloadSectionStatus = 'reloaded' | 'unchanged' | 'failed' | 'restart-required';

/**
 * Config section name reported in reload results.
 */
export type ReloadSectionName = 'db' | 'redis' | 'llm' | 'plugins' | 'docs' | 'server';

/**
 * Per-section reload outcome.
 */
export interface ReloadSectionResult {
  /**
   * Config section that was evaluated.
   */
  section: ReloadSectionName;

  /**
   * Whether the section was applied, skipped, failed, or needs a process restart.
   */
  status: ReloadSectionStatus;

  /**
   * Human-readable error when status is `failed` or `restart-required`.
   */
  error?: string;
}

/**
 * Result of reloading server.yaml at runtime.
 */
export interface ReloadResult {
  /**
   * Per-section reload outcomes when the config file parsed successfully.
   */
  sections: ReloadSectionResult[];

  /**
   * When set, the config file could not be read or parsed; no sections were changed.
   */
  fatalError?: string;
}

/**
 * Live server resources backed by server.yaml, with swappable database and throttle connections.
 */
export interface RuntimeContext {
  /**
   * Absolute path to the config file re-read on reload.
   */
  readonly configPath: string;

  /**
   * HTTP bind host from the active config (changes require a process restart).
   */
  readonly host: string;

  /**
   * HTTP bind port from the active config (changes require a process restart).
   */
  readonly port: number;

  /**
   * Stable database handle; underlying connection swaps on reload.
   */
  readonly db: IDatabase;

  /**
   * Stable throttle store handle; underlying Redis client swaps on reload.
   */
  readonly throttleStore: IThrottleStore;

  /**
   * Returns the current normalized LLM configuration.
   */
  getLlm(): LlmConfig | null;

  /**
   * Returns the current normalized plugin source configuration.
   */
  getPlugins(): PluginsConfig | null;

  /**
   * Returns the current normalized documentation search configuration.
   */
  getDocs(): DocsConfig | null;

  /**
   * Winston logger configured at process startup from server.yaml.
   */
  readonly logger: Logger;
}

/**
 * Mutable holder for a swappable service instance.
 */
interface SwappableHolder<T> {
  underlying: T;
}

/**
 * Internal mutable state for a {@link RuntimeContext}.
 */
interface RuntimeContextState {
  configPath: string;
  host: string;
  port: number;
  activeDbConfig: Record<string, unknown>;
  activeRedisConfig: Record<string, unknown>;
  dbHolder: SwappableHolder<IDatabase>;
  throttleHolder: SwappableHolder<IThrottleStore>;
  llm: LlmConfig | null;
  plugins: PluginsConfig | null;
  docs: DocsConfig | null;
}

const runtimeContextStates = new WeakMap<RuntimeContext, RuntimeContextState>();

/**
 * Builds a stable proxy that forwards property access to a swappable underlying object.
 *
 * @param holder - Mutable holder whose `underlying` reference may change on reload.
 * @returns Proxy implementing the same surface as the underlying instance.
 */
function createSwappableProxy<T extends object>(holder: SwappableHolder<T>): T {
  return new Proxy({} as T, {
    /**
     * Forwards property reads to the current underlying instance.
     */
    get(_target, prop) {
      const value = Reflect.get(holder.underlying, prop, holder.underlying);
      if (typeof value === 'function') {
        return value.bind(holder.underlying);
      }

      return value;
    }
  });
}

/**
 * Returns internal state for a runtime context created by {@link createRuntimeContext}.
 *
 * @param ctx - Runtime context instance.
 * @returns Mutable internal state used for reload and lifecycle.
 * @throws {Error} When the context was not created by {@link createRuntimeContext}.
 */
function getState(ctx: RuntimeContext): RuntimeContextState {
  const state = runtimeContextStates.get(ctx);
  if (!state) {
    throw new Error('Invalid runtime context.');
  }

  return state;
}

/**
 * Formats an unknown error for reload result payloads.
 *
 * @param error - Caught reload error.
 * @returns Message suitable for API and log output.
 */
function formatReloadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Creates runtime resources from an initial validated config snapshot.
 *
 * @param config - Parsed server.yaml contents.
 * @param configPath - Absolute path to the config file for subsequent reloads.
 * @returns Runtime context with stable db and throttle proxies.
 */
export function createRuntimeContext(config: ServerConfig, configPath: string): RuntimeContext {
  const state: RuntimeContextState = {
    configPath,
    host: config.host,
    port: config.port,
    activeDbConfig: config.db,
    activeRedisConfig: config.redis,
    dbHolder: { underlying: createDatabase(config.db) },
    throttleHolder: { underlying: createThrottleStore(config.redis) },
    llm: config.llm,
    plugins: config.plugins,
    docs: config.docs
  };

  const ctx: RuntimeContext = {
    configPath: state.configPath,
    get host() {
      return state.host;
    },
    get port() {
      return state.port;
    },
    db: createSwappableProxy(state.dbHolder),
    throttleStore: createSwappableProxy(state.throttleHolder),
    getLlm: () => state.llm,
    getPlugins: () => state.plugins,
    getDocs: () => state.docs,
    logger: createLogger(config.logging)
  };

  runtimeContextStates.set(ctx, state);
  return ctx;
}

/**
 * Opens connections for the current database and throttle store instances.
 *
 * @param ctx - Runtime context to connect.
 */
export async function connectRuntimeContext(ctx: RuntimeContext): Promise<void> {
  const state = getState(ctx);
  await state.dbHolder.underlying.connect();
  await state.dbHolder.underlying.ensureSystemUser();
  await state.throttleHolder.underlying.connect();
}

/**
 * Closes connections for the current database and throttle store instances.
 *
 * @param ctx - Runtime context to disconnect.
 */
export async function disconnectAll(ctx: RuntimeContext): Promise<void> {
  const state = getState(ctx);
  await state.dbHolder.underlying.disconnect();
  await state.throttleHolder.underlying.disconnect();
}

/**
 * Attempts to reconnect the database section when its raw config changed.
 *
 * @param state - Mutable runtime state.
 * @param nextDbConfig - Parsed `db` section from the reloaded config file.
 * @returns Section reload outcome.
 */
async function reloadDbSection(
  state: RuntimeContextState,
  nextDbConfig: Record<string, unknown>
): Promise<ReloadSectionResult> {
  if (isDeepStrictEqual(state.activeDbConfig, nextDbConfig)) {
    return { section: 'db', status: 'unchanged' };
  }

  try {
    const nextDb = createDatabase(nextDbConfig);
    await nextDb.connect();
    await nextDb.ensureSystemUser();
    const previousDb = state.dbHolder.underlying;
    state.dbHolder.underlying = nextDb;
    state.activeDbConfig = nextDbConfig;
    await previousDb.disconnect();
    return { section: 'db', status: 'reloaded' };
  } catch (error) {
    return { section: 'db', status: 'failed', error: formatReloadError(error) };
  }
}

/**
 * Attempts to reconnect the Redis throttle store when its raw config changed.
 *
 * @param state - Mutable runtime state.
 * @param nextRedisConfig - Parsed `redis` section from the reloaded config file.
 * @returns Section reload outcome.
 */
async function reloadRedisSection(
  state: RuntimeContextState,
  nextRedisConfig: Record<string, unknown>
): Promise<ReloadSectionResult> {
  if (isDeepStrictEqual(state.activeRedisConfig, nextRedisConfig)) {
    return { section: 'redis', status: 'unchanged' };
  }

  try {
    const nextStore = createThrottleStore(nextRedisConfig);
    await nextStore.connect();
    const previousStore = state.throttleHolder.underlying;
    state.throttleHolder.underlying = nextStore;
    state.activeRedisConfig = nextRedisConfig;
    await previousStore.disconnect();
    return { section: 'redis', status: 'reloaded' };
  } catch (error) {
    return { section: 'redis', status: 'failed', error: formatReloadError(error) };
  }
}

/**
 * Reports when server bind settings changed and cannot be applied without restart.
 *
 * @param state - Active runtime state.
 * @param nextConfig - Newly parsed config file contents.
 * @returns Section reload outcome.
 */
function reloadServerSection(
  state: RuntimeContextState,
  nextConfig: ServerConfig
): ReloadSectionResult {
  if (state.host === nextConfig.host && state.port === nextConfig.port) {
    return { section: 'server', status: 'unchanged' };
  }

  return {
    section: 'server',
    status: 'restart-required',
    error: 'Changes to server.host or server.port require a full process restart.'
  };
}

/**
 * Re-reads server.yaml and applies reloadable sections on a best-effort basis.
 *
 * When the config file is invalid, nothing is changed and {@link ReloadResult.fatalError} is set.
 *
 * @param ctx - Runtime context to update.
 * @returns Per-section reload report.
 */
export async function reloadRuntimeConfig(ctx: RuntimeContext): Promise<ReloadResult> {
  const state = getState(ctx);

  let nextConfig: ServerConfig;
  try {
    nextConfig = loadServerConfig(state.configPath);
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : formatReloadError(error);
    return { sections: [], fatalError: message };
  }

  const sections: ReloadSectionResult[] = [];

  sections.push(await reloadDbSection(state, nextConfig.db));
  sections.push(await reloadRedisSection(state, nextConfig.redis));

  state.llm = nextConfig.llm;
  sections.push({ section: 'llm', status: 'reloaded' });

  state.plugins = nextConfig.plugins;
  sections.push({ section: 'plugins', status: 'reloaded' });

  state.docs = nextConfig.docs;
  sections.push({ section: 'docs', status: 'reloaded' });

  sections.push(reloadServerSection(state, nextConfig));

  return { sections };
}

/**
 * Formats per-section reload outcomes for console output.
 *
 * @param result - Reload report returned by {@link reloadRuntimeConfig}.
 * @returns Single-line summary of section statuses.
 */
function formatConfigReloadSummary(result: ReloadResult): string {
  return result.sections
    .map((section) => {
      if (section.error) {
        return `${section.section}: ${section.status} (${section.error})`;
      }

      return `${section.section}: ${section.status}`;
    })
    .join(', ');
}

/**
 * Writes a user-facing console message after a config reload attempt.
 *
 * Called for both SIGHUP and `POST /admin/config/reload` reloads.
 *
 * @param result - Reload report returned by {@link reloadRuntimeConfig}.
 */
export function logConfigReloadResult(result: ReloadResult): void {
  if (result.fatalError) {
    console.error(`Team Hub config reload failed: ${result.fatalError}`);
    return;
  }

  console.log(`Team Hub config reloaded (${formatConfigReloadSummary(result)}).`);
}
