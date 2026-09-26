import { describe, expect, it, vi } from 'vitest';
import { streamWithContinuations } from '../chatContinuation';
import type { ChatMessage } from '../types';

const request: ChatMessage[] = [{ role: 'user', content: 'Explain in detail.' }];

describe('long answer continuation', () => {
  it('continues an output-limited reply and combines both parts in one answer', async () => {
    const seen: ChatMessage[][] = [];
    const updates: string[] = [];
    const parts = [
      { text: 'First part. ', finishReason: 'length' },
      { text: 'Final part.', finishReason: 'stop' }
    ];
    const streamPart = vi.fn(async (messages: ChatMessage[], onText: (text: string) => void) => {
      seen.push(messages);
      const part = parts[seen.length - 1];
      onText(part.text);
      return part;
    });

    const result = await streamWithContinuations(request, streamPart, text => updates.push(text));

    expect(result).toEqual({ text: 'First part. Final part.', hitSafetyLimit: false });
    expect(seen).toHaveLength(2);
    expect(seen[1][1]).toEqual({ role: 'assistant', content: 'First part. ' });
    expect(seen[1][2].role).toBe('user');
    expect(seen[1][2].content).toMatch(/Continue the previous answer/);
    expect(updates.at(-1)).toBe('First part. Final part.');
  });

  it('stops safely when a provider returns no text after another output limit', async () => {
    const parts = [
      { text: 'Partial', finishReason: 'length' },
      { text: '', finishReason: 'length' }
    ];
    let index = 0;
    const result = await streamWithContinuations(
      request,
      async () => parts[index++],
      vi.fn()
    );

    expect(result).toEqual({ text: 'Partial', hitSafetyLimit: true });
    expect(index).toBe(2);
  });
});
