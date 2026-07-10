import type { FastifyReply } from 'fastify';
import { DuplicateUserNameError, ReservedUserNameError } from '#/db/userNameValidation.js';
import { DeletionLockedError } from '#/db/deletionLockedError.js';
import { ValidationError } from '#/server/admin/userValidation.js';
import { errorResponseSchema } from '#/server/routes/schemas/common.js';

const DUPLICATE_USER_NAME_MESSAGE = 'User name is already in use.';

/**
 * Returns true when a database driver reports a unique violation on users.name.
 *
 * @param error - Thrown error from a relational backend write.
 * @returns True when the error is a duplicate user name constraint violation.
 */
function isDuplicateUserNameDbError(error: Error): boolean {
  const candidate = error as Error & { code?: string; constraint?: string };

  if (candidate.code === '23505') {
    return (
      candidate.constraint === 'users_name_key' ||
      candidate.constraint?.endsWith('_name_key') === true ||
      error.message.includes('users_name_key') ||
      error.message.includes('(name)')
    );
  }

  if (candidate.code === 'ER_DUP_ENTRY') {
    return error.message.includes("'name'") || error.message.includes('users.name');
  }

  return false;
}

/**
 * Maps validation errors to HTTP 400 responses.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param error - Thrown error from request validation.
 * @returns True when the error was handled and a response was sent.
 */
export function handleValidationError(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof ValidationError)) {
    return false;
  }

  void reply.code(400).send(errorResponseSchema.parse({ error: error.message }));
  return true;
}

/**
 * Maps known database-layer errors to HTTP responses.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param error - Thrown error from an {@link IDatabase} operation.
 * @returns True when the error was handled and a response was sent.
 */
export function handleDbError(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof DuplicateUserNameError) {
    void reply.code(400).send(errorResponseSchema.parse({ error: error.message }));
    return true;
  }

  if (error instanceof ReservedUserNameError) {
    void reply.code(400).send(errorResponseSchema.parse({ error: error.message }));
    return true;
  }

  if (error instanceof DeletionLockedError) {
    void reply.code(403).send(errorResponseSchema.parse({ error: error.message }));
    return true;
  }

  if (isDuplicateUserNameDbError(error)) {
    void reply.code(400).send(errorResponseSchema.parse({ error: DUPLICATE_USER_NAME_MESSAGE }));
    return true;
  }

  if (error.message.includes('is required')) {
    void reply.code(400).send(errorResponseSchema.parse({ error: error.message }));
    return true;
  }

  if (error.message === 'System user is not provisioned') {
    void reply.code(503).send(
      errorResponseSchema.parse({
        error: 'Team Hub is not fully provisioned. Run database migrations and restart the server.'
      })
    );
    return true;
  }

  if (error.message.toLowerCase().includes('not found')) {
    void reply.code(404).send(errorResponseSchema.parse({ error: error.message }));
    return true;
  }

  return false;
}
