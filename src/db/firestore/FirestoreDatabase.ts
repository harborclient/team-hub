import { randomUUID } from 'node:crypto';
import { Firestore, type DocumentReference, type Query } from '@google-cloud/firestore';
import { resolveActingUserName } from '#/db/attribution.js';
import { BOOTSTRAP_USER_NAME } from '#/db/bootstrapUsers.js';
import { InvitationUnavailableError } from '#/db/invitationErrors.js';
import {
  API_TOKENS_COLLECTION,
  AUDIT_LOG_COLLECTION,
  COLLECTIONS_COLLECTION,
  DOCUMENTS_COLLECTION,
  ENVIRONMENTS_COLLECTION,
  FOLDERS_COLLECTION,
  INVITATIONS_COLLECTION,
  LLM_USAGE_COLLECTION,
  LLM_USAGE_LOG_COLLECTION,
  REQUESTS_COLLECTION,
  RUN_RESULTS_COLLECTION,
  SNIPPETS_COLLECTION,
  USERS_COLLECTION,
  WRITE_BATCH_LIMIT
} from '#/db/firestore/const.js';
import { createSystemUserInput, SYSTEM_USER_NAME } from '#/db/systemUsers.js';
import { firestoreConfigSchema } from '#/db/firestore/schemas.js';
import type {
  FirestoreApiTokenDocument,
  FirestoreAuditLogDocument,
  FirestoreCollectionDocument,
  FirestoreDatabaseConfig,
  FirestoreEnvironmentDocument,
  FirestoreFolderDocument,
  FirestoreInvitationDocument,
  FirestoreLlmUsageDocument,
  FirestoreLlmUsageLogDocument,
  FirestoreRequestDocument,
  FirestoreDocumentDocument,
  FirestoreRunResultDocument,
  FirestoreSnippetDocument,
  FirestoreUserDocument
} from '#/db/firestore/types.js';
import {
  mapFirestoreApiToken,
  mapFirestoreAuditLog,
  mapFirestoreCollection,
  mapFirestoreEnvironment,
  mapFirestoreFolder,
  mapFirestoreInvitation,
  mapFirestoreLlmUsage,
  mapFirestoreLlmUsageLog,
  mapFirestoreRequest,
  mapFirestoreDocument,
  mapFirestoreRunResult,
  mapFirestoreSnippet,
  mapFirestoreUser
} from '#/db/firestore/utils.js';
import type { IDatabase } from '#/db/IDatabase.js';
import { buildDefaultRunResultLabel, parseRunResultPayload } from '#/db/runResultPayload.js';
import { generateApiToken } from '#/server/auth/apiTokens.js';
import { trimRequiredName } from '#/db/trimRequiredName.js';
import { serializeSidebarMarker } from '#/db/sidebarMarker.js';
import { assertUserNameAvailable, assertUserNameNotReserved } from '#/db/userNameValidation.js';
import type {
  ApiTokenRecord,
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  AuthConfig,
  CollectionRecord,
  CreateRunResultInput,
  CreateUserInput,
  CreatedInvitedUserResult,
  CreateLlmUsageLogInput,
  EnvironmentRecord,
  FolderRecord,
  InvitationRecord,
  KeyValue,
  ListAuditLogOptions,
  LlmUsageLogRecord,
  LlmUsageRecord,
  RedeemedInvitationResult,
  SaveRequestInput,
  SaveDocumentInput,
  RunResultRecord,
  SavedRequestRecord,
  DocumentRecord,
  SnippetRecord,
  SnippetScope,
  UpdateUserInput,
  UserRecord,
  Variable
} from '#/db/types.js';
import { defaultAuth } from '#/db/types.js';
import { formatZodError } from '#/db/validation.js';

/**
 * Firestore-backed database implementation.
 */
export class FirestoreDatabase implements IDatabase {
  /**
   * Active Firestore client, or null when disconnected.
   */
  private client: Firestore | null = null;

  /**
   * Cached identifier of the internal system user, when provisioned during migration.
   */
  private systemUserId: string | null = null;

  /**
   * Creates a Firestore database instance from validated config.
   *
   * @param config - Parsed Firestore connection settings.
   */
  constructor(private readonly config: FirestoreDatabaseConfig) {}

  /**
   * Validates raw config and constructs a {@link FirestoreDatabase}.
   *
   * @param config - Raw `db` section from server.yaml.
   * @returns Configured Firestore database instance.
   * @throws {Error} When config fails Firestore-specific validation.
   */
  static fromConfig(config: unknown): FirestoreDatabase {
    const parsed = firestoreConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(formatZodError(parsed.error));
    }

    return new FirestoreDatabase({
      projectId: parsed.data.projectId,
      keyFilename: parsed.data.keyFilename
    });
  }

  /**
   * Opens a Firestore client and verifies connectivity by listing collections.
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const client = new Firestore({
      projectId: this.config.projectId,
      keyFilename: this.config.keyFilename
    });

    await client.listCollections();

    this.client = client;
  }

  /**
   * Terminates the Firestore client and releases resources.
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.terminate();
    this.client = null;
  }

  /**
   * Firestore uses schemaless documents; provisions the system user and migrates orphan tokens.
   */
  async migrate(): Promise<void> {
    await this.ensureSystemUser();
    await this.migrateOrphanTokensToBootstrapUser();
    await this.migrateSnippetAccessBackfill();
  }

  /**
   * Returns the stable identifier of the internal system user, when provisioned.
   */
  getSystemUserId(): string | null {
    return this.systemUserId;
  }

  /**
   * Lists audit log entries ordered newest-first with optional filters.
   *
   * @param options - Optional limit and filter criteria.
   */
  async listAuditLog(options: ListAuditLogOptions = {}): Promise<AuditLogRecord[]> {
    const limit = options.limit ?? 100;
    let query: Query = this.requireClient().collection(AUDIT_LOG_COLLECTION);

    if (options.userId !== undefined) {
      query = query.where('userId', '==', options.userId);
    }

    if (options.entityType !== undefined) {
      query = query.where('entityType', '==', options.entityType);
    }

    if (options.entityId !== undefined) {
      query = query.where('entityId', '==', options.entityId);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) =>
      mapFirestoreAuditLog(doc.id, doc.data() as FirestoreAuditLogDocument)
    );
  }

  /**
   * Creates a new user account with the given role and access lists.
   *
   * @param input - User fields to persist.
   * @param actingUserId - User performing the create action.
   */
  async createUser(input: CreateUserInput, actingUserId: string): Promise<UserRecord> {
    const trimmedName = trimRequiredName(input.name, 'User name');
    assertUserNameNotReserved(trimmedName);
    const id = randomUUID();
    const now = new Date();
    const attributionUserId = trimmedName === SYSTEM_USER_NAME ? id : actingUserId;
    const data: FirestoreUserDocument = {
      name: trimmedName,
      role: input.role,
      collectionAccess: input.collectionAccess,
      environmentAccess: input.environmentAccess,
      snippetAccess: input.snippetAccess,
      llmAccess: input.llmAccess ?? false,
      llmModels: input.llmModels ?? [],
      llmMonthlyTokenLimit: input.llmMonthlyTokenLimit ?? null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: attributionUserId,
      updatedByUserId: attributionUserId
    };

    await this.requireClient().collection(USERS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'user', id);

    const created = await this.findUserById(id);
    if (!created) {
      throw new Error('User not found after insert');
    }

    return created;
  }

  /**
   * Finds a user by stable identifier.
   *
   * @param id - User identifier to look up.
   */
  async findUserById(id: string): Promise<UserRecord | null> {
    const snapshot = await this.requireClient().collection(USERS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreUser(id, snapshot.data() as FirestoreUserDocument);
  }

  /**
   * Finds a user by unique display name.
   *
   * @param name - User name to look up.
   */
  async findUserByName(name: string): Promise<UserRecord | null> {
    const snapshot = await this.requireClient()
      .collection(USERS_COLLECTION)
      .where('name', '==', name)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }

    return mapFirestoreUser(doc.id, doc.data() as FirestoreUserDocument);
  }

  /**
   * Lists all user accounts ordered by name.
   */
  async listUsers(): Promise<UserRecord[]> {
    const snapshot = await this.requireClient().collection(USERS_COLLECTION).orderBy('name').get();
    return snapshot.docs.map((doc) =>
      mapFirestoreUser(doc.id, doc.data() as FirestoreUserDocument)
    );
  }

  /**
   * Updates an existing user account.
   *
   * @param id - User identifier to update.
   * @param input - Partial fields to apply.
   * @param actingUserId - User performing the update action.
   */
  async updateUser(id: string, input: UpdateUserInput, actingUserId: string): Promise<UserRecord> {
    const existing = await this.findUserById(id);
    if (!existing) {
      throw new Error('User not found');
    }

    const name =
      input.name !== undefined ? trimRequiredName(input.name, 'User name') : existing.name;

    if (name !== existing.name) {
      assertUserNameNotReserved(name);
      const duplicate = await this.findUserByName(name);
      assertUserNameAvailable(name, id, duplicate);
    }

    const role = input.role ?? existing.role;
    const collectionAccess = input.collectionAccess ?? existing.collectionAccess;
    const environmentAccess = input.environmentAccess ?? existing.environmentAccess;
    const snippetAccess = input.snippetAccess ?? existing.snippetAccess;
    const llmAccess = input.llmAccess ?? existing.llmAccess;
    const llmModels = input.llmModels ?? existing.llmModels;
    const llmMonthlyTokenLimit =
      input.llmMonthlyTokenLimit !== undefined
        ? input.llmMonthlyTokenLimit
        : existing.llmMonthlyTokenLimit;
    const updatedAt = new Date();

    await this.requireClient().collection(USERS_COLLECTION).doc(id).update({
      name,
      role,
      collectionAccess,
      environmentAccess,
      snippetAccess,
      llmAccess,
      llmModels,
      llmMonthlyTokenLimit,
      updatedAt,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'update', 'user', id);

    const updated = await this.findUserById(id);
    if (!updated) {
      throw new Error('User not found');
    }

    return updated;
  }

  /**
   * Deletes a user account and revokes all of their API tokens.
   *
   * @param id - User identifier to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteUser(id: string, actingUserId: string): Promise<void> {
    const client = this.requireClient();
    const tokenSnapshot = await client
      .collection(API_TOKENS_COLLECTION)
      .where('userId', '==', id)
      .get();

    const batch = client.batch();

    for (const doc of tokenSnapshot.docs) {
      batch.delete(doc.ref);
    }

    batch.delete(client.collection(USERS_COLLECTION).doc(id));
    await batch.commit();

    await this.recordAuditEntry(actingUserId, 'delete', 'user', id);
  }

  /**
   * Assigns legacy API tokens without an owner to the bootstrap user.
   */
  async migrateOrphanTokensToBootstrapUser(): Promise<void> {
    const client = this.requireClient();
    const snapshot = await client.collection(API_TOKENS_COLLECTION).get();
    const orphanDocs = snapshot.docs.filter((doc) => {
      const data = doc.data() as Partial<FirestoreApiTokenDocument>;
      return data.userId === undefined || data.userId === null || data.userId === '';
    });

    if (orphanDocs.length === 0) {
      return;
    }

    const systemUserId = this.getSystemUserId();
    if (!systemUserId) {
      throw new Error('System user is not provisioned');
    }

    let bootstrapUser = await this.findUserByName(BOOTSTRAP_USER_NAME);
    if (!bootstrapUser) {
      bootstrapUser = await this.createUser(
        {
          name: BOOTSTRAP_USER_NAME,
          role: 'user',
          collectionAccess: ['*'],
          environmentAccess: ['*'],
          snippetAccess: ['*']
        },
        systemUserId
      );
    }

    for (let index = 0; index < orphanDocs.length; index += WRITE_BATCH_LIMIT) {
      const batch = client.batch();
      const chunk = orphanDocs.slice(index, index + WRITE_BATCH_LIMIT);
      for (const doc of chunk) {
        batch.update(doc.ref, { userId: bootstrapUser.id });
      }
      await batch.commit();
    }
  }

  /**
   * Grants wildcard snippet access to user accounts that already have wildcard collection access.
   */
  async migrateSnippetAccessBackfill(): Promise<void> {
    const client = this.requireClient();
    const snapshot = await client.collection(USERS_COLLECTION).where('role', '==', 'user').get();
    if (snapshot.docs.length === 0) {
      return;
    }

    let batch = client.batch();
    let batchSize = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as FirestoreUserDocument;
      if ((data.snippetAccess?.length ?? 0) > 0) {
        continue;
      }
      if (!data.collectionAccess?.includes('*')) {
        continue;
      }

      batch.update(doc.ref, { snippetAccess: ['*'] });
      batchSize += 1;

      if (batchSize >= WRITE_BATCH_LIMIT) {
        await batch.commit();
        batch = client.batch();
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await batch.commit();
    }
  }

  /**
   * Inserts a new API token document.
   *
   * @param record - Token metadata to persist.
   * @param actingUserId - User performing the create action.
   */
  async createApiToken(record: ApiTokenRecord, actingUserId: string): Promise<void> {
    await this.requireClient().collection(API_TOKENS_COLLECTION).doc(record.id).set({
      userId: record.userId,
      name: record.name,
      tokenHash: record.tokenHash,
      tokenPrefix: record.tokenPrefix,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'create', 'api_token', record.id);
  }

  /**
   * Finds an active token by its stored hash.
   *
   * @param tokenHash - sha256 hex digest of the bearer token secret.
   */
  async findActiveApiTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const snapshot = await this.requireClient()
      .collection(API_TOKENS_COLLECTION)
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }

    const data = doc.data() as FirestoreApiTokenDocument;
    if (data.revokedAt !== null || !data.userId) {
      return null;
    }

    return mapFirestoreApiToken(doc.id, data);
  }

  /**
   * Lists all API tokens ordered by creation time descending.
   */
  async listApiTokens(): Promise<ApiTokenRecord[]> {
    const snapshot = await this.requireClient()
      .collection(API_TOKENS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs
      .map((doc) => mapFirestoreApiToken(doc.id, doc.data() as FirestoreApiTokenDocument))
      .filter((token) => Boolean(token.userId));
  }

  /**
   * Returns API tokens owned by a specific user ordered newest-first.
   *
   * @param userId - Owning user identifier.
   */
  async listApiTokensByUserId(userId: string): Promise<ApiTokenRecord[]> {
    const snapshot = await this.requireClient()
      .collection(API_TOKENS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreApiToken(doc.id, doc.data() as FirestoreApiTokenDocument)
    );
  }

  /**
   * Finds an API token record by stable identifier.
   *
   * @param id - Token identifier to look up.
   */
  async findApiTokenById(id: string): Promise<ApiTokenRecord | null> {
    const docRef = this.requireClient().collection(API_TOKENS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreApiToken(snapshot.id, snapshot.data() as FirestoreApiTokenDocument);
  }

  /**
   * Permanently removes an API token record by id.
   *
   * @param id - Token identifier to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteApiToken(id: string, actingUserId: string): Promise<boolean> {
    const docRef = this.requireClient().collection(API_TOKENS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return false;
    }

    await docRef.delete();
    await this.recordAuditEntry(actingUserId, 'delete', 'api_token', id);
    return true;
  }

  /**
   * Soft-revokes an active token by id.
   *
   * @param id - Token identifier to revoke.
   * @param actingUserId - User performing the revoke action.
   */
  async revokeApiToken(id: string, actingUserId: string): Promise<boolean> {
    const docRef = this.requireClient().collection(API_TOKENS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return false;
    }

    const data = snapshot.data() as FirestoreApiTokenDocument;
    if (data.revokedAt !== null) {
      return false;
    }

    await docRef.update({ revokedAt: new Date(), updatedByUserId: actingUserId });
    await this.recordAuditEntry(actingUserId, 'update', 'api_token', id);
    return true;
  }

  /**
   * Updates the last-used timestamp for a token.
   *
   * @param id - Token identifier that authenticated a request.
   * @param when - Timestamp of the authenticated request.
   */
  async touchApiTokenLastUsed(id: string, when: Date): Promise<void> {
    await this.requireClient()
      .collection(API_TOKENS_COLLECTION)
      .doc(id)
      .update({ lastUsedAt: when });
  }

  /**
   * Creates a user account and its initial onboarding invitation in one transaction.
   *
   * @param userId - Pre-generated stable identifier for the new user.
   * @param input - User fields to persist.
   * @param invitation - Invitation metadata including the stored code hash.
   * @param actingUserId - User performing the create action.
   */
  async createInvitedUser(
    userId: string,
    input: CreateUserInput,
    invitation: InvitationRecord,
    actingUserId: string
  ): Promise<CreatedInvitedUserResult> {
    const trimmedName = trimRequiredName(input.name, 'User name');
    assertUserNameNotReserved(trimmedName);
    const now = new Date();
    const client = this.requireClient();
    const userRef = client.collection(USERS_COLLECTION).doc(userId);
    const invitationRef = client.collection(INVITATIONS_COLLECTION).doc(invitation.id);
    const userData: FirestoreUserDocument = {
      name: trimmedName,
      role: input.role,
      collectionAccess: input.collectionAccess,
      environmentAccess: input.environmentAccess,
      snippetAccess: input.snippetAccess,
      llmAccess: input.llmAccess ?? false,
      llmModels: input.llmModels ?? [],
      llmMonthlyTokenLimit: input.llmMonthlyTokenLimit ?? null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };
    const invitationData: FirestoreInvitationDocument = {
      userId: invitation.userId,
      codeHash: invitation.codeHash,
      codePrefix: invitation.codePrefix,
      expiresAt: invitation.expiresAt,
      redeemedAt: invitation.redeemedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };

    await client.runTransaction(async (transaction) => {
      transaction.set(userRef, userData);
      transaction.set(invitationRef, invitationData);
    });

    await this.recordAuditEntry(actingUserId, 'create', 'user', userId);
    await this.recordAuditEntry(actingUserId, 'create', 'invitation', invitation.id);

    return {
      user: mapFirestoreUser(userId, userData),
      invitation
    };
  }

  /**
   * Persists a new onboarding invitation for an existing user account.
   *
   * @param invitation - Invitation metadata including the stored code hash.
   * @param actingUserId - User performing the create action.
   */
  async createInvitation(
    invitation: InvitationRecord,
    actingUserId: string
  ): Promise<InvitationRecord> {
    const user = await this.findUserById(invitation.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const data: FirestoreInvitationDocument = {
      userId: invitation.userId,
      codeHash: invitation.codeHash,
      codePrefix: invitation.codePrefix,
      expiresAt: invitation.expiresAt,
      redeemedAt: invitation.redeemedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };

    await this.requireClient().collection(INVITATIONS_COLLECTION).doc(invitation.id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'invitation', invitation.id);
    return invitation;
  }

  /**
   * Finds an invitation by stable identifier.
   *
   * @param id - Invitation identifier to look up.
   */
  async findInvitationById(id: string): Promise<InvitationRecord | null> {
    const snapshot = await this.requireClient().collection(INVITATIONS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreInvitation(snapshot.id, snapshot.data() as FirestoreInvitationDocument);
  }

  /**
   * Finds an invitation by the sha256 hash of its secret.
   *
   * @param codeHash - sha256 hex digest of the invitation secret.
   */
  async findInvitationByCodeHash(codeHash: string): Promise<InvitationRecord | null> {
    const snapshot = await this.requireClient()
      .collection(INVITATIONS_COLLECTION)
      .where('codeHash', '==', codeHash)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }

    return mapFirestoreInvitation(doc.id, doc.data() as FirestoreInvitationDocument);
  }

  /**
   * Lists all invitations ordered by creation time descending.
   */
  async listInvitations(): Promise<InvitationRecord[]> {
    const snapshot = await this.requireClient()
      .collection(INVITATIONS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreInvitation(doc.id, doc.data() as FirestoreInvitationDocument)
    );
  }

  /**
   * Revokes a pending invitation by id.
   *
   * @param id - Invitation identifier to revoke.
   * @param actingUserId - User performing the revoke action.
   */
  async revokeInvitation(id: string, actingUserId: string): Promise<boolean> {
    const docRef = this.requireClient().collection(INVITATIONS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return false;
    }

    const data = snapshot.data() as FirestoreInvitationDocument;
    const now = new Date();
    if (
      data.redeemedAt !== null ||
      data.revokedAt !== null ||
      data.expiresAt.getTime() <= now.getTime()
    ) {
      return false;
    }

    await docRef.update({ revokedAt: now, updatedByUserId: actingUserId });
    await this.recordAuditEntry(actingUserId, 'update', 'invitation', id);
    return true;
  }

  /**
   * Atomically consumes a pending invitation and issues a permanent API token.
   *
   * @param codeHash - sha256 hex digest of the invitation secret.
   * @param tokenName - Label stored on the newly created API token.
   * @param actingUserId - Internal user attributed with the redemption action.
   */
  async redeemInvitation(
    codeHash: string,
    tokenName: string,
    actingUserId: string
  ): Promise<RedeemedInvitationResult> {
    const now = new Date();
    const client = this.requireClient();
    const invitationQuery = client
      .collection(INVITATIONS_COLLECTION)
      .where('codeHash', '==', codeHash)
      .limit(1);

    let user!: UserRecord;
    let invitation!: InvitationRecord;
    let token!: ApiTokenRecord;
    let secret!: string;

    await client.runTransaction(async (transaction) => {
      const invitationSnapshot = await transaction.get(invitationQuery);
      const invitationDoc = invitationSnapshot.docs[0];
      if (!invitationDoc) {
        throw new InvitationUnavailableError('not_found');
      }

      const invitationData = invitationDoc.data() as FirestoreInvitationDocument;
      if (invitationData.redeemedAt) {
        throw new InvitationUnavailableError('redeemed');
      }

      if (invitationData.revokedAt) {
        throw new InvitationUnavailableError('revoked');
      }

      if (invitationData.expiresAt.getTime() <= now.getTime()) {
        throw new InvitationUnavailableError('expired');
      }

      transaction.update(invitationDoc.ref, {
        redeemedAt: now,
        updatedByUserId: actingUserId
      });

      const userRef = client.collection(USERS_COLLECTION).doc(invitationData.userId);
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) {
        throw new Error('User not found');
      }

      user = mapFirestoreUser(userSnapshot.id, userSnapshot.data() as FirestoreUserDocument);
      invitation = mapFirestoreInvitation(invitationDoc.id, {
        ...invitationData,
        redeemedAt: now,
        updatedByUserId: actingUserId
      });

      const generated = generateApiToken(user.id, tokenName);
      token = generated.record;
      secret = generated.secret;

      const tokenRef = client.collection(API_TOKENS_COLLECTION).doc(token.id);
      const tokenData: FirestoreApiTokenDocument = {
        userId: token.userId,
        name: token.name,
        tokenHash: token.tokenHash,
        tokenPrefix: token.tokenPrefix,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        revokedAt: token.revokedAt,
        createdByUserId: actingUserId,
        updatedByUserId: actingUserId
      };
      transaction.set(tokenRef, tokenData);
    });

    await this.recordAuditEntry(actingUserId, 'update', 'invitation', invitation.id);
    await this.recordAuditEntry(actingUserId, 'create', 'api_token', token.id);

    return { user, token, secret };
  }

  /**
   * Lists all collections ordered by name.
   */
  async listCollections(): Promise<CollectionRecord[]> {
    const snapshot = await this.requireClient()
      .collection(COLLECTIONS_COLLECTION)
      .orderBy('name')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreCollection(doc.id, doc.data() as FirestoreCollectionDocument)
    );
  }

  /**
   * Creates a new collection with the given name.
   *
   * @param name - Display name for the collection.
   * @param actingUserId - User performing the create action.
   */
  async createCollection(name: string, actingUserId: string): Promise<CollectionRecord> {
    const trimmedName = trimRequiredName(name, 'Collection name');
    const id = randomUUID();
    const now = new Date();
    const data: FirestoreCollectionDocument = {
      name: trimmedName,
      variables: [],
      headers: [],
      auth: defaultAuth(),
      preRequestScript: '',
      postRequestScript: '',
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId,
      deletionLocked: false
    };

    await this.requireClient().collection(COLLECTIONS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'collection', id);
    return mapFirestoreCollection(id, data);
  }

  /**
   * Updates a collection's name, variables, headers, and scripts.
   *
   * @param actingUserId - User performing the update action.
   */
  async updateCollection(
    id: string,
    name: string,
    variables: Variable[],
    headers: KeyValue[],
    preRequestScript: string,
    postRequestScript: string,
    auth: AuthConfig,
    actingUserId: string,
    marker?: string | null
  ): Promise<CollectionRecord> {
    const trimmedName = trimRequiredName(name, 'Collection name');
    const updatedAt = new Date();
    const docRef = this.requireClient().collection(COLLECTIONS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Collection not found');
    }

    const existing = snapshot.data() as FirestoreCollectionDocument;
    const serializedMarker =
      marker !== undefined ? serializeSidebarMarker(marker) : existing.marker;
    const updated: FirestoreCollectionDocument = {
      ...existing,
      name: trimmedName,
      variables,
      headers,
      auth,
      preRequestScript,
      postRequestScript,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    };

    await docRef.update({
      name: trimmedName,
      variables,
      headers,
      auth,
      preRequestScript,
      postRequestScript,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    });

    await this.recordAuditEntry(actingUserId, 'update', 'collection', id);
    return mapFirestoreCollection(id, updated);
  }

  /**
   * Deletes a collection and all of its requests and folders.
   *
   * @param id - Collection ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteCollection(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'collection', id);

    const client = this.requireClient();
    const requestsSnap = await client
      .collection(REQUESTS_COLLECTION)
      .where('collectionId', '==', id)
      .get();
    const documentsSnap = await client
      .collection(DOCUMENTS_COLLECTION)
      .where('collectionId', '==', id)
      .get();
    const foldersSnap = await client
      .collection(FOLDERS_COLLECTION)
      .where('collectionId', '==', id)
      .get();

    const refs = [
      ...requestsSnap.docs.map((requestDoc) => requestDoc.ref),
      ...documentsSnap.docs.map((documentDoc) => documentDoc.ref),
      ...foldersSnap.docs.map((folderDoc) => folderDoc.ref),
      client.collection(COLLECTIONS_COLLECTION).doc(id)
    ];

    await this.commitBatchedDeletes(refs);
  }

  /**
   * Finds a collection by stable identifier.
   *
   * @param id - Collection ID to look up.
   */
  async findCollectionById(id: string): Promise<CollectionRecord | null> {
    const snapshot = await this.requireClient().collection(COLLECTIONS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreCollection(id, snapshot.data() as FirestoreCollectionDocument);
  }

  /**
   * Updates whether non-admin users may delete a collection.
   *
   * @param id - Collection ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the collection.
   * @param actingUserId - Admin user performing the update.
   */
  async setCollectionDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<CollectionRecord> {
    const docRef = this.requireClient().collection(COLLECTIONS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Collection not found');
    }

    const updatedAt = new Date();
    await docRef.update({
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'update', 'collection', id);

    const existing = snapshot.data() as FirestoreCollectionDocument;
    return mapFirestoreCollection(id, {
      ...existing,
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });
  }

  /**
   * Lists all environments ordered by name.
   */
  async listEnvironments(): Promise<EnvironmentRecord[]> {
    const snapshot = await this.requireClient()
      .collection(ENVIRONMENTS_COLLECTION)
      .orderBy('name')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreEnvironment(doc.id, doc.data() as FirestoreEnvironmentDocument)
    );
  }

  /**
   * Creates a new environment with the given name.
   *
   * @param name - Display name for the environment.
   * @param actingUserId - User performing the create action.
   */
  async createEnvironment(name: string, actingUserId: string): Promise<EnvironmentRecord> {
    const trimmedName = trimRequiredName(name, 'Environment name');
    const id = randomUUID();
    const now = new Date();
    const data: FirestoreEnvironmentDocument = {
      name: trimmedName,
      variables: [],
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId,
      deletionLocked: false
    };

    await this.requireClient().collection(ENVIRONMENTS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'environment', id);
    return mapFirestoreEnvironment(id, data);
  }

  /**
   * Updates an environment's name and variables.
   *
   * @param actingUserId - User performing the update action.
   */
  async updateEnvironment(
    id: string,
    name: string,
    variables: Variable[],
    actingUserId: string,
    marker?: string | null
  ): Promise<EnvironmentRecord> {
    const trimmedName = trimRequiredName(name, 'Environment name');
    const updatedAt = new Date();
    const docRef = this.requireClient().collection(ENVIRONMENTS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Environment not found');
    }

    const existing = snapshot.data() as FirestoreEnvironmentDocument;
    const serializedMarker =
      marker !== undefined ? serializeSidebarMarker(marker) : existing.marker;
    const updated: FirestoreEnvironmentDocument = {
      ...existing,
      name: trimmedName,
      variables,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    };

    await docRef.update({
      name: trimmedName,
      variables,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    });

    await this.recordAuditEntry(actingUserId, 'update', 'environment', id);
    return mapFirestoreEnvironment(id, updated);
  }

  /**
   * Deletes an environment.
   *
   * @param id - Environment ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteEnvironment(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'environment', id);
    await this.requireClient().collection(ENVIRONMENTS_COLLECTION).doc(id).delete();
  }

  /**
   * Finds an environment by stable identifier.
   *
   * @param id - Environment ID to look up.
   */
  async findEnvironmentById(id: string): Promise<EnvironmentRecord | null> {
    const snapshot = await this.requireClient().collection(ENVIRONMENTS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreEnvironment(id, snapshot.data() as FirestoreEnvironmentDocument);
  }

  /**
   * Updates whether non-admin users may delete an environment.
   *
   * @param id - Environment ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the environment.
   * @param actingUserId - Admin user performing the update.
   */
  async setEnvironmentDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<EnvironmentRecord> {
    const docRef = this.requireClient().collection(ENVIRONMENTS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Environment not found');
    }

    const updatedAt = new Date();
    await docRef.update({
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'update', 'environment', id);

    const existing = snapshot.data() as FirestoreEnvironmentDocument;
    return mapFirestoreEnvironment(id, {
      ...existing,
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });
  }

  /**
   * Lists all snippets ordered by sort order then name.
   */
  async listSnippets(): Promise<SnippetRecord[]> {
    const snapshot = await this.requireClient().collection(SNIPPETS_COLLECTION).get();

    return snapshot.docs
      .map((doc) => mapFirestoreSnippet(doc.id, doc.data() as FirestoreSnippetDocument))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      });
  }

  /**
   * Creates a new snippet with the given fields.
   *
   * @param name - Display name for the snippet.
   * @param code - JavaScript source for the snippet.
   * @param scope - Execution scope for the snippet.
   * @param actingUserId - User performing the create action.
   */
  async createSnippet(
    name: string,
    code: string,
    scope: SnippetScope,
    actingUserId: string
  ): Promise<SnippetRecord> {
    const trimmedName = trimRequiredName(name, 'Snippet name');
    const id = randomUUID();
    const now = new Date();
    const existing = await this.listSnippets();
    const maxOrder = existing.reduce((max, snippet) => Math.max(max, snippet.sortOrder), -1);
    const data: FirestoreSnippetDocument = {
      name: trimmedName,
      code,
      scope,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId,
      deletionLocked: false
    };

    await this.requireClient().collection(SNIPPETS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'snippet', id);
    return mapFirestoreSnippet(id, data);
  }

  /**
   * Updates a snippet's name, code, and scope. Sort order is left unchanged.
   *
   * @param actingUserId - User performing the update action.
   */
  async updateSnippet(
    id: string,
    name: string,
    code: string,
    scope: SnippetScope,
    actingUserId: string
  ): Promise<SnippetRecord> {
    const trimmedName = trimRequiredName(name, 'Snippet name');
    const updatedAt = new Date();
    const docRef = this.requireClient().collection(SNIPPETS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Snippet not found');
    }

    const existing = snapshot.data() as FirestoreSnippetDocument;
    const updated: FirestoreSnippetDocument = {
      ...existing,
      name: trimmedName,
      code,
      scope,
      updatedAt,
      updatedByUserId: actingUserId
    };

    await docRef.update({
      name: trimmedName,
      code,
      scope,
      updatedAt,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'update', 'snippet', id);
    return mapFirestoreSnippet(id, updated);
  }

  /**
   * Deletes a snippet.
   *
   * @param id - Snippet ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteSnippet(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'snippet', id);
    await this.requireClient().collection(SNIPPETS_COLLECTION).doc(id).delete();
  }

  /**
   * Finds a snippet by stable identifier.
   *
   * @param id - Snippet ID to look up.
   */
  async findSnippetById(id: string): Promise<SnippetRecord | null> {
    const snapshot = await this.requireClient().collection(SNIPPETS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreSnippet(id, snapshot.data() as FirestoreSnippetDocument);
  }

  /**
   * Updates whether non-admin users may delete a snippet.
   *
   * @param id - Snippet ID to update.
   * @param deletionLocked - When true, user-role tokens cannot delete the snippet.
   * @param actingUserId - Admin user performing the update.
   */
  async setSnippetDeletionLocked(
    id: string,
    deletionLocked: boolean,
    actingUserId: string
  ): Promise<SnippetRecord> {
    const docRef = this.requireClient().collection(SNIPPETS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Snippet not found');
    }

    const updatedAt = new Date();
    await docRef.update({
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });

    await this.recordAuditEntry(actingUserId, 'update', 'snippet', id);

    const existing = snapshot.data() as FirestoreSnippetDocument;
    return mapFirestoreSnippet(id, {
      ...existing,
      deletionLocked,
      updatedAt,
      updatedByUserId: actingUserId
    });
  }

  /**
   * Lists all saved requests in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listRequests(collectionId: string): Promise<SavedRequestRecord[]> {
    const snapshot = await this.requireClient()
      .collection(REQUESTS_COLLECTION)
      .where('collectionId', '==', collectionId)
      .get();

    return snapshot.docs
      .map((doc) => mapFirestoreRequest(doc.id, doc.data() as FirestoreRequestDocument))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      });
  }

  /**
   * Finds a saved request by id.
   *
   * @param id - Request identifier to look up.
   */
  async findRequestById(id: string): Promise<SavedRequestRecord | null> {
    const snapshot = await this.requireClient().collection(REQUESTS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreRequest(id, snapshot.data() as FirestoreRequestDocument);
  }

  /**
   * Inserts a new request or updates an existing one.
   *
   * @param input - Request fields to persist.
   * @param actingUserId - User performing the save action.
   */
  async saveRequest(input: SaveRequestInput, actingUserId: string): Promise<SavedRequestRecord> {
    const trimmedName = trimRequiredName(input.name, 'Request name');
    const folderId = input.folderId ?? null;
    const serializedMarker = serializeSidebarMarker(input.marker ?? null);
    const now = new Date();
    const client = this.requireClient();

    if (folderId != null) {
      const folderSnap = await client.collection(FOLDERS_COLLECTION).doc(folderId).get();
      if (!folderSnap.exists) {
        throw new Error('Folder not found');
      }

      const folder = folderSnap.data() as FirestoreFolderDocument;
      if (folder.collectionId !== input.collectionId) {
        throw new Error('Folder not found');
      }
    }

    if (input.id) {
      const docRef = client.collection(REQUESTS_COLLECTION).doc(input.id);
      const snapshot = await docRef.get();
      if (snapshot.exists) {
        const existing = snapshot.data() as FirestoreRequestDocument;
        const updated: FirestoreRequestDocument = {
          ...existing,
          collectionId: input.collectionId,
          folderId,
          name: trimmedName,
          method: input.method,
          url: input.url,
          headers: input.headers,
          params: input.params,
          auth: input.auth,
          body: input.body,
          bodyType: input.bodyType,
          preRequestScript: input.preRequestScript,
          postRequestScript: input.postRequestScript,
          comment: input.comment,
          marker: serializedMarker,
          updatedAt: now,
          updatedByUserId: actingUserId
        };

        await docRef.update({
          collectionId: input.collectionId,
          folderId,
          name: trimmedName,
          method: input.method,
          url: input.url,
          headers: input.headers,
          params: input.params,
          auth: input.auth,
          body: input.body,
          bodyType: input.bodyType,
          preRequestScript: input.preRequestScript,
          postRequestScript: input.postRequestScript,
          comment: input.comment,
          marker: serializedMarker,
          updatedAt: now,
          updatedByUserId: actingUserId
        });

        await this.recordAuditEntry(actingUserId, 'update', 'request', input.id);
        return mapFirestoreRequest(input.id, updated);
      }
    }

    const existingRequests = await this.listRequests(input.collectionId);
    const maxOrder = existingRequests
      .filter((request) => request.folderId === folderId)
      .reduce((max, request) => Math.max(max, request.sortOrder), -1);
    const id = randomUUID();
    const data: FirestoreRequestDocument = {
      collectionId: input.collectionId,
      folderId,
      name: trimmedName,
      method: input.method,
      url: input.url,
      headers: input.headers,
      params: input.params,
      auth: input.auth,
      body: input.body,
      bodyType: input.bodyType,
      preRequestScript: input.preRequestScript,
      postRequestScript: input.postRequestScript,
      comment: input.comment,
      marker: serializedMarker,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };

    await client.collection(REQUESTS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'request', id);
    return mapFirestoreRequest(id, data);
  }

  /**
   * Deletes a saved request by ID.
   *
   * @param id - Request ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteRequest(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'request', id);
    await this.requireClient().collection(REQUESTS_COLLECTION).doc(id).delete();
  }

  /**
   * Lists all folders in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listFolders(collectionId: string): Promise<FolderRecord[]> {
    const snapshot = await this.requireClient()
      .collection(FOLDERS_COLLECTION)
      .where('collectionId', '==', collectionId)
      .get();

    return snapshot.docs
      .map((doc) => mapFirestoreFolder(doc.id, doc.data() as FirestoreFolderDocument))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      });
  }

  /**
   * Finds a folder by id.
   *
   * @param id - Folder identifier to look up.
   */
  async findFolderById(id: string): Promise<FolderRecord | null> {
    const snapshot = await this.requireClient().collection(FOLDERS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreFolder(id, snapshot.data() as FirestoreFolderDocument);
  }

  /**
   * Creates a new folder in a collection.
   *
   * @param collectionId - Collection to add the folder to.
   * @param name - Display name for the folder.
   * @param actingUserId - User performing the create action.
   */
  async createFolder(
    collectionId: string,
    name: string,
    actingUserId: string,
    parentFolderId: string | null = null
  ): Promise<FolderRecord> {
    const trimmedName = trimRequiredName(name, 'Folder name');
    if (parentFolderId != null) {
      const parent = await this.findFolderById(parentFolderId);
      if (!parent || parent.collectionId !== collectionId) {
        throw new Error('Parent folder not found in collection');
      }
    }
    const id = randomUUID();
    const now = new Date();
    const existingFolders = await this.listFolders(collectionId);
    const maxOrder = existingFolders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .reduce((max, folder) => Math.max(max, folder.sortOrder), -1);
    const data: FirestoreFolderDocument = {
      collectionId,
      parentFolderId,
      name: trimmedName,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };

    await this.requireClient().collection(FOLDERS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'folder', id);
    return mapFirestoreFolder(id, data);
  }

  /**
   * Renames a folder.
   *
   * @param id - Folder ID to rename.
   * @param name - New display name.
   * @param actingUserId - User performing the rename action.
   */
  async renameFolder(
    id: string,
    name: string,
    actingUserId: string,
    marker?: string | null
  ): Promise<FolderRecord> {
    const trimmedName = trimRequiredName(name, 'Folder name');
    const updatedAt = new Date();
    const docRef = this.requireClient().collection(FOLDERS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Folder not found');
    }

    const existing = snapshot.data() as FirestoreFolderDocument;
    const serializedMarker =
      marker !== undefined ? serializeSidebarMarker(marker) : existing.marker;
    await docRef.update({
      name: trimmedName,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    });
    await this.recordAuditEntry(actingUserId, 'update', 'folder', id);
    return mapFirestoreFolder(id, {
      ...existing,
      name: trimmedName,
      updatedAt,
      updatedByUserId: actingUserId,
      ...(marker !== undefined ? { marker: serializedMarker } : {})
    });
  }

  /**
   * Deletes a folder, its descendants, and their contents.
   *
   * @param id - Folder ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteFolder(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'folder', id);

    const client = this.requireClient();
    const root = await this.findFolderById(id);
    if (!root) {
      return;
    }
    const folders = await this.listFolders(root.collectionId);
    const descendantIds = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (
          folder.parentFolderId != null &&
          descendantIds.has(folder.parentFolderId) &&
          !descendantIds.has(folder.id)
        ) {
          descendantIds.add(folder.id);
          changed = true;
        }
      }
    }
    const ids = [...descendantIds];
    const requestSnapshots = await Promise.all(
      ids.map((folderId) =>
        client.collection(REQUESTS_COLLECTION).where('folderId', '==', folderId).get()
      )
    );
    const documentSnapshots = await Promise.all(
      ids.map((folderId) =>
        client.collection(DOCUMENTS_COLLECTION).where('folderId', '==', folderId).get()
      )
    );
    const refs = [
      ...requestSnapshots.flatMap((snapshot) => snapshot.docs.map((requestDoc) => requestDoc.ref)),
      ...documentSnapshots.flatMap((snapshot) =>
        snapshot.docs.map((documentDoc) => documentDoc.ref)
      ),
      ...ids.map((folderId) => client.collection(FOLDERS_COLLECTION).doc(folderId))
    ];

    await this.commitBatchedDeletes(refs);
  }

  /**
   * Moves a folder to a new parent and optional sibling position.
   *
   * @param id - Folder ID to move.
   * @param parentFolderId - Destination parent, or null for collection root.
   * @param sortOrder - Optional zero-based destination sibling index.
   * @param actingUserId - User performing the move action.
   */
  async moveFolder(
    id: string,
    parentFolderId: string | null,
    sortOrder: number | undefined,
    actingUserId: string
  ): Promise<FolderRecord> {
    const folder = await this.findFolderById(id);
    if (!folder) {
      throw new Error('Folder not found');
    }
    const folders = await this.listFolders(folder.collectionId);
    if (parentFolderId != null) {
      let ancestor = folders.find((entry) => entry.id === parentFolderId);
      if (!ancestor) {
        throw new Error('Parent folder not found in collection');
      }
      while (ancestor) {
        if (ancestor.id === id) {
          throw new Error('Cannot move a folder inside itself or its descendants');
        }
        ancestor =
          ancestor.parentFolderId == null
            ? undefined
            : folders.find((entry) => entry.id === ancestor?.parentFolderId);
      }
    }

    const siblings = folders
      .filter((entry) => entry.id !== id && entry.parentFolderId === parentFolderId)
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
      );
    const index = Math.max(0, Math.min(sortOrder ?? siblings.length, siblings.length));
    siblings.splice(index, 0, { ...folder, parentFolderId });
    const updatedAt = new Date();
    await this.requireClient().collection(FOLDERS_COLLECTION).doc(id).update({
      parentFolderId,
      updatedAt,
      updatedByUserId: actingUserId
    });
    await this.reorderFolders(
      folder.collectionId,
      parentFolderId,
      siblings.map((entry) => entry.id),
      actingUserId
    );
    return {
      ...folder,
      parentFolderId,
      sortOrder: index,
      updatedAt,
      updatedByUserId: actingUserId
    };
  }

  /**
   * Reorders sibling folders within a collection.
   *
   * @param collectionId - Collection containing the folders.
   * @param orderedFolderIds - Folder IDs in desired order.
   * @param actingUserId - User performing the reorder action.
   */
  async reorderFolders(
    collectionId: string,
    parentFolderId: string | null,
    orderedFolderIds: string[],
    actingUserId: string
  ): Promise<void> {
    const client = this.requireClient();
    const updatedAt = new Date();
    const batch = client.batch();

    for (let index = 0; index < orderedFolderIds.length; index++) {
      const docRef = client.collection(FOLDERS_COLLECTION).doc(orderedFolderIds[index]);
      batch.update(docRef, {
        sortOrder: index,
        collectionId,
        updatedAt,
        updatedByUserId: actingUserId
      });
    }

    await batch.commit();
    await this.recordAuditEntry(actingUserId, 'reorder', 'folder', collectionId, {
      parentFolderId,
      orderedFolderIds
    });
  }

  /**
   * Reorders requests within a folder or at collection root.
   *
   * @param actingUserId - User performing the reorder action.
   */
  async reorderRequests(
    collectionId: string,
    folderId: string | null,
    orderedRequestIds: string[],
    actingUserId: string
  ): Promise<void> {
    const client = this.requireClient();
    const updatedAt = new Date();
    const batch = client.batch();

    for (let index = 0; index < orderedRequestIds.length; index++) {
      const docRef = client.collection(REQUESTS_COLLECTION).doc(orderedRequestIds[index]);
      batch.update(docRef, {
        sortOrder: index,
        folderId,
        collectionId,
        updatedAt,
        updatedByUserId: actingUserId
      });
    }

    await batch.commit();
    await this.recordAuditEntry(actingUserId, 'reorder', 'request', collectionId, {
      folderId,
      orderedRequestIds
    });
  }

  /**
   * Moves a request to another folder or collection root at a given index.
   *
   * @param actingUserId - User performing the move action.
   */
  async moveRequest(
    requestId: string,
    folderId: string | null,
    index: number,
    actingUserId: string
  ): Promise<void> {
    const client = this.requireClient();
    const updatedAt = new Date();
    const requestSnap = await client.collection(REQUESTS_COLLECTION).doc(requestId).get();
    if (!requestSnap.exists) {
      throw new Error('Request not found');
    }

    const request = mapFirestoreRequest(
      requestSnap.id,
      requestSnap.data() as FirestoreRequestDocument
    );
    const collectionId = request.collectionId;
    const oldFolderId = request.folderId;

    if (folderId != null) {
      const folderSnap = await client.collection(FOLDERS_COLLECTION).doc(folderId).get();
      if (!folderSnap.exists) {
        throw new Error('Folder not found');
      }

      const folder = folderSnap.data() as FirestoreFolderDocument;
      if (folder.collectionId !== collectionId) {
        throw new Error('Folder not found');
      }
    }

    /**
     * Lists request ids in a container ordered for reindexing.
     *
     * @param targetFolderId - Folder id or null for collection root.
     */
    const listInContainer = async (targetFolderId: string | null): Promise<string[]> => {
      const requests = await this.listRequests(collectionId);
      return requests
        .filter((item) => item.folderId === targetFolderId)
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return left.name.localeCompare(right.name);
        })
        .map((item) => item.id);
    };

    /**
     * Rewrites sort_order and folder_id for a container's request list.
     *
     * @param targetFolderId - Folder id or null for collection root.
     * @param orderedIds - Request ids in desired order.
     */
    const reindexContainer = async (
      targetFolderId: string | null,
      orderedIds: string[]
    ): Promise<void> => {
      const batch = client.batch();
      for (let sortIndex = 0; sortIndex < orderedIds.length; sortIndex++) {
        const docRef = client.collection(REQUESTS_COLLECTION).doc(orderedIds[sortIndex]);
        batch.update(docRef, {
          sortOrder: sortIndex,
          folderId: targetFolderId,
          updatedAt,
          updatedByUserId: actingUserId
        });
      }
      await batch.commit();
    };

    if (oldFolderId === folderId) {
      const siblings = (await listInContainer(folderId)).filter((id) => id !== requestId);
      siblings.splice(index, 0, requestId);
      await reindexContainer(folderId, siblings);
      await this.recordAuditEntry(actingUserId, 'move', 'request', requestId, {
        folderId,
        index
      });
      return;
    }

    const oldIds = (await listInContainer(oldFolderId)).filter((id) => id !== requestId);
    await reindexContainer(oldFolderId, oldIds);

    const newIds = (await listInContainer(folderId)).filter((id) => id !== requestId);
    newIds.splice(index, 0, requestId);
    await reindexContainer(folderId, newIds);

    await this.recordAuditEntry(actingUserId, 'move', 'request', requestId, {
      folderId,
      index
    });
  }

  /**
   * Lists all documents in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listDocuments(collectionId: string): Promise<DocumentRecord[]> {
    const snapshot = await this.requireClient()
      .collection(DOCUMENTS_COLLECTION)
      .where('collectionId', '==', collectionId)
      .get();

    return snapshot.docs
      .map((doc) => mapFirestoreDocument(doc.id, doc.data() as FirestoreDocumentDocument))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      });
  }

  /**
   * Finds a document by id.
   *
   * @param id - Document identifier to look up.
   */
  async findDocumentById(id: string): Promise<DocumentRecord | null> {
    const snapshot = await this.requireClient().collection(DOCUMENTS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreDocument(id, snapshot.data() as FirestoreDocumentDocument);
  }

  /**
   * Inserts a new document or updates an existing one.
   *
   * @param input - Document fields to persist.
   * @param actingUserId - User performing the save action.
   */
  async saveDocument(input: SaveDocumentInput, actingUserId: string): Promise<DocumentRecord> {
    const trimmedName = trimRequiredName(input.name, 'Document name');
    const folderId = input.folderId ?? null;
    const serializedMarker = serializeSidebarMarker(input.marker ?? null);
    const now = new Date();
    const client = this.requireClient();

    if (folderId != null) {
      const folderSnap = await client.collection(FOLDERS_COLLECTION).doc(folderId).get();
      if (!folderSnap.exists) {
        throw new Error('Folder not found');
      }

      const folder = folderSnap.data() as FirestoreFolderDocument;
      if (folder.collectionId !== input.collectionId) {
        throw new Error('Folder not found');
      }
    }

    if (input.id) {
      const docRef = client.collection(DOCUMENTS_COLLECTION).doc(input.id);
      const snapshot = await docRef.get();
      if (snapshot.exists) {
        const existing = snapshot.data() as FirestoreDocumentDocument;
        const updated: FirestoreDocumentDocument = {
          ...existing,
          collectionId: input.collectionId,
          folderId,
          name: trimmedName,
          content: input.content,
          marker: serializedMarker,
          updatedAt: now,
          updatedByUserId: actingUserId
        };

        await docRef.update({
          collectionId: input.collectionId,
          folderId,
          name: trimmedName,
          content: input.content,
          marker: serializedMarker,
          updatedAt: now,
          updatedByUserId: actingUserId
        });

        await this.recordAuditEntry(actingUserId, 'update', 'document', input.id);
        return mapFirestoreDocument(input.id, updated);
      }
    }

    const existingDocuments = await this.listDocuments(input.collectionId);
    const maxOrder = existingDocuments
      .filter((document) => document.folderId === folderId)
      .reduce((max, document) => Math.max(max, document.sortOrder), -1);
    const id = randomUUID();
    const data: FirestoreDocumentDocument = {
      collectionId: input.collectionId,
      folderId,
      name: trimmedName,
      content: input.content,
      marker: serializedMarker,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actingUserId,
      updatedByUserId: actingUserId
    };

    await client.collection(DOCUMENTS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'document', id);
    return mapFirestoreDocument(id, data);
  }

  /**
   * Deletes a document by ID.
   *
   * @param id - Document ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteDocument(id: string, actingUserId: string): Promise<void> {
    await this.recordAuditEntry(actingUserId, 'delete', 'document', id);
    await this.requireClient().collection(DOCUMENTS_COLLECTION).doc(id).delete();
  }

  /**
   * Reorders documents within a folder or at collection root.
   *
   * @param actingUserId - User performing the reorder action.
   */
  async reorderDocuments(
    collectionId: string,
    folderId: string | null,
    orderedDocumentIds: string[],
    actingUserId: string
  ): Promise<void> {
    const client = this.requireClient();
    const updatedAt = new Date();
    const batch = client.batch();

    for (let index = 0; index < orderedDocumentIds.length; index++) {
      const docRef = client.collection(DOCUMENTS_COLLECTION).doc(orderedDocumentIds[index]);
      batch.update(docRef, {
        sortOrder: index,
        folderId,
        collectionId,
        updatedAt,
        updatedByUserId: actingUserId
      });
    }

    await batch.commit();
    await this.recordAuditEntry(actingUserId, 'reorder', 'document', collectionId, {
      folderId,
      orderedDocumentIds
    });
  }

  /**
   * Moves a document to another folder or collection root at a given index.
   *
   * @param actingUserId - User performing the move action.
   */
  async moveDocument(
    documentId: string,
    folderId: string | null,
    index: number,
    actingUserId: string
  ): Promise<void> {
    const client = this.requireClient();
    const updatedAt = new Date();
    const documentSnap = await client.collection(DOCUMENTS_COLLECTION).doc(documentId).get();
    if (!documentSnap.exists) {
      throw new Error('Document not found');
    }

    const document = mapFirestoreDocument(
      documentSnap.id,
      documentSnap.data() as FirestoreDocumentDocument
    );
    const collectionId = document.collectionId;
    const oldFolderId = document.folderId;

    if (folderId != null) {
      const folderSnap = await client.collection(FOLDERS_COLLECTION).doc(folderId).get();
      if (!folderSnap.exists) {
        throw new Error('Folder not found');
      }

      const folder = folderSnap.data() as FirestoreFolderDocument;
      if (folder.collectionId !== collectionId) {
        throw new Error('Folder not found');
      }
    }

    /**
     * Lists document ids in a container ordered for reindexing.
     *
     * @param targetFolderId - Folder id or null for collection root.
     */
    const listInContainer = async (targetFolderId: string | null): Promise<string[]> => {
      const documents = await this.listDocuments(collectionId);
      return documents
        .filter((item) => item.folderId === targetFolderId)
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return left.name.localeCompare(right.name);
        })
        .map((item) => item.id);
    };

    /**
     * Rewrites sort_order and folder_id for a container's document list.
     *
     * @param targetFolderId - Folder id or null for collection root.
     * @param orderedIds - Document ids in desired order.
     */
    const reindexContainer = async (
      targetFolderId: string | null,
      orderedIds: string[]
    ): Promise<void> => {
      const batch = client.batch();
      for (let sortIndex = 0; sortIndex < orderedIds.length; sortIndex++) {
        const docRef = client.collection(DOCUMENTS_COLLECTION).doc(orderedIds[sortIndex]);
        batch.update(docRef, {
          sortOrder: sortIndex,
          folderId: targetFolderId,
          updatedAt,
          updatedByUserId: actingUserId
        });
      }
      await batch.commit();
    };

    if (oldFolderId === folderId) {
      const siblings = (await listInContainer(folderId)).filter((id) => id !== documentId);
      siblings.splice(index, 0, documentId);
      await reindexContainer(folderId, siblings);
      await this.recordAuditEntry(actingUserId, 'move', 'document', documentId, {
        folderId,
        index
      });
      return;
    }

    const oldIds = (await listInContainer(oldFolderId)).filter((id) => id !== documentId);
    await reindexContainer(oldFolderId, oldIds);

    const newIds = (await listInContainer(folderId)).filter((id) => id !== documentId);
    newIds.splice(index, 0, documentId);
    await reindexContainer(folderId, newIds);

    await this.recordAuditEntry(actingUserId, 'move', 'document', documentId, {
      folderId,
      index
    });
  }

  /**
   * Returns monthly LLM usage for a user, or null when no usage has been recorded.
   *
   * @param userId - Owning user identifier.
   * @param period - UTC calendar month key (`YYYY-MM`).
   */
  async getLlmUsage(userId: string, period: string): Promise<LlmUsageRecord | null> {
    const docId = `${userId}_${period}`;
    const snapshot = await this.requireClient().collection(LLM_USAGE_COLLECTION).doc(docId).get();

    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreLlmUsage(docId, snapshot.data() as FirestoreLlmUsageDocument);
  }

  /**
   * Atomically increments monthly LLM token usage for a user.
   *
   * @param userId - Owning user identifier.
   * @param period - UTC calendar month key (`YYYY-MM`).
   * @param promptTokens - Prompt tokens to add.
   * @param completionTokens - Completion tokens to add.
   */
  async addLlmUsage(
    userId: string,
    period: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<LlmUsageRecord> {
    const docId = `${userId}_${period}`;
    const docRef = this.requireClient().collection(LLM_USAGE_COLLECTION).doc(docId);
    const now = new Date();
    const totalDelta = promptTokens + completionTokens;

    await this.requireClient().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) {
        const data: FirestoreLlmUsageDocument = {
          userId,
          period,
          promptTokens,
          completionTokens,
          totalTokens: totalDelta,
          updatedAt: now
        };
        transaction.set(docRef, data);
        return;
      }

      const existing = snapshot.data() as FirestoreLlmUsageDocument;
      transaction.update(docRef, {
        promptTokens: existing.promptTokens + promptTokens,
        completionTokens: existing.completionTokens + completionTokens,
        totalTokens: existing.totalTokens + totalDelta,
        updatedAt: now
      });
    });

    const usage = await this.getLlmUsage(userId, period);
    if (!usage) {
      throw new Error('LLM usage not found after upsert');
    }

    return usage;
  }

  /**
   * Lists run results saved by the given user, newest first.
   *
   * @param userId - Owning user identifier.
   */
  async listRunResultsForUser(userId: string): Promise<RunResultRecord[]> {
    const snapshot = await this.requireClient()
      .collection(RUN_RESULTS_COLLECTION)
      .where('createdByUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreRunResult(doc.id, doc.data() as FirestoreRunResultDocument)
    );
  }

  /**
   * Lists all run results for admin inspection, newest first.
   */
  async listAllRunResults(): Promise<RunResultRecord[]> {
    const snapshot = await this.requireClient()
      .collection(RUN_RESULTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreRunResult(doc.id, doc.data() as FirestoreRunResultDocument)
    );
  }

  /**
   * Creates a standalone run result snapshot.
   *
   * @param input - HarborClient export payload and optional label.
   * @param actingUserId - User performing the create action.
   */
  async createRunResult(
    input: CreateRunResultInput,
    actingUserId: string
  ): Promise<RunResultRecord> {
    const metadata = parseRunResultPayload(input.payload);
    const label = input.label?.trim() || buildDefaultRunResultLabel(metadata);
    const id = randomUUID();
    const now = new Date();
    const data: FirestoreRunResultDocument = {
      kind: metadata.kind,
      label,
      collectionName: metadata.collectionName,
      requestName: metadata.requestName,
      summary: metadata.summary,
      payload: input.payload,
      createdAt: now,
      createdByUserId: actingUserId
    };

    await this.requireClient().collection(RUN_RESULTS_COLLECTION).doc(id).set(data);
    await this.recordAuditEntry(actingUserId, 'create', 'run_result', id);
    return mapFirestoreRunResult(id, data);
  }

  /**
   * Finds a run result by stable identifier.
   *
   * @param id - Run result ID to look up.
   */
  async findRunResultById(id: string): Promise<RunResultRecord | null> {
    const snapshot = await this.requireClient().collection(RUN_RESULTS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapFirestoreRunResult(id, snapshot.data() as FirestoreRunResultDocument);
  }

  /**
   * Deletes a run result.
   *
   * @param id - Run result ID to delete.
   * @param actingUserId - User performing the delete action.
   */
  async deleteRunResult(id: string, actingUserId: string): Promise<void> {
    const docRef = this.requireClient().collection(RUN_RESULTS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error('Run result not found');
    }

    await this.recordAuditEntry(actingUserId, 'delete', 'run_result', id);
    await docRef.delete();
  }

  /**
   * Inserts a per-request LLM usage log entry.
   *
   * @param input - Usage details for one successful completion step.
   */
  async createLlmUsageLog(input: CreateLlmUsageLogInput): Promise<LlmUsageLogRecord> {
    const id = randomUUID();
    const now = new Date();
    const data: FirestoreLlmUsageLogDocument = {
      userId: input.userId,
      apiTokenId: input.apiTokenId,
      period: input.period,
      model: input.model,
      provider: input.provider,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      isNewTurn: input.isNewTurn,
      hadToolCalls: input.hadToolCalls,
      messageCount: input.messageCount,
      createdAt: now
    };

    await this.requireClient().collection(LLM_USAGE_LOG_COLLECTION).doc(id).set(data);

    return mapFirestoreLlmUsageLog(id, data);
  }

  /**
   * Lists all per-request LLM usage log entries, newest first.
   */
  async listLlmUsageLogs(): Promise<LlmUsageLogRecord[]> {
    const snapshot = await this.requireClient()
      .collection(LLM_USAGE_LOG_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) =>
      mapFirestoreLlmUsageLog(doc.id, doc.data() as FirestoreLlmUsageLogDocument)
    );
  }

  /**
   * Commits document deletes in Firestore-sized batches.
   *
   * @param refs - Document refs to delete.
   */
  private async commitBatchedDeletes(refs: DocumentReference[]): Promise<void> {
    const client = this.requireClient();

    for (let offset = 0; offset < refs.length; offset += WRITE_BATCH_LIMIT) {
      const batch = client.batch();
      for (const ref of refs.slice(offset, offset + WRITE_BATCH_LIMIT)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  }

  /**
   * Ensures the internal system user exists and caches its identifier.
   *
   * Inserts directly rather than calling {@link createUser} to avoid recursion
   * during migration bootstrap.
   */
  async ensureSystemUser(): Promise<void> {
    const existing = await this.findUserByName(SYSTEM_USER_NAME);
    if (existing) {
      this.systemUserId = existing.id;
      return;
    }

    const input = createSystemUserInput();
    const id = randomUUID();
    const now = new Date();
    const trimmedName = trimRequiredName(input.name, 'User name');
    const data: FirestoreUserDocument = {
      name: trimmedName,
      role: input.role,
      collectionAccess: input.collectionAccess,
      environmentAccess: input.environmentAccess,
      snippetAccess: input.snippetAccess,
      llmAccess: false,
      llmModels: [],
      llmMonthlyTokenLimit: null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: id,
      updatedByUserId: id
    };

    await this.requireClient().collection(USERS_COLLECTION).doc(id).set(data);
    this.systemUserId = id;
  }

  /**
   * Persists a single audit log entry for a mutating action.
   *
   * @param actingUserId - User performing the action.
   * @param action - CRUD or structural action performed.
   * @param entityType - Kind of entity affected.
   * @param entityId - Identifier of the affected entity.
   * @param metadata - Optional structured context for the action.
   */
  private async recordAuditEntry(
    actingUserId: string,
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: string,
    metadata?: Record<string, unknown> | null
  ): Promise<void> {
    const userName = await resolveActingUserName(
      (userId) => this.findUserById(userId),
      actingUserId
    );
    const id = randomUUID();
    const now = new Date();
    const data: FirestoreAuditLogDocument = {
      userId: actingUserId,
      userName,
      action,
      entityType,
      entityId,
      createdAt: now,
      metadata: metadata ?? null
    };

    await this.requireClient().collection(AUDIT_LOG_COLLECTION).doc(id).set(data);
  }

  /**
   * Returns the active Firestore client or throws when connect has not been called.
   *
   * @returns Connected Firestore client.
   * @throws {Error} When the database is not connected.
   */
  private requireClient(): Firestore {
    if (!this.client) {
      throw new Error('Firestore database is not connected.');
    }

    return this.client;
  }
}
