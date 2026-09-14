import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { useChat } from '../hooks/useChat';
import { useVoiceInput } from '../hooks/useVoiceInput';
import {
  chatContentImages,
  chatContentText,
  formatBytes,
  MAX_CHAT_IMAGES,
  prepareChatImage
} from '../chatImages';
import {
  CHAT_FILE_ACCEPT,
  isImageFile,
  MAX_CHAT_FILES,
  prepareChatFile
} from '../chatFiles';
import type {
  ChatAttachment,
  ChatDisplayAttachment,
  ChatSettings,
  ProfilesResponse
} from '../types';
import { MarkdownMessage } from '../components/MarkdownMessage';
import {
  FileIcon,
  ImageIcon,
  MicIcon,
  PlusIcon,
  RepeatIcon,
  SendIcon,
  StopIcon,
  TrashIcon
} from '../components/Icons';
import '../image-upload.css';

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

function fallbackDisplayAttachments(messageImages: ReturnType<typeof chatContentImages>): ChatDisplayAttachment[] {
  return messageImages.map((image, index) => ({
    kind: 'image',
    name: `Image ${index + 1}`,
    mimeType: 'image/*',
    sizeBytes: 0,
    dataUrl: image.image_url.url
  }));
}

export function ChatView({ settings, modelOptions, profiles, onSettingsChange }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [processingFiles, setProcessingFiles] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [runtimeOpen, setRuntimeOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 620
  ));
  const chat = useChat(settings);
  const voice = useVoiceInput(input, setInput);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const modeOptions = useMemo(
    () => Array.from(new Set(['auto', 'fast', 'normal', 'deep', 'vision', ...Object.keys(profiles)])),
    [profiles]
  );
  const imageCount = attachments.filter(attachment => attachment.kind === 'image').length;
  const fileCount = attachments.filter(attachment => attachment.kind === 'file').length;

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  async function addImages(files: File[]) {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) return;

    const available = Math.max(0, MAX_CHAT_IMAGES - imageCount);
    if (available === 0) {
      setAttachmentError(`You can attach up to ${MAX_CHAT_IMAGES} images per message.`);
      return;
    }

    setAttachmentError('');
    const prepared: ChatAttachment[] = [];
    for (const file of imageFiles.slice(0, available)) {
      try {
        prepared.push(await prepareChatImage(file));
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : String(error));
      }
    }

    if (imageFiles.length > available) {
      setAttachmentError(`Only ${available} more image${available === 1 ? '' : 's'} could be added.`);
    }
    if (prepared.length) setAttachments(previous => [...previous, ...prepared]);
  }

  async function addDocuments(files: File[]) {
    const documentFiles = files.filter(file => !isImageFile(file));
    if (documentFiles.length === 0) return;

    const available = Math.max(0, MAX_CHAT_FILES - fileCount);
    if (available === 0) {
      setAttachmentError(`You can attach up to ${MAX_CHAT_FILES} files per message.`);
      return;
    }

    setAttachmentMenuOpen(false);
    setAttachmentError('');
    setProcessingFiles(previous => previous + Math.min(available, documentFiles.length));
    const client = new ApiClient(settings.backendUrl, settings.apiKey);
    const prepared: ChatAttachment[] = [];

    for (const file of documentFiles.slice(0, available)) {
      try {
        prepared.push(await prepareChatFile(file, client));
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : String(error));
      } finally {
        setProcessingFiles(previous => Math.max(0, previous - 1));
      }
    }

    if (documentFiles.length > available) {
      setAttachmentError(`Only ${available} more file${available === 1 ? '' : 's'} could be added.`);
    }
    if (prepared.length) setAttachments(previous => [...previous, ...prepared]);
  }

  async function handleFiles(files: File[]) {
    await addImages(files.filter(isImageFile));
    await addDocuments(files.filter(file => !isImageFile(file)));
  }

  async function submit() {
    const value = input.trim();
    if ((!value && attachments.length === 0) || chat.sending || processingFiles > 0) return;

    voice.stop();
    const pendingAttachments = attachments;
    setInput('');
    setAttachments([]);
    setAttachmentError('');
    setAttachmentMenuOpen(false);
    await chat.send(value, pendingAttachments);
  }

  const hasConversation = chat.messages.length > 0;
  const canSend = (Boolean(input.trim()) || attachments.length > 0) && processingFiles === 0;
  const visionRoutingActive = imageCount > 0;

  return (
    <>
      <section className="workspace chat-workspace">
        <div className="page-heading chat-heading">
          <div>
            <span className="eyebrow">Playground</span>
            <h1>Chat</h1>
            <p>Chat with live models, images and documents, or dictate a prompt with your microphone.</p>
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
                  <h2>Ask, attach, or speak.</h2>
                  <p>
                    AI Nonymauz can read screenshots, photos, PDFs, Office files, text/code files and normal prompts.
                  </p>
                  <div className="prompt-suggestions">
                    {[
                      'Explain the latest .NET approach for a minimal API with EF Core.',
                      'Attach a screenshot and ask what should be improved.',
                      'Attach a PDF or spreadsheet and ask for a summary.'
                    ].map(prompt => (
                      <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chat.messages.map((message, index) => {
                const contentImages = chatContentImages(message.content);
                const displayAttachments = message.displayAttachments?.length
                  ? message.displayAttachments
                  : fallbackDisplayAttachments(contentImages);
                const messageImages = displayAttachments.filter(attachment => attachment.kind === 'image' && attachment.dataUrl);
                const messageFiles = displayAttachments.filter(attachment => attachment.kind === 'file');
                const messageText = message.displayText !== undefined
                  ? message.displayText
                  : chatContentText(message.content);

                return (
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

                      {messageImages.length > 0 && (
                        <div className={`message-image-grid count-${Math.min(messageImages.length, 4)}`}>
                          {messageImages.map((image, imageIndex) => (
                            <button
                              type="button"
                              className="message-image-button"
                              key={`${index}-${imageIndex}-${image.name}`}
                              onClick={() => image.dataUrl && setPreviewImage(image.dataUrl)}
                              aria-label={`Preview ${image.name}`}
                            >
                              <img src={image.dataUrl} alt={image.name} />
                            </button>
                          ))}
                        </div>
                      )}

                      {messageFiles.length > 0 && (
                        <div className="message-file-list">
                          {messageFiles.map((file, fileIndex) => (
                            <div className="message-file-chip" key={`${index}-${fileIndex}-${file.name}`}>
                              <FileIcon />
                              <div>
                                <b>{file.name}</b>
                                <span>
                                  {file.extractedChars ? `${file.extractedChars.toLocaleString()} chars read` : formatBytes(file.sizeBytes)}
                                  {file.truncated ? ' · context capped' : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="markdown-body">
                        {messageText
                          ? <MarkdownMessage content={messageText} />
                          : message.streaming
                            ? <span className="typing-dots"><i /><i /><i /></span>
                            : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div
              className={`composer-wrap ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={event => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={event => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={event => {
                if (event.currentTarget === event.target) setDragActive(false);
              }}
              onDrop={event => {
                event.preventDefault();
                setDragActive(false);
                void handleFiles(Array.from(event.dataTransfer.files));
              }}
            >
              {dragActive && (
                <div className="drop-overlay">
                  <PlusIcon />
                  <span>Drop images or files to attach</span>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="attachment-strip">
                  {attachments.map(attachment => (
                    <div className={`attachment-card ${attachment.kind}`} key={attachment.id}>
                      {attachment.kind === 'image' ? (
                        <button
                          type="button"
                          className="attachment-preview"
                          onClick={() => setPreviewImage(attachment.dataUrl)}
                          aria-label={`Preview ${attachment.name}`}
                        >
                          <img src={attachment.dataUrl} alt={attachment.name} />
                        </button>
                      ) : (
                        <div className="attachment-file-icon"><FileIcon /></div>
                      )}
                      <button
                        type="button"
                        className="attachment-remove"
                        onClick={() => setAttachments(previous => previous.filter(item => item.id !== attachment.id))}
                        aria-label={`Remove ${attachment.name}`}
                      >
                        ×
                      </button>
                      <div className="attachment-meta">
                        <span title={attachment.name}>{attachment.name}</span>
                        <small>
                          {attachment.kind === 'image'
                            ? `${attachment.width}×${attachment.height} · ${formatBytes(attachment.sizeBytes)}`
                            : `${attachment.extractedChars.toLocaleString()} chars · ${formatBytes(attachment.sizeBytes)}${attachment.truncated ? ' · capped' : ''}`}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {visionRoutingActive && (
                <div className="vision-routing-note">
                  <ImageIcon />
                  <span>
                    Vision routing active
                    {settings.model !== 'auto' && settings.model !== 'ai-nonymauz-vision'
                      ? ` · ${settings.model} will be released so the backend can choose a vision model`
                      : ' · backend will use an image-capable model'}
                  </span>
                </div>
              )}

              {processingFiles > 0 && (
                <div className="file-processing-note"><span className="mini-spinner" /> Reading {processingFiles} file{processingFiles === 1 ? '' : 's'}…</div>
              )}
              {attachmentError && <div className="attachment-error">{attachmentError}</div>}
              {voice.error && <div className="attachment-error">{voice.error}</div>}

              <input
                ref={imageInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={event => {
                  void addImages(Array.from(event.target.files || []));
                  event.currentTarget.value = '';
                  setAttachmentMenuOpen(false);
                }}
              />
              <input
                ref={documentInputRef}
                className="hidden-file-input"
                type="file"
                accept={CHAT_FILE_ACCEPT}
                multiple
                onChange={event => {
                  void addDocuments(Array.from(event.target.files || []));
                  event.currentTarget.value = '';
                }}
              />

              <div className="composer-shell">
                <div className="composer-row">
                  <div className="attachment-menu-wrap">
                    <button
                      className={`composer-icon-button plus-button ${attachmentMenuOpen ? 'active' : ''}`}
                      type="button"
                      disabled={chat.sending}
                      onClick={() => setAttachmentMenuOpen(open => !open)}
                      aria-label="Add attachment"
                      title="Add attachment"
                    >
                      <PlusIcon />
                    </button>
                    {attachmentMenuOpen && (
                      <div className="attachment-menu">
                        <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageCount >= MAX_CHAT_IMAGES}>
                          <ImageIcon />
                          <span><b>Photo or image</b><small>Screenshot, camera or library</small></span>
                        </button>
                        <button type="button" onClick={() => documentInputRef.current?.click()} disabled={fileCount >= MAX_CHAT_FILES || processingFiles > 0}>
                          <FileIcon />
                          <span><b>Upload file</b><small>PDF, Office, text and code</small></span>
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onPaste={event => {
                      const pasted = Array.from(event.clipboardData.items)
                        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
                        .map(item => item.getAsFile())
                        .filter((file): file is File => Boolean(file));
                      if (pasted.length > 0) {
                        event.preventDefault();
                        void addImages(pasted);
                      }
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder={
                      attachments.some(attachment => attachment.kind === 'file')
                        ? 'Ask something about the attached file…'
                        : imageCount > 0
                          ? 'Ask something about the image…'
                          : voice.listening
                            ? 'Listening…'
                            : 'Message AI Nonymauz…'
                    }
                    rows={1}
                  />

                  <div className="composer-actions">
                    <button
                      className={`composer-icon-button mic-button ${voice.listening ? 'listening' : ''}`}
                      type="button"
                      disabled={!voice.supported || chat.sending}
                      onClick={voice.toggle}
                      aria-label={voice.listening ? 'Stop voice input' : 'Use voice input'}
                      title={voice.supported ? (voice.listening ? 'Stop listening' : 'Use voice input') : 'Voice input is not supported by this browser'}
                    >
                      {voice.listening ? <StopIcon /> : <MicIcon />}
                    </button>
                    {chat.sending ? (
                      <button className="stop-button" type="button" onClick={chat.stop} aria-label="Stop generation">
                        <StopIcon />
                      </button>
                    ) : (
                      <button className="send-button" type="button" disabled={!canSend} onClick={() => void submit()} aria-label="Send message">
                        <SendIcon />
                      </button>
                    )}
                  </div>
                </div>
                <div className="composer-footer">
                  <span>{voice.listening ? 'Listening · tap the mic to stop' : 'Enter to send · Shift+Enter for new line'}</span>
                  <span>{imageCount > 0 ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : ''}{imageCount > 0 && fileCount > 0 ? ' · ' : ''}{fileCount > 0 ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : ''}</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="inspector-stack">
            <details
              className="panel inspector-card runtime-details"
              open={runtimeOpen}
              onToggle={event => setRuntimeOpen(event.currentTarget.open)}
            >
              <summary className="runtime-summary">
                <div>
                  <span className="eyebrow">Live trace</span>
                  <h2>Runtime</h2>
                </div>
                <span className={`live-badge ${chat.sending ? 'active' : ''}`}>{chat.sending ? 'LIVE' : 'IDLE'}</span>
              </summary>

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
            </details>

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

                <label className="advanced-toggle-row">
                  <span>
                    <b>Custom max tokens</b>
                    <small>Off uses the backend's dynamic output budget.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.useCustomMaxTokens}
                    onChange={event => onSettingsChange({ useCustomMaxTokens: event.target.checked })}
                  />
                </label>

                {settings.useCustomMaxTokens && (
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
                )}

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

      {previewImage && (
        <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button type="button" className="lightbox-close" onClick={() => setPreviewImage(null)} aria-label="Close image preview">×</button>
          <img src={previewImage} alt="Attachment preview" onClick={event => event.stopPropagation()} />
        </div>
      )}
    </>
  );
}
