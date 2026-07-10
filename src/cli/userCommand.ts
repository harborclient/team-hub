import { Command, InvalidArgumentError } from 'commander';
import { randomUUID } from 'node:crypto';
import { mergeGlobalOptions } from '#/cli/globalOptions.js';
import { loadServerConfig } from '#/config/serverConfig.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import { createDatabase } from '#/db/index.js';
import type { ApiTokenRecord, UpdateUserInput, UserRole } from '#/db/types.js';
import { generateApiToken } from '#/server/auth/apiTokens.js';
import { generateInvitation, resolveInvitationExpiresAt } from '#/server/auth/invitations.js';
import { getInvitationStatus } from '#/db/invitationRows.js';
import {
  buildAccessCatalogIds,
  buildAccessListWarnings,
  normalizeAccessForRole,
  normalizeLlmForRole,
  ValidationError,
  validateSubmittedAccessLists
} from '#/server/admin/userValidation.js';
import { currentUsagePeriod, listHubOfferedModels } from '#/server/llm/models.js';
import type { IDatabase } from '#/db/IDatabase.js';

/**
 * Ensures schema migrations ran and returns the internal system user id for CLI actions.
 *
 * @param db - Connected database instance.
 * @returns Stable system user identifier.
 * @throws {Error} When the system user cannot be provisioned.
 */
async function requireSystemUserId(db: IDatabase): Promise<string> {
  await db.migrate();
  const systemUserId = db.getSystemUserId();
  if (!systemUserId) {
    throw new Error('System user is not provisioned.');
  }

  return systemUserId;
}

export interface UserCommandOptions {
  /**
   * Path to the server YAML config file (from global `-c` / `--config`).
   */
  config: string;
}

export interface UserCreateCommandOptions extends UserCommandOptions {
  /**
   * Unique display name for the new user account.
   */
  name: string;

  /**
   * Role assigned to the new account.
   */
  role: UserRole;

  /**
   * Collection ids or `*` granting collection access.
   */
  collectionAccess: string[];

  /**
   * Environment ids or `*` granting environment access.
   */
  environmentAccess: string[];

  /**
   * Snippet ids or `*` granting snippet access.
   */
  snippetAccess: string[];

  /**
   * Whether the user may use hub-proxied LLM routes.
   */
  llmAccess?: boolean;

  /**
   * LLM model ids or `*` granting model access.
   */
  llmModels?: string[];

  /**
   * Monthly LLM token limit, or undefined for unlimited.
   */
  llmMonthlyTokens?: number;
}

export interface UserUpdateCommandOptions extends UserCommandOptions {
  /**
   * Identifier of the user to update.
   */
  id: string;

  /**
   * New display name, when changing the account label.
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
   * Replacement monthly LLM token limit.
   */
  llmMonthlyTokens?: number;
}

export interface UserTokenCreateCommandOptions extends UserCommandOptions {
  /**
   * Owning user identifier.
   */
  user: string;

  /**
   * Human-readable label for the new token.
   */
  name: string;
}

export interface UserTokenListCommandOptions extends UserCommandOptions {
  /**
   * Optional user identifier limiting token output.
   */
  user?: string;
}

export interface UserTokenRevokeCommandOptions extends UserCommandOptions {
  /**
   * Identifier of the token to revoke.
   */
  id: string;
}

/**
 * Formats a nullable date for CLI output.
 *
 * @param value - Date to format, or null when unset.
 * @returns ISO string or a dash placeholder.
 */
function formatOptionalDate(value: Date | null): string {
  return value ? value.toISOString() : '-';
}

/**
 * Formats an access list for CLI output.
 *
 * @param access - Collection or environment access ids.
 * @returns Comma-separated list or a dash when empty.
 */
function formatAccessList(access: string[]): string {
  return access.length > 0 ? access.join(', ') : '-';
}

/**
 * Parses and validates a user or token name from CLI input.
 *
 * @param value - Name string from a Commander option or argument.
 * @returns Trimmed non-empty name.
 * @throws {InvalidArgumentError} When the name is empty after trimming.
 */
function parseRequiredName(value: string): string {
  const name = value.trim();
  if (!name) {
    throw new InvalidArgumentError('Name must not be empty.');
  }

  return name;
}

/**
 * Parses a user role from CLI input.
 *
 * @param value - Role string from a Commander option.
 * @returns Validated user role.
 * @throws {InvalidArgumentError} When the role is not supported.
 */
function parseUserRole(value: string): UserRole {
  const role = value.trim();
  if (role === 'admin' || role === 'user') {
    return role;
  }

  throw new InvalidArgumentError('Role must be "admin" or "user".');
}

/**
 * Parses repeated access flags into a normalized access list.
 *
 * @param _value - Current flag value (unused; Commander passes prior values).
 * @param previous - Accumulated values from earlier `--flag` occurrences.
 * @returns Updated access list including the latest parsed entry.
 * @throws {InvalidArgumentError} When wildcard access is combined with ids.
 */
function parseAccessFlag(_value: string, previous: string[]): string[] {
  const entry = _value.trim();
  if (!entry) {
    throw new InvalidArgumentError('Access entries must not be empty.');
  }

  const next = [...previous, entry];
  if (next.includes('*') && next.length > 1) {
    throw new InvalidArgumentError('Wildcard access "*" must be the only entry.');
  }

  return next;
}

/**
 * Reads LLM model access ids from parsed Commander create/update options.
 *
 * Commander maps `--llm-model` to the `llmModel` property rather than `llmModels`.
 *
 * @param options - Parsed options that may include either property name.
 */
function readLlmModelsOption(options: { llmModels?: string[]; llmModel?: string[] }): string[] {
  return options.llmModels ?? options.llmModel ?? [];
}

/**
 * Parses a positive integer token limit from CLI input.
 *
 * @param value - Token limit string from a Commander option.
 * @returns Parsed positive integer limit.
 * @throws {InvalidArgumentError} When the value is not a positive integer.
 */
function parseMonthlyTokenLimit(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('Monthly token limit must be a positive integer.');
  }

  return parsed;
}

/**
 * Parses a positive integer from CLI input.
 *
 * @param value - Integer string from a Commander option.
 * @returns Parsed positive integer.
 * @throws {InvalidArgumentError} When the value is not a positive integer.
 */
function parsePositiveInt(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('Value must be a positive integer.');
  }

  return parsed;
}

/**
 * Optional monthly LLM usage fields for CLI user listings.
 */
interface UserDisplayUsage {
  /**
   * UTC calendar month key (`YYYY-MM`) for the usage total.
   */
  llmUsagePeriod: string;

  /**
   * Total tokens consumed during {@link UserDisplayUsage.llmUsagePeriod}.
   */
  llmTokensUsed: number;
}

/**
 * Prints a user record for CLI listings.
 *
 * @param user - User record to display.
 * @param usage - Current-month LLM usage when listing or showing users.
 */
function printUser(
  user: {
    id: string;
    name: string;
    role: UserRole;
    collectionAccess: string[];
    environmentAccess: string[];
    snippetAccess: string[];
    llmAccess: boolean;
    llmModels: string[];
    llmMonthlyTokenLimit: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  usage?: UserDisplayUsage
): void {
  console.log(`- id: ${user.id}`);
  console.log(`  name: ${user.name}`);
  console.log(`  role: ${user.role}`);
  console.log(`  collection access: ${formatAccessList(user.collectionAccess)}`);
  console.log(`  environment access: ${formatAccessList(user.environmentAccess)}`);
  console.log(`  snippet access: ${formatAccessList(user.snippetAccess)}`);
  console.log(`  llm access: ${user.llmAccess ? 'enabled' : 'disabled'}`);
  console.log(`  llm models: ${formatAccessList(user.llmModels)}`);
  console.log(
    `  llm monthly tokens: ${user.llmMonthlyTokenLimit != null ? user.llmMonthlyTokenLimit : 'unlimited'}`
  );
  if (usage) {
    console.log(`  llm tokens used (${usage.llmUsagePeriod}): ${usage.llmTokensUsed}`);
  }
  console.log(`  created: ${user.createdAt.toISOString()}`);
  console.log(`  updated: ${user.updatedAt.toISOString()}`);
}

/**
 * Prints a newly created API token and its one-time secret for CLI output.
 *
 * @param user - Owning user account.
 * @param record - Persisted token metadata (hash only).
 * @param secret - Plaintext bearer token shown once at creation.
 */
function printCreatedApiToken(
  user: { name: string },
  record: ApiTokenRecord,
  secret: string
): void {
  console.log(`Created API token "${record.name}" (${record.id}) for user "${user.name}".`);
  console.log(`Token prefix: ${record.tokenPrefix}`);
  console.log('');
  console.log('Store this token now; it will not be shown again:');
  console.log(secret);
}

/**
 * Loads hub resource catalogs used to validate and warn on access lists.
 *
 * @param db - Connected database instance.
 * @param llm - Normalized LLM config from server.yaml, or null when unset.
 * @returns Known collection, environment, and LLM model ids.
 */
async function loadAccessCatalogs(db: IDatabase, llm: LlmConfig | null) {
  const [collections, environments, snippets] = await Promise.all([
    db.listCollections(),
    db.listEnvironments(),
    db.listSnippets()
  ]);

  return buildAccessCatalogIds(
    collections,
    environments,
    snippets,
    llm ? listHubOfferedModels(llm).map((model) => model.id) : null
  );
}

/**
 * Runs a validation helper and maps {@link ValidationError} to Commander errors.
 *
 * @param fn - Validation or normalization function from the server admin module.
 * @returns The value returned by {@link fn}.
 * @throws {InvalidArgumentError} When {@link fn} throws {@link ValidationError}.
 */
function mapValidationError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new InvalidArgumentError(error.message);
    }

    throw error;
  }
}

/**
 * Validates submitted access lists and maps server validation errors to CLI errors.
 *
 * @param submitted - Access fields provided on the CLI command.
 * @param catalogs - Known collection, environment, and LLM model ids.
 * @throws {InvalidArgumentError} When a submitted list references unknown ids.
 */
function validateSubmittedAccessListsOrThrow(
  submitted: Parameters<typeof validateSubmittedAccessLists>[0],
  catalogs: Parameters<typeof validateSubmittedAccessLists>[1]
): void {
  mapValidationError(() => validateSubmittedAccessLists(submitted, catalogs));
}

/**
 * Prints stale access list warnings to stderr without changing stdout listings.
 *
 * @param warnings - Human-readable warnings for unknown access ids.
 */
function printAccessListWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

/**
 * Creates a new user account.
 *
 * @param options - Parsed user create options.
 */
export async function userCreateCommand(options: UserCreateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);
  const access = mapValidationError(() =>
    normalizeAccessForRole(
      options.role,
      options.collectionAccess,
      options.environmentAccess,
      options.snippetAccess
    )
  );

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const catalogs = await loadAccessCatalogs(db, config.llm);
  const llmModels = readLlmModelsOption(options);
  const llm = mapValidationError(() =>
    normalizeLlmForRole(options.role, options.llmAccess ?? false, llmModels)
  );
  validateSubmittedAccessListsOrThrow(
    {
      role: options.role,
      collectionAccess: access.collectionAccess,
      environmentAccess: access.environmentAccess,
      snippetAccess: access.snippetAccess,
      llmModels
    },
    catalogs
  );

  const user = await db.createUser(
    {
      name: options.name,
      role: options.role,
      collectionAccess: access.collectionAccess ?? [],
      environmentAccess: access.environmentAccess ?? [],
      snippetAccess: access.snippetAccess ?? [],
      llmAccess: llm.llmAccess,
      llmModels: llm.llmModels,
      llmMonthlyTokenLimit: options.llmMonthlyTokens ?? null
    },
    actingUserId
  );
  const { record, secret } = generateApiToken(user.id, user.name);
  await db.createApiToken(record, actingUserId);
  await db.disconnect();

  console.log(`Created user "${user.name}" (${user.id}) with role ${user.role}.`);
  printUser(user);
  console.log('');
  printCreatedApiToken(user, record, secret);
}

export interface UserInviteCreateCommandOptions extends UserCreateCommandOptions {
  /**
   * Optional invitation lifetime in hours; defaults to 24 when omitted.
   */
  expiresInHours?: number;
}

export interface UserInviteRevokeCommandOptions extends UserCommandOptions {
  /**
   * Invitation identifier to revoke.
   */
  id: string;
}

/**
 * Prints a newly created invitation and its one-time secret for CLI output.
 *
 * @param user - Invited user account.
 * @param invitation - Persisted invitation metadata.
 * @param secret - Plaintext invitation secret shown once at creation.
 */
function printCreatedInvitation(
  user: { name: string; id: string },
  invitation: { id: string; codePrefix: string; expiresAt: Date },
  secret: string
): void {
  console.log(`Created invitation (${invitation.id}) for user "${user.name}" (${user.id}).`);
  console.log(`Invitation prefix: ${invitation.codePrefix}`);
  console.log(`Expires: ${invitation.expiresAt.toISOString()}`);
  console.log('');
  console.log('Store this invitation secret now; it will not be shown again:');
  console.log(secret);
}

/**
 * Creates a new user account with an onboarding invitation instead of an API token.
 *
 * @param options - Parsed invite create options.
 */
export async function userInviteCreateCommand(
  options: UserInviteCreateCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);
  const access = mapValidationError(() =>
    normalizeAccessForRole(
      options.role,
      options.collectionAccess,
      options.environmentAccess,
      options.snippetAccess
    )
  );

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const catalogs = await loadAccessCatalogs(db, config.llm);
  const llmModels = readLlmModelsOption(options);
  const llm = mapValidationError(() =>
    normalizeLlmForRole(options.role, options.llmAccess ?? false, llmModels)
  );
  validateSubmittedAccessListsOrThrow(
    {
      role: options.role,
      collectionAccess: access.collectionAccess,
      environmentAccess: access.environmentAccess,
      snippetAccess: access.snippetAccess,
      llmModels
    },
    catalogs
  );

  const userId = randomUUID();
  const expiresAt = resolveInvitationExpiresAt(options.expiresInHours);
  const { record: invitation, secret } = generateInvitation(userId, actingUserId, expiresAt);
  const created = await db.createInvitedUser(
    userId,
    {
      name: options.name,
      role: options.role,
      collectionAccess: access.collectionAccess ?? [],
      environmentAccess: access.environmentAccess ?? [],
      snippetAccess: access.snippetAccess ?? [],
      llmAccess: llm.llmAccess,
      llmModels: llm.llmModels,
      llmMonthlyTokenLimit: options.llmMonthlyTokens ?? null
    },
    invitation,
    actingUserId
  );
  await db.disconnect();

  console.log(
    `Created invited user "${created.user.name}" (${created.user.id}) with role ${created.user.role}.`
  );
  printUser(created.user);
  console.log('');
  printCreatedInvitation(created.user, created.invitation, secret);
}

/**
 * Lists stored onboarding invitations.
 *
 * @param options - Parsed user command options including config path.
 */
export async function userInviteListCommand(options: UserCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const [invitations, users] = await Promise.all([db.listInvitations(), db.listUsers()]);
  await db.disconnect();

  if (invitations.length === 0) {
    console.log('No invitations found.');
    return;
  }

  const usersById = new Map(users.map((user) => [user.id, user.name]));

  for (const invitation of invitations) {
    const userName = usersById.get(invitation.userId) ?? invitation.userId;
    console.log(
      `${invitation.id}  ${userName}  ${invitation.codePrefix}  ${getInvitationStatus(invitation)}`
    );
    console.log(`  expires: ${invitation.expiresAt.toISOString()}`);
  }
}

/**
 * Revokes a pending onboarding invitation by id.
 *
 * @param options - Parsed invite revoke options including invitation id.
 */
export async function userInviteRevokeCommand(
  options: UserInviteRevokeCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const revoked = await db.revokeInvitation(options.id, actingUserId);
  await db.disconnect();

  if (revoked) {
    console.log(`Revoked invitation ${options.id}.`);
    return;
  }

  console.log(`No pending invitation found with id ${options.id}.`);
}

/**
 * Lists stored user accounts.
 *
 * @param options - Parsed user list options including config path.
 */
export async function userListCommand(options: UserCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const [users, catalogs] = await Promise.all([db.listUsers(), loadAccessCatalogs(db, config.llm)]);
  const period = currentUsagePeriod();
  const tokensUsedByUser = await Promise.all(
    users.map(async (user) => {
      const usage = await db.getLlmUsage(user.id, period);
      return usage?.totalTokens ?? 0;
    })
  );
  await db.disconnect();

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  for (const [index, user] of users.entries()) {
    printAccessListWarnings(
      buildAccessListWarnings(
        {
          collectionAccess: user.collectionAccess,
          environmentAccess: user.environmentAccess,
          snippetAccess: user.snippetAccess,
          llmModels: user.llmModels
        },
        catalogs
      )
    );
    printUser(user, { llmUsagePeriod: period, llmTokensUsed: tokensUsedByUser[index] ?? 0 });
  }
}

/**
 * Shows a single user account by id.
 *
 * @param options - Parsed user show options including user id.
 */
export async function userShowCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const [user, catalogs] = await Promise.all([
    db.findUserById(options.id),
    loadAccessCatalogs(db, config.llm)
  ]);

  if (!user) {
    await db.disconnect();
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  const period = currentUsagePeriod();
  const usage = await db.getLlmUsage(user.id, period);
  await db.disconnect();

  printAccessListWarnings(
    buildAccessListWarnings(
      {
        collectionAccess: user.collectionAccess,
        environmentAccess: user.environmentAccess,
        snippetAccess: user.snippetAccess,
        llmModels: user.llmModels
      },
      catalogs
    )
  );
  printUser(user, { llmUsagePeriod: period, llmTokensUsed: usage?.totalTokens ?? 0 });
}

/**
 * Updates an existing user account.
 *
 * @param options - Parsed user update options.
 */
export async function userUpdateCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const existing = await db.findUserById(options.id);
  if (!existing) {
    await db.disconnect();
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  const role = options.role ?? existing.role;
  const collectionAccess =
    options.collectionAccess ?? (options.role === 'admin' ? [] : existing.collectionAccess);
  const environmentAccess =
    options.environmentAccess ?? (options.role === 'admin' ? [] : existing.environmentAccess);
  const snippetAccess =
    options.snippetAccess ?? (options.role === 'admin' ? [] : existing.snippetAccess);
  const access = mapValidationError(() =>
    normalizeAccessForRole(role, collectionAccess, environmentAccess, snippetAccess)
  );
  const llmAccess = role === 'admin' ? false : (options.llmAccess ?? existing.llmAccess);
  const llmModels = role === 'admin' ? [] : (options.llmModels ?? existing.llmModels);
  const llm = mapValidationError(() => normalizeLlmForRole(role, llmAccess, llmModels));
  const catalogs = await loadAccessCatalogs(db, config.llm);
  validateSubmittedAccessListsOrThrow(
    {
      role,
      collectionAccess: options.collectionAccess,
      environmentAccess: options.environmentAccess,
      snippetAccess: options.snippetAccess,
      llmModels: options.llmModels
    },
    catalogs
  );

  const input: UpdateUserInput = {
    name: options.name,
    role: options.role,
    collectionAccess: access.collectionAccess,
    environmentAccess: access.environmentAccess,
    snippetAccess: access.snippetAccess,
    llmAccess: llm.llmAccess,
    llmModels: llm.llmModels,
    llmMonthlyTokenLimit:
      options.llmMonthlyTokens !== undefined ? options.llmMonthlyTokens : undefined
  };

  const user = await db.updateUser(options.id, input, actingUserId);
  await db.disconnect();

  console.log(`Updated user "${user.name}" (${user.id}).`);
}

/**
 * Deletes a user account and revokes their tokens.
 *
 * @param options - Parsed user delete options including user id.
 */
export async function userDeleteCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const existing = await db.findUserById(options.id);
  if (!existing) {
    await db.disconnect();
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  await db.deleteUser(options.id, actingUserId);
  await db.disconnect();

  console.log(`Deleted user "${existing.name}" (${existing.id}).`);
}

/**
 * Creates a new API token for a user-role account.
 *
 * @param options - Parsed token create options.
 */
export async function userTokenCreateCommand(
  options: UserTokenCreateCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const user = await db.findUserById(options.user);
  if (!user) {
    await db.disconnect();
    throw new Error(`No user found with id ${options.user}.`);
  }

  const { record, secret } = generateApiToken(user.id, options.name);
  await db.createApiToken(record, actingUserId);
  await db.disconnect();

  printCreatedApiToken(user, record, secret);
}

/**
 * Lists stored API tokens, optionally filtered by user.
 *
 * @param options - Parsed token list options.
 */
export async function userTokenListCommand(options: UserTokenListCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const tokens = options.user
    ? await db.listApiTokensByUserId(options.user)
    : await db.listApiTokens();
  await db.disconnect();

  if (tokens.length === 0) {
    console.log('No API tokens found.');
    return;
  }

  for (const token of tokens) {
    console.log(`- id: ${token.id}`);
    console.log(`  user id: ${token.userId}`);
    console.log(`  name: ${token.name}`);
    console.log(`  prefix: ${token.tokenPrefix}`);
    console.log(`  created: ${formatOptionalDate(token.createdAt)}`);
    console.log(`  last used: ${formatOptionalDate(token.lastUsedAt)}`);
    console.log(`  revoked: ${formatOptionalDate(token.revokedAt)}`);
  }
}

/**
 * Soft-revokes an API token by id.
 *
 * @param options - Parsed token revoke options including token id.
 */
export async function userTokenRevokeCommand(
  options: UserTokenRevokeCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const actingUserId = await requireSystemUserId(db);
  const revoked = await db.revokeApiToken(options.id, actingUserId);
  await db.disconnect();

  if (revoked) {
    console.log(`Revoked API token ${options.id}.`);
    return;
  }

  console.log(`No active API token found with id ${options.id}.`);
}

/**
 * Registers the `user` command group on a Commander program.
 *
 * @param program - Root or parent Commander instance.
 * @param handlers - Injectable handlers for testing.
 */
export function registerUserCommand(
  program: Command,
  handlers: {
    create?: (options: UserCreateCommandOptions) => Promise<void>;
    list?: (options: UserCommandOptions) => Promise<void>;
    show?: (options: UserUpdateCommandOptions) => Promise<void>;
    update?: (options: UserUpdateCommandOptions) => Promise<void>;
    delete?: (options: UserUpdateCommandOptions) => Promise<void>;
    tokenCreate?: (options: UserTokenCreateCommandOptions) => Promise<void>;
    tokenList?: (options: UserTokenListCommandOptions) => Promise<void>;
    tokenRevoke?: (options: UserTokenRevokeCommandOptions) => Promise<void>;
    inviteCreate?: (options: UserInviteCreateCommandOptions) => Promise<void>;
    inviteList?: (options: UserCommandOptions) => Promise<void>;
    inviteRevoke?: (options: UserInviteRevokeCommandOptions) => Promise<void>;
  } = {}
): void {
  const user = program.command('user').description('Manage user accounts and their API tokens');

  const invite = user
    .command('invite')
    .description('Manage onboarding invitations for user accounts');

  invite
    .command('create')
    .description('Create a user account with a single-use onboarding invitation')
    .requiredOption('--name <name>', 'Unique display name', parseRequiredName)
    .requiredOption('--role <role>', 'Account role (admin or user)', parseUserRole)
    .option(
      '--collection-access <id>',
      'Collection id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--environment-access <id>',
      'Environment id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--snippet-access <id>',
      'Snippet id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option('--llm-access', 'Enable hub-proxied LLM access for the user')
    .option('--llm-model <id>', 'LLM model id or * (repeatable)', parseAccessFlag, [] as string[])
    .option('--llm-monthly-tokens <count>', 'Monthly LLM token limit', parseMonthlyTokenLimit)
    .option('--expires-in-hours <hours>', 'Invitation lifetime in hours', parsePositiveInt)
    .action(
      /**
       * Runs the user invite create subcommand after merging global CLI options.
       */
      async function userInviteCreateAction(
        this: Command,
        options: UserInviteCreateCommandOptions
      ) {
        await (handlers.inviteCreate ?? userInviteCreateCommand)(mergeGlobalOptions(this, options));
      }
    );

  invite
    .command('list')
    .description('List stored onboarding invitations')
    .action(
      /**
       * Runs the user invite list subcommand after merging global CLI options.
       */
      async function userInviteListAction(this: Command, options: UserCommandOptions) {
        await (handlers.inviteList ?? userInviteListCommand)(mergeGlobalOptions(this, options));
      }
    );

  invite
    .command('revoke')
    .description('Revoke a pending onboarding invitation by id')
    .argument('<id>', 'Invitation identifier to revoke')
    .action(
      /**
       * Runs the user invite revoke subcommand after merging global CLI options.
       */
      async function userInviteRevokeAction(
        this: Command,
        id: string,
        options: UserCommandOptions
      ) {
        await (handlers.inviteRevoke ?? userInviteRevokeCommand)(
          mergeGlobalOptions(this, { ...options, id })
        );
      }
    );

  user
    .command('create')
    .description('Create a new user account')
    .requiredOption('--name <name>', 'Unique display name', parseRequiredName)
    .requiredOption('--role <role>', 'Account role (admin or user)', parseUserRole)
    .option(
      '--collection-access <id>',
      'Collection id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--environment-access <id>',
      'Environment id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--snippet-access <id>',
      'Snippet id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option('--llm-access', 'Enable hub-proxied LLM access for the user')
    .option('--llm-model <id>', 'LLM model id or * (repeatable)', parseAccessFlag, [] as string[])
    .option('--llm-monthly-tokens <count>', 'Monthly LLM token limit', parseMonthlyTokenLimit)
    .action(
      /**
       * Runs the user create subcommand after merging global CLI options.
       */
      async function userCreateAction(this: Command, options: UserCreateCommandOptions) {
        await (handlers.create ?? userCreateCommand)(mergeGlobalOptions(this, options));
      }
    );

  user
    .command('list')
    .description('List stored user accounts')
    .action(
      /**
       * Runs the user list subcommand after merging global CLI options.
       */
      async function userListAction(this: Command, options: UserCommandOptions) {
        await (handlers.list ?? userListCommand)(mergeGlobalOptions(this, options));
      }
    );

  user
    .command('show')
    .description('Show a user account by id')
    .argument('<id>', 'User identifier')
    .action(
      /**
       * Runs the user show subcommand after merging global CLI options.
       */
      async function userShowAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.show ?? userShowCommand)(mergeGlobalOptions(this, { ...options, id }));
      }
    );

  user
    .command('update')
    .description('Update a user account')
    .argument('<id>', 'User identifier')
    .option('--name <name>', 'New display name', parseRequiredName)
    .option('--role <role>', 'New role (admin or user)', parseUserRole)
    .option(
      '--collection-access <id>',
      'Replacement collection id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--environment-access <id>',
      'Replacement environment id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--snippet-access <id>',
      'Replacement snippet id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option('--llm-access', 'Enable hub-proxied LLM access for the user')
    .option('--no-llm-access', 'Disable hub-proxied LLM access for the user')
    .option(
      '--llm-model <id>',
      'Replacement LLM model id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option('--llm-monthly-tokens <count>', 'Monthly LLM token limit', parseMonthlyTokenLimit)
    .action(
      /**
       * Runs the user update subcommand after merging global CLI options.
       */
      async function userUpdateAction(
        this: Command,
        id: string,
        options: UserUpdateCommandOptions
      ) {
        const merged = mergeGlobalOptions(this, { ...options, id });
        const input: UserUpdateCommandOptions = {
          ...merged,
          collectionAccess:
            (options.collectionAccess ?? []).length > 0 ? options.collectionAccess : undefined,
          environmentAccess:
            (options.environmentAccess ?? []).length > 0 ? options.environmentAccess : undefined,
          snippetAccess:
            (options.snippetAccess ?? []).length > 0 ? options.snippetAccess : undefined,
          llmModels: (() => {
            const llmModels = readLlmModelsOption(options);
            return llmModels.length > 0 ? llmModels : undefined;
          })()
        };
        await (handlers.update ?? userUpdateCommand)(input);
      }
    );

  user
    .command('delete')
    .description('Delete a user account and revoke their tokens')
    .argument('<id>', 'User identifier')
    .action(
      /**
       * Runs the user delete subcommand after merging global CLI options.
       */
      async function userDeleteAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.delete ?? userDeleteCommand)(mergeGlobalOptions(this, { ...options, id }));
      }
    );

  const token = user.command('token').description('Manage API bearer tokens for user accounts');

  token
    .command('create')
    .description('Create a new API bearer token for a user')
    .requiredOption('--user <userId>', 'Owning user identifier')
    .requiredOption('--name <name>', 'Human-readable token label', parseRequiredName)
    .action(
      /**
       * Runs the user token create subcommand after merging global CLI options.
       */
      async function userTokenCreateAction(this: Command, options: UserTokenCreateCommandOptions) {
        await (handlers.tokenCreate ?? userTokenCreateCommand)(mergeGlobalOptions(this, options));
      }
    );

  token
    .command('list')
    .description('List stored API bearer tokens')
    .option('--user <userId>', 'Limit output to a single user')
    .action(
      /**
       * Runs the user token list subcommand after merging global CLI options.
       */
      async function userTokenListAction(this: Command, options: UserTokenListCommandOptions) {
        await (handlers.tokenList ?? userTokenListCommand)(mergeGlobalOptions(this, options));
      }
    );

  token
    .command('revoke')
    .description('Revoke an API bearer token by id')
    .argument('<id>', 'Token identifier to revoke')
    .action(
      /**
       * Runs the user token revoke subcommand after merging global CLI options.
       */
      async function userTokenRevokeAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.tokenRevoke ?? userTokenRevokeCommand)(
          mergeGlobalOptions(this, { ...options, id })
        );
      }
    );
}
