import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import type { ChatSettings, ProfilesResponse } from '../types';
import { MarkdownMessage } from '../components/MarkdownMessage';
import { RepeatIcon, SendIcon, StopIcon, TrashIcon } from '../components/Icons';

interface ChatViewProps {
  settings: ChatSettings;
  modelOptions: string[];
  profiles: ProfilesResponse;
  onSettingsChange: (patch: Partial<ChatSettings>) => void;
}

function formatMs(value?: number): string {
  if (value === undefined) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function booleanLabel(value: unknown): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '—';
}

export function ChatView({ settings, modelOptions, profiles, onSettingsChange }: ChatViewProps) {
  const [input, setInput] = useState('');
  const chat = useChat(settings);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const modeOptions = useMemo(
    () => Array.from(new Set(['auto', 'fast', 'normal', 'deep', 'vision', ...Object.keys(profiles)])),
    [profiles]
  );

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  async function submit() {
    const value = input.trim();
    if (!value || chat.sending) return;
    setInput('');
    await chat.send(value);
  }

  const hasConversation = chat.messages.length > 0;

  return (
    <section className="workspace chat-workspace">
      <div className="page-heading chat-heading">
        <div>
          <span className="eyebrow">Playground</span>
          <h1>Chat</h1>
          <p>Stream responses through the real backend and inspect what actually served them.</p>
        </div>

        <div className="heading-actions">
          <select
            aria-label="Mode"
            value={settings.mode}
            onChange={event => onSettingsChange({ mode: event.target.value })}
          >
            {modeOptions.map(mode => <option key={mode} value={mode}>{mode}</option>)}
          </select>
          <select
            aria-label="Model"
            value={settings.model}
            onChange={event => onSettingsChange({ model: event.target.value })}
          >
            <option value="auto">auto · backend router</option>
            {modelOptions.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </div>
      </div>

      <div className="chat-grid">
        <div className="chat-main panel">
          <div className="chat-toolbar">
            <div className="toggle-group">
              <label className={`toggle-pill ${settings.useRag ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.useRag}
                  onChange={event => onSettingsChange({ useRag: event.target.checked })}
                />
                RAG
              </label>
              <label className={`toggle-pill ${settings.useTools ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.useTools}
                  onChange={event => onSettingsChange({ useTools: event.target.checked })}
                />
                Tools
              </label>
            </div>

            <div className="toolbar-actions">
              <button type="button" className="ghost icon-text" disabled={!hasConversation || chat.sending} onClick={chat.regenerate}>
                <RepeatIcon /> Regenerate
              </button>
              <button type="button" className="ghost icon-text" disabled={!hasConversation} onClick={chat.clear}>
                <TrashIcon /> Clear
              </button>
            </div>
          </div>

          <div className="message-thread" ref={threadRef}>
            {!hasConversation && (
              <div className="chat-empty">
                <div className="empty-orb">AI</div>
                <h2>Test the backend, not a mock.</h2>
                <p>
                  Ask about code, current information, or your RAG knowledge. Runtime metadata will appear beside the answer.
                </p>
                <div className="prompt-suggestions">
                  {[
                    'What models are currently available and which should I use for a large coding task?',
                    'Explain the latest .NET approach for a minimal API with EF Core.',
                    'Dalam Bahasa Melayu, explain how the RAG pipeline works.'
                  ].map(prompt => (
                    <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`message-row ${message.role} ${message.error ? 'error' : ''}`}
              >
                <div className="message-avatar">{message.role === 'user' ? 'You' : 'AI'}</div>
                <div className="message-content">
                  <div className="message-label">
                    {message.role === 'user' ? 'You' : 'AI Nonymauz'}
                    {message.streaming && <span className="stream-indicator">streaming</span>}
                  </div>
                  <div className="markdown-body">
                    {message.content
                      ? <MarkdownMessage content={message.content} />
                      : <span className="typing-dots"><i /><i /><i /></span>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="composer-wrap">
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Message AI Nonymauz…"
              rows={2}
            />
            {chat.sending ? (
              <button className="stop-button" type="button" onClick={chat.stop} aria-label="Stop generation">
                <StopIcon />
              </button>
            ) : (
              <button className="send-button" type="button" disabled={!input.trim()} onClick={() => void submit()} aria-label="Send message">
                <SendIcon />
              </button>
            )}
            <div className="composer-hint">Enter to send · Shift+Enter for new line</div>
          </div>
        </div>

        <aside className="inspector-stack">
          <div className="panel inspector-card">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">Live trace</span>
                <h2>Runtime</h2>
              </div>
              <span className={`live-badge ${chat.sending ? 'active' : ''}`}>{chat.sending ? 'LIVE' : 'IDLE'}</span>
            </div>

            <dl className="runtime-list">
              <div><dt>Mode</dt><dd>{String(chat.meta.mode ?? '—')}</dd></div>
              <div><dt>Alias</dt><dd title={String(chat.meta.model ?? '')}>{String(chat.meta.model ?? '—')}</dd></div>
              <div><dt>Served by</dt><dd title={String(chat.meta.served_by ?? '')}>{String(chat.meta.served_by ?? '—')}</dd></div>
              <div><dt>First token</dt><dd>{formatMs(chat.stats.firstTokenMs)}</dd></div>
              <div><dt>Total</dt><dd>{formatMs(chat.stats.totalMs)}</dd></div>
              <div><dt>Server</dt><dd>{typeof chat.meta.server_latency_seconds === 'number' ? `${chat.meta.server_latency_seconds.toFixed(2)} s` : '—'}</dd></div>
              <div><dt>Tokens</dt><dd>{chat.stats.totalTokens ?? '—'}</dd></div>
              <div><dt>RAG</dt><dd>{booleanLabel(chat.meta.used_rag)}</dd></div>
              <div><dt>Web search</dt><dd>{booleanLabel(chat.meta.used_web_search)}</dd></div>
              <div><dt>Weather</dt><dd>{booleanLabel(chat.meta.used_weather_tool)}</dd></div>
              <div><dt>Summary</dt><dd>{booleanLabel(chat.meta.used_summary)}</dd></div>
              <div><dt>Large reroute</dt><dd>{booleanLabel(chat.meta.large_task_reroute)}</dd></div>
              <div><dt>Self-check</dt><dd>{booleanLabel(chat.meta.self_check)}</dd></div>
              <div><dt>Tool loops</dt><dd>{chat.meta.tool_iterations ?? '—'}</dd></div>
            </dl>
          </div>

          <details className="panel advanced-card">
            <summary>Advanced request controls</summary>
            <div className="advanced-fields">
              <label>
                Temperature <span>{settings.temperature.toFixed(1)}</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={settings.temperature}
                  onChange={event => onSettingsChange({ temperature: Number(event.target.value) })}
                />
              </label>
              <label>
                Max tokens
                <input
                  type="number"
                  min="64"
                  max="16384"
                  value={settings.maxTokens}
                  onChange={event => onSettingsChange({ maxTokens: Number(event.target.value) })}
                />
              </label>
              <label>
                RAG top K
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={settings.ragTopK}
                  onChange={event => onSettingsChange({ ragTopK: Number(event.target.value) })}
                />
              </label>
              <label>
                RAG character budget
                <input
                  type="number"
                  min="500"
                  max="30000"
                  step="500"
                  value={settings.ragMaxChars}
                  onChange={event => onSettingsChange({ ragMaxChars: Number(event.target.value) })}
                />
              </label>
              <label>
                Weather city
                <input value={settings.city} onChange={event => onSettingsChange({ city: event.target.value })} />
              </label>
              <label>
                Extra system prompt
                <textarea
                  rows={4}
                  value={settings.systemPrompt}
                  onChange={event => onSettingsChange({ systemPrompt: event.target.value })}
                  placeholder="Optional test-only instruction"
                />
              </label>
            </div>
          </details>

          <div className="panel source-card">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">Grounding</span>
                <h2>Sources</h2>
              </div>
              <span className="count-badge">{chat.sources.length}</span>
            </div>

            {chat.sources.length === 0 ? (
              <p className="muted-copy">No RAG sources reported for this response.</p>
            ) : (
              <div className="source-list">
                {chat.sources.map((source, index) => (
                  <div className="source-item" key={`${source.source}-${source.title}-${index}`}>
                    <div>
                      <b>{source.title || 'Untitled chunk'}</b>
                      <span>{source.source || 'unknown source'}</span>
                    </div>
                    {source.score !== undefined && <code>{String(source.score)}</code>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
