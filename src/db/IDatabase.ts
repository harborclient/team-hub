import type {
  AuditLogRecord,
  AuthConfig,
  CollectionRecord,
  CreateRunResultInput,
  CreateUserInput,
  CreatedInvitedUserResult,
  EnvironmentRecord,
  FolderRecord,
  InvitationRecord,
  KeyValue,
  ListAuditLogOptions,
  RedeemedInvitationResult,
  SaveRequestInput,
  SaveDocumentInput,
  SavedRequestRecord,
  DocumentRecord,
  SnippetRecord,
  SnippetScope,
  UpdateUserInput,
  UserRecord,
  Variable,
  LlmUsageRecord,
  CreateLlmUsageLogInput,
  LlmUsageLogRecord,
  RunResultRecord
} from '#/db/types.js';
import type { ApiTokenRecord } from '#/db/types.js';

/**
 * Common contract for Team Hub database backends.
 */
export interface IDatabase {
  /**
   * Opens a connection pool or client to the configured database.
   */
  connect(): Promise<void>;

  /**
   * Closes open connections and releases resources.
   */
  disconnect(): Promise<void>;

  /**
   * Creates required tables or indexes when absent.
   *
   * SQL backends run DDL; Firestore treats schema as implicit and performs no work.
   */
  migrate(): Promise<void>;

  /**
   * Returns the stable identifier of the internal system user, when provisioned.
   */
  getSystemUserId(): string | null;

  /**
   * Provisions the internal system user when missing and caches its id.
   *
   * Idempotent and safe to call on every connect; assumes migrations have
   * already created the schema.
   */
  ensureSystemUser(): Promise<void>;

  /**
   * Lists audit log entries ordered newest-first with optional filters.
   *
   * @param options - Optional limit and filter criteria.
   */
  listAuditLog(options?: ListAuditLogOptions): Promise<AuditLogRecord[]>;

  /**
   * Creates a new user account.
   *
   * @param input - User fields to persist.
   * @param actingUserId - User performing the create action.
   * @returns The newly created user record.
   */
  createUser(input: CreateUserInput, actingUserId: string): Promise<UserRecord>;

  /**
   * Finds a user by stable identifier.
   *
   * @param id - User identifier to look up.
   * @returns Matching user record, or null when not found.
   */
  findUserById(id: string): Promise<UserRecord | null>;

  /**
   * Finds a user by unique display name.
   *
   * @param name - User name to look up.
   * @returns Matching user record, or null when not found.
   */
  findUserByName(name: string): Promise<UserRecord | null>;

  /**
   * Lists all user accounts ordered by name.
   */
  listUsers(): Promise<UserRecord[]>;

  /**
   * Updates an existing user account.
   *
   * @param id - User identifier to update.
   * @param input - Partial fields to apply.
   * @param actingUserId - User performing the update action.
   * @returns The updated user record.
   */
  updateUser(id: string, input: UpdateUserInput, actingUserId: string): Promise<UserRecord>;

  /**
   * Deletes a user account and permanently removes all of their API tokens.
   *
   * @param id - User identifier to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteUser(id: string, actingUserId: string): Promise<void>;

  /**
   * Assigns legacy API tokens without an owner to the bootstrap user.
   *
   * Idempotent: no-op when no orphan tokens exist.
   */
  migrateOrphanTokensToBootstrapUser(): Promise<void>;

  /**
   * Persists a newly generated API token record.
   *
   * @param record - Token metadata including the stored hash (not the raw secret).
   * @param actingUserId - User performing the create action.
   */
  createApiToken(record: ApiTokenRecord, actingUserId: string): Promise<void>;

  /**
   * Looks up a non-revoked token by its sha256 hash for request authentication.
   *
   * @param tokenHash - sha256 hex digest of the bearer token secret.
   * @returns Matching active token record, or null when not found or revoked.
   */
  findActiveApiTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null>;

  /**
   * Returns all API token records ordered newest-first for operator listing.
   */
  listApiTokens(): Promise<ApiTokenRecord[]>;

  /**
   * Returns API tokens owned by a specific user ordered newest-first.
   *
   * @param userId - Owning user identifier.
   */
  listApiTokensByUserId(userId: string): Promise<ApiTokenRecord[]>;

  /**
   * Finds an API token record by stable identifier.
   *
   * @param id - Token identifier to look up.
   * @returns Matching token record, or null when not found.
   */
  findApiTokenById(id: string): Promise<ApiTokenRecord | null>;

  /**
   * Permanently removes an API token record by id.
   *
   * @param id - Token identifier to delete.
   * @param actingUserId - User performing the delete action.
   * @returns True when a token row was removed; false when missing.
   */
  deleteApiToken(id: string, actingUserId: string): Promise<boolean>;

  /**
   * Soft-revokes a token by id.
   *
   * @param id - Token identifier to revoke.
   * @param actingUserId - User performing the revoke action.
   * @returns True when an active token was updated; false when already revoked or missing.
   */
  revokeApiToken(id: string, actingUserId: string): Promise<boolean>;

  /**
   * Updates the last-used timestamp for a token after successful authentication.
   *
   * @param id - Token identifier that authenticated the request.
   * @param when - Timestamp of the authenticated request.
   */
  touchApiTokenLastUsed(id: string, when: Date): Promise<void>;

  /**
   * Creates a user account and its initial onboarding invitation in one transaction.
   *
   * @param userId - Pre-generated stable identifier for the new user.
   * @param input - User fields to persist.
   * @param invitation - Invitation metadata including the stored code hash.
   * @param actingUserId - User performing the create action.
   * @returns The created user and invitation records.
   */
  createInvitedUser(
    userId: string,
    input: CreateUserInput,
    invitation: InvitationRecord,
    actingUserId: string
  ): Promise<CreatedInvitedUserResult>;

  /**
   * Persists a new onboarding invitation for an existing user account.
   *
   * @param invitation - Invitation metadata including the stored code hash.
   * @param actingUserId - User performing the create action.
   * @returns The persisted invitation record.
   */
  createInvitation(invitation: InvitationRecord, actingUserId: string): Promise<InvitationRecord>;

  /**
   * Finds an invitation by stable identifier.
   *
   * @param id - Invitation identifier to look up.
   */
  findInvitationById(id: string): Promise<InvitationRecord | null>;

  /**
   * Finds an invitation by the sha256 hash of its secret.
   *
   * @param codeHash - sha256 hex digest of the invitation secret.
   */
  findInvitationByCodeHash(codeHash: string): Promise<InvitationRecord | null>;

  /**
   * Lists all invitations ordered by creation time descending.
   */
  listInvitations(): Promise<InvitationRecord[]>;

  /**
   * Revokes a pending invitation by id.
   *
   * @param id - Invitation identifier to revoke.
   * @param actingUserId - User performing the revoke action.
   * @returns True when a pending invitation was revoked; false when missing or already consumed.
   */
  revokeInvitation(id: string, actingUserId: string): Promise<boolean>;

  /**
   * Atomically consumes a pending invitation and issues a permanent API token.
   *
   * @param codeHash - sha256 hex digest of the invitation secret.
   * @param tokenName - Label stored on the newly created API token.
   * @param actingUserId - Internal user attributed with the redemption action.
   * @returns The owning user, new token metadata, and one-time bearer secret.
   */
  redeemInvitation(
    codeHash: string,
    tokenName: string,
    actingUserId: string
  ): Promise<RedeemedInvitationResult>;

  /**
   * Lists all collections ordered by name.
   *
   * @returns All collections in the database.
   */
  listCollections(): Promise<CollectionRecord[]>;

  /**
   * Creates a new collection with the given name.
   *
   * @param name - Display name for the collection.
   * @param actingUserId - User performing the create action.
   * @returns The newly created collection.
   */
  createCollection(name: string, actingUserId: string): Promise<CollectionRecord>;

  /**
   * Updates a collection's name, variables, headers, and scripts.
   *
   * @param id - Collection ID to update.
   * @param name - New display name.
   * @param variables - Collection-scoped variables.
   * @param headers - Headers sent with every request in the collection.
   * @param preRequestScript - Script run before each request in the collection.
   * @param postRequestScript - Script run after each request in the collection.
   * @param auth - Default Authorization settings for requests in the collection.
   * @param actingUserId - User performing the update action.
   * @param marker - Optional sidebar marker; omit to leave the stored value unchanged.
   * @returns The updated collection.
   */
  updateCollection(
    id: string,
    name: string,
    variables: Variable[],
    headers: KeyValue[],
    preRequestScript: string,
    postRequestScript: string,
    auth: AuthConfig,
    actingUserId: string,
    marker?: string | null
  ): Promise<CollectionRecord>;

  /**
   * Deletes a collection and all of its requests and folders.
   *
   * @param id - Collection ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteCollection(id: string, actingUserId: string): Promise<void>;

  /**
   * Finds a collection by stable identifier.
   *
   * @param id - Collection ID to look up.
   * @returns Matching collection record, or null when not found.
   */
  findCollectionById(id: string): Promise<CollectionRecord | null>;

  /**
   * Updates whether non-admin users may delete a collection.
   *
   * @param id - Collection ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the collection.
   * @param actingUserId - Admin user performing the update.
   * @returns Updated collection record.
   */
  setCollectionDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<CollectionRecord>;

  /**
   * Lists all environments ordered by name.
   *
   * @returns All environments in the database.
   */
  listEnvironments(): Promise<EnvironmentRecord[]>;

  /**
   * Creates a new environment with the given name.
   *
   * @param name - Display name for the environment.
   * @param actingUserId - User performing the create action.
   * @returns The newly created environment.
   */
  createEnvironment(name: string, actingUserId: string): Promise<EnvironmentRecord>;

  /**
   * Updates an environment's name and variables.
   *
   * @param id - Environment ID to update.
   * @param name - New display name.
   * @param variables - Environment-scoped variables.
   * @param actingUserId - User performing the update action.
   * @param marker - Optional sidebar marker; omit to leave the stored value unchanged.
   * @returns The updated environment.
   */
  updateEnvironment(
    id: string,
    name: string,
    variables: Variable[],
    actingUserId: string,
    marker?: string | null
  ): Promise<EnvironmentRecord>;

  /**
   * Deletes an environment.
   *
   * @param id - Environment ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteEnvironment(id: string, actingUserId: string): Promise<void>;

  /**
   * Finds an environment by stable identifier.
   *
   * @param id - Environment ID to look up.
   * @returns Matching environment record, or null when not found.
   */
  findEnvironmentById(id: string): Promise<EnvironmentRecord | null>;

  /**
   * Updates whether non-admin users may delete an environment.
   *
   * @param id - Environment ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the environment.
   * @param actingUserId - Admin user performing the update.
   * @returns Updated environment record.
   */
  setEnvironmentDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<EnvironmentRecord>;

  /**
   * Lists all snippets ordered by sort order then name.
   *
   * @returns All snippets in the database.
   */
  listSnippets(): Promise<SnippetRecord[]>;

  /**
   * Creates a new snippet with the given fields.
   *
   * @param name - Display name for the snippet.
   * @param code - JavaScript source for the snippet.
   * @param scope - Execution scope for the snippet.
   * @param actingUserId - User performing the create action.
   * @returns The newly created snippet.
   */
  createSnippet(
    name: string,
    code: string,
    scope: SnippetScope,
    actingUserId: string
  ): Promise<SnippetRecord>;

  /**
   * Updates a snippet's name, code, and scope. Sort order is left unchanged;
   * HarborClient's snippet update flow does not manage sidebar position.
   *
   * @param id - Snippet ID to update.
   * @param name - New display name.
   * @param code - Updated JavaScript source.
   * @param scope - Updated execution scope.
   * @param actingUserId - User performing the update action.
   * @returns The updated snippet.
   */
  updateSnippet(
    id: string,
    name: string,
    code: string,
    scope: SnippetScope,
    actingUserId: string
  ): Promise<SnippetRecord>;

  /**
   * Deletes a snippet.
   *
   * @param id - Snippet ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteSnippet(id: string, actingUserId: string): Promise<void>;

  /**
   * Finds a snippet by stable identifier.
   *
   * @param id - Snippet ID to look up.
   * @returns Matching snippet record, or null when not found.
   */
  findSnippetById(id: string): Promise<SnippetRecord | null>;

  /**
   * Updates whether non-admin users may delete a snippet.
   *
   * @param id - Snippet ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the snippet.
   * @param actingUserId - Admin user performing the update.
   * @returns Updated snippet record.
   */
  setSnippetDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<SnippetRecord>;

  /**
   * Lists all saved requests in a collection.
   *
   * @param collectionId - Collection to query.
   * @returns Requests ordered by sort_order then name.
   */
  listRequests(collectionId: string): Promise<SavedRequestRecord[]>;

  /**
   * Finds a saved request by id.
   *
   * @param id - Request identifier to look up.
   * @returns Matching request record, or null when not found.
   */
  findRequestById(id: string): Promise<SavedRequestRecord | null>;

  /**
   * Inserts a new request or updates an existing one.
   *
   * @param input - Request fields to persist.
   * @param actingUserId - User performing the save action.
   * @returns The saved request with ID and timestamps.
   */
  saveRequest(input: SaveRequestInput, actingUserId: string): Promise<SavedRequestRecord>;

  /**
   * Deletes a saved request by ID.
   *
   * @param id - Request ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteRequest(id: string, actingUserId: string): Promise<void>;

  /**
   * Lists all folders in a collection.
   *
   * @param collectionId - Collection to query.
   * @returns Folders ordered by sort_order then name.
   */
  listFolders(collectionId: string): Promise<FolderRecord[]>;

  /**
   * Finds a folder by id.
   *
   * @param id - Folder identifier to look up.
   * @returns Matching folder record, or null when not found.
   */
  findFolderById(id: string): Promise<FolderRecord | null>;

  /**
   * Creates a new folder in a collection.
   *
   * @param collectionId - Collection to add the folder to.
   * @param name - Display name for the folder.
   * @param actingUserId - User performing the create action.
   * @param parentFolderId - Parent folder, or null/omitted for collection root.
   * @returns The newly created folder.
   */
  createFolder(
    collectionId: string,
    name: string,
    actingUserId: string,
    parentFolderId?: string | null
  ): Promise<FolderRecord>;

  /**
   * Renames a folder.
   *
   * @param id - Folder ID to rename.
   * @param name - New display name.
   * @param actingUserId - User performing the rename action.
   * @param marker - Optional sidebar marker; omit to leave the stored value unchanged.
   * @returns The updated folder.
   */
  renameFolder(
    id: string,
    name: string,
    actingUserId: string,
    marker?: string | null
  ): Promise<FolderRecord>;

  /**
   * Deletes a folder and all requests inside it.
   *
   * @param id - Folder ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteFolder(id: string, actingUserId: string): Promise<void>;

  /**
   * Moves a folder to another parent and optionally positions it among siblings.
   *
   * @param id - Folder ID to move.
   * @param parentFolderId - Destination parent, or null for collection root.
   * @param sortOrder - Optional zero-based destination sibling index.
   * @param actingUserId - User performing the move action.
   * @returns The updated folder.
   */
  moveFolder(
    id: string,
    parentFolderId: string | null,
    sortOrder: number | undefined,
    actingUserId: string
  ): Promise<FolderRecord>;

  /**
   * Reorders folders within a collection.
   *
   * @param collectionId - Collection containing the folders.
   * @param parentFolderId - Parent folder, or null for collection root.
   * @param orderedFolderIds - Folder IDs in desired order.
   * @param actingUserId - User performing the reorder action.
   */
  reorderFolders(
    collectionId: string,
    parentFolderId: string | null,
    orderedFolderIds: string[],
    actingUserId: string
  ): Promise<void>;

  /**
   * Reorders requests within a folder or at collection root.
   *
   * @param collectionId - Collection containing the requests.
   * @param folderId - Folder ID, or null for root-level requests.
   * @param orderedRequestIds - Request IDs in desired order.
   * @param actingUserId - User performing the reorder action.
   */
  reorderRequests(
    collectionId: string,
    folderId: string | null,
    orderedRequestIds: string[],
    actingUserId: string
  ): Promise<void>;

  /**
   * Moves a request to another folder or collection root at a given index.
   *
   * @param requestId - Request ID to move.
   * @param folderId - Destination folder ID, or null for collection root.
   * @param index - Zero-based position within the destination container.
   * @param actingUserId - User performing the move action.
   */
  moveRequest(
    requestId: string,
    folderId: string | null,
    index: number,
    actingUserId: string
  ): Promise<void>;

  /**
   * Lists all documents in a collection.
   *
   * @param collectionId - Collection to query.
   * @returns Documents ordered by sort_order then name.
   */
  listDocuments(collectionId: string): Promise<DocumentRecord[]>;

  /**
   * Finds a document by id.
   *
   * @param id - Document identifier to look up.
   * @returns Matching document record, or null when not found.
   */
  findDocumentById(id: string): Promise<DocumentRecord | null>;

  /**
   * Inserts a new document or updates an existing one.
   *
   * @param input - Document fields to persist.
   * @param actingUserId - User performing the save action.
   * @returns The saved document with ID and timestamps.
   */
  saveDocument(input: SaveDocumentInput, actingUserId: string): Promise<DocumentRecord>;

  /**
   * Deletes a document by ID.
   *
   * @param id - Document ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  deleteDocument(id: string, actingUserId: string): Promise<void>;

  /**
   * Reorders documents within a folder or at collection root.
   *
   * @param collectionId - Collection containing the documents.
   * @param folderId - Folder ID, or null for root-level documents.
   * @param orderedDocumentIds - Document IDs in desired order.
   * @param actingUserId - User performing the reorder action.
   */
  reorderDocuments(
    collectionId: string,
    folderId: string | null,
    orderedDocumentIds: string[],
    actingUserId: string
  ): Promise<void>;

  /**
   * Moves a document to another folder or collection root at a given index.
   *
   * @param documentId - Document ID to move.
   * @param folderId - Destination folder ID, or null for collection root.
   * @param index - Zero-based position within the destination container.
   * @param actingUserId - User performing the move action.
   */
  moveDocument(
    documentId: string,
    folderId: string | null,
    index: number,
    actingUserId: string
  ): Promise<void>;

  /**
   * Returns monthly LLM usage for a user, or null when no usage has been recorded.
   *
   * @param userId - Owning user identifier.
   * @param period - UTC calendar month key (`YYYY-MM`).
   */
  getLlmUsage(userId: string, period: string): Promise<LlmUsageRecord | null>;

  /**
   * Atomically increments monthly LLM token usage for a user.
   *
   * @param userId - Owning user identifier.
   * @param period - UTC calendar month key (`YYYY-MM`).
   * @param promptTokens - Prompt tokens to add.
   * @param completionTokens - Completion tokens to add.
   */
  addLlmUsage(
    userId: string,
    period: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<LlmUsageRecord>;

  /**
   * Inserts a per-request LLM usage log entry.
   *
   * @param input - Usage details for one successful completion step.
   */
  createLlmUsageLog(input: CreateLlmUsageLogInput): Promise<LlmUsageLogRecord>;

  /**
   * Lists all per-request LLM usage log entries, newest first.
   */
  listLlmUsageLogs(): Promise<LlmUsageLogRecord[]>;

  /**
   * Lists run results saved by the given user, newest first.
   *
   * @param userId - User account id whose snapshots should be returned.
   */
  listRunResultsForUser(userId: string): Promise<RunResultRecord[]>;

  /**
   * Lists all run results for admin inspection, newest first.
   */
  listAllRunResults(): Promise<RunResultRecord[]>;

  /**
   * Creates a standalone run result snapshot.
   *
   * @param input - Label and HarborClient export payload.
   * @param actingUserId - User performing the save action.
   */
  createRunResult(input: CreateRunResultInput, actingUserId: string): Promise<RunResultRecord>;

  /**
   * Finds a run result by id.
   *
   * @param id - Run result UUID.
   */
  findRunResultById(id: string): Promise<RunResultRecord | null>;

  /**
   * Deletes a run result by id.
   *
   * @param id - Run result UUID.
   * @param actingUserId - User performing the delete action.
   */
  deleteRunResult(id: string, actingUserId: string): Promise<void>;
}
