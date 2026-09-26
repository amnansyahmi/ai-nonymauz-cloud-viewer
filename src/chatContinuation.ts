import type { ChatStreamResult } from './api/client';
import type { ChatMessage } from './types';

const MAX_AUTO_CONTINUATIONS = 8;
const CONTINUE_PROMPT = 'Continue the previous answer exactly where it stopped. Do not repeat earlier text. Finish the remaining content naturally.';

export async function streamWithContinuations(
  requestMessages: ChatMessage[],
  streamPart: (messages: ChatMessage[], onText: (text: string) => void) => Promise<ChatStreamResult>,
  onText: (text: string) => void,
  normalizeText: (text: string) => string = text => text
): Promise<{ text: string; hitSafetyLimit: boolean }> {
  let combined = '';

  for (let continuation = 0; ; continuation += 1) {
    const prior = combined;
    const turnMessages: ChatMessage[] = continuation === 0
      ? requestMessages
      : [
          ...requestMessages,
          { role: 'assistant', content: prior },
          { role: 'user', content: CONTINUE_PROMPT }
        ];

    const part = await streamPart(turnMessages, text => onText(normalizeText(prior + text)));
    combined = normalizeText(prior + part.text);
    onText(combined);

    if (!['length', 'max_tokens'].includes(part.finishReason ?? '')) {
      return { text: combined, hitSafetyLimit: false };
    }
    if (!part.text.trim() || continuation >= MAX_AUTO_CONTINUATIONS) {
      return { text: combined, hitSafetyLimit: true };
    }
  }
}
