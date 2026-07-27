import { describe, expect, it, vi } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { DuplicateUserNameError, ReservedUserNameError } from '#/db/userNameValidation.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleApiTokenRecord,
  sampleUserRecord
} from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleLlmConfig = {
  providers: {
    openai: { apiKey: 'sk-test' }
  },
  models: ['gpt-4o']
};

const sampleCollection = {
  id: 'collection-1',
  name: 'Shared API',
  variables: [],
  headers: [],
  auth: { type: 'none' as const, basic: { username: '', password: '' }, bearer: { token: '' } },
  preRequestScript: '',
  postRequestScript: '',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false,
  marker: null
};

const sampleEnvironment = {
  id: 'env-1',
  name: 'Production',
  variables: [],
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false,
  marker: null
};

const sampleFolder = {
  id: 'folder-1',
  collectionId: 'collection-1',
  parentFolderId: null,
  name: 'Auth',
  sortOrder: 0,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  ...sampleAttribution,
  marker: null
};

const sampleRequest = {
  id: 'request-1',
  collectionId: 'collection-1',
  name: 'Get health',
  method: 'GET' as const,
  url: '/health',
  headers: [],
  params: [],
  auth: { type: 'none' as const, basic: { username: '', password: '' }, bearer: { token: '' } },
  body: '',
  bodyType: 'none' as const,
  preRequestScript: '',
  postRequestScript: '',
  comment: '',
  folderId: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-04T00:00:00.000Z'),
  updatedAt: new Date('2026-01-05T00:00:00.000Z'),
  ...sampleAttribution,
  marker: null
};

const sampleSnippet = {
  id: 'snippet-1',
  name: 'Auth helper',
  code: '',
  scope: 'any' as const,
  sortOrder: 0,
  createdAt: new Date('2026-01-05T00:00:00.000Z'),
  updatedAt: new Date('2026-01-05T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false
};

const adminUser = {
  ...sampleUserRecord,
  id: 'admin-1',
  role: 'admin' as const,
  collectionAccess: [],
  environmentAccess: [],
  snippetAccess: []
};

/**
 * Configures catalog list mocks used by admin user access validation.
 *
 * @param db - Database stub for admin route tests.
 */
function mockAccessCatalogs(db: ReturnType<typeof createStubDatabase>): void {
  db.listCollections.mockResolvedValue([sampleCollection]);
  db.listEnvironments.mockResolvedValue([sampleEnvironment]);
  db.listSnippets.mockResolvedValue([sampleSnippet]);
}

describe('GET /admin/users', () => {
  it('omits the internal system user from the response', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      name: 'Ops',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemUser = {
      ...sampleUserRecord,
      id: 'system-user-id',
      name: 'system',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const listedUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };
    db.getSystemUserId.mockReturnValue('system-user-id');
    db.listUsers.mockResolvedValue([systemUser, adminUser, listedUser]);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users.map((user: { id: string }) => user.id)).toEqual([
      'admin-1',
      'user-2'
    ]);

    await app.close();
  });

  it('includes unrelated accounts named system when systemUserId is known', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      name: 'Ops',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemUser = {
      ...sampleUserRecord,
      id: 'system-user-id',
      name: 'system',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const decoySystemNameUser = {
      ...sampleUserRecord,
      id: 'other-id',
      name: 'system',
      role: 'user' as const
    };
    db.getSystemUserId.mockReturnValue('system-user-id');
    db.listUsers.mockResolvedValue([systemUser, adminUser, decoySystemNameUser]);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users.map((user: { id: string }) => user.id)).toEqual([
      'admin-1',
      'other-id'
    ]);

    await app.close();
  });

  it('returns all users for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      name: 'Ops',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const listedUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };
    db.listUsers.mockResolvedValue([adminUser, listedUser]);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      users: [
        {
          id: 'admin-1',
          name: 'Ops',
          role: 'admin',
          collectionAccess: [],
          environmentAccess: [],
          snippetAccess: [],
          llmAccess: false,
          llmModels: [],
          llmMonthlyTokenLimit: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          warnings: []
        },
        {
          id: 'user-2',
          name: 'Alice',
          role: 'user',
          collectionAccess: ['*'],
          environmentAccess: ['*'],
          snippetAccess: ['*'],
          llmAccess: false,
          llmModels: [],
          llmMonthlyTokenLimit: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          warnings: []
        }
      ]
    });
    expect(db.listUsers).toHaveBeenCalledOnce();
    expect(db.listCollections).toHaveBeenCalledOnce();
    expect(db.listEnvironments).toHaveBeenCalledOnce();

    await app.close();
  });

  it('includes warnings for stale access list references', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      name: 'Ops',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const listedUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice',
      collectionAccess: ['collection-1', 'deleted-col'],
      environmentAccess: ['missing-env'],
      snippetAccess: []
    };
    db.listUsers.mockResolvedValue([adminUser, listedUser]);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser,
      llm: sampleLlmConfig
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users[1].warnings).toEqual([
      'Unknown collection id "deleted-col".',
      'Unknown environment id "missing-env".'
    ]);

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.listUsers).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 401 without a bearer token', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({ db });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });
});

describe('PUT /admin/users/:id', () => {
  it('updates a user for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      name: 'Ops',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };
    const updatedUser = {
      ...targetUser,
      name: 'Alice Updated',
      updatedAt: new Date('2026-01-02T00:00:00.000Z')
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.updateUser.mockResolvedValue(updatedUser);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { name: 'Alice Updated' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Alice Updated');
    expect(db.updateUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ name: 'Alice Updated' }),
      'admin-1'
    );

    await app.close();
  });

  it('clears access lists when changing role to admin', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice',
      llmAccess: true,
      llmModels: ['gpt-4o']
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.updateUser.mockResolvedValue({
      ...targetUser,
      role: 'admin',
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: [],
      llmAccess: false,
      llmModels: []
    });
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { role: 'admin', collectionAccess: ['*'] }
    });

    expect(response.statusCode).toBe(200);
    expect(db.updateUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        role: 'admin',
        collectionAccess: [],
        environmentAccess: [],
        snippetAccess: [],
        llmAccess: false,
        llmModels: []
      }),
      'admin-1'
    );

    await app.close();
  });

  it('returns 404 when the user does not exist', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findUserById.mockResolvedValue(null);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/missing-id',
      headers: authHeader(),
      payload: { name: 'Updated' }
    });

    expect(response.statusCode).toBe(404);
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 when renaming a user to an existing name', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };
    const otherUser = {
      ...sampleUserRecord,
      id: 'user-3',
      name: 'Bob'
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.updateUser.mockRejectedValue(new DuplicateUserNameError('Bob'));
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      if (id === otherUser.id) {
        return otherUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { name: 'Bob' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'User name "Bob" is already in use.'
    });
    expect(db.updateUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ name: 'Bob' }),
      'admin-1'
    );

    await app.close();
  });

  it('returns 400 when renaming a user to the reserved system name', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.updateUser.mockRejectedValue(new ReservedUserNameError('system'));
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { name: 'system' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'User name "system" is reserved for the internal system account.'
    });

    await app.close();
  });

  it('returns 400 for mixed wildcard access lists', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findUserById.mockResolvedValue(targetUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { collectionAccess: ['*', 'collection-1'] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Wildcard access "*" must be the only entry.'
    });
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 for unknown collection access ids', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findUserById.mockResolvedValue(targetUser);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { collectionAccess: ['missing-col'] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Unknown collection id: missing-col.'
    });
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('allows partial updates when stored access lists contain stale ids', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice',
      collectionAccess: ['deleted-col'],
      environmentAccess: ['missing-env'],
      snippetAccess: []
    };
    const updatedUser = {
      ...targetUser,
      name: 'Alice Updated'
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.updateUser.mockResolvedValue(updatedUser);
    mockAccessCatalogs(db);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { name: 'Alice Updated' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Alice Updated');
    expect(db.updateUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ name: 'Alice Updated' }),
      'admin-1'
    );

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/user-2',
      headers: authHeader(),
      payload: { name: 'Updated' }
    });

    expect(response.statusCode).toBe(403);
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when changing the authenticated admin role', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findUserById.mockResolvedValue(adminUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/admin-1',
      headers: authHeader(),
      payload: { role: 'user' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when updating the system user', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemUser = {
      ...sampleUserRecord,
      id: 'system-user-id',
      name: 'system',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.getSystemUserId.mockReturnValue('system-user-id');
    db.findUserById.mockResolvedValue(systemUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === systemUser.id) {
        return systemUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/users/system-user-id',
      headers: authHeader(),
      payload: { name: 'Updated' }
    });

    expect(response.statusCode).toBe(403);
    expect(db.updateUser).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('DELETE /admin/users/:id', () => {
  it('deletes a user for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.deleteUser.mockResolvedValue(undefined);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/users/user-2',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteUser).toHaveBeenCalledWith('user-2', 'admin-1');

    await app.close();
  });

  it('returns 404 when the user does not exist', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findUserById.mockResolvedValue(null);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/users/missing-id',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(404);
    expect(db.deleteUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/users/user-2',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.deleteUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting the authenticated admin account', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findUserById.mockResolvedValue(adminUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/users/admin-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting the system user', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemUser = {
      ...sampleUserRecord,
      id: 'system-user-id',
      name: 'system',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.getSystemUserId.mockReturnValue('system-user-id');
    db.findUserById.mockResolvedValue(systemUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === systemUser.id) {
        return systemUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/users/system-user-id',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.deleteUser).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/collections', () => {
  it('returns all collections for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([sampleCollection]);
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      collections: [{ id: 'collection-1', name: 'Shared API', deletionLocked: false }]
    });

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.listCollections).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/collections/:collectionId/folders', () => {
  it('returns folders for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue(sampleCollection);
    db.listFolders.mockResolvedValue([sampleFolder]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/collection-1/folders',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().folders).toEqual([
      expect.objectContaining({
        id: 'folder-1',
        parentFolderId: null,
        name: 'Auth',
        sortOrder: 0
      })
    ]);

    await app.close();
  });

  it('returns 404 when the collection is unknown', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue(null);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/missing/folders',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(404);
    expect(db.listFolders).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/collection-1/folders',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.findCollectionById).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/collections/:collectionId/requests', () => {
  it('returns requests for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue(sampleCollection);
    db.listRequests.mockResolvedValue([sampleRequest]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/collection-1/requests',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toEqual([
      expect.objectContaining({ id: 'request-1', name: 'Get health', method: 'GET' })
    ]);

    await app.close();
  });

  it('returns 404 when the collection is unknown', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue(null);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/missing/requests',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(404);
    expect(db.listRequests).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/collections/collection-1/requests',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.findCollectionById).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('DELETE /admin/requests/:id', () => {
  it('deletes a saved request for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findRequestById.mockResolvedValue(sampleRequest);
    db.deleteRequest.mockResolvedValue(undefined);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/requests/request-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteRequest).toHaveBeenCalledWith('request-1', 'admin-1');

    await app.close();
  });

  it('returns 404 when the request is unknown', async () => {
    const db = createStubDatabase();
    db.findRequestById.mockResolvedValue(null);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/requests/missing',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(404);
    expect(db.deleteRequest).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/requests/request-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.findRequestById).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/environments', () => {
  it('returns all environments for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.listEnvironments.mockResolvedValue([sampleEnvironment]);
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/environments',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      environments: [{ id: 'env-1', name: 'Production', deletionLocked: false }]
    });

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/environments',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.listEnvironments).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('admin collection configuration', () => {
  const adminUser = {
    ...sampleUserRecord,
    id: 'admin-1',
    role: 'admin' as const,
    collectionAccess: [],
    environmentAccess: [],
    snippetAccess: []
  };

  it('deletes a collection for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue({ ...sampleCollection, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/collections/collection-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteCollection).toHaveBeenCalledWith('collection-1', 'admin-1');

    await app.close();
  });

  it('updates collection deletion lock for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.setCollectionDeletionLocked.mockResolvedValue({ ...sampleCollection, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/collections/collection-1',
      headers: authHeader(),
      payload: { deletionLocked: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'collection-1',
      name: 'Shared API',
      deletionLocked: true
    });
    expect(db.setCollectionDeletionLocked).toHaveBeenCalledWith('collection-1', true, 'admin-1');

    await app.close();
  });

  it('returns 403 for user-role tokens on admin collection routes', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/admin/collections/collection-1',
      headers: authHeader()
    });
    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/admin/collections/collection-1',
      headers: authHeader(),
      payload: { deletionLocked: true }
    });

    expect(deleteResponse.statusCode).toBe(403);
    expect(updateResponse.statusCode).toBe(403);

    await app.close();
  });
});

describe('admin environment configuration', () => {
  const adminUser = {
    ...sampleUserRecord,
    id: 'admin-1',
    role: 'admin' as const,
    collectionAccess: [],
    environmentAccess: [],
    snippetAccess: []
  };

  it('deletes an environment for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findEnvironmentById.mockResolvedValue({ ...sampleEnvironment, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/environments/env-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteEnvironment).toHaveBeenCalledWith('env-1', 'admin-1');

    await app.close();
  });

  it('updates environment deletion lock for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.setEnvironmentDeletionLocked.mockResolvedValue({
      ...sampleEnvironment,
      deletionLocked: true
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/environments/env-1',
      headers: authHeader(),
      payload: { deletionLocked: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'env-1',
      name: 'Production',
      deletionLocked: true
    });
    expect(db.setEnvironmentDeletionLocked).toHaveBeenCalledWith('env-1', true, 'admin-1');

    await app.close();
  });
});

describe('admin snippet management', () => {
  const adminUser = {
    ...sampleUserRecord,
    id: 'admin-1',
    role: 'admin' as const,
    collectionAccess: [],
    environmentAccess: [],
    snippetAccess: []
  };

  it('lists full snippet records for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.listSnippets.mockResolvedValue([sampleSnippet]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/snippets',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      snippets: [
        {
          id: 'snippet-1',
          name: 'Auth helper',
          code: '',
          scope: 'any',
          sortOrder: 0,
          createdAt: '2026-01-05T00:00:00.000Z',
          updatedAt: '2026-01-05T00:00:00.000Z',
          createdByUserId: sampleAttribution.createdByUserId,
          updatedByUserId: sampleAttribution.updatedByUserId,
          deletionLocked: false
        }
      ]
    });

    await app.close();
  });

  it('creates a snippet for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.createSnippet.mockResolvedValue({
      ...sampleSnippet,
      name: 'New helper',
      code: 'console.log("hi");'
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/snippets',
      headers: authHeader(),
      payload: { name: 'New helper', code: 'console.log("hi");', scope: 'any' }
    });

    expect(response.statusCode).toBe(201);
    expect(db.createSnippet).toHaveBeenCalledWith(
      'New helper',
      'console.log("hi");',
      'any',
      'admin-1'
    );

    await app.close();
  });

  it('updates snippet content for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findSnippetById.mockResolvedValue(sampleSnippet);
    db.updateSnippet.mockResolvedValue({
      ...sampleSnippet,
      name: 'Updated helper',
      code: 'console.log("updated");',
      scope: 'pre-request'
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/snippets/snippet-1',
      headers: authHeader(),
      payload: {
        name: 'Updated helper',
        code: 'console.log("updated");',
        scope: 'pre-request'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.updateSnippet).toHaveBeenCalledWith(
      'snippet-1',
      'Updated helper',
      'console.log("updated");',
      'pre-request',
      'admin-1'
    );

    await app.close();
  });

  it('deletes a snippet for admin-role tokens', async () => {
    const db = createStubDatabase();
    db.findSnippetById.mockResolvedValue({ ...sampleSnippet, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/snippets/snippet-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteSnippet).toHaveBeenCalledWith('snippet-1', 'admin-1');

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/admin/snippets',
      headers: authHeader()
    });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/admin/snippets',
      headers: authHeader(),
      payload: { name: 'Blocked', code: '', scope: 'any' }
    });

    expect(listResponse.statusCode).toBe(403);
    expect(createResponse.statusCode).toBe(403);
    expect(db.listSnippets).not.toHaveBeenCalled();
    expect(db.createSnippet).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/llm/models', () => {
  it('returns all hub-offered models for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      models: [{ id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' }],
      capabilities: { openai: true }
    });

    await app.close();
  });

  it('returns 503 when LLM is not configured', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: null,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(503);

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });
});

describe('POST /admin/users', () => {
  it('creates a user and initial token for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const createdUser = {
      ...sampleUserRecord,
      id: 'user-new',
      name: 'Bob',
      role: 'user' as const
    };

    mockAccessCatalogs(db);
    db.createUser.mockResolvedValue(createdUser);
    db.createApiToken.mockResolvedValue(undefined);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: authHeader(),
      payload: {
        name: 'Bob',
        role: 'user',
        collectionAccess: ['*'],
        environmentAccess: ['*'],
        snippetAccess: ['*']
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.name).toBe('Bob');
    expect(body.token.userId).toBe('user-new');
    expect(typeof body.secret).toBe('string');
    expect(body.secret.startsWith('hbk_')).toBe(true);
    expect(db.createUser).toHaveBeenCalledOnce();
    expect(db.createApiToken).toHaveBeenCalledOnce();

    await app.close();
  });

  it('returns 400 for duplicate user names', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    mockAccessCatalogs(db);
    db.createUser.mockRejectedValue(new DuplicateUserNameError('Bob'));

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: authHeader(),
      payload: { name: 'Bob', role: 'user' }
    });

    expect(response.statusCode).toBe(400);
    expect(db.createApiToken).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: authHeader(),
      payload: { name: 'Bob', role: 'user' }
    });

    expect(response.statusCode).toBe(403);
    expect(db.createUser).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /admin/tokens', () => {
  it('returns all tokens for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    db.listApiTokens.mockResolvedValue([sampleApiTokenRecord]);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/tokens',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tokens: [
        {
          id: sampleApiTokenRecord.id,
          userId: sampleApiTokenRecord.userId,
          name: sampleApiTokenRecord.name,
          tokenPrefix: sampleApiTokenRecord.tokenPrefix,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: null
        }
      ]
    });

    await app.close();
  });

  it('returns 403 for user-role tokens', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/tokens',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.listApiTokens).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /admin/users/:id/tokens', () => {
  it('creates a token for an existing user', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findUserById.mockResolvedValue(targetUser);
    db.createApiToken.mockResolvedValue(undefined);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/user-2/tokens',
      headers: authHeader(),
      payload: { name: 'Desktop' }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token.userId).toBe('user-2');
    expect(body.token.name).toBe('Desktop');
    expect(typeof body.secret).toBe('string');
    expect(db.createApiToken).toHaveBeenCalledOnce();

    await app.close();
  });

  it('returns 404 when the user does not exist', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findUserById.mockResolvedValue(null);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/missing-id/tokens',
      headers: authHeader(),
      payload: { name: 'Desktop' }
    });

    expect(response.statusCode).toBe(404);
    expect(db.createApiToken).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('DELETE /admin/tokens/:id', () => {
  it('deletes a token for admin-role tokens', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const targetUser = {
      ...sampleUserRecord,
      id: 'user-2',
      name: 'Alice'
    };

    db.findApiTokenById.mockResolvedValue(sampleApiTokenRecord);
    db.findUserById.mockResolvedValue(targetUser);
    db.deleteApiToken.mockResolvedValue(true);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === targetUser.id) {
        return targetUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/tokens/${sampleApiTokenRecord.id}`,
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteApiToken).toHaveBeenCalledWith(sampleApiTokenRecord.id, 'admin-1');

    await app.close();
  });

  it('returns 404 when the token does not exist', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };

    db.findApiTokenById.mockResolvedValue(null);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tokens/missing-id',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(404);
    expect(db.deleteApiToken).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting a system user token', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemUser = {
      ...sampleUserRecord,
      id: 'system-user-id',
      name: 'system',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const systemToken = {
      ...sampleApiTokenRecord,
      id: 'system-token',
      userId: 'system-user-id'
    };

    db.getSystemUserId.mockReturnValue('system-user-id');
    db.findApiTokenById.mockResolvedValue(systemToken);
    db.findUserById.mockResolvedValue(systemUser);

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser
    });
    db.findUserById.mockImplementation(async (id: string) => {
      if (id === sampleApiTokenRecord.userId || id === adminUser.id) {
        return adminUser;
      }

      if (id === systemUser.id) {
        return systemUser;
      }

      return null;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tokens/system-token',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(db.deleteApiToken).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /admin/config/reload', () => {
  it('returns 403 for non-admin users', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: sampleUserRecord
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/config/reload',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it('returns the reload report for admin users', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const reloadConfig = vi.fn().mockResolvedValue({
      sections: [
        { section: 'db', status: 'unchanged' },
        { section: 'redis', status: 'unchanged' },
        { section: 'llm', status: 'reloaded' },
        { section: 'plugins', status: 'reloaded' },
        { section: 'server', status: 'unchanged' }
      ]
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser,
      reloadConfig
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/config/reload',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(reloadConfig).toHaveBeenCalledOnce();
    expect(response.json()).toEqual({
      sections: [
        { section: 'db', status: 'unchanged' },
        { section: 'redis', status: 'unchanged' },
        { section: 'llm', status: 'reloaded' },
        { section: 'plugins', status: 'reloaded' },
        { section: 'server', status: 'unchanged' }
      ]
    });

    await app.close();
  });

  it('returns 400 when reload fails before any section is applied', async () => {
    const db = createStubDatabase();
    const adminUser = {
      ...sampleUserRecord,
      id: 'admin-1',
      role: 'admin' as const,
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
    const reloadConfig = vi.fn().mockResolvedValue({
      sections: [],
      fatalError: 'Config file not found: /missing/server.yaml'
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: adminUser,
      reloadConfig
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/config/reload',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      sections: [],
      fatalError: 'Config file not found: /missing/server.yaml'
    });

    await app.close();
  });
});
