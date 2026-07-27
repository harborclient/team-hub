import { describe, expect, it } from 'vitest';
import {
  mapCollectionSqlRow,
  mapEnvironmentSqlRow,
  mapFolderSqlRow,
  mapRequestSqlRow
} from '#/db/entityRows.js';
import { DEFAULT_AUTH_JSON } from '#/db/types.js';

describe('mapCollectionSqlRow', () => {
  it('parses JSON columns into typed fields', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const record = mapCollectionSqlRow({
      id: 'collection-1',
      name: 'API Tests',
      variables: JSON.stringify([
        { key: 'baseUrl', value: 'https://example.com', defaultValue: '', share: true }
      ]),
      headers: JSON.stringify([{ key: 'Accept', value: 'application/json', enabled: true }]),
      auth: DEFAULT_AUTH_JSON,
      pre_request_script: 'console.log("pre")',
      post_request_script: '',
      created_at: createdAt,
      updated_at: updatedAt,
      created_by_user_id: 'user-1',
      updated_by_user_id: 'user-1',
      deletion_locked: false,
      marker: null
    });

    expect(record).toEqual({
      id: 'collection-1',
      name: 'API Tests',
      variables: [{ key: 'baseUrl', value: 'https://example.com', defaultValue: '', share: true }],
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      auth: {
        type: 'none',
        basic: { username: '', password: '' },
        bearer: { token: '' }
      },
      preRequestScript: 'console.log("pre")',
      postRequestScript: '',
      createdAt,
      updatedAt,
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      deletionLocked: false,
      marker: null
    });
  });

  it('reads stored sidebar markers from SQL rows', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const record = mapCollectionSqlRow({
      id: 'collection-1',
      name: 'API Tests',
      variables: '[]',
      headers: '[]',
      auth: DEFAULT_AUTH_JSON,
      pre_request_script: '',
      post_request_script: '',
      created_at: createdAt,
      updated_at: createdAt,
      created_by_user_id: 'user-1',
      updated_by_user_id: 'user-1',
      deletion_locked: false,
      marker: ' #32D2E2 '
    });

    expect(record.marker).toBe('#32D2E2');
  });
});

describe('mapEnvironmentSqlRow', () => {
  it('maps environment rows with variables', () => {
    const createdAt = new Date('2026-01-02T00:00:00.000Z');
    const updatedAt = new Date('2026-01-03T00:00:00.000Z');
    const record = mapEnvironmentSqlRow({
      id: 'env-1',
      name: 'Production',
      variables: JSON.stringify([
        { key: 'host', value: 'prod.example.com', defaultValue: '', share: false }
      ]),
      created_at: createdAt,
      updated_at: updatedAt,
      created_by_user_id: 'user-1',
      updated_by_user_id: 'user-2',
      deletion_locked: true,
      marker: null
    });

    expect(record).toEqual({
      id: 'env-1',
      name: 'Production',
      variables: [{ key: 'host', value: 'prod.example.com', defaultValue: '', share: false }],
      createdAt,
      updatedAt,
      createdByUserId: 'user-1',
      updatedByUserId: 'user-2',
      deletionLocked: true,
      marker: null
    });
  });
});

describe('mapFolderSqlRow', () => {
  it('maps folder rows with collection id', () => {
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    const updatedAt = new Date('2026-01-04T00:00:00.000Z');
    const record = mapFolderSqlRow({
      id: 'folder-1',
      collection_id: 'collection-1',
      parent_folder_id: 'folder-parent',
      name: 'Auth',
      sort_order: 2,
      created_at: createdAt,
      updated_at: updatedAt,
      created_by_user_id: null,
      updated_by_user_id: 'user-1',
      marker: null
    });

    expect(record).toEqual({
      id: 'folder-1',
      collectionId: 'collection-1',
      parentFolderId: 'folder-parent',
      name: 'Auth',
      sortOrder: 2,
      createdAt,
      updatedAt,
      createdByUserId: null,
      updatedByUserId: 'user-1',
      marker: null
    });
  });
});

describe('mapRequestSqlRow', () => {
  it('maps request rows including null folder_id', () => {
    const createdAt = new Date('2026-01-04T00:00:00.000Z');
    const updatedAt = new Date('2026-01-05T00:00:00.000Z');
    const record = mapRequestSqlRow({
      id: 'request-1',
      collection_id: 'collection-1',
      folder_id: null,
      name: 'Get health',
      method: 'GET',
      url: '/health',
      headers: '[]',
      params: '[]',
      auth: DEFAULT_AUTH_JSON,
      body: '',
      body_type: 'none',
      pre_request_script: '',
      post_request_script: '',
      comment: 'smoke test',
      sort_order: 0,
      created_at: createdAt,
      updated_at: updatedAt,
      created_by_user_id: 'user-1',
      updated_by_user_id: 'user-1',
      marker: null
    });

    expect(record.folderId).toBeNull();
    expect(record.comment).toBe('smoke test');
    expect(record.updatedAt).toEqual(updatedAt);
    expect(record.createdByUserId).toBe('user-1');
  });
});
