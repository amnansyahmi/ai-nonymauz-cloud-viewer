import { describe, expect, it } from 'vitest';
import { decodeSseBlock, extractSseEvents } from '../api/sse';

describe('SSE parser', () => {
  it('decodes data and event fields', () => {
    expect(decodeSseBlock('event: message\ndata: {"ok":true}')).toEqual({
      event: 'message',
      data: '{"ok":true}'
    });
  });

  it('keeps incomplete chunks as a remainder', () => {
    const parsed = extractSseEvents('data: {"a":1}\n\ndata: {"b":');
    expect(parsed.events).toEqual([{ data: '{"a":1}', event: undefined }]);
    expect(parsed.remainder).toBe('data: {"b":');
  });

  it('joins multi-line data payloads', () => {
    expect(decodeSseBlock('data: hello\ndata: world')).toEqual({
      data: 'hello\nworld',
      event: undefined
    });
  });
});
