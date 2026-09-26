import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import type { ChatSettings } from '../types';

const settings: ChatSettings = {
  backendUrl: 'https://example.test', apiKey: '', rememberApiKey: false,
  mode: 'normal', model: 'auto', temperature: 0.2, useCustomMaxTokens: false,
  maxTokens: 2048, ragTopK: 3, ragMaxChars: 5000, city: 'Shah Alam',
  useRag: true, useTools: true, systemPrompt: ''
};

afterEach(() => vi.unstubAllGlobals());

describe('chat stream completion', () => {
  it('reports the real model and output-limit finish reason', async () => {
    const events = [
      { ai_nonymauz_meta: { model: 'ai-nonymauz-fast' } },
      { model: 'provider/real-model', choices: [{ delta: { content: 'Part one' }, finish_reason: null }] },
      { model: 'provider/real-model', choices: [{ delta: {}, finish_reason: 'length' }] }
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )));

    const onModel = vi.fn();
    const onMeta = vi.fn();
    const result = await new ApiClient(settings.backendUrl).streamChat(
      settings,
      [{ role: 'user', content: 'Explain this.' }],
      { onText: vi.fn(), onMeta, onModel, onUsage: vi.fn(), onFirstToken: vi.fn() },
      new AbortController().signal
    );

    expect(result).toEqual({ text: 'Part one', finishReason: 'length' });
    expect(onMeta).toHaveBeenCalledWith({ model: 'ai-nonymauz-fast' });
    expect(onModel).toHaveBeenCalledWith('provider/real-model');
  });

  it('does not silently accept an interrupted stream as a complete answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )));

    await expect(new ApiClient(settings.backendUrl).streamChat(
      settings,
      [{ role: 'user', content: 'Explain this.' }],
      { onText: vi.fn(), onMeta: vi.fn(), onModel: vi.fn(), onUsage: vi.fn(), onFirstToken: vi.fn() },
      new AbortController().signal
    )).rejects.toThrow('ended before completion');
  });
});
