import type { FastifyInstance } from 'fastify';
import type { FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { DocsConfig } from '#/config/docsConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import type { IDatabase } from '#/db/IDatabase.js';
import { canUseLlm, isLlmModelAllowed, isOverMonthlyLimit } from '#/server/auth/accessControl.js';
import { runHubChatStep } from '#/server/llm/agent.js';
import {
  currentUsagePeriod,
  getHubLlmCapabilities,
  getHubModelById,
  isHubModelOffered,
  listHubOfferedModels
} from '#/server/llm/models.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import { errorResponseSchema } from '#/server/routes/schemas/common.js';
import {
  listLlmModelsResponseSchema,
  llmChatStepBodySchema,
  llmChatStepResponseSchema,
  llmUsageSummaryResponseSchema
} from '#/server/routes/schemas/llm.js';

/**
 * Options for registering LLM proxy routes.
 */
export interface RegisterLlmRoutesOptions {
  /**
   * Database used for usage metering and user access checks.
   */
  db: IDatabase;

  /**
   * Returns the current normalized LLM configuration from server.yaml.
   */
  getLlm: () => LlmConfig | null;

  /**
   * Returns the current normalized documentation search configuration from server.yaml.
   */
  getDocs: () => DocsConfig | null;
}

/**
 * Sends a 402 response when the user has exceeded their monthly token limit.
 *
 * @param reply - Fastify reply used to short-circuit the handler.
 */
function sendMonthlyLimitExceeded(reply: FastifyReply): FastifyReply {
  return reply.code(402).send({
    error: 'Monthly LLM token limit reached. Try again next month or contact your administrator.'
  });
}

/**
 * Sends a 503 response when LLM support is not configured on the hub.
 *
 * @param reply - Fastify reply used to short-circuit the handler.
 */
function sendLlmUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    error: 'LLM support is not configured on this Team Hub.'
  });
}

/**
 * Registers bearer-protected LLM proxy routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param options - Database and LLM configuration.
 */
export async function registerLlmRoutes(
  app: FastifyInstance,
  options: RegisterLlmRoutesOptions
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/llm/models',
    schema: {
      response: {
        200: listLlmModelsResponseSchema,
        403: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Lists hub-offered models the authenticated user may use.
     */
    handler: async (request, reply) => {
      const llm = options.getLlm();
      if (!llm) {
        return sendLlmUnavailable(reply);
      }

      const user = requireAuthenticatedUser(request);
      if (denyUnlessAllowed(reply, canUseLlm(user))) {
        return;
      }

      const offered = listHubOfferedModels(llm).filter((model) =>
        isLlmModelAllowed(user, model.id)
      );

      return reply.send({
        models: offered.map((model) => ({
          id: model.id,
          label: model.label,
          provider: model.provider
        })),
        capabilities: getHubLlmCapabilities(llm)
      });
    }
  });

  routes.route({
    method: 'GET',
    url: '/llm/usage',
    schema: {
      response: {
        200: llmUsageSummaryResponseSchema,
        403: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Returns the authenticated user's current monthly LLM usage summary.
     */
    handler: async (request, reply) => {
      const llm = options.getLlm();
      if (!llm) {
        return sendLlmUnavailable(reply);
      }

      const user = requireAuthenticatedUser(request);
      if (denyUnlessAllowed(reply, canUseLlm(user))) {
        return;
      }

      const period = currentUsagePeriod();
      const usage = await options.db.getLlmUsage(user.id, period);

      return reply.send({
        period,
        totalTokens: usage?.totalTokens ?? 0,
        limit: user.llmMonthlyTokenLimit
      });
    }
  });

  routes.route({
    method: 'POST',
    url: '/llm/chat/step',
    schema: {
      body: llmChatStepBodySchema,
      response: {
        200: llmChatStepResponseSchema,
        402: errorResponseSchema,
        403: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Runs one stateless LLM completion step using hub-configured provider keys.
     */
    handler: async (request, reply) => {
      const llm = options.getLlm();
      if (!llm) {
        return sendLlmUnavailable(reply);
      }

      const user = requireAuthenticatedUser(request);
      if (denyUnlessAllowed(reply, canUseLlm(user))) {
        return;
      }

      const { model, messages, tools, systemPrompt } = request.body;

      if (!isHubModelOffered(llm, model)) {
        return reply.code(403).send({ error: 'Model is not offered by this Team Hub.' });
      }

      if (!isLlmModelAllowed(user, model)) {
        return reply.code(403).send({ error: 'You are not allowed to use this model.' });
      }

      const period = currentUsagePeriod();
      const usage = await options.db.getLlmUsage(user.id, period);
      const totalTokens = usage?.totalTokens ?? 0;
      const lastMessage = messages.at(-1);
      const isNewTurn = lastMessage?.role === 'user';

      if (isNewTurn && isOverMonthlyLimit(totalTokens, user.llmMonthlyTokenLimit)) {
        return sendMonthlyLimitExceeded(reply);
      }

      const result = await runHubChatStep(
        llm,
        {
          model,
          messages,
          tools,
          systemPrompt
        },
        {},
        options.getDocs()
      );

      const catalogModel = getHubModelById(model);
      if (!catalogModel) {
        throw new Error(`Unknown hub model: ${model}`);
      }

      await options.db.addLlmUsage(
        user.id,
        period,
        result.usage.promptTokens,
        result.usage.completionTokens
      );

      await options.db.createLlmUsageLog({
        userId: user.id,
        apiTokenId: request.apiToken?.id ?? null,
        period,
        model,
        provider: catalogModel.provider,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        isNewTurn,
        hadToolCalls: Boolean(result.toolCalls && result.toolCalls.length > 0),
        messageCount: messages.length
      });

      return reply.send({
        content: result.content,
        ...(result.toolCalls && result.toolCalls.length > 0 ? { toolCalls: result.toolCalls } : {}),
        usage: result.usage
      });
    }
  });
}
