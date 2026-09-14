import { describe, expect, it } from 'vitest';
import {
  buildDisplayAttachments,
  buildUserContent,
  chatContentImages,
  chatContentText,
  messagesHaveImages
} from '../chatImages';
import type { ChatFileAttachment, ChatImageAttachment, ChatMessage } from '../types';

const image: ChatImageAttachment = {
  kind: 'image',
  id: 'image-1',
  name: 'screen.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  width: 800,
  height: 600,
  dataUrl: 'data:image/png;base64,abc123'
};

const file: ChatFileAttachment = {
  kind: 'file',
  id: 'file-1',
  name: 'brief.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  extension: '.pdf',
  text: 'Quarterly revenue increased by 20%.',
  extractedChars: 35,
  truncated: false
};

describe('multimodal chat content', () => {
  it('keeps normal text messages as strings', () => {
    expect(buildUserContent(' hello ', [])).toBe('hello');
  });

  it('builds text plus image_url content in OpenAI-compatible order', () => {
    const content = buildUserContent('What is wrong here?', [image]);
    expect(chatContentText(content)).toBe('What is wrong here?');
    expect(chatContentImages(content)).toHaveLength(1);
    expect(chatContentImages(content)[0].image_url.url).toBe(image.dataUrl);
  });

  it('supports image-only user messages', () => {
    const content = buildUserContent('', [image]);
    expect(chatContentText(content)).toBe('');
    expect(chatContentImages(content)).toHaveLength(1);
  });

  it('injects extracted file text as reference context', () => {
    const content = buildUserContent('Summarise this', [file]);
    expect(typeof content).toBe('string');
    expect(chatContentText(content)).toContain('Summarise this');
    expect(chatContentText(content)).toContain('ATTACHED FILE: brief.pdf');
    expect(chatContentText(content)).toContain('Quarterly revenue increased by 20%.');
  });

  it('does not expose extracted document text in display attachment metadata', () => {
    const display = buildDisplayAttachments([file]);
    expect(display).toHaveLength(1);
    expect(display[0].name).toBe('brief.pdf');
    expect(display[0]).not.toHaveProperty('text');
  });

  it('detects images anywhere in conversation history', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: buildUserContent('read this', [image]) }
    ];
    expect(messagesHaveImages(messages)).toBe(true);
  });
});
