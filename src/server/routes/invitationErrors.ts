import type { FastifyReply } from 'fastify';
import { InvitationUnavailableError } from '#/db/invitationErrors.js';
import { errorResponseSchema } from '#/server/routes/schemas/common.js';

/**
 * Maps invitation availability errors to safe HTTP responses.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param error - Thrown error from invitation preview or redeem logic.
 * @returns True when the error was handled and a response was sent.
 */
export function handleInvitationError(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof InvitationUnavailableError)) {
    return false;
  }

  const status = error.reason === 'not_found' ? 404 : 410;
  void reply.code(status).send(errorResponseSchema.parse({ error: error.message }));
  return true;
}
