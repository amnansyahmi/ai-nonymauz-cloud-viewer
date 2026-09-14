import { describe, expect, it } from 'vitest';
import {
  buildUserContent,
  chatContentImages,
  chatContentText,
  messagesHaveImages
} from '../chatImages';
import type { ChatAttachment, ChatMessage } from '../types';

const attachment: ChatAttachment = {
  id: 'image-1',
  name: 'screen.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  width: 800,
  height: 600,
  dataUrl: 'data:image/png;base64,abc123'
};

describe('multimodal chat content', () => {
  it('keeps normal text messages as strings', () => {
    expect(buildUserContent(' hello ', [])).toBe('hello');
  });

  it('builds text plus image_url content in OpenAI-compatible order', () => {
    const content = buildUserContent('What is wrong here?', [attachment]);
    expect(chatContentText(content)).toBe('What is wrong here?');
    expect(chatContentImages(content)).toHaveLength(1);
    expect(chatContentImages(content)[0].image_url.url).toBe(attachment.dataUrl);
  });

  it('supports image-only user messages', () => {
    const content = buildUserContent('', [attachment]);
    expect(chatContentText(content)).toBe('');
    expect(chatContentImages(content)).toHaveLength(1);
  });

  it('detects images anywhere in conversation history', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: buildUserContent('read this', [attachment]) }
    ];
    expect(messagesHaveImages(messages)).toBe(true);
  });
});
