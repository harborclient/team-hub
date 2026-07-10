/**
 * Reason an invitation cannot be previewed or redeemed.
 */
export type InvitationUnavailableReason = 'not_found' | 'expired' | 'revoked' | 'redeemed';

/**
 * Thrown when an invitation secret does not refer to a pending, unexpired invitation.
 */
export class InvitationUnavailableError extends Error {
  /**
   * Specific failure reason used to choose a safe HTTP status code.
   */
  readonly reason: InvitationUnavailableReason;

  /**
   * @param reason - Why the invitation cannot be used.
   */
  constructor(reason: InvitationUnavailableReason) {
    super('Invalid or expired invitation.');
    this.name = 'InvitationUnavailableError';
    this.reason = reason;
  }
}
