/**
 * Firestore collection name for user account documents.
 */
export const USERS_COLLECTION = 'users';

/**
 * Firestore collection name for API token documents.
 */
export const API_TOKENS_COLLECTION = 'apiTokens';

/**
 * Firestore collection name for user onboarding invitation documents.
 */
export const INVITATIONS_COLLECTION = 'invitations';

/**
 * Firestore collection name for shared collection documents.
 */
export const COLLECTIONS_COLLECTION = 'collections';

/**
 * Firestore collection name for environment documents.
 */
export const ENVIRONMENTS_COLLECTION = 'environments';

/**
 * Firestore collection name for snippet documents.
 */
export const SNIPPETS_COLLECTION = 'snippets';

/**
 * Firestore collection name for folder documents.
 */
export const FOLDERS_COLLECTION = 'folders';

/**
 * Firestore collection name for saved request documents.
 */
export const REQUESTS_COLLECTION = 'requests';

/**
 * Firestore collection name for collection document files.
 */
export const DOCUMENTS_COLLECTION = 'documents';

/**
 * Firestore collection name for audit log documents.
 */
export const AUDIT_LOG_COLLECTION = 'auditLog';

/**
 * Firestore collection name for monthly LLM usage documents.
 */
export const LLM_USAGE_COLLECTION = 'llmUsage';

/**
 * Firestore collection name for per-request LLM usage log documents.
 */
export const LLM_USAGE_LOG_COLLECTION = 'llmUsageLog';

/**
 * Firestore collection name for run result documents.
 */
export const RUN_RESULTS_COLLECTION = 'runResults';

/**
 * Maximum writes per Firestore batch commit.
 */
export const WRITE_BATCH_LIMIT = 500;
