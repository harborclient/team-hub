import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleUserRecord
} from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleSnippet = {
  id: 'snippet-1',
  name: 'Auth helper',
  code: 'console.log("ok");',
  scope: 'pre-request' as const,
  sortOrder: 0,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false
};

describe('snippet routes', () => {
  it('lists snippets with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.listSnippets.mockResolvedValue([sampleSnippet]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/snippets',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      snippets: [
        {
          ...sampleSnippet,
          createdAt: sampleSnippet.createdAt.toISOString(),
          updatedAt: sampleSnippet.updatedAt.toISOString()
        }
      ]
    });

    await app.close();
  });

  it('creates a snippet with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.createSnippet.mockResolvedValue(sampleSnippet);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/snippets',
      headers: authHeader(),
      payload: { name: 'Auth helper', code: 'console.log("ok");', scope: 'pre-request' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createSnippet).toHaveBeenCalledWith(
      'Auth helper',
      'console.log("ok");',
      'pre-request',
      'user-1'
    );
    expect(response.json().id).toBe('snippet-1');

    await app.close();
  });

  it('returns all snippets for admin users on GET /snippets', async () => {
    const db = createStubDatabase();
    db.listSnippets.mockResolvedValue([sampleSnippet]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: [],
        snippetAccess: []
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/snippets',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      snippets: [
        {
          ...sampleSnippet,
          createdAt: sampleSnippet.createdAt.toISOString(),
          updatedAt: sampleSnippet.updatedAt.toISOString()
        }
      ]
    });

    await app.close();
  });

  it('updates a snippet without requiring sort order in the request body', async () => {
    const db = createStubDatabase();
    db.updateSnippet.mockResolvedValue({
      ...sampleSnippet,
      name: 'Renamed helper',
      code: 'console.log("updated");'
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1'],
        snippetAccess: ['snippet-1']
      }
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/snippets/snippet-1',
      headers: authHeader(),
      payload: {
        name: 'Renamed helper',
        code: 'console.log("updated");',
        scope: 'pre-request'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.updateSnippet).toHaveBeenCalledWith(
      'snippet-1',
      'Renamed helper',
      'console.log("updated");',
      'pre-request',
      'user-1'
    );
    expect(response.json().name).toBe('Renamed helper');

    await app.close();
  });

  it('returns 403 for admin users on mutating snippet routes', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: [],
        snippetAccess: []
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/snippets',
      headers: authHeader(),
      payload: { name: 'Auth helper' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });

    await app.close();
  });

  it('returns 403 when deleting a deletion-locked snippet as a user', async () => {
    const db = createStubDatabase();
    db.findSnippetById.mockResolvedValue({ ...sampleSnippet, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1'],
        snippetAccess: ['snippet-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/snippets/snippet-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Deletion is locked for this snippet.' });
    expect(db.deleteSnippet).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes an unlocked snippet for an authorized user', async () => {
    const db = createStubDatabase();
    db.findSnippetById.mockResolvedValue(sampleSnippet);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1'],
        snippetAccess: ['snippet-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/snippets/snippet-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteSnippet).toHaveBeenCalledWith('snippet-1', 'user-1');

    await app.close();
  });
});
