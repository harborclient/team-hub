/**
 * Server account role controlling API and CLI capabilities.
 */
export type UserRole = 'admin' | 'user';

/**
 * CRUD or structural action recorded in the audit log.
 */
export type AuditAction = 'create' | 'update' | 'delete' | 'reorder' | 'move';

/**
 * Entity kinds tracked by the audit log.
 */
export type AuditEntityType =
  | 'user'
  | 'api_token'
  | 'invitation'
  | 'collection'
  | 'environment'
  | 'snippet'
  | 'folder'
  | 'request'
  | 'document'
  | 'run_result';

/**
 * Persisted audit log entry describing a single mutating action.
 */
export interface AuditLogRecord {
  /**
   * Stable identifier for the audit entry.
   */
  id: string;

  /**
   * User who performed the action, when known.
   */
  userId: string | null;

  /**
   * Snapshot of the acting user's display name at write time.
   */
  userName: string | null;

  /**
   * Action that was performed.
   */
  action: AuditAction;

  /**
   * Kind of entity affected by the action.
   */
  entityType: AuditEntityType;

  /**
   * Identifier of the affected entity.
   */
  entityId: string;

  /**
   * When the action was recorded.
   */
  createdAt: Date;

  /**
   * Optional structured context for the action.
   */
  metadata: Record<string, unknown> | null;
}

/**
 * Optional filters when listing audit log entries.
 */
export interface ListAuditLogOptions {
  /**
   * Maximum number of entries to return, newest first.
   */
  limit?: number;

  /**
   * Restrict results to a specific acting user.
   */
  userId?: string;

  /**
   * Restrict results to a specific entity type.
   */
  entityType?: AuditEntityType;

  /**
   * Restrict results to a specific entity id.
   */
  entityId?: string;
}

/**
 * Stored metadata for a Team Hub user account.
 */
export interface UserRecord {
  /**
   * Stable identifier used for token ownership and CLI operations.
   */
  id: string;

  /**
   * Unique display name chosen when the user was created.
   */
  name: string;

  /**
   * Role determining API capabilities: `user` for scoped entity access,
   * `admin` for management API access without entity access.
   */
  role: UserRole;

  /**
   * Collection ids the user may access, or `['*']` for all collections.
   */
  collectionAccess: string[];

  /**
   * Environment ids the user may access, or `['*']` for all environments.
   */
  environmentAccess: string[];

  /**
   * Snippet ids the user may access, or `['*']` for all snippets.
   */
  snippetAccess: string[];

  /**
   * When true, the user may call hub-proxied LLM routes.
   */
  llmAccess: boolean;

  /**
   * LLM model ids the user may use, or `['*']` for all hub-offered models.
   */
  llmModels: string[];

  /**
   * Maximum total tokens per UTC calendar month, or null for unlimited.
   */
  llmMonthlyTokenLimit: number | null;

  /**
   * When the user account was created.
   */
  createdAt: Date;

  /**
   * When the user account was last updated.
   */
  updatedAt: Date;

  /**
   * User who created the account.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the account.
   */
  updatedByUserId: string | null;
}

/**
 * Fields required to create a new user account.
 */
export interface CreateUserInput {
  /**
   * Unique display name for the new account.
   */
  name: string;

  /**
   * Role assigned to the new account.
   */
  role: UserRole;

  /**
   * Collection access list; admins store an empty array.
   */
  collectionAccess: string[];

  /**
   * Environment access list; admins store an empty array.
   */
  environmentAccess: string[];

  /**
   * Snippet access list; admins store an empty array.
   */
  snippetAccess: string[];

  /**
   * Whether the user may use hub-proxied LLM routes.
   */
  llmAccess?: boolean;

  /**
   * Allowed LLM model ids, or `['*']` for all hub-offered models.
   */
  llmModels?: string[];

  /**
   * Monthly token limit, or null for unlimited.
   */
  llmMonthlyTokenLimit?: number | null;
}

/**
 * Partial fields accepted when updating an existing user account.
 */
export interface UpdateUserInput {
  /**
   * New unique display name, when changing the account label.
   */
  name?: string;

  /**
   * New role, when changing account capabilities.
   */
  role?: UserRole;

  /**
   * Replacement collection access list.
   */
  collectionAccess?: string[];

  /**
   * Replacement environment access list.
   */
  environmentAccess?: string[];

  /**
   * Replacement snippet access list.
   */
  snippetAccess?: string[];

  /**
   * Whether the user may use hub-proxied LLM routes.
   */
  llmAccess?: boolean;

  /**
   * Replacement LLM model access list.
   */
  llmModels?: string[];

  /**
   * Replacement monthly token limit, or null for unlimited.
   */
  llmMonthlyTokenLimit?: number | null;
}

/**
 * Stored metadata for a database-backed API bearer token.
 *
 * The raw secret is never persisted; only its sha256 hash is stored for lookup.
 */
export interface ApiTokenRecord {
  /**
   * Stable identifier used for revoke and audit operations.
   */
  id: string;

  /**
   * Owning user account that receives the token's access permissions.
   */
  userId: string;

  /**
   * Human-readable label chosen when the token was created.
   */
  name: string;

  /**
   * sha256 hex digest of the bearer token secret.
   */
  tokenHash: string;

  /**
   * Non-secret prefix shown in listings (for example `hbk_AbCd1234`).
   */
  tokenPrefix: string;

  /**
   * When the token was created.
   */
  createdAt: Date;

  /**
   * When the token was last used to authenticate a request, if ever.
   */
  lastUsedAt: Date | null;

  /**
   * When the token was revoked; null means the token is still active.
   */
  revokedAt: Date | null;

  /**
   * User who created the token record.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the token record.
   */
  updatedByUserId: string | null;
}

/**
 * Stored metadata for a single-use user onboarding invitation.
 *
 * The raw invitation secret is never persisted; only its sha256 hash is stored.
 */
export interface InvitationRecord {
  /**
   * Stable identifier used for admin listing and revocation.
   */
  id: string;

  /**
   * User account that receives an API token when the invitation is redeemed.
   */
  userId: string;

  /**
   * sha256 hex digest of the invitation secret.
   */
  codeHash: string;

  /**
   * Non-secret prefix shown in listings (for example `hbi_AbCd1234`).
   */
  codePrefix: string;

  /**
   * When the invitation stops being redeemable.
   */
  expiresAt: Date;

  /**
   * When the invitation was redeemed; null means it is still pending or revoked.
   */
  redeemedAt: Date | null;

  /**
   * When the invitation was revoked by an operator; null means not revoked.
   */
  revokedAt: Date | null;

  /**
   * When the invitation was created.
   */
  createdAt: Date;

  /**
   * User who created the invitation.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the invitation.
   */
  updatedByUserId: string | null;
}

/**
 * Fields required to create a user account together with an initial invitation.
 */
export interface CreateInvitedUserInput extends CreateUserInput {
  /**
   * Optional invitation lifetime in hours; defaults to 24 when omitted.
   */
  expiresInHours?: number;
}

/**
 * Fields required to issue a replacement invitation for an existing user.
 */
export interface CreateUserInvitationInput {
  /**
   * Existing user account that will receive access after redemption.
   */
  userId: string;

  /**
   * Optional invitation lifetime in hours; defaults to 24 when omitted.
   */
  expiresInHours?: number;
}

/**
 * Result of atomically creating a user account and its initial invitation.
 */
export interface CreatedInvitedUserResult {
  /**
   * Newly created user account without any API tokens yet.
   */
  user: UserRecord;

  /**
   * Persisted invitation metadata (secret hash only).
   */
  invitation: InvitationRecord;
}

/**
 * Result of redeeming a pending invitation into a permanent API token.
 */
export interface RedeemedInvitationResult {
  /**
   * User account that now owns the issued API token.
   */
  user: UserRecord;

  /**
   * Newly created permanent API token metadata.
   */
  token: ApiTokenRecord;

  /**
   * One-time plaintext bearer secret for HarborClient storage.
   */
  secret: string;
}

/**
 * Persisted monthly LLM token usage for a user.
 */
export interface LlmUsageRecord {
  /**
   * Stable identifier for the usage row.
   */
  id: string;

  /**
   * Owning user account id.
   */
  userId: string;

  /**
   * UTC calendar month key (`YYYY-MM`).
   */
  period: string;

  /**
   * Prompt tokens consumed during the period.
   */
  promptTokens: number;

  /**
   * Completion tokens consumed during the period.
   */
  completionTokens: number;

  /**
   * Total tokens consumed during the period.
   */
  totalTokens: number;

  /**
   * When usage was last updated.
   */
  updatedAt: Date;
}

/**
 * LLM provider id stored on per-request usage log rows.
 */
export type LlmUsageLogProvider = 'openai' | 'claude' | 'gemini';

/**
 * Persisted per-request LLM usage log entry.
 */
export interface LlmUsageLogRecord {
  /**
   * Stable identifier for the log row.
   */
  id: string;

  /**
   * User who consumed tokens.
   */
  userId: string;

  /**
   * Bearer token used for the request, when known.
   */
  apiTokenId: string | null;

  /**
   * UTC calendar month key (`YYYY-MM`).
   */
  period: string;

  /**
   * Provider-specific model id sent to the API.
   */
  model: string;

  /**
   * LLM provider that served the request.
   */
  provider: LlmUsageLogProvider;

  /**
   * Prompt tokens billed for the step.
   */
  promptTokens: number;

  /**
   * Completion tokens billed for the step.
   */
  completionTokens: number;

  /**
   * Total tokens billed for the step.
   */
  totalTokens: number;

  /**
   * Whether the last message in the request was from the user.
   */
  isNewTurn: boolean;

  /**
   * Whether the model returned tool calls.
   */
  hadToolCalls: boolean;

  /**
   * Number of messages included in the request body.
   */
  messageCount: number;

  /**
   * When the completion step finished.
   */
  createdAt: Date;
}

/**
 * Input for inserting a per-request LLM usage log row.
 */
export interface CreateLlmUsageLogInput {
  /**
   * User who consumed tokens.
   */
  userId: string;

  /**
   * Bearer token used for the request, when known.
   */
  apiTokenId: string | null;

  /**
   * UTC calendar month key (`YYYY-MM`).
   */
  period: string;

  /**
   * Provider-specific model id sent to the API.
   */
  model: string;

  /**
   * LLM provider that served the request.
   */
  provider: LlmUsageLogProvider;

  /**
   * Prompt tokens billed for the step.
   */
  promptTokens: number;

  /**
   * Completion tokens billed for the step.
   */
  completionTokens: number;

  /**
   * Total tokens billed for the step.
   */
  totalTokens: number;

  /**
   * Whether the last message in the request was from the user.
   */
  isNewTurn: boolean;

  /**
   * Whether the model returned tool calls.
   */
  hadToolCalls: boolean;

  /**
   * Number of messages included in the request body.
   */
  messageCount: number;
}

/**
 * Supported HTTP request methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request body content type.
 */
export type BodyType = 'none' | 'json' | 'text' | 'multipart' | 'urlencoded';

/**
 * Authorization type for saved requests and collections.
 */
export type AuthType = 'none' | 'basic' | 'bearer';

/**
 * Basic and bearer credential fields stored together so switching type preserves values.
 */
export interface AuthConfig {
  /**
   * Selected auth mode; none means no request-level override.
   */
  type: AuthType;

  /**
   * Username and password for Basic Auth.
   */
  basic: {
    username: string;
    password: string;
  };

  /**
   * Token value for Bearer Token auth.
   */
  bearer: {
    token: string;
  };
}

/**
 * A key-value pair with an enable toggle for headers and query params.
 */
export interface KeyValue {
  /**
   * Header or query parameter name.
   */
  key: string;

  /**
   * Header or query parameter value.
   */
  value: string;

  /**
   * When false, the pair is ignored when building the request.
   */
  enabled: boolean;
}

/**
 * A collection-scoped or environment-scoped variable for {{key}} substitution.
 */
export interface Variable {
  /**
   * Variable name referenced in {{key}} placeholders.
   */
  key: string;

  /**
   * Value substituted when the variable is resolved.
   */
  value: string;

  /**
   * Fallback value used when value is empty.
   */
  defaultValue: string;

  /**
   * When true, value is included in collection exports.
   */
  share: boolean;
}

/**
 * Persisted collection metadata and defaults shared by all requests in the collection.
 */
export interface CollectionRecord {
  /**
   * Stable collection identifier.
   */
  id: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Collection-scoped variables for {{key}} substitution in requests.
   */
  variables: Variable[];

  /**
   * Headers sent with every request in this collection.
   */
  headers: KeyValue[];

  /**
   * Default Authorization settings inherited by requests unless overridden.
   */
  auth: AuthConfig;

  /**
   * JavaScript run before every request in this collection.
   */
  preRequestScript: string;

  /**
   * JavaScript run after every request in this collection.
   */
  postRequestScript: string;

  /**
   * When the collection was created.
   */
  createdAt: Date;

  /**
   * When the collection was last updated.
   */
  updatedAt: Date;

  /**
   * User who created the collection.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the collection.
   */
  updatedByUserId: string | null;

  /**
   * When true, non-admin users cannot delete this collection.
   */
  deletionLocked: boolean;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker: string | null;
}

/**
 * Persisted environment with scoped variables.
 */
export interface EnvironmentRecord {
  /**
   * Stable environment identifier.
   */
  id: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Environment-scoped variables for {{key}} substitution in requests.
   */
  variables: Variable[];

  /**
   * When the environment was created.
   */
  createdAt: Date;

  /**
   * When the environment was last updated.
   */
  updatedAt: Date;

  /**
   * User who created the environment.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the environment.
   */
  updatedByUserId: string | null;

  /**
   * When true, non-admin users cannot delete this environment.
   */
  deletionLocked: boolean;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker: string | null;
}

/**
 * Execution scope for a reusable code snippet.
 */
export type SnippetScope = 'pre-request' | 'post-request' | 'any';

/**
 * Persisted reusable script snippet.
 */
export interface SnippetRecord {
  /**
   * Stable snippet identifier.
   */
  id: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * JavaScript source inserted into requests.
   */
  code: string;

  /**
   * When the snippet may be applied relative to a request.
   */
  scope: SnippetScope;

  /**
   * Position for sidebar ordering.
   */
  sortOrder: number;

  /**
   * When the snippet was created.
   */
  createdAt: Date;

  /**
   * When the snippet was last updated.
   */
  updatedAt: Date;

  /**
   * User who created the snippet.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the snippet.
   */
  updatedByUserId: string | null;

  /**
   * When true, non-admin users cannot delete this snippet.
   */
  deletionLocked: boolean;
}

/**
 * Discriminator for collection-wide or single-request run result snapshots.
 */
export type RunResultKind = 'collection-run-results' | 'request-run-results';

/**
 * Pass/fail/skip counts stored with a run result snapshot.
 */
export interface RunResultSummaryCounts {
  /**
   * Number of requests that passed.
   */
  passed: number;

  /**
   * Number of requests that failed.
   */
  failed: number;

  /**
   * Number of requests that were skipped.
   */
  skipped: number;
}

/**
 * Persisted collection runner result snapshot.
 */
export interface RunResultRecord {
  /**
   * Stable run result identifier.
   */
  id: string;

  /**
   * Whether the snapshot is a collection-wide or single-request run.
   */
  kind: RunResultKind;

  /**
   * User-facing label for list rows.
   */
  label: string;

  /**
   * Collection display name captured at save time.
   */
  collectionName: string | null;

  /**
   * Request display name when the run targeted one request.
   */
  requestName: string | null;

  /**
   * Pass/fail/skip counts derived from the saved result rows.
   */
  summary: RunResultSummaryCounts;

  /**
   * Complete HarborClient export payload stored as JSON.
   */
  payload: Record<string, unknown>;

  /**
   * When the run result was saved.
   */
  createdAt: Date;

  /**
   * User who saved the run result.
   */
  createdByUserId: string | null;
}

/**
 * Input for creating a run result snapshot.
 */
export interface CreateRunResultInput {
  /**
   * Optional display label; generated from payload metadata when omitted.
   */
  label?: string;

  /**
   * HarborClient run-results export payload to persist.
   */
  payload: Record<string, unknown>;
}

/**
 * A folder for organizing requests within a collection.
 */
export interface FolderRecord {
  /**
   * Stable folder identifier.
   */
  id: string;

  /**
   * ID of the collection this folder belongs to.
   */
  collectionId: string;

  /**
   * Parent folder identifier, or null at the collection root.
   */
  parentFolderId: string | null;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Position among sibling folders for sidebar ordering.
   */
  sortOrder: number;

  /**
   * When the folder was created.
   */
  createdAt: Date;

  /**
   * When the folder was last updated.
   */
  updatedAt: Date;

  /**
   * User who created the folder.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the folder.
   */
  updatedByUserId: string | null;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker: string | null;
}

/**
 * A saved HTTP request belonging to a collection.
 */
export interface SavedRequestRecord {
  /**
   * Stable request identifier.
   */
  id: string;

  /**
   * ID of the collection this request belongs to.
   */
  collectionId: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * HTTP method used for the request.
   */
  method: HttpMethod;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers as editable key-value pairs.
   */
  headers: KeyValue[];

  /**
   * Query parameters as editable key-value pairs.
   */
  params: KeyValue[];

  /**
   * Authorization settings; none inherits collection auth at send time.
   */
  auth: AuthConfig;

  /**
   * Raw request body content.
   */
  body: string;

  /**
   * Content type of the request body.
   */
  bodyType: BodyType;

  /**
   * JavaScript run before the request is sent.
   */
  preRequestScript: string;

  /**
   * JavaScript run after the response is received.
   */
  postRequestScript: string;

  /**
   * Free-form notes for this request.
   */
  comment: string;

  /**
   * ID of the folder containing this request, or null when at collection root.
   */
  folderId: string | null;

  /**
   * Position within the collection for sidebar ordering.
   */
  sortOrder: number;

  /**
   * When the request was created.
   */
  createdAt: Date;

  /**
   * When the request was last saved.
   */
  updatedAt: Date;

  /**
   * User who created the request.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the request.
   */
  updatedByUserId: string | null;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker: string | null;
}

/**
 * Input for creating or updating a saved request.
 */
export interface SaveRequestInput {
  /**
   * Existing request ID; omit to insert a new request.
   */
  id?: string;

  /**
   * ID of the collection to save the request in.
   */
  collectionId: string;

  /**
   * Display name for the saved request.
   */
  name: string;

  /**
   * HTTP method used for the request.
   */
  method: HttpMethod;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers as editable key-value pairs.
   */
  headers: KeyValue[];

  /**
   * Query parameters as editable key-value pairs.
   */
  params: KeyValue[];

  /**
   * Authorization settings; none inherits collection auth at send time.
   */
  auth: AuthConfig;

  /**
   * Raw request body content.
   */
  body: string;

  /**
   * Content type of the request body.
   */
  bodyType: BodyType;

  /**
   * JavaScript run before the request is sent.
   */
  preRequestScript: string;

  /**
   * JavaScript run after the response is received.
   */
  postRequestScript: string;

  /**
   * Free-form notes for this request.
   */
  comment: string;

  /**
   * ID of the folder containing this request, or null when at collection root.
   */
  folderId?: string | null;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker?: string | null;
}

/**
 * A markdown document attached to a collection or folder.
 */
export interface DocumentRecord {
  /**
   * Stable document identifier.
   */
  id: string;

  /**
   * ID of the collection this document belongs to.
   */
  collectionId: string;

  /**
   * ID of the folder containing this document, or null when at collection root.
   */
  folderId: string | null;

  /**
   * Display file name shown in the sidebar (for example README.md).
   */
  name: string;

  /**
   * Markdown body content.
   */
  content: string;

  /**
   * Position within the collection or folder for sidebar ordering.
   */
  sortOrder: number;

  /**
   * When the document was created.
   */
  createdAt: Date;

  /**
   * When the document was last saved.
   */
  updatedAt: Date;

  /**
   * User who created the document.
   */
  createdByUserId: string | null;

  /**
   * User who last updated the document.
   */
  updatedByUserId: string | null;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker: string | null;
}

/**
 * Input for creating or updating a collection document.
 */
export interface SaveDocumentInput {
  /**
   * Existing document ID; omit to insert a new document.
   */
  id?: string;

  /**
   * ID of the collection to save the document in.
   */
  collectionId: string;

  /**
   * Display file name for the document.
   */
  name: string;

  /**
   * Markdown body content.
   */
  content: string;

  /**
   * ID of the folder containing this document, or null when at collection root.
   */
  folderId?: string | null;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker?: string | null;
}

/**
 * Returns a default auth config with type none and empty credentials.
 *
 * @returns Empty AuthConfig safe for new requests and collections.
 */
export function defaultAuth(): AuthConfig {
  return {
    type: 'none',
    basic: { username: '', password: '' },
    bearer: { token: '' }
  };
}

/**
 * JSON string of {@link defaultAuth} for database column defaults.
 */
export const DEFAULT_AUTH_JSON = JSON.stringify(defaultAuth());

/**
 * Normalizes a partial or legacy auth value from storage into a full AuthConfig.
 *
 * @param value - Parsed JSON or unknown field from the database.
 * @returns Valid AuthConfig with defaults for missing fields.
 */
export function normalizeAuth(value: unknown): AuthConfig {
  const fallback = defaultAuth();
  if (value == null || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const type =
    record.type === 'basic' || record.type === 'bearer' || record.type === 'none'
      ? record.type
      : fallback.type;

  const basicRecord =
    record.basic != null && typeof record.basic === 'object'
      ? (record.basic as Record<string, unknown>)
      : {};
  const bearerRecord =
    record.bearer != null && typeof record.bearer === 'object'
      ? (record.bearer as Record<string, unknown>)
      : {};

  return {
    type,
    basic: {
      username: typeof basicRecord.username === 'string' ? basicRecord.username : '',
      password: typeof basicRecord.password === 'string' ? basicRecord.password : ''
    },
    bearer: {
      token: typeof bearerRecord.token === 'string' ? bearerRecord.token : ''
    }
  };
}

/**
 * Normalizes a variable row from storage.
 *
 * @param value - Partial variable from JSON.
 * @returns Variable with defaults for missing fields.
 */
export function normalizeVariable(value: Partial<Variable>): Variable {
  return {
    key: typeof value.key === 'string' ? value.key : '',
    value: typeof value.value === 'string' ? value.value : '',
    defaultValue: typeof value.defaultValue === 'string' ? value.defaultValue : '',
    share: typeof value.share === 'boolean' ? value.share : false
  };
}
