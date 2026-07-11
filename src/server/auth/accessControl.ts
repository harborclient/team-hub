import type {
  CollectionRecord,
  DocumentRecord,
  EnvironmentRecord,
  RunResultRecord,
  SavedRequestRecord,
  SnippetRecord,
  UserRecord
} from '#/db/types.js';

/**
 * Returns true when the authenticated user has an admin role.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `admin`-role accounts.
 */
export function isAdmin(user: UserRecord): boolean {
  return user.role === 'admin';
}

/**
 * Returns true when the user may call management API routes for user and token administration.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `admin`-role accounts.
 */
export function canUseManagementApi(user: UserRecord): boolean {
  return isAdmin(user);
}

/**
 * Returns true when the user may call entity data API routes for collections,
 * environments, snippets, folders, and requests.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`-role accounts; false for admins.
 */
export function canUseDataApi(user: UserRecord): boolean {
  return user.role === 'user';
}

/**
 * Returns true when the user may list collections via `GET /collections`.
 *
 * Admins receive the full catalog; mutations and nested reads remain blocked.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`- and `admin`-role accounts.
 */
export function canListCollections(user: UserRecord): boolean {
  return canUseDataApi(user) || canUseManagementApi(user);
}

/**
 * Returns true when the user may list environments via `GET /environments`.
 *
 * Admins receive the full catalog; mutations remain blocked.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`- and `admin`-role accounts.
 */
export function canListEnvironments(user: UserRecord): boolean {
  return canUseDataApi(user) || canUseManagementApi(user);
}

/**
 * Returns true when the user may list snippets via `GET /snippets`.
 *
 * Admins receive the full catalog; mutations remain blocked.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`- and `admin`-role accounts.
 */
export function canListSnippets(user: UserRecord): boolean {
  return canUseDataApi(user) || canUseManagementApi(user);
}

/**
 * Returns true when the user may list their own run results via `GET /run-results`.
 *
 * Admins receive an empty list (they created none) rather than a 403, matching the
 * collections/environments/snippets listing endpoints.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`- and `admin`-role accounts.
 */
export function canListRunResults(user: UserRecord): boolean {
  return canUseDataApi(user) || canUseManagementApi(user);
}

/**
 * Returns true when an access list grants all resources via the wildcard entry.
 *
 * @param access - Collection or environment access ids.
 * @returns True when the list contains `*`.
 */
export function hasWildcardAccess(access: string[]): boolean {
  return access.includes('*');
}

/**
 * Returns true when the user may read or mutate a specific collection.
 *
 * @param user - Authenticated user attached to the request.
 * @param collectionId - Collection identifier being accessed.
 * @returns True when the user role and access list permit the collection.
 */
export function canAccessCollection(user: UserRecord, collectionId: string): boolean {
  if (user.role === 'admin') {
    return false;
  }

  if (hasWildcardAccess(user.collectionAccess)) {
    return true;
  }

  return user.collectionAccess.includes(collectionId);
}

/**
 * Returns true when the user may read or mutate a specific environment.
 *
 * @param user - Authenticated user attached to the request.
 * @param environmentId - Environment identifier being accessed.
 * @returns True when the user role and access list permit the environment.
 */
export function canAccessEnvironment(user: UserRecord, environmentId: string): boolean {
  if (user.role === 'admin') {
    return false;
  }

  if (hasWildcardAccess(user.environmentAccess)) {
    return true;
  }

  return user.environmentAccess.includes(environmentId);
}

/**
 * Returns true when the user may read or mutate a specific snippet.
 *
 * @param user - Authenticated user attached to the request.
 * @param snippetId - Snippet identifier being accessed.
 * @returns True when the user role and access list permit the snippet.
 */
export function canAccessSnippet(user: UserRecord, snippetId: string): boolean {
  if (user.role === 'admin') {
    return false;
  }

  if (hasWildcardAccess(user.snippetAccess)) {
    return true;
  }

  return user.snippetAccess.includes(snippetId);
}

/**
 * Returns true when the user may delete a specific collection via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param collection - Collection record being deleted.
 * @returns True when the user created the collection, has access, and deletion is not locked.
 */
export function canDeleteCollection(user: UserRecord, collection: CollectionRecord): boolean {
  return (
    canUseDataApi(user) &&
    canAccessCollection(user, collection.id) &&
    collection.createdByUserId === user.id &&
    !collection.deletionLocked
  );
}

/**
 * Returns true when the user may delete a specific environment via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param environment - Environment record being deleted.
 * @returns True when the user has access and the environment is not deletion-locked.
 */
export function canDeleteEnvironment(user: UserRecord, environment: EnvironmentRecord): boolean {
  return (
    canUseDataApi(user) && canAccessEnvironment(user, environment.id) && !environment.deletionLocked
  );
}

/**
 * Returns true when the user may delete a specific snippet via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param snippet - Snippet record being deleted.
 * @returns True when the user has access and the snippet is not deletion-locked.
 */
export function canDeleteSnippet(user: UserRecord, snippet: SnippetRecord): boolean {
  return canUseDataApi(user) && canAccessSnippet(user, snippet.id) && !snippet.deletionLocked;
}

/**
 * Returns true when the user may delete a specific saved request via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param request - Saved request record being deleted.
 * @returns True when the user created the request and has access to its collection.
 */
export function canDeleteRequest(user: UserRecord, request: SavedRequestRecord): boolean {
  return (
    canUseDataApi(user) &&
    canAccessCollection(user, request.collectionId) &&
    request.createdByUserId === user.id
  );
}

/**
 * Returns true when the user may delete a specific document via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param document - Document record being deleted.
 * @returns True when the user created the document and has access to its collection.
 */
export function canDeleteDocument(user: UserRecord, document: DocumentRecord): boolean {
  return (
    canUseDataApi(user) &&
    canAccessCollection(user, document.collectionId) &&
    document.createdByUserId === user.id
  );
}

/**
 * Returns true when the user may delete a specific run result via the data API.
 *
 * @param user - Authenticated user attached to the request.
 * @param runResult - Run result record being deleted.
 * @returns True when the user created the run result.
 */
export function canDeleteRunResult(user: UserRecord, runResult: RunResultRecord): boolean {
  return canUseDataApi(user) && runResult.createdByUserId === user.id;
}

/**
 * Returns true when the user may create new collections via the API.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when the user has wildcard collection access.
 */
export function canCreateCollection(user: UserRecord): boolean {
  return user.role === 'user' && hasWildcardAccess(user.collectionAccess);
}

/**
 * Returns true when the user may create new environments via the API.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when the user has wildcard environment access.
 */
export function canCreateEnvironment(user: UserRecord): boolean {
  return user.role === 'user' && hasWildcardAccess(user.environmentAccess);
}

/**
 * Returns true when the user may create new snippets via the API.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when the user has wildcard snippet access.
 */
export function canCreateSnippet(user: UserRecord): boolean {
  return user.role === 'user' && hasWildcardAccess(user.snippetAccess);
}

/**
 * Filters a collection list to entries the user is allowed to see.
 *
 * @param user - Authenticated user attached to the request.
 * @param collections - Unfiltered collections from the database.
 * @returns Collections visible to the user.
 */
export function filterAccessibleCollections(
  user: UserRecord,
  collections: CollectionRecord[]
): CollectionRecord[] {
  if (user.role === 'admin' || hasWildcardAccess(user.collectionAccess)) {
    return collections;
  }

  const allowed = new Set(user.collectionAccess);
  return collections.filter((collection) => allowed.has(collection.id));
}

/**
 * Filters an environment list to entries the user is allowed to see.
 *
 * @param user - Authenticated user attached to the request.
 * @param environments - Unfiltered environments from the database.
 * @returns Environments visible to the user.
 */
export function filterAccessibleEnvironments(
  user: UserRecord,
  environments: EnvironmentRecord[]
): EnvironmentRecord[] {
  if (user.role === 'admin' || hasWildcardAccess(user.environmentAccess)) {
    return environments;
  }

  const allowed = new Set(user.environmentAccess);
  return environments.filter((environment) => allowed.has(environment.id));
}

/**
 * Filters a snippet list to entries the user is allowed to see.
 *
 * @param user - Authenticated user attached to the request.
 * @param snippets - Unfiltered snippets from the database.
 * @returns Snippets visible to the user.
 */
export function filterAccessibleSnippets(
  user: UserRecord,
  snippets: SnippetRecord[]
): SnippetRecord[] {
  if (user.role === 'admin' || hasWildcardAccess(user.snippetAccess)) {
    return snippets;
  }

  const allowed = new Set(user.snippetAccess);
  return snippets.filter((snippet) => allowed.has(snippet.id));
}

/**
 * Returns true when the user may call hub-proxied LLM routes.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when LLM access is enabled for the account.
 */
export function canUseLlm(user: UserRecord): boolean {
  return user.role !== 'admin' && user.llmAccess;
}

/**
 * Returns true when the user may request a specific hub-offered model.
 *
 * @param user - Authenticated user attached to the request.
 * @param modelId - Provider-specific model id.
 * @returns True when the user's model access list permits the model.
 */
export function isLlmModelAllowed(user: UserRecord, modelId: string): boolean {
  if (!user.llmAccess) {
    return false;
  }

  if (hasWildcardAccess(user.llmModels)) {
    return true;
  }

  return user.llmModels.includes(modelId);
}

/**
 * Returns true when usage has reached or exceeded the configured monthly limit.
 *
 * @param totalTokens - Tokens consumed in the current period.
 * @param limit - Configured monthly limit, or null for unlimited.
 */
export function isOverMonthlyLimit(totalTokens: number, limit: number | null): boolean {
  if (limit == null) {
    return false;
  }

  return totalTokens >= limit;
}
