import { Command } from 'commander';
import type { FastifyInstance } from 'fastify';
import { mergeGlobalOptions } from '#/cli/globalOptions.js';
import { loadServerConfig, resolveConfigPath } from '#/config/serverConfig.js';
import { createServer } from '#/index.js';
import { disposeHubMcpConnections } from '#/server/llm/mcpClient.js';
import {
  connectRuntimeContext,
  createRuntimeContext,
  disconnectAll,
  logConfigReloadResult,
  reloadRuntimeConfig,
  type ReloadResult,
  type RuntimeContext
} from '#/server/runtimeContext.js';

export interface StartCommandOptions {
  /**
   * When true, enables verbose server logging.
   */
  verbose?: boolean;

  /**
   * Path to the server YAML config file (from global `-c` / `--config`).
   */
  config: string;
}

export interface RunServerOptions {
  /**
   * When true, logs resolved config and enables Fastify request logging.
   */
  verbose?: boolean;
}

/**
 * Formats a listen address for user-facing console output.
 *
 * Wildcard bind addresses (`0.0.0.0`, `::`) are shown as localhost so operators
 * know which URL to open locally.
 *
 * @param address - Address returned by the HTTP server after listen.
 * @param port - TCP port the server is listening on.
 * @returns HTTP URL suitable for display (e.g. `http://127.0.0.1:8787`).
 */
function formatListenAddress(address: string | null, port: number): string {
  if (!address) {
    return `http://127.0.0.1:${port}`;
  }

  if (address === '0.0.0.0' || address === '::') {
    return `http://127.0.0.1:${port}`;
  }

  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `http://${host}:${port}`;
}

/**
 * Registers SIGINT and SIGTERM handlers that close the Fastify instance cleanly.
 *
 * @param app - Running Fastify server to shut down on signal.
 * @param ctx - Runtime context whose connections are closed during shutdown.
 */
function registerGracefulShutdown(app: FastifyInstance, ctx: RuntimeContext): void {
  /**
   * Closes the server and exits the process after a termination signal.
   *
   * @param signal - Signal that triggered shutdown.
   */
  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info(`Received ${signal}, shutting down.`);
    await app.close();
    await disposeHubMcpConnections();
    await disconnectAll(ctx);
    process.exit(0);
  };

  /**
   * Forwards SIGINT to the shared shutdown handler.
   */
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  /**
   * Forwards SIGTERM to the shared shutdown handler.
   */
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

/**
 * Registers a repeatable SIGHUP handler that reloads server.yaml at runtime.
 *
 * @param reloadConfig - Shared reload handler that logs results and returns the report.
 */
function registerConfigReloadHandler(reloadConfig: () => Promise<ReloadResult>): void {
  process.on('SIGHUP', () => {
    void reloadConfig();
  });
}

/**
 * Creates, listens on, and runs the Team Hub HTTP server until shutdown.
 *
 * @param ctx - Runtime context with bind settings and swappable connections.
 * @param options - Runtime options such as verbose logging.
 * @returns The listening Fastify instance (also registered for graceful shutdown).
 */
export async function runServer(
  ctx: RuntimeContext,
  options: RunServerOptions = {}
): Promise<FastifyInstance> {
  /**
   * Reloads server.yaml, logs the outcome, and returns the per-section report.
   */
  const reloadConfig = async (): Promise<ReloadResult> => {
    const result = await reloadRuntimeConfig(ctx);
    logConfigReloadResult(result);
    return result;
  };

  const app = await createServer(ctx, {
    verbose: options.verbose,
    reloadConfig
  });

  await connectRuntimeContext(ctx);

  await app.listen({
    host: ctx.host,
    port: ctx.port
  });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : ctx.port;
  const host = typeof address === 'object' && address ? address.address : ctx.host;

  if (options.verbose) {
    console.log('Starting server with config path:', ctx.configPath);
  }

  console.log(`Team Hub listening on ${formatListenAddress(host, port)}`);

  registerGracefulShutdown(app, ctx);
  registerConfigReloadHandler(reloadConfig);

  return app;
}

/**
 * CLI handler for the `start` subcommand: loads config and runs the server.
 *
 * @param options - Parsed start command options including config path.
 */
export async function startCommand(options: StartCommandOptions): Promise<void> {
  const configPath = resolveConfigPath(options.config);
  const config = loadServerConfig(options.config);
  const ctx = createRuntimeContext(config, configPath);
  await runServer(ctx, { verbose: options.verbose });
}

/**
 * Registers the `start` subcommand on a Commander program.
 *
 * @param program - Root or parent Commander instance.
 * @param handler - Action to run when `start` is invoked (defaults to {@link startCommand}).
 */
export function registerStartCommand(
  program: Command,
  handler: (options: StartCommandOptions) => Promise<void> = startCommand
): void {
  program
    .command('start')
    .description('Start the Team Hub server')
    .action(
      /**
       * Runs the start subcommand after merging global CLI options.
       */
      async function startAction(this: Command, options: StartCommandOptions) {
        await handler(mergeGlobalOptions(this, options));
      }
    );
}
