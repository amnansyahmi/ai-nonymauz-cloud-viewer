export interface SseEvent {
  data: string;
  event?: string;
}

export function decodeSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event: string | undefined;
  const data: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(':')) continue;

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }

  if (!data.length) return null;
  return { data: data.join('\n'), event };
}

export function extractSseEvents(buffer: string): {
  events: SseEvent[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remainder = parts.pop() ?? '';
  const events = parts
    .map(decodeSseBlock)
    .filter((event): event is SseEvent => event !== null);

  return { events, remainder };
}

export async function consumeSse(
  response: Response,
  onEvent: (event: SseEvent) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('This browser does not expose the response stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = extractSseEvents(buffer);
    buffer = parsed.remainder;
    parsed.events.forEach(onEvent);
  }

  buffer += decoder.decode();
  const finalBlock = decodeSseBlock(buffer.trim());
  if (finalBlock) onEvent(finalBlock);
}
