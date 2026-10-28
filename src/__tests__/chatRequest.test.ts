import { describe, expect, it } from 'vitest';
import { ApiClient, RAG_MAX_CONTEXT_CHARS, buildChatRequestBody, clampRagChars } from '../api/client';
import type { ChatMessage, ChatSettings } from '../types';

const baseSettings: ChatSettings = {
  backendUrl: 'https://example.test',
  apiKey: '',
  rememberApiKey: false,
  mode: 'normal',
  model: 'auto',
  temperature: 0.2,
  useCustomMaxTokens: false,
  maxTokens: 2048,
  ragTopK: 3,
  ragMaxChars: 5000,
  city: 'Shah Alam',
  useRag: true,
  useTools: true,
  systemPrompt: ''
};

const messages: ChatMessage[] = [{ role: 'user', content: 'Explain this fully.' }];

describe('chat request body', () => {
  it('leaves max_tokens out by default so the backend can choose dynamically', () => {
    const body = buildChatRequestBody(baseSettings, messages);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('sends max_tokens only after the user opts in', () => {
    const body = buildChatRequestBody({ ...baseSettings, useCustomMaxTokens: true }, messages);
    expect(body.max_tokens).toBe(2048);
  });
});

describe('RAG context limit', () => {
  it('never sends more RAG context than the backend accepts', () => {
    const body = buildChatRequestBody({ ...baseSettings, ragMaxChars: 30000 }, messages);
    expect(body.rag_max_context_chars).toBe(RAG_MAX_CONTEXT_CHARS);
  });

  it('keeps in-range values unchanged', () => {
    expect(clampRagChars(5000)).toBe(5000);
    expect(clampRagChars(-5)).toBe(0);
    expect(clampRagChars(Number.NaN)).toBe(RAG_MAX_CONTEXT_CHARS);
  });

  it('clamps the RAG inspector query before it reaches /rag/search', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ sources: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      await new ApiClient('https://example.test', 'key').ragSearch('angular', 5, 30000);
    } finally {
      globalThis.fetch = original;
    }
    expect(new URL(calls[0]).searchParams.get('max_chars')).toBe(String(RAG_MAX_CONTEXT_CHARS));
  });
});
