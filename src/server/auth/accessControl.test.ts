import { describe, expect, it } from 'vitest';
import type {
  CollectionRecord,
  EnvironmentRecord,
  SavedRequestRecord,
  UserRecord
} from '#/db/types.js';
import {
  canAccessCollection,
  canAccessEnvironment,
  canCreateCollection,
  canCreateEnvironment,
  canDeleteCollection,
  canDeleteEnvironment,
  canDeleteRequest,
  canListCollections,
  canListEnvironments,
  canUseDataApi,
  canUseManagementApi,
  isAdmin,
  canUseLlm,
  isLlmModelAllowed,
  isOverMonthlyLimit,
  filterAccessibleCollections,
  filterAccessibleEnvironments,
  hasWildcardAccess
} from '#/server/auth/accessControl.js';

const baseUser: UserRecord = {
  id: 'user-1',
  name: 'Alice',
  role: 'user',
  collectionAccess: ['collection-a'],
  environmentAccess: ['env-a'],
  snippetAccess: [],

  llmAccess: false,
  llmModels: [],
  llmMonthlyTokenLimit: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdByUserId: null,
  updatedByUserId: null
};

const adminUser: UserRecord = {
  ...baseUser,
  id: 'admin-1',
  name: 'Admin',
  role: 'admin',
  collectionAccess: [],
  environmentAccess: []
};

const wildcardUser: UserRecord = {
  ...baseUser,
  collectionAccess: ['*'],
  environmentAccess: ['*']
};

const sampleCollections: CollectionRecord[] = [
  {
    id: 'collection-a',
    name: 'A',
    variables: [],
    headers: [],
    auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
    preRequestScript: '',
    postRequestScript: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: 'user-1',
    updatedByUserId: null,
    deletionLocked: false,
    marker: null
  },
  {
    id: 'collection-b',
    name: 'B',
    variables: [],
    headers: [],
    auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
    preRequestScript: '',
    postRequestScript: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null,
    deletionLocked: false,
    marker: null
  }
];

const sampleEnvironments: EnvironmentRecord[] = [
  {
    id: 'env-a',
    name: 'A',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null,
    deletionLocked: false,
    marker: null
  },
  {
    id: 'env-b',
    name: 'B',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null,
    deletionLocked: false,
    marker: null
  }
];

const sampleRequest: SavedRequestRecord = {
  id: 'request-a',
  collectionId: 'collection-a',
  name: 'Get health',
  method: 'GET',
  url: '/health',
  headers: [],
  params: [],
  auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
  body: '',
  bodyType: 'none',
  preRequestScript: '',
  postRequestScript: '',
  comment: '',
  folderId: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdByUserId: 'user-1',
  updatedByUserId: null,
  marker: null
};

describe('accessControl', () => {
  it('detects wildcard access lists', () => {
    expect(hasWildcardAccess(['*'])).toBe(true);
    expect(hasWildcardAccess(['collection-a'])).toBe(false);
  });

  it('identifies admin accounts', () => {
    expect(isAdmin(adminUser)).toBe(true);
    expect(isAdmin(baseUser)).toBe(false);
    expect(canUseManagementApi(adminUser)).toBe(true);
    expect(canUseManagementApi(baseUser)).toBe(false);
  });

  it('denies admins and scoped users correctly for collections', () => {
    expect(canAccessCollection(adminUser, 'collection-a')).toBe(false);
    expect(canAccessCollection(baseUser, 'collection-a')).toBe(true);
    expect(canAccessCollection(baseUser, 'collection-b')).toBe(false);
    expect(canAccessCollection(wildcardUser, 'collection-b')).toBe(true);
  });

  it('denies admins and scoped users correctly for environments', () => {
    expect(canAccessEnvironment(adminUser, 'env-a')).toBe(false);
    expect(canAccessEnvironment(baseUser, 'env-a')).toBe(true);
    expect(canAccessEnvironment(baseUser, 'env-b')).toBe(false);
    expect(canAccessEnvironment(wildcardUser, 'env-b')).toBe(true);
  });

  it('allows list collections and environments for user and admin roles', () => {
    expect(canListCollections(adminUser)).toBe(true);
    expect(canListCollections(baseUser)).toBe(true);
    expect(canListCollections(wildcardUser)).toBe(true);
    expect(canListEnvironments(adminUser)).toBe(true);
    expect(canListEnvironments(baseUser)).toBe(true);
    expect(canListEnvironments(wildcardUser)).toBe(true);
  });

  it('allows delete only when access is granted and deletion is not locked', () => {
    expect(canDeleteCollection(baseUser, sampleCollections[0])).toBe(true);
    expect(canDeleteCollection(baseUser, { ...sampleCollections[0], deletionLocked: true })).toBe(
      false
    );
    expect(canDeleteCollection(adminUser, sampleCollections[0])).toBe(false);
    expect(
      canDeleteCollection(baseUser, { ...sampleCollections[0], createdByUserId: 'other-user' })
    ).toBe(false);
    expect(canDeleteCollection(baseUser, { ...sampleCollections[0], createdByUserId: null })).toBe(
      false
    );
    expect(canDeleteEnvironment(baseUser, sampleEnvironments[0])).toBe(true);
    expect(canDeleteEnvironment(baseUser, { ...sampleEnvironments[0], deletionLocked: true })).toBe(
      false
    );
  });

  it('allows request delete only for the creating user with collection access', () => {
    expect(canDeleteRequest(baseUser, sampleRequest)).toBe(true);
    expect(canDeleteRequest(baseUser, { ...sampleRequest, createdByUserId: 'other-user' })).toBe(
      false
    );
    expect(canDeleteRequest(baseUser, { ...sampleRequest, createdByUserId: null })).toBe(false);
    expect(canDeleteRequest(adminUser, sampleRequest)).toBe(false);
  });

  it('allows create only for wildcard users', () => {
    expect(canUseDataApi(adminUser)).toBe(false);
    expect(canUseDataApi(baseUser)).toBe(true);
    expect(canCreateCollection(adminUser)).toBe(false);
    expect(canCreateCollection(baseUser)).toBe(false);
    expect(canCreateCollection(wildcardUser)).toBe(true);
    expect(canCreateEnvironment(wildcardUser)).toBe(true);
  });

  it('filters list results by access', () => {
    expect(filterAccessibleCollections(adminUser, sampleCollections)).toEqual(sampleCollections);
    expect(filterAccessibleCollections(baseUser, sampleCollections)).toEqual([
      sampleCollections[0]
    ]);
    expect(filterAccessibleCollections(wildcardUser, sampleCollections)).toEqual(sampleCollections);
    expect(filterAccessibleEnvironments(adminUser, sampleEnvironments)).toEqual(sampleEnvironments);
    expect(filterAccessibleEnvironments(baseUser, sampleEnvironments)).toEqual([
      sampleEnvironments[0]
    ]);
  });

  it('evaluates LLM access and model permissions', () => {
    const llmUser: UserRecord = {
      ...baseUser,
      llmAccess: true,
      llmModels: ['gpt-4o']
    };

    expect(canUseLlm(baseUser)).toBe(false);
    expect(canUseLlm(llmUser)).toBe(true);
    expect(canUseLlm({ ...llmUser, role: 'admin' })).toBe(false);
    expect(isLlmModelAllowed(llmUser, 'gpt-4o')).toBe(true);
    expect(isLlmModelAllowed(llmUser, 'gpt-4o-mini')).toBe(false);
    expect(isLlmModelAllowed({ ...llmUser, llmModels: ['*'] }, 'gpt-4o-mini')).toBe(true);
  });

  it('detects monthly token limit exhaustion', () => {
    expect(isOverMonthlyLimit(999, 1000)).toBe(false);
    expect(isOverMonthlyLimit(1000, 1000)).toBe(true);
    expect(isOverMonthlyLimit(1000, null)).toBe(false);
  });
});
