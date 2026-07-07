import { vi, type Mocked } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';

/**
 * Stub {@link IDatabase} with unresolved vi.fn mocks for every method.
 *
 * Used by HTTP and CLI tests that only exercise a subset of database behavior.
 *
 * @returns Database stub whose methods can be configured per test.
 */
export function createStubDatabase(): Mocked<IDatabase> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    migrate: vi.fn(),
    getSystemUserId: vi.fn().mockReturnValue('system-user-id'),
    listAuditLog: vi.fn().mockResolvedValue([]),
    createUser: vi.fn(),
    findUserById: vi.fn(),
    findUserByName: vi.fn(),
    listUsers: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    migrateOrphanTokensToBootstrapUser: vi.fn(),
    createApiToken: vi.fn(),
    findActiveApiTokenByHash: vi.fn(),
    listApiTokens: vi.fn(),
    listApiTokensByUserId: vi.fn(),
    findApiTokenById: vi.fn(),
    deleteApiToken: vi.fn(),
    revokeApiToken: vi.fn(),
    touchApiTokenLastUsed: vi.fn(),
    listCollections: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    findCollectionById: vi.fn(),
    setCollectionDeletionLocked: vi.fn(),
    listEnvironments: vi.fn(),
    createEnvironment: vi.fn(),
    updateEnvironment: vi.fn(),
    deleteEnvironment: vi.fn(),
    findEnvironmentById: vi.fn(),
    setEnvironmentDeletionLocked: vi.fn(),
    listSnippets: vi.fn(),
    createSnippet: vi.fn(),
    updateSnippet: vi.fn(),
    deleteSnippet: vi.fn(),
    findSnippetById: vi.fn(),
    setSnippetDeletionLocked: vi.fn(),
    listRequests: vi.fn(),
    findRequestById: vi.fn(),
    saveRequest: vi.fn(),
    deleteRequest: vi.fn(),
    listFolders: vi.fn(),
    findFolderById: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reorderFolders: vi.fn(),
    reorderRequests: vi.fn(),
    moveRequest: vi.fn(),
    getLlmUsage: vi.fn(),
    addLlmUsage: vi.fn(),
    createLlmUsageLog: vi.fn(),
    listLlmUsageLogs: vi.fn().mockResolvedValue([])
  };
}
