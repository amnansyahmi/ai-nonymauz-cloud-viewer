import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { beginTask, collectTask, endTask, pendingTask, pendingTasks } from '../background';
import { streamWithContinuations } from '../chatContinuation';
import {
  buildDisplayAttachments,
  buildUserContent,
  chatContentImages,
  chatContentText
} from '../chatImages';
import type {
  ChatAttachment,
  ChatContent,
  ChatDisplayAttachment,
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
  const generationRef = useRef(0);

  useEffect(() => () => { generationRef.current += 1; abortRef.current?.abort(); }, []);

  // The app was closed while a reply was finishing in the background: when it
  // opens again, show the question and the reply the backend kept.
  useEffect(() => {
    if (!settings.apiKey.trim()) return;
    const waiting = pendingTasks().filter(task => task.kind === 'chat' && task.away);
    if (!waiting.length) return;
    const task = waiting[waiting.length - 1];
    const client = new ApiClient(settings.backendUrl, settings.apiKey);
    const question: ChatMessage = { role: 'user', content: task.meta?.question ?? '', displayText: task.meta?.question ?? '' };
    let live = true;
    setMessages(current => current.length ? current
      : [question, { role: 'assistant', content: '_Finishing in the background…_', streaming: true }]);
    void collectTask(client, task.id).then(found => {
      for (const item of waiting) endTask(client, item.id);
      if (!live) return;
      const reply = found?.result as { text?: string; error?: string } | undefined;
      setMessages(current => {
        if (current.length > 2 || current[0]?.displayText !== question.displayText) return current;
        return [question, {
          role: 'assistant',
          content: reply?.text ? cleanAssistantText(reply.text) : `Error: ${reply?.error || 'The reply did not come back. Send the question again.'}`,
          error: !reply?.text
        }];
      });
    });
    return () => { live = false; };
    // Once per connection: a fresh launch, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.backendUrl, settings.apiKey]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages([]);
    setMeta({});
    setStats(emptyStats);
    setSources([]);
  }, []);

  const runContent = useCallback(
    async (
      content: ChatContent,
      displayText = '',
      displayAttachments: ChatDisplayAttachment[] = [],
      historyOverride?: ChatMessage[],
      instruction = ''
    ) => {
      if (!hasContent(content) || sending || abortRef.current) return;
      const generation = ++generationRef.current;

      const history = historyOverride ?? messages.filter(message => !message.streaming);
      const userMessage: ChatMessage = {
        role: 'user',
        content,
        displayText,
        displayAttachments
      };
      const requestMessages: ChatMessage[] = [...history, userMessage];

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
      let completedText = '';
      let inFlightText = '';
      let servedBy = '';
      const servedModels: string[] = [];

      const showAnswer = (content: string, streaming: boolean, error = false) => {
        if (generation !== generationRef.current) return;
        setMessages([
          ...requestMessages,
          {
            role: 'assistant',
            content: cleanAssistantText(content) || (streaming ? '' : '(empty response)'),
            streaming,
            error,
            modelAlias: currentMeta.model,
            servedBy
          }
        ]);
      };

      try {
        const client = new ApiClient(settings.backendUrl, settings.apiKey);
        const result = await streamWithContinuations(
          requestMessages,
          async (turnMessages, updateText) => {
            let partTokens: number | undefined;
            // With a key the backend can keep the reply if the app is sent to
            // the background mid-answer, and notify when it is ready.
            const block = settings.apiKey.trim()
              ? beginTask('chat', chatContentText(content).slice(0, 80),
                          { question: (displayText || chatContentText(content)).slice(0, 2000) })
              : undefined;
            const partBase = inFlightText;
            let part;
            try {
              part = await client.streamChat(
              instruction ? { ...settings, systemPrompt: [settings.systemPrompt, instruction].filter(Boolean).join('\n\n') } : settings,
              turnMessages,
              {
                onText: updateText,
                onMeta: nextMeta => {
                  if (generation !== generationRef.current) return;
                  currentMeta = { ...currentMeta, ...nextMeta };
                  setMeta(currentMeta);
                  if (Array.isArray(nextMeta.sources)) setSources(nextMeta.sources);
                },
                onModel: model => {
                  if (generation !== generationRef.current) return;
                  if (servedModels.includes(model)) return;
                  servedModels.push(model);
                  servedBy = servedModels.join(' → ');
                  currentMeta = { ...currentMeta, served_by: servedBy };
                  setMeta(currentMeta);
                  showAnswer(inFlightText, true);
                },
                onUsage: tokens => {
                  if (generation !== generationRef.current) return;
                  partTokens = tokens;
                  setStats(previous => ({ ...previous, totalTokens: (totalTokens ?? 0) + tokens }));
                },
                onFirstToken: () => {
                  if (generation !== generationRef.current) return;
                  if (firstTokenMs !== undefined) return;
                  firstTokenMs = performance.now() - started;
                  setStats(previous => ({ ...previous, firstTokenMs }));
                }
              },
              controller.signal,
              block
            );
            } catch (error) {
              const away = block && !controller.signal.aborted && pendingTask(block.task_id)?.away;
              if (!block || !away) {
                if (block) endTask(client, block.task_id);
                throw error;
              }
              // The app left and the stream died with it; the backend kept going.
              showAnswer(`${partBase ? `${partBase}\n\n` : ''}_Finishing in the background…_`, true);
              const found = await collectTask(client, block.task_id, controller.signal);
              endTask(client, block.task_id);
              const reply = found?.result as { text?: string; error?: string } | undefined;
              if (!reply || (!reply.text && reply.error)) throw reply?.error ? new Error(reply.error) : error;
              updateText(reply.text ?? '');
              return { text: reply.text ?? '', finishReason: null };
            }
            if (block) endTask(client, block.task_id);
            if (partTokens !== undefined) totalTokens = (totalTokens ?? 0) + partTokens;
            return part;
          },
          text => {
            inFlightText = text;
            showAnswer(text, true);
          },
          cleanAssistantText
        );

        if (generation !== generationRef.current) return { text: '', error: 'Generation stopped.' };
        if (controller.signal.aborted) {
          showAnswer(inFlightText ? `${inFlightText}\n\n_Generation stopped._` : 'Generation stopped.', false, true);
          return { text: '', error: 'Generation stopped.' };
        }
        completedText = result.text;
        if (result.hitSafetyLimit) completedText += '\n\n_Response hit the provider output limit. Send “continue” to get the rest._';

        showAnswer(completedText, false);
        setStats({
          firstTokenMs,
          totalMs: performance.now() - started,
          totalTokens
        });
        return { text: cleanAssistantText(completedText) };
      } catch (error) {
        if (generation !== generationRef.current) return { text: '', error: 'Generation stopped.' };
        if (controller.signal.aborted) {
          showAnswer(inFlightText ? `${inFlightText}\n\n_Generation stopped._` : 'Generation stopped.', false, true);
        } else {
          const message = error instanceof Error ? error.message : String(error);
          showAnswer(inFlightText ? `${inFlightText}\n\n_Response interrupted: ${message}_` : `Error: ${message}`, false, true);
        }
        setStats(previous => ({ ...previous, totalMs: performance.now() - started }));
        return { text: '', error: controller.signal.aborted ? 'Generation stopped.' : (error instanceof Error ? error.message : String(error)) };
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setSending(false);
        }
      }
    },
    [messages, sending, settings]
  );

  const run = useCallback(
    async (text: string, attachments: ChatAttachment[] = [], historyOverride?: ChatMessage[], instruction = '') => {
      return runContent(
        buildUserContent(text, attachments),
        text.trim(),
        buildDisplayAttachments(attachments),
        historyOverride,
        instruction
      );
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

    const message = stable[lastUserIndex];
    const history = stable.slice(0, lastUserIndex);
    await runContent(
      message.content,
      message.displayText ?? chatContentText(message.content),
      message.displayAttachments ?? [],
      history
    );
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
