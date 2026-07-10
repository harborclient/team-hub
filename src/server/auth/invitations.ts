import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { InvitationRecord } from '#/db/types.js';

/**
 * Prefix applied to generated invitation secrets and display prefixes.
 */
export const INVITATION_PREFIX = 'hbi_';

/**
 * Default invitation lifetime in hours when the caller omits an explicit value.
 */
export const DEFAULT_INVITATION_EXPIRES_IN_HOURS = 24;

/**
 * Computes the sha256 hex digest used for database lookup of an invitation secret.
 *
 * @param secret - Raw invitation secret from a join link or request body.
 * @returns Lowercase hex digest suitable for storage and lookup.
 */
export function hashInvitationSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Returns true when the value looks like a Team Hub invitation secret.
 *
 * @param secret - Candidate invitation secret from a client request.
 */
export function isInvitationSecretFormat(secret: string): boolean {
  return secret.startsWith(INVITATION_PREFIX) && secret.length > INVITATION_PREFIX.length + 8;
}

/**
 * Resolves invitation expiry from an optional hours override.
 *
 * @param expiresInHours - Optional positive hour count from admin input.
 * @returns Absolute expiry timestamp.
 */
export function resolveInvitationExpiresAt(expiresInHours?: number): Date {
  const hours =
    expiresInHours !== undefined && expiresInHours > 0
      ? expiresInHours
      : DEFAULT_INVITATION_EXPIRES_IN_HOURS;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * Generates a new invitation record and its one-time plaintext secret.
 *
 * @param userId - User account the invitation grants access for after redemption.
 * @param actingUserId - Admin or system user creating the invitation.
 * @param expiresAt - Absolute expiry timestamp for the invitation.
 * @returns Persistable record (hash only) and the secret shown once at creation.
 */
export function generateInvitation(
  userId: string,
  actingUserId: string,
  expiresAt: Date
): { record: InvitationRecord; secret: string } {
  const secretSuffix = randomBytes(32).toString('base64url');
  const secret = `${INVITATION_PREFIX}${secretSuffix}`;
  const codePrefix = `${INVITATION_PREFIX}${secretSuffix.slice(0, 8)}`;
  const createdAt = new Date();

  const record: InvitationRecord = {
    id: randomUUID(),
    userId,
    codeHash: hashInvitationSecret(secret),
    codePrefix,
    expiresAt,
    redeemedAt: null,
    revokedAt: null,
    createdAt,
    createdByUserId: actingUserId,
    updatedByUserId: actingUserId
  };

  return { record, secret };
}
