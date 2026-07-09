import { z } from 'zod/v4';

const portSchema = z.union([
  z
    .number()
    .int({ message: 'Port must be an integer between 1 and 65535.' })
    .min(1, { message: 'Port must be an integer between 1 and 65535.' })
    .max(65535, { message: 'Port must be an integer between 1 and 65535.' }),
  z
    .string()
    .regex(/^\d+$/, { message: 'Port must be an integer between 1 and 65535.' })
    .transform(Number)
    .pipe(
      z
        .number()
        .int({ message: 'Port must be an integer between 1 and 65535.' })
        .min(1, { message: 'Port must be an integer between 1 and 65535.' })
        .max(65535, { message: 'Port must be an integer between 1 and 65535.' })
    )
]);

/**
 * Zod schema for the `server` section of the config file (host and port).
 */
export const serverSectionSchema = z.object({
  port: portSchema,
  host: z.string().trim().min(1, { message: 'Host must not be empty.' })
});

/**
 * Zod schema for the `db` section of the config file (driver discriminant only).
 *
 * Driver-specific fields are validated by each database implementation.
 */
export const dbSectionSchema = z
  .object({
    driver: z.string().trim().min(1, { message: 'Database driver must not be empty.' })
  })
  .loose();

/**
 * Zod schema for the `redis` section of the config file.
 *
 * Throttle policy fields default to 10 failures / 900s window / 900s block when omitted.
 */
export const redisSectionSchema = z
  .object({
    host: z.string().trim().min(1, { message: 'Redis host must not be empty.' }),
    port: portSchema,
    password: z.string().optional(),
    db: z
      .union([
        z.number().int().min(0).max(15),
        z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(15))
      ])
      .optional(),
    keyPrefix: z.string().optional(),
    maxFailures: z
      .union([
        z.number().int().min(1),
        z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1))
      ])
      .optional(),
    windowSeconds: z
      .union([
        z.number().int().min(1),
        z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1))
      ])
      .optional(),
    blockSeconds: z
      .union([
        z.number().int().min(1),
        z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1))
      ])
      .optional()
  })
  .loose();

/**
 * Zod schema for a single LLM provider API key entry in server.yaml.
 */
export const llmProviderEntrySchema = z.object({
  apiKey: z.string().trim().min(1, { message: 'LLM provider apiKey must not be empty.' })
});

/**
 * Zod schema for MCP server HTTP headers in server.yaml.
 *
 * Accepts an object map, an array of single-key objects, or one nested array level.
 */
export const hubMcpHeadersSchema = z.union([
  z.record(z.string(), z.string()),
  z.array(z.union([z.record(z.string(), z.string()), z.array(z.record(z.string(), z.string()))]))
]);

/**
 * Zod schema for one MCP server entry under llm.mcp.
 */
export const hubMcpServerEntrySchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().min(1),
  headers: hubMcpHeadersSchema.optional()
});

/**
 * Zod schema for the optional `llm` section of the config file.
 */
export const llmSectionSchema = z.object({
  providers: z
    .object({
      openai: llmProviderEntrySchema.optional(),
      claude: llmProviderEntrySchema.optional(),
      gemini: llmProviderEntrySchema.optional()
    })
    .refine(
      (providers) =>
        Boolean(providers.openai?.apiKey || providers.claude?.apiKey || providers.gemini?.apiKey),
      { message: 'llm.providers must include at least one provider with an apiKey.' }
    ),
  models: z.array(z.string().trim().min(1)).optional(),
  mcp: z.array(hubMcpServerEntrySchema).optional()
});

/**
 * Zod schema for the optional `plugins` section of the config file.
 */
export const pluginsSectionSchema = z.object({
  catalogs: z.array(z.string().trim().url()).optional(),
  trusted: z.array(z.string().trim().url()).optional()
});

/**
 * Zod schema for the optional `docs` section of the config file.
 */
export const docsSectionSchema = z.object({
  searchIndexPath: z.string().trim().min(1).optional()
});

/**
 * Zod schema for supported log levels in the optional `logging` section.
 */
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * Zod schema for the optional `logging` section of the config file.
 */
export const loggingSectionSchema = z.object({
  level: logLevelSchema.optional(),
  file: z.string().trim().min(1).optional(),
  console: z.boolean().optional()
});

/**
 * Zod schema for the full server config document (`server.yaml` root mapping).
 */
export const serverConfigDocumentSchema = z.object({
  server: serverSectionSchema,
  db: dbSectionSchema,
  redis: redisSectionSchema,
  llm: llmSectionSchema.optional(),
  plugins: pluginsSectionSchema.optional(),
  docs: docsSectionSchema.optional(),
  logging: loggingSectionSchema.optional()
});

/**
 * Validated shape of a parsed server config YAML file.
 */
export type ServerConfigDocument = z.infer<typeof serverConfigDocumentSchema>;

/**
 * Validated shape of the optional llm section.
 */
export type LlmSection = z.infer<typeof llmSectionSchema>;

/**
 * Validated shape of the optional plugins section.
 */
export type PluginsSection = z.infer<typeof pluginsSectionSchema>;

/**
 * Validated shape of the optional docs section.
 */
export type DocsSection = z.infer<typeof docsSectionSchema>;

/**
 * Validated shape of the optional logging section.
 */
export type LoggingSection = z.infer<typeof loggingSectionSchema>;
