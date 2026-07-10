import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import { InvitationUnavailableError } from '#/db/invitationErrors.js';
import { assertInvitationPending } from '#/db/invitationValidation.js';
import { hashInvitationSecret, isInvitationSecretFormat } from '#/server/auth/invitations.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { handleDbError } from '#/server/routes/errors.js';
import { handleInvitationError } from '#/server/routes/invitationErrors.js';
import {
  createdApiTokenResponseSchema,
  invitationSecretBodySchema,
  previewInvitationResponseSchema,
  redeemInvitationBodySchema,
  serializeInvitationPreviewUser
} from '#/server/routes/schemas/invitations.js';
import { serializeApiToken } from '#/server/routes/schemas/admin.js';
import { errorResponseSchema } from '#/server/routes/schemas/common.js';

export interface RegisterInvitationRoutesOptions {
  /**
   * Database used to preview and redeem onboarding invitations.
   */
  db: IDatabase;

  /**
   * Redis-backed store for throttling unauthenticated invitation routes.
   */
  throttleStore: IThrottleStore;
}

/**
 * Builds the throttle key for public invitation routes from client IP only.
 *
 * @param request - Incoming HTTP request.
 * @returns Throttle key scoped to invitation preview/redeem attempts.
 */
export function buildInvitationThrottleKey(request: FastifyRequest): string {
  return `${request.ip}:invitation`;
}

/**
 * Builds an onRequest hook that rate-limits public invitation routes by IP.
 *
 * @param throttleStore - Redis-backed throttle store shared with bearer auth.
 * @returns Hook that rejects throttled clients with HTTP 429 or 503.
 */
export function createInvitationThrottleHook(throttleStore: IThrottleStore) {
  /**
   * Applies IP throttling before public invitation handlers run.
   *
   * @param request - Incoming HTTP request.
   * @param reply - Fastify reply used to short-circuit throttled requests.
   */
  return async function invitationThrottle(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const policy = throttleStore.getPolicy();
    const throttleKey = buildInvitationThrottleKey(request);

    try {
      if (await throttleStore.isBlocked(throttleKey)) {
        return reply
          .header('Retry-After', String(policy.blockSeconds))
          .code(429)
          .send({ error: 'Too Many Requests' });
      }
    } catch {
      return reply.code(503).send({ error: 'Service Unavailable' });
    }
  };
}

/**
 * Records a failed invitation attempt and blocks abusive clients when needed.
 *
 * @param throttleStore - Redis-backed throttle store.
 * @param request - Incoming HTTP request.
 * @param reply - Fastify reply used to return 503 when Redis is unavailable.
 * @returns True when the response was already sent.
 */
async function recordInvitationFailure(
  throttleStore: IThrottleStore,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const throttleKey = buildInvitationThrottleKey(request);

  try {
    await throttleStore.recordFailure(throttleKey);
    return false;
  } catch {
    void reply.code(503).send({ error: 'Service Unavailable' });
    return true;
  }
}

/**
 * Resets invitation throttling after a successful preview or redeem.
 *
 * @param throttleStore - Redis-backed throttle store.
 * @param request - Incoming HTTP request.
 * @param reply - Fastify reply used to return 503 when Redis is unavailable.
 * @returns True when the response was already sent.
 */
async function resetInvitationThrottle(
  throttleStore: IThrottleStore,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const throttleKey = buildInvitationThrottleKey(request);

  try {
    await throttleStore.reset(throttleKey);
    return false;
  } catch {
    void reply.code(503).send({ error: 'Service Unavailable' });
    return true;
  }
}

/**
 * Registers public invitation preview and redeem routes.
 *
 * @param app - Fastify server or encapsulated public scope.
 * @param options - Database and throttle dependencies.
 */
export async function registerInvitationRoutes(
  app: FastifyInstance,
  options: RegisterInvitationRoutesOptions
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', createInvitationThrottleHook(options.throttleStore));

  routes.route({
    method: 'POST',
    url: '/auth/invitations/preview',
    schema: {
      body: invitationSecretBodySchema,
      response: {
        200: previewInvitationResponseSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        410: errorResponseSchema,
        429: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Returns invited user details for confirmation without consuming the invitation.
     */
    handler: async (request, reply) => {
      try {
        const secret = request.body.secret;
        if (!isInvitationSecretFormat(secret)) {
          return reply.code(400).send({ error: 'Invalid invitation secret format.' });
        }

        const invitation = await options.db.findInvitationByCodeHash(hashInvitationSecret(secret));
        if (!invitation) {
          if (await recordInvitationFailure(options.throttleStore, request, reply)) {
            return;
          }

          return reply.code(404).send({ error: 'Invalid or expired invitation.' });
        }

        try {
          assertInvitationPending(invitation);
        } catch (error) {
          if (await recordInvitationFailure(options.throttleStore, request, reply)) {
            return;
          }

          if (handleInvitationError(reply, error)) {
            return;
          }

          throw error;
        }

        const user = await options.db.findUserById(invitation.userId);
        if (!user) {
          return reply.code(404).send({ error: 'Invalid or expired invitation.' });
        }

        if (await resetInvitationThrottle(options.throttleStore, request, reply)) {
          return;
        }

        return reply.send({
          user: serializeInvitationPreviewUser(user),
          expiresAt: invitation.expiresAt.toISOString()
        });
      } catch (error) {
        if (handleDbError(reply, error) || handleInvitationError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/auth/invitations/redeem',
    schema: {
      body: redeemInvitationBodySchema,
      response: {
        201: createdApiTokenResponseSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        410: errorResponseSchema,
        429: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Consumes a pending invitation and returns a one-time permanent API token secret.
     */
    handler: async (request, reply) => {
      try {
        const secret = request.body.secret;
        if (!isInvitationSecretFormat(secret)) {
          return reply.code(400).send({ error: 'Invalid invitation secret format.' });
        }

        const systemUserId = options.db.getSystemUserId();
        if (!systemUserId) {
          throw new Error('System user is not provisioned');
        }

        const tokenName = request.body.tokenName?.trim();

        const codeHash = hashInvitationSecret(secret);

        let redeemed;
        try {
          redeemed = await options.db.redeemInvitation(codeHash, tokenName ?? '', systemUserId);
        } catch (error) {
          if (error instanceof InvitationUnavailableError) {
            if (await recordInvitationFailure(options.throttleStore, request, reply)) {
              return;
            }
          }

          if (handleInvitationError(reply, error)) {
            return;
          }

          throw error;
        }

        if (await resetInvitationThrottle(options.throttleStore, request, reply)) {
          return;
        }

        return reply.code(201).send({
          token: serializeApiToken(redeemed.token),
          secret: redeemed.secret
        });
      } catch (error) {
        if (handleDbError(reply, error) || handleInvitationError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });
}
