import { useCallback, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { buildUserContent, chatContentImages, chatContentText } from '../chatImages';
import type {
  ChatAttachment,
  ChatContent,
  ChatMessage,
  ChatSettings,
  ChatStats,
  KnowledgeSource,
  ResponseMeta
} from '../types';

const emptyStats: ChatStats = {};

function cleanAssistantText(value: string): string {
  return value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trimStart();
}

function hasContent(content: ChatContent): boolean {
  return Boolean(chatContentText(content).trim()) || chatContentImages(content).length > 0;
}

export function useChat(settings: ChatSettings) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [meta, setMeta] = useState<ResponseMeta>({});
  const [stats, setStats] = useState<ChatStats>(emptyStats);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setMeta({});
    setStats(emptyStats);
    setSources([]);
  }, []);

  const runContent = useCallback(
    async (content: ChatContent, historyOverride?: ChatMessage[]) => {
      if (!hasContent(content) || sending) return;

      const history = historyOverride ?? messages.filter(message => !message.streaming);
      const requestMessages: ChatMessage[] = [
        ...history,
        { role: 'user', content }
      ];

      setMessages([...requestMessages, { role: 'assistant', content: '', streaming: true }]);
      setMeta({});
      setStats({});
      setSources([]);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const started = performance.now();
      let firstTokenMs: number | undefined;
      let totalTokens: number | undefined;
      let currentMeta: ResponseMeta = {};

      try {
        const client = new ApiClient(settings.backendUrl, settings.apiKey);
        const finalText = await client.streamChat(
          settings,
          requestMessages,
          {
            onText: fullText => {
              const cleaned = cleanAssistantText(fullText);
              setMessages([
                ...requestMessages,
                { role: 'assistant', content: cleaned, streaming: true }
              ]);
            },
            onMeta: nextMeta => {
              currentMeta = { ...currentMeta, ...nextMeta };
              setMeta(currentMeta);
              if (Array.isArray(nextMeta.sources)) setSources(nextMeta.sources);
            },
            onUsage: tokens => {
              totalTokens = tokens;
              setStats(previous => ({ ...previous, totalTokens: tokens }));
            },
            onFirstToken: () => {
              if (firstTokenMs !== undefined) return;
              firstTokenMs = performance.now() - started;
              setStats(previous => ({ ...previous, firstTokenMs }));
            }
          },
          controller.signal
        );

        setMessages([
          ...requestMessages,
          {
            role: 'assistant',
            content: cleanAssistantText(finalText) || '(empty response)'
          }
        ]);
        setStats({
          firstTokenMs,
          totalMs: performance.now() - started,
          totalTokens
        });
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages(previous => {
            const withoutStreaming = previous.filter(message => !message.streaming);
            return [
              ...withoutStreaming,
              { role: 'assistant', content: 'Generation stopped.', error: true }
            ];
          });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          setMessages([
            ...requestMessages,
            { role: 'assistant', content: `Error: ${message}`, error: true }
          ]);
        }
        setStats(previous => ({ ...previous, totalMs: performance.now() - started }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setSending(false);
      }
    },
    [messages, sending, settings]
  );

  const run = useCallback(
    async (text: string, attachments: ChatAttachment[] = [], historyOverride?: ChatMessage[]) => {
      await runContent(buildUserContent(text, attachments), historyOverride);
    },
    [runContent]
  );

  const regenerate = useCallback(async () => {
    if (sending) return;
    const stable = messages.filter(message => !message.streaming);
    let lastUserIndex = -1;
    for (let index = stable.length - 1; index >= 0; index -= 1) {
      if (stable[index].role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) return;

    const content = stable[lastUserIndex].content;
    const history = stable.slice(0, lastUserIndex);
    await runContent(content, history);
  }, [messages, runContent, sending]);

  return {
    messages,
    sending,
    meta,
    stats,
    sources,
    send: run,
    stop,
    clear,
    regenerate
  };
}
