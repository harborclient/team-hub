import { describe, expect, it } from 'vitest';
import {
  assertUserNameAvailable,
  assertUserNameNotReserved,
  DuplicateUserNameError,
  ReservedUserNameError
} from '#/db/userNameValidation.js';
import type { UserRecord } from '#/db/types.js';

describe('assertUserNameNotReserved', () => {
  it('rejects the reserved system user name', () => {
    expect(() => assertUserNameNotReserved('system')).toThrow(ReservedUserNameError);
    expect(() => assertUserNameNotReserved('system')).toThrow(
      'User name "system" is reserved for the internal system account.'
    );
  });

  it('allows normal display names', () => {
    expect(() => assertUserNameNotReserved('Alice')).not.toThrow();
  });
});

describe('assertUserNameAvailable', () => {
  const existing: UserRecord = {
    id: 'user-2',
    name: 'Bob',
    role: 'user',
    collectionAccess: [],
    environmentAccess: [],
    snippetAccess: [],

    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: 'system-user-id',
    updatedByUserId: 'system-user-id'
  };

  it('throws when another account already uses the name', () => {
    expect(() => assertUserNameAvailable('Bob', 'user-1', existing)).toThrow(
      DuplicateUserNameError
    );
  });

  it('allows keeping the same name for the same user', () => {
    expect(() => assertUserNameAvailable('Bob', 'user-2', existing)).not.toThrow();
  });
});
