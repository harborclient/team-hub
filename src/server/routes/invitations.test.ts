import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import type { InvitationRecord, UserRecord } from '#/db/types.js';
import { hashInvitationSecret } from '#/server/auth/invitations.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';
import { createPublicTestApp } from '#/server/routes/test/createPublicTestApp.js';

const sampleUser: UserRecord = {
  id: 'user-invited',
  name: 'Invited User',
  role: 'user',
  collectionAccess: ['*'],
  environmentAccess: ['*'],
  snippetAccess: ['*'],
  llmAccess: false,
  llmModels: [],
  llmMonthlyTokenLimit: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...sampleAttribution
};

const invitationSecret = 'hbi_test-invitation-secret-value';
const invitationHash = hashInvitationSecret(invitationSecret);

const pendingInvitation: InvitationRecord = {
  id: 'invite-1',
  userId: sampleUser.id,
  codeHash: invitationHash,
  codePrefix: 'hbi_test-in',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  redeemedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  createdByUserId: 'admin-1',
  updatedByUserId: 'admin-1'
};

describe('POST /auth/invitations/preview', () => {
  it('returns invited user details for a pending invitation', async () => {
    const db = createStubDatabase();
    db.findInvitationByCodeHash.mockResolvedValue(pendingInvitation);
    db.findUserById.mockResolvedValue(sampleUser);

    const app = await createPublicTestApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { secret: invitationSecret }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.name).toBe('Invited User');
    expect(body.expiresAt).toBe(pendingInvitation.expiresAt.toISOString());

    await app.close();
  });

  it('returns 404 for unknown invitation secrets', async () => {
    const db = createStubDatabase();
    db.findInvitationByCodeHash.mockResolvedValue(null);

    const app = await createPublicTestApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { secret: invitationSecret }
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});

describe('POST /auth/invitations/redeem', () => {
  it('returns a permanent API token secret when redemption succeeds', async () => {
    const db = createStubDatabase();
    db.getSystemUserId.mockReturnValue('system-user-id');
    db.redeemInvitation.mockResolvedValue({
      user: sampleUser,
      token: {
        id: 'token-new',
        userId: sampleUser.id,
        name: sampleUser.name,
        tokenHash: 'abc',
        tokenPrefix: 'hbk_prefix',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        createdByUserId: 'system-user-id',
        updatedByUserId: 'system-user-id'
      },
      secret: 'hbk_new-secret'
    });

    const app = await createPublicTestApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invitations/redeem',
      payload: { secret: invitationSecret }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.secret).toBe('hbk_new-secret');
    expect(body.token.userId).toBe(sampleUser.id);

    await app.close();
  });

  it('returns 503 when the system user is not provisioned', async () => {
    const db = createStubDatabase();
    db.getSystemUserId.mockReturnValue(null);

    const app = await createPublicTestApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invitations/redeem',
      payload: { secret: invitationSecret }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('not fully provisioned');
    expect(db.redeemInvitation).not.toHaveBeenCalled();

    await app.close();
  });
});
