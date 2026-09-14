import { describe, expect, it } from 'vitest';
import { buildChatRequestBody } from '../api/client';
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
