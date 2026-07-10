import { z } from 'zod/v4';
import type { InvitationRecord, UserRecord } from '#/db/types.js';
import { userRoleSchema } from '#/server/routes/schemas/auth.js';
import { timestampSchema } from '#/server/routes/schemas/common.js';
import { createAdminUserBodySchema, hubUserRecordSchema } from '#/server/routes/schemas/admin.js';
import { createdApiTokenResponseSchema } from '#/server/routes/schemas/admin.js';
import { getInvitationStatus } from '#/db/invitationRows.js';

/**
 * Computed invitation lifecycle status exposed to admin clients.
 */
export const invitationStatusSchema = z.enum(['pending', 'redeemed', 'revoked', 'expired']);

/**
 * Invitation metadata returned by admin and preview routes (never includes the secret hash).
 */
export const hubInvitationRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  codePrefix: z.string(),
  expiresAt: timestampSchema,
  redeemedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  status: invitationStatusSchema
});

/**
 * Request body schema for `POST /admin/invited-users`.
 */
export const createAdminInvitedUserBodySchema = createAdminUserBodySchema.extend({
  expiresInHours: z.number().int().positive().optional()
});

/**
 * Response body schema for `POST /admin/invited-users` and `POST /admin/users/:id/invitations`.
 */
export const createAdminInvitationResponseSchema = z.object({
  user: hubUserRecordSchema,
  invitation: hubInvitationRecordSchema,
  secret: z.string()
});

/**
 * Response body schema for `GET /admin/invitations`.
 */
export const listAdminInvitationsResponseSchema = z.object({
  invitations: z.array(hubInvitationRecordSchema)
});

/**
 * Request body schema for public invitation preview and redeem routes.
 */
export const invitationSecretBodySchema = z.object({
  secret: z.string().trim().min(1)
});

/**
 * Optional token label supplied when redeeming an invitation.
 */
export const redeemInvitationBodySchema = invitationSecretBodySchema.extend({
  tokenName: z.string().trim().min(1).optional()
});

/**
 * User details returned by invitation preview without issuing a token.
 */
export const hubInvitationPreviewUserSchema = z.object({
  name: z.string(),
  role: userRoleSchema,
  collectionAccess: z.array(z.string()),
  environmentAccess: z.array(z.string()),
  snippetAccess: z.array(z.string()),
  llmAccess: z.boolean(),
  llmModels: z.array(z.string())
});

/**
 * Response body schema for `POST /auth/invitations/preview`.
 */
export const previewInvitationResponseSchema = z.object({
  user: hubInvitationPreviewUserSchema,
  expiresAt: timestampSchema
});

/**
 * Serializes an invitation record for JSON admin API responses.
 *
 * @param invitation - Invitation record from the database layer.
 * @returns Invitation with ISO timestamp strings and computed status.
 */
export function serializeHubInvitation(invitation: InvitationRecord) {
  return {
    id: invitation.id,
    userId: invitation.userId,
    codePrefix: invitation.codePrefix,
    expiresAt: invitation.expiresAt.toISOString(),
    redeemedAt: invitation.redeemedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    status: getInvitationStatus(invitation)
  };
}

/**
 * Serializes preview user details from a full user record.
 *
 * @param user - Invited user account associated with a pending invitation.
 * @returns Non-sensitive user fields for confirmation UI.
 */
export function serializeInvitationPreviewUser(user: UserRecord) {
  return {
    name: user.name,
    role: user.role,
    collectionAccess: user.collectionAccess,
    environmentAccess: user.environmentAccess,
    snippetAccess: user.snippetAccess,
    llmAccess: user.llmAccess,
    llmModels: user.llmModels
  };
}

export { createdApiTokenResponseSchema };
