import type {
  AuditAction,
  AuthConfig,
  KeyValue,
  RunResultKind,
  RunResultSummaryCounts,
  UserRole,
  Variable
} from '#/db/types.js';

/**
 * Validated configuration for a Firestore database connection.
 */
export interface FirestoreDatabaseConfig {
  /**
   * Google Cloud project ID that owns the Firestore database.
   */
  projectId: string;

  /**
   * Optional path to a service account key JSON file.
   */
  keyFilename?: string;
}

/**
 * Firestore document shape for persisted user accounts.
 */
export interface FirestoreUserDocument {
  /**
   * Unique display name for the account.
   */
  name: string;

  /**
   * Role assigned to the account.
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

  /**
   * When true, the user may call hub-proxied LLM routes.
   */
  llmAccess?: boolean;

  /**
   * LLM model ids the user may use, or `['*']` for all hub-offered models.
   */
  llmModels?: string[];

  /**
   * Maximum total tokens per UTC calendar month, or null for unlimited.
   */
  llmMonthlyTokenLimit?: number | null;
}

/**
 * Firestore document shape for persisted user onboarding invitations.
 */
export interface FirestoreInvitationDocument {
  /**
   * Invited user identifier.
   */
  userId: string;

  /**
   * sha256 hex digest of the invitation secret.
   */
  codeHash: string;

  /**
   * Non-secret prefix shown in listings.
   */
  codePrefix: string;

  /**
   * When the invitation stops being redeemable.
   */
  expiresAt: Date;

  /**
   * When the invitation was redeemed; null means still pending or revoked.
   */
  redeemedAt: Date | null;

  /**
   * When the invitation was revoked; null means not revoked.
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
 * Firestore document shape for persisted API tokens.
 */
export interface FirestoreApiTokenDocument {
  /**
   * Owning user identifier.
   */
  userId: string;

  /**
   * Human-readable token label.
   */
  name: string;

  /**
   * sha256 hex digest of the bearer token secret.
   */
  tokenHash: string;

  /**
   * Non-secret prefix shown in listings.
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
 * Firestore document shape for persisted collections.
 */
export interface FirestoreCollectionDocument {
  /**
   * Display name for the collection.
   */
  name: string;

  /**
   * Collection-scoped variables.
   */
  variables: Variable[];

  /**
   * Default headers for requests in the collection.
   */
  headers: KeyValue[];

  /**
   * Default auth settings for requests in the collection.
   */
  auth: AuthConfig;

  /**
   * Pre-request script shared by all requests in the collection.
   */
  preRequestScript: string;

  /**
   * Post-request script shared by all requests in the collection.
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
  deletionLocked?: boolean;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker?: string | null;
}

/**
 * Firestore document shape for persisted environments.
 */
export interface FirestoreEnvironmentDocument {
  /**
   * Display name for the environment.
   */
  name: string;

  /**
   * Environment-scoped variables.
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
  deletionLocked?: boolean;

  /**
   * Optional sidebar marker (CSS color string) for visual grouping.
   */
  marker?: string | null;
}

/**
 * Firestore document shape for persisted snippets.
 */
export interface FirestoreSnippetDocument {
  /**
   * Display name for the snippet.
   */
  name: string;

  /**
   * JavaScript source inserted into requests.
   */
  code: string;

  /**
   * When the snippet may be applied relative to a request.
   */
  scope: 'pre-request' | 'post-request' | 'any';

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
  deletionLocked?: boolean;
}

/**
 * Firestore document shape for persisted folders.
 */
export interface FirestoreFolderDocument {
  /**
   * Parent collection identifier.
   */
  collectionId: string;

  /**
   * Parent folder identifier, or null at the collection root.
   */
  parentFolderId: string | null;

  /**
   * Display name for the folder.
   */
  name: string;

  /**
   * Position among sibling folders.
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
  marker?: string | null;
}

/**
 * Firestore document shape for persisted saved requests.
 */
export interface FirestoreRequestDocument {
  /**
   * Parent collection identifier.
   */
  collectionId: string;

  /**
   * Optional parent folder identifier.
   */
  folderId: string | null;

  /**
   * Display name for the request.
   */
  name: string;

  /**
   * HTTP method for the request.
   */
  method: string;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers.
   */
  headers: KeyValue[];

  /**
   * Query parameters.
   */
  params: KeyValue[];

  /**
   * Authorization settings.
   */
  auth: AuthConfig;

  /**
   * Request body content.
   */
  body: string;

  /**
   * Request body content type.
   */
  bodyType: string;

  /**
   * Pre-request script.
   */
  preRequestScript: string;

  /**
   * Post-request script.
   */
  postRequestScript: string;

  /**
   * Free-form notes.
   */
  comment: string;

  /**
   * Position within the collection or folder.
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
  marker?: string | null;
}

/**
 * Firestore document shape for persisted collection documents.
 */
export interface FirestoreDocumentDocument {
  /**
   * Parent collection identifier.
   */
  collectionId: string;

  /**
   * Optional parent folder identifier.
   */
  folderId: string | null;

  /**
   * Display file name for the document.
   */
  name: string;

  /**
   * Markdown body content.
   */
  content: string;

  /**
   * Position within the collection or folder.
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
  marker?: string | null;
}
export interface FirestoreAuditLogDocument {
  /**
   * Acting user identifier, when known.
   */
  userId: string | null;

  /**
   * Snapshot of the acting user's display name at write time.
   */
  userName: string | null;

  /**
   * CRUD or structural action performed.
   */
  action: AuditAction;

  /**
   * Entity kind affected by the action.
   */
  entityType: string;

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
 * Firestore document shape for persisted monthly LLM usage.
 */
export interface FirestoreLlmUsageDocument {
  /**
   * Owning user identifier.
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
 * Firestore document shape for per-request LLM usage log entries.
 */
export interface FirestoreLlmUsageLogDocument {
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
  provider: string;

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
 * Firestore document shape for persisted run result snapshots.
 */
export interface FirestoreRunResultDocument {
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
