import { InvitationUnavailableError } from '#/db/invitationErrors.js';
import type { InvitationRecord } from '#/db/types.js';

/**
 * Validates that an invitation is still pending and throws when it is not redeemable.
 *
 * @param invitation - Invitation record loaded from storage.
 * @param now - Reference time, typically the current instant.
 * @throws {InvitationUnavailableError} When the invitation cannot be used.
 */
export function assertInvitationPending(
  invitation: InvitationRecord,
  now: Date = new Date()
): void {
  if (invitation.redeemedAt) {
    throw new InvitationUnavailableError('redeemed');
  }

  if (invitation.revokedAt) {
    throw new InvitationUnavailableError('revoked');
  }

  if (invitation.expiresAt.getTime() <= now.getTime()) {
    throw new InvitationUnavailableError('expired');
  }
}
