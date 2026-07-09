import { describe, expect, it, vi } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleUserRecord
} from '#/server/routes/test/createTestApp.js';
import * as agent from '#/server/llm/agent.js';
import { currentUsagePeriod } from '#/server/llm/models.js';

const sampleLlmConfig = {
  providers: {
    openai: { apiKey: 'sk-test' }
  },
  models: ['gpt-4o']
};

describe('llm routes', () => {
  it('returns 503 when LLM is not configured', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({ db, withValidAuth: true, llm: null });

    const response = await app.inject({
      method: 'GET',
      url: '/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('returns 403 when the user lacks LLM access', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: { ...sampleUserRecord, llmAccess: false }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('lists allowed models for an LLM-enabled user', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: {
        ...sampleUserRecord,
        llmAccess: true,
        llmModels: ['gpt-4o']
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/llm/models',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      models: [{ id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' }],
      capabilities: { openai: true }
    });
    await app.close();
  });

  it('returns 402 when a new turn exceeds the monthly token limit', async () => {
    const period = currentUsagePeriod();
    const db = createStubDatabase();
    db.getLlmUsage.mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 900,
      completionTokens: 100,
      totalTokens: 1000,
      updatedAt: new Date('2026-06-01T00:00:00.000Z')
    });

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: {
        ...sampleUserRecord,
        llmAccess: true,
        llmModels: ['*'],
        llmMonthlyTokenLimit: 1000
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/llm/chat/step',
      headers: authHeader(),
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });

    expect(response.statusCode).toBe(402);
    await app.close();
  });

  it('allows continuation steps after the monthly limit is reached', async () => {
    const period = currentUsagePeriod();
    const runHubChatStep = vi.spyOn(agent, 'runHubChatStep').mockResolvedValue({
      content: 'Done',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    });

    const db = createStubDatabase();
    db.getLlmUsage.mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 900,
      completionTokens: 100,
      totalTokens: 1000,
      updatedAt: new Date('2026-06-01T00:00:00.000Z')
    });
    db.addLlmUsage.mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 901,
      completionTokens: 102,
      totalTokens: 1003,
      updatedAt: new Date('2026-06-01T00:00:00.000Z')
    });
    db.createLlmUsageLog.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      apiTokenId: 'token-1',
      period,
      model: 'gpt-4o',
      provider: 'openai',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      isNewTurn: false,
      hadToolCalls: false,
      messageCount: 1,
      createdAt: new Date('2026-06-01T00:00:00.000Z')
    });

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: {
        ...sampleUserRecord,
        llmAccess: true,
        llmModels: ['*'],
        llmMonthlyTokenLimit: 1000
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/llm/chat/step',
      headers: authHeader(),
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'tool', tool_call_id: 'call-1', content: '{}' }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(runHubChatStep).toHaveBeenCalledOnce();
    expect(db.addLlmUsage).toHaveBeenCalledWith('user-1', expect.any(String), 1, 2);
    expect(db.createLlmUsageLog).toHaveBeenCalledWith({
      userId: 'user-1',
      apiTokenId: 'token-1',
      period: expect.any(String),
      model: 'gpt-4o',
      provider: 'openai',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      isNewTurn: false,
      hadToolCalls: false,
      messageCount: 1
    });
    runHubChatStep.mockRestore();
    await app.close();
  });

  it('logs per-request usage for successful new-turn completions', async () => {
    const period = currentUsagePeriod();
    const runHubChatStep = vi.spyOn(agent, 'runHubChatStep').mockResolvedValue({
      content: null,
      toolCalls: [{ id: 'call-1', name: 'listCollections', arguments: '{}' }],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    });

    const db = createStubDatabase();
    db.getLlmUsage.mockResolvedValue(null);
    db.addLlmUsage.mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      updatedAt: new Date('2026-06-01T00:00:00.000Z')
    });
    db.createLlmUsageLog.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      apiTokenId: 'token-1',
      period,
      model: 'gpt-4o',
      provider: 'openai',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      isNewTurn: true,
      hadToolCalls: true,
      messageCount: 2,
      createdAt: new Date('2026-06-01T00:00:00.000Z')
    });

    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      llm: sampleLlmConfig,
      user: {
        ...sampleUserRecord,
        llmAccess: true,
        llmModels: ['*']
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/llm/chat/step',
      headers: authHeader(),
      payload: {
        model: 'gpt-4o',
        messages: [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Hello' }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createLlmUsageLog).toHaveBeenCalledWith({
      userId: 'user-1',
      apiTokenId: 'token-1',
      period: expect.any(String),
      model: 'gpt-4o',
      provider: 'openai',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      isNewTurn: true,
      hadToolCalls: true,
      messageCount: 2
    });
    runHubChatStep.mockRestore();
    await app.close();
  });
});
