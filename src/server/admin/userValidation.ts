import type { CreateUserInput, UpdateUserInput, UserRole } from '#/db/types.js';

/**
 * Error thrown when admin user update input fails validation.
 */
export class ValidationError extends Error {
  /**
   * Creates a validation error with a client-facing message.
   *
   * @param message - Description of the invalid input.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Returns true when an access list mixes the wildcard with specific ids.
 *
 * @param access - Collection, environment, snippet, or LLM model access ids.
 * @returns True when the list is invalid.
 */
export function hasInvalidWildcardAccess(access: string[]): boolean {
  return access.includes('*') && access.length > 1;
}

/**
 * Validates a single access list for wildcard usage.
 *
 * @param access - Collection, environment, snippet, or LLM model access ids.
 * @throws {ValidationError} When wildcard access is combined with specific ids.
 */
export function validateAccessList(access: string[]): void {
  if (hasInvalidWildcardAccess(access)) {
    throw new ValidationError('Wildcard access "*" must be the only entry.');
  }
}

/**
 * Normalizes LLM access for admin accounts and validates model access lists.
 *
 * @param role - Target user role.
 * @param llmAccess - Parsed LLM access flag.
 * @param llmModels - Parsed LLM model access ids.
 * @returns LLM fields suitable for persistence.
 * @throws {ValidationError} When admins receive LLM access or lists are invalid.
 */
export function normalizeLlmForRole(
  role: UserRole,
  llmAccess: boolean,
  llmModels: string[]
): Pick<UpdateUserInput, 'llmAccess' | 'llmModels'> {
  if (role === 'admin') {
    if (llmAccess || llmModels.length > 0) {
      throw new ValidationError('Admin users cannot have LLM access.');
    }

    return {
      llmAccess: false,
      llmModels: []
    };
  }

  validateAccessList(llmModels);

  return {
    llmAccess,
    llmModels
  };
}

/**
 * Normalizes access lists for admin accounts and validates wildcard usage.
 *
 * @param role - Target user role.
 * @param collectionAccess - Parsed collection access ids.
 * @param environmentAccess - Parsed environment access ids.
 * @param snippetAccess - Parsed snippet access ids.
 * @returns Access lists suitable for persistence.
 * @throws {ValidationError} When admins receive access flags or lists are invalid.
 */
export function normalizeAccessForRole(
  role: UserRole,
  collectionAccess: string[],
  environmentAccess: string[],
  snippetAccess: string[]
): Pick<UpdateUserInput, 'collectionAccess' | 'environmentAccess' | 'snippetAccess'> {
  if (role === 'admin') {
    if (collectionAccess.length > 0 || environmentAccess.length > 0 || snippetAccess.length > 0) {
      throw new ValidationError(
        'Admin users cannot have collection, environment, or snippet access.'
      );
    }

    return {
      collectionAccess: [],
      environmentAccess: [],
      snippetAccess: []
    };
  }

  validateAccessList(collectionAccess);
  validateAccessList(environmentAccess);
  validateAccessList(snippetAccess);

  return {
    collectionAccess,
    environmentAccess,
    snippetAccess
  };
}

/**
 * Known resource ids used to validate or warn on access lists.
 */
export interface AccessCatalogIds {
  /**
   * Collection ids currently stored on the hub.
   */
  knownCollectionIds: ReadonlySet<string>;

  /**
   * Environment ids currently stored on the hub.
   */
  knownEnvironmentIds: ReadonlySet<string>;

  /**
   * Snippet ids currently stored on the hub.
   */
  knownSnippetIds: ReadonlySet<string>;

  /**
   * Hub-offered LLM model ids, or null when LLM support is not configured.
   */
  knownLlmModelIds: ReadonlySet<string> | null;
}

/**
 * Access list fields explicitly submitted in a create or update request.
 */
export interface SubmittedAccessLists {
  /**
   * Resulting user role after the update is applied.
   */
  role: UserRole;

  /**
   * Collection access ids from the request body or CLI flags, when provided.
   */
  collectionAccess?: string[];

  /**
   * Environment access ids from the request body or CLI flags, when provided.
   */
  environmentAccess?: string[];

  /**
   * Snippet access ids from the request body or CLI flags, when provided.
   */
  snippetAccess?: string[];

  /**
   * LLM model access ids from the request body or CLI flags, when provided.
   */
  llmModels?: string[];
}

/**
 * Stored access lists on a user record checked for stale references.
 */
export interface StoredAccessLists {
  /**
   * Persisted collection access ids.
   */
  collectionAccess: string[];

  /**
   * Persisted environment access ids.
   */
  environmentAccess: string[];

  /**
   * Persisted snippet access ids.
   */
  snippetAccess: string[];

  /**
   * Persisted LLM model access ids.
   */
  llmModels: string[];
}

/**
 * Returns ids from an access list that are not the wildcard and not in knownIds.
 *
 * @param access - Collection, environment, snippet, or LLM model access ids.
 * @param knownIds - Valid resource ids from the hub catalog.
 * @returns Unknown ids excluding the wildcard entry.
 */
export function findUnknownAccessIds(access: string[], knownIds: ReadonlySet<string>): string[] {
  return access.filter((id) => id !== '*' && !knownIds.has(id));
}

/**
 * Validates that every specific id in an access list exists in the catalog.
 *
 * @param access - Collection, environment, snippet, or LLM model access ids.
 * @param knownIds - Valid resource ids from the hub catalog.
 * @param resourceLabel - Singular resource label for error messages.
 * @throws {ValidationError} When one or more ids are unknown.
 */
export function validateKnownAccessIds(
  access: string[],
  knownIds: ReadonlySet<string>,
  resourceLabel: 'collection' | 'environment' | 'snippet' | 'LLM model'
): void {
  const unknownIds = findUnknownAccessIds(access, knownIds);
  if (unknownIds.length === 0) {
    return;
  }

  const label = unknownIds.length === 1 ? `${resourceLabel} id` : `${resourceLabel} id(s)`;
  throw new ValidationError(`Unknown ${label}: ${unknownIds.join(', ')}.`);
}

/**
 * Validates explicitly submitted access lists against hub resource catalogs.
 *
 * @param submitted - Access fields provided in the request or CLI flags.
 * @param catalogs - Known collection, environment, snippet, and LLM model ids.
 * @throws {ValidationError} When a submitted list references unknown ids.
 */
export function validateSubmittedAccessLists(
  submitted: SubmittedAccessLists,
  catalogs: AccessCatalogIds
): void {
  if (submitted.role !== 'admin') {
    if (submitted.collectionAccess !== undefined) {
      validateKnownAccessIds(submitted.collectionAccess, catalogs.knownCollectionIds, 'collection');
    }

    if (submitted.environmentAccess !== undefined) {
      validateKnownAccessIds(
        submitted.environmentAccess,
        catalogs.knownEnvironmentIds,
        'environment'
      );
    }

    if (submitted.snippetAccess !== undefined) {
      validateKnownAccessIds(submitted.snippetAccess, catalogs.knownSnippetIds, 'snippet');
    }
  }

  if (submitted.llmModels !== undefined && catalogs.knownLlmModelIds !== null) {
    validateKnownAccessIds(submitted.llmModels, catalogs.knownLlmModelIds, 'LLM model');
  }
}

/**
 * Builds warning messages for stored access lists that reference missing resources.
 *
 * @param stored - Persisted access lists on a user record.
 * @param catalogs - Known collection, environment, snippet, and LLM model ids.
 * @returns Human-readable warnings for stale access references.
 */
export function buildAccessListWarnings(
  stored: StoredAccessLists,
  catalogs: AccessCatalogIds
): string[] {
  const warnings: string[] = [];

  for (const id of findUnknownAccessIds(stored.collectionAccess, catalogs.knownCollectionIds)) {
    warnings.push(`Unknown collection id "${id}".`);
  }

  for (const id of findUnknownAccessIds(stored.environmentAccess, catalogs.knownEnvironmentIds)) {
    warnings.push(`Unknown environment id "${id}".`);
  }

  for (const id of findUnknownAccessIds(stored.snippetAccess, catalogs.knownSnippetIds)) {
    warnings.push(`Unknown snippet id "${id}".`);
  }

  if (catalogs.knownLlmModelIds !== null) {
    for (const id of findUnknownAccessIds(stored.llmModels, catalogs.knownLlmModelIds)) {
      warnings.push(`Unknown LLM model id "${id}".`);
    }
  }

  return warnings;
}

/**
 * Builds {@link AccessCatalogIds} from hub collection, environment, snippet, and model listings.
 *
 * @param collections - Collections returned by the database layer.
 * @param environments - Environments returned by the database layer.
 * @param snippets - Snippets returned by the database layer.
 * @param llmModelIds - Hub-offered LLM model ids, or null when LLM is not configured.
 * @returns Catalog id sets for validation and warnings.
 */
export function buildAccessCatalogIds(
  collections: ReadonlyArray<{ id: string }>,
  environments: ReadonlyArray<{ id: string }>,
  snippets: ReadonlyArray<{ id: string }>,
  llmModelIds: string[] | null
): AccessCatalogIds {
  return {
    knownCollectionIds: new Set(collections.map((collection) => collection.id)),
    knownEnvironmentIds: new Set(environments.map((environment) => environment.id)),
    knownSnippetIds: new Set(snippets.map((snippet) => snippet.id)),
    knownLlmModelIds: llmModelIds === null ? null : new Set(llmModelIds)
  };
}

/**
 * Builds the update payload applied to an existing user record.
 *
 * @param existing - Current user record from the database.
 * @param body - Partial fields from the management API request body.
 * @returns Normalized update input for {@link IDatabase.updateUser}.
 * @throws {ValidationError} When access lists are invalid for the resulting role.
 */
export function buildAdminUserUpdateInput(
  existing: {
    name: string;
    role: UserRole;
    collectionAccess: string[];
    environmentAccess: string[];
    snippetAccess: string[];
    llmAccess: boolean;
    llmModels: string[];
    llmMonthlyTokenLimit: number | null;
  },
  body: {
    name?: string;
    role?: UserRole;
    collectionAccess?: string[];
    environmentAccess?: string[];
    snippetAccess?: string[];
    llmAccess?: boolean;
    llmModels?: string[];
    llmMonthlyTokenLimit?: number | null;
  }
): UpdateUserInput {
  const role = body.role ?? existing.role;
  const collectionAccess =
    role === 'admin' ? [] : (body.collectionAccess ?? existing.collectionAccess);
  const environmentAccess =
    role === 'admin' ? [] : (body.environmentAccess ?? existing.environmentAccess);
  const snippetAccess = role === 'admin' ? [] : (body.snippetAccess ?? existing.snippetAccess);
  const access = normalizeAccessForRole(role, collectionAccess, environmentAccess, snippetAccess);
  const llmAccess = role === 'admin' ? false : (body.llmAccess ?? existing.llmAccess);
  const llmModels = role === 'admin' ? [] : (body.llmModels ?? existing.llmModels);
  const llm = normalizeLlmForRole(role, llmAccess, llmModels);

  return {
    name: body.name,
    role: body.role,
    collectionAccess: access.collectionAccess,
    environmentAccess: access.environmentAccess,
    snippetAccess: access.snippetAccess,
    llmAccess: llm.llmAccess,
    llmModels: llm.llmModels,
    llmMonthlyTokenLimit: body.llmMonthlyTokenLimit
  };
}

/**
 * Builds the create payload for a new user account.
 *
 * @param body - Fields from the management API create request body.
 * @returns Normalized create input for {@link IDatabase.createUser}.
 * @throws {ValidationError} When access lists are invalid for the role.
 */
export function buildAdminUserCreateInput(body: {
  name: string;
  role: UserRole;
  collectionAccess?: string[];
  environmentAccess?: string[];
  snippetAccess?: string[];
  llmAccess?: boolean;
  llmModels?: string[];
  llmMonthlyTokenLimit?: number | null;
}): CreateUserInput {
  const collectionAccess = body.collectionAccess ?? [];
  const environmentAccess = body.environmentAccess ?? [];
  const snippetAccess = body.snippetAccess ?? [];
  const access = normalizeAccessForRole(
    body.role,
    collectionAccess,
    environmentAccess,
    snippetAccess
  );
  const llmAccess = body.role === 'admin' ? false : (body.llmAccess ?? false);
  const llmModels = body.role === 'admin' ? [] : (body.llmModels ?? []);
  const llm = normalizeLlmForRole(body.role, llmAccess, llmModels);

  return {
    name: body.name,
    role: body.role,
    collectionAccess: access.collectionAccess ?? [],
    environmentAccess: access.environmentAccess ?? [],
    snippetAccess: access.snippetAccess ?? [],
    llmAccess: llm.llmAccess ?? false,
    llmModels: llm.llmModels ?? [],
    llmMonthlyTokenLimit: body.llmMonthlyTokenLimit ?? null
  };
}
