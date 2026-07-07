import { randomUUID } from 'node:crypto';
import type { UserRecord } from '#/db/types.js';

/**
 * Display name assigned to the migration bootstrap user for orphan API tokens.
 */
export const BOOTSTRAP_USER_NAME = 'bootstrap';

/**
 * Builds the bootstrap user record used when assigning legacy tokens during migration.
 *
 * @param now - Timestamp used for created and updated fields.
 * @returns Bootstrap user with full collection and environment access.
 */
export function createBootstrapUserRecord(now: Date): UserRecord {
  return {
    id: randomUUID(),
    name: BOOTSTRAP_USER_NAME,
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    snippetAccess: ['*'],
    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null,
    createdAt: now,
    updatedAt: now,
    createdByUserId: null,
    updatedByUserId: null
  };
}
