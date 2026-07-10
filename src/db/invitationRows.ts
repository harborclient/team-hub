import type { InvitationRecord } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the user_invitations table.
 */
export interface InvitationSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Invited user identifier column.
   */
  user_id: string;

  /**
   * sha256 hex digest column for the invitation secret.
   */
  code_hash: string;

  /**
   * Display prefix column.
   */
  code_prefix: string;

  /**
   * Expiry timestamp column.
   */
  expires_at: Date;

  /**
   * Redemption timestamp column, if any.
   */
  redeemed_at: Date | null;

  /**
   * Revocation timestamp column, if any.
   */
  revoked_at: Date | null;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Creating user identifier column.
   */
  created_by_user_id: string | null;

  /**
   * Last updating user identifier column.
   */
  updated_by_user_id: string | null;
}

/**
 * Maps a snake_case SQL row to the shared {@link InvitationRecord} shape.
 *
 * @param row - Database row from user_invitations.
 * @returns Normalized invitation record for application code.
 */
export function mapInvitationSqlRow(row: InvitationSqlRow): InvitationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    codePrefix: row.code_prefix,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null
  };
}

/**
 * Computes a human-readable invitation status from persisted timestamps.
 *
 * @param invitation - Invitation record to classify.
 * @param now - Reference time, typically the current instant.
 * @returns One of pending, redeemed, revoked, or expired.
 */
export function getInvitationStatus(
  invitation: InvitationRecord,
  now: Date = new Date()
): 'pending' | 'redeemed' | 'revoked' | 'expired' {
  if (invitation.redeemedAt) {
    return 'redeemed';
  }

  if (invitation.revokedAt) {
    return 'revoked';
  }

  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }

  return 'pending';
}
