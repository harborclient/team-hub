import { z } from 'zod/v4';

/**
 * Zod schema for a tool call in an LLM chat step request or response.
 */
export const llmToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string()
});

/**
 * Zod schema for a message in an LLM chat step request.
 */
export const llmChatStepMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  tool_calls: z.array(llmToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional()
});

/**
 * Zod schema for POST /llm/chat/step request body.
 */
export const llmChatStepBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z.array(llmChatStepMessageSchema),
  tools: z.array(z.record(z.string(), z.unknown())).optional(),
  systemPrompt: z.string().optional()
});

/**
 * Zod schema for token usage returned by POST /llm/chat/step.
 */
export const llmUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

/**
 * Zod schema for POST /llm/chat/step response body.
 */
export const llmChatStepResponseSchema = z.object({
  content: z.string().nullable(),
  toolCalls: z.array(llmToolCallSchema).optional(),
  usage: llmUsageSchema
});

/**
 * Zod schema for one model entry in GET /llm/models.
 */
export const llmModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(['openai', 'claude', 'gemini'])
});

/**
 * Zod schema for hub LLM capability flags returned by GET /llm/models.
 */
export const llmCapabilitiesSchema = z.object({
  openai: z.boolean()
});

/**
 * Zod schema for GET /llm/models response body.
 */
export const listLlmModelsResponseSchema = z.object({
  models: z.array(llmModelSchema),
  capabilities: llmCapabilitiesSchema
});

/**
 * Zod schema for GET /llm/usage response body.
 */
export const llmUsageSummaryResponseSchema = z.object({
  period: z.string(),
  totalTokens: z.number().int().nonnegative(),
  limit: z.number().int().positive().nullable()
});
