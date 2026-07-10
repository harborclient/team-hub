/**
 * SQL column list for user_invitations SELECT queries.
 */
export const INVITATION_SELECT_COLUMNS = `
  id,
  user_id,
  code_hash,
  code_prefix,
  expires_at,
  redeemed_at,
  revoked_at,
  created_at,
  created_by_user_id,
  updated_by_user_id
`.trim();

/**
 * Base SELECT statement for user_invitations rows.
 */
export const INVITATION_SELECT = `SELECT ${INVITATION_SELECT_COLUMNS} FROM user_invitations`;
