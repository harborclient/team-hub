import { describe, expect, it } from 'vitest';
import {
  buildAccessCatalogIds,
  buildAccessListWarnings,
  buildAdminUserUpdateInput,
  findUnknownAccessIds,
  normalizeAccessForRole,
  normalizeLlmForRole,
  validateAccessList,
  validateSubmittedAccessLists
} from '#/server/admin/userValidation.js';

describe('userValidation', () => {
  const catalogs = buildAccessCatalogIds(
    [{ id: 'collection-1' }],
    [{ id: 'env-1' }],
    [{ id: 'snippet-1' }],
    ['gpt-4o']
  );

  const existing = {
    name: 'Alice',
    role: 'user' as const,
    collectionAccess: ['collection-1'],
    environmentAccess: ['env-1'],
    snippetAccess: ['snippet-1'],
    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null
  };

  it('rejects mixed wildcard access lists', () => {
    expect(() => validateAccessList(['*', 'collection-1'])).toThrow(
      'Wildcard access "*" must be the only entry.'
    );
  });

  it('clears access lists for admin roles', () => {
    expect(normalizeAccessForRole('admin', [], [], [])).toEqual({
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    });
  });

  it('rejects access flags on admin roles', () => {
    expect(() => normalizeAccessForRole('admin', ['*'], [], [])).toThrow(
      'Admin users cannot have collection, environment, or snippet access.'
    );
  });

  it('rejects LLM access on admin roles', () => {
    expect(() => normalizeLlmForRole('admin', true, [])).toThrow(
      'Admin users cannot have LLM access.'
    );
    expect(() => normalizeLlmForRole('admin', false, ['gpt-4o'])).toThrow(
      'Admin users cannot have LLM access.'
    );
  });

  it('clears LLM access when changing role to admin', () => {
    const input = buildAdminUserUpdateInput(
      { ...existing, llmAccess: true, llmModels: ['gpt-4o'] },
      { role: 'admin' }
    );
    expect(input).toEqual({
      name: undefined,
      role: 'admin',
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: [],
      llmAccess: false,
      llmModels: [],
      llmMonthlyTokenLimit: undefined
    });
  });

  it('clears access when changing role to admin', () => {
    const input = buildAdminUserUpdateInput(existing, { role: 'admin' });
    expect(input.collectionAccess).toEqual([]);
    expect(input.environmentAccess).toEqual([]);
    expect(input.snippetAccess).toEqual([]);
    expect(input.llmAccess).toBe(false);
    expect(input.llmModels).toEqual([]);
  });

  it('applies partial field updates', () => {
    const input = buildAdminUserUpdateInput(existing, { name: 'Bob', llmAccess: true });
    expect(input).toEqual({
      name: 'Bob',
      role: undefined,
      collectionAccess: ['collection-1'],
      environmentAccess: ['env-1'],
      snippetAccess: ['snippet-1'],
      llmAccess: true,
      llmModels: [],
      llmMonthlyTokenLimit: undefined
    });
  });

  it('ignores wildcard entries when finding unknown access ids', () => {
    expect(findUnknownAccessIds(['*', 'collection-1'], new Set(['collection-1']))).toEqual([]);
    expect(findUnknownAccessIds(['*'], new Set())).toEqual([]);
  });

  it('rejects unknown collection and environment ids on submit', () => {
    expect(() =>
      validateSubmittedAccessLists(
        {
          role: 'user',
          collectionAccess: ['missing-col'],
          environmentAccess: ['env-1']
        },
        catalogs
      )
    ).toThrow('Unknown collection id: missing-col.');

    expect(() =>
      validateSubmittedAccessLists(
        {
          role: 'user',
          environmentAccess: ['missing-env']
        },
        catalogs
      )
    ).toThrow('Unknown environment id: missing-env.');
  });

  it('rejects unknown snippet ids on submit', () => {
    expect(() =>
      validateSubmittedAccessLists(
        {
          role: 'user',
          snippetAccess: ['missing-snippet']
        },
        catalogs
      )
    ).toThrow('Unknown snippet id: missing-snippet.');
  });

  it('rejects unknown LLM model ids when a catalog is available', () => {
    expect(() =>
      validateSubmittedAccessLists(
        {
          role: 'user',
          llmModels: ['missing-model']
        },
        catalogs
      )
    ).toThrow('Unknown LLM model id: missing-model.');
  });

  it('skips collection and environment validation for admin roles', () => {
    expect(() =>
      validateSubmittedAccessLists(
        {
          role: 'admin',
          collectionAccess: ['missing-col'],
          environmentAccess: ['missing-env'],
          snippetAccess: ['missing-snippet']
        },
        catalogs
      )
    ).not.toThrow();
  });

  it('builds warnings for stale stored access references', () => {
    expect(
      buildAccessListWarnings(
        {
          collectionAccess: ['collection-1', 'deleted-col'],
          environmentAccess: ['*'],
          snippetAccess: ['deleted-snippet'],
          llmModels: ['gpt-4o', 'retired-model']
        },
        catalogs
      )
    ).toEqual([
      'Unknown collection id "deleted-col".',
      'Unknown snippet id "deleted-snippet".',
      'Unknown LLM model id "retired-model".'
    ]);
  });
});
