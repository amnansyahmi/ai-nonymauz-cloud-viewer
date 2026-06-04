import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || 'https://ai-nonymauz-cloud.onrender.com';

const MODEL_OPTIONS = [
  'auto',
  'ai-nonymauz-groq-llama',
  'ai-nonymauz-fast',
  'ai-nonymauz-qwen',
  'ai-nonymauz-coding',
  'ai-nonymauz-free-pool',
  'ai-nonymauz-coding-backup',
  'ai-nonymauz-coding-llama'
];

const MODE_PRESETS = {
  fast: {
    label: 'Fast',
    hint: 'Groq, short answers, minimal RAG',
    model: 'auto',
    temperature: 0.2,
    maxTokens: 512,
    ragTopK: 1,
    ragMaxChars: 2000,
    useRag: true,
    useTools: true
  },
  normal: {
    label: 'Normal',
    hint: 'Balanced speed + quality',
    model: 'auto',
    temperature: 0.3,
    maxTokens: 1024,
    ragTopK: 2,
    ragMaxChars: 3500,
    useRag: true,
    useTools: true
  },
  deep: {
    label: 'Deep',
    hint: 'More context, longer answers',
    model: 'auto',
    temperature: 0.2,
    maxTokens: 2048,
    ragTopK: 4,
    ragMaxChars: 8000,
    useRag: true,
    useTools: true
  }
};

function cleanAssistantText(text) {
  return (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function getStoredNumber(key, fallback) {
  const value = localStorage.getItem(key);
  if (value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function App() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem('backendUrl') || DEFAULT_BACKEND);
  const [mode, setMode] = useState(localStorage.getItem('mode') || 'fast');
  const [model, setModel] = useState(localStorage.getItem('model') || 'auto');
  const preset = MODE_PRESETS[mode] || MODE_PRESETS.fast;

  const [temperature, setTemperature] = useState(getStoredNumber('temperature', preset.temperature));
  const [maxTokens, setMaxTokens] = useState(getStoredNumber('maxTokens', preset.maxTokens));
  const [ragTopK, setRagTopK] = useState(getStoredNumber('ragTopK', preset.ragTopK));
  const [ragMaxChars, setRagMaxChars] = useState(getStoredNumber('ragMaxChars', preset.ragMaxChars));
  const [city, setCity] = useState(localStorage.getItem('city') || 'Shah Alam');
  const [useRag, setUseRag] = useState(localStorage.getItem('useRag') !== 'false');
  const [useTools, setUseTools] = useState(localStorage.getItem('useTools') !== 'false');
  const [systemPrompt, setSystemPrompt] = useState(localStorage.getItem('systemPrompt') || '');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [stats, setStats] = useState({ latency: '—', firstToken: '—', model: '—', tokens: '—', rag: '—', tool: '—' });
  const [sources, setSources] = useState([]);

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState(localStorage.getItem('imageStyle') || 'realistic');
  const [imageSize, setImageSize] = useState(localStorage.getItem('imageSize') || '1024x1024');
  const [generatedImage, setGeneratedImage] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageMeta, setImageMeta] = useState(null);

  const chatRef = useRef(null);

  const canSend = useMemo(() => input.trim() && !isSending, [input, isSending]);
  const canGenerateImage = useMemo(() => imagePrompt.trim() && !imageLoading, [imagePrompt, imageLoading]);

  function applyMode(nextMode) {
    const nextPreset = MODE_PRESETS[nextMode] || MODE_PRESETS.fast;
    setMode(nextMode);
    setModel(nextPreset.model);
    setTemperature(nextPreset.temperature);
    setMaxTokens(nextPreset.maxTokens);
    setRagTopK(nextPreset.ragTopK);
    setRagMaxChars(nextPreset.ragMaxChars);
    setUseRag(nextPreset.useRag);
    setUseTools(nextPreset.useTools);
  }

  function persist() {
    localStorage.setItem('backendUrl', backendUrl);
    localStorage.setItem('mode', mode);
    localStorage.setItem('model', model);
    localStorage.setItem('temperature', String(temperature));
    localStorage.setItem('maxTokens', String(maxTokens));
    localStorage.setItem('ragTopK', String(ragTopK));
    localStorage.setItem('ragMaxChars', String(ragMaxChars));
    localStorage.setItem('city', city);
    localStorage.setItem('useRag', String(useRag));
    localStorage.setItem('useTools', String(useTools));
    localStorage.setItem('systemPrompt', systemPrompt);
    localStorage.setItem('imageStyle', imageStyle);
    localStorage.setItem('imageSize', imageSize);
  }

  function scrollBottom() {
    setTimeout(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, 0);
  }

  async function sendMessage() {
    if (!canSend) return;
    persist();
    setSources([]);
    setStats({ latency: '—', firstToken: '—', model: '—', tokens: '—', rag: '—', tool: '—' });

    const text = input.trim();
    setInput('');
    setIsSending(true);
    const started = Date.now();
    let firstTokenMs = null;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages([...nextMessages, { role: 'assistant', content: '', streaming: true }]);
    scrollBottom();

    try {
      const body = {
        mode,
        model: model === 'auto' ? null : model,
        messages: nextMessages,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        use_rag: useRag,
        use_tools: useTools,
        city,
        rag_top_k: ragTopK,
        rag_max_context_chars: ragMaxChars
      };

      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 700)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let usedModel = model === 'auto' ? mode : model;
      let totalTokens = '—';
      let usedRag = '—';
      let usedTool = '—';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error);

          if (json.ai_nonymauz_meta) {
            usedModel = json.ai_nonymauz_meta.model || usedModel;
            usedRag = json.ai_nonymauz_meta.used_rag ? 'yes' : 'no';
            usedTool = json.ai_nonymauz_meta.used_weather_tool ? 'weather' : 'no';
            setSources(json.ai_nonymauz_meta.sources || []);
            setStats(s => ({ ...s, model: usedModel, rag: usedRag, tool: usedTool }));
            continue;
          }

          if (json.ai_nonymauz_done) {
            continue;
          }

          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - started;
              setStats(s => ({ ...s, firstToken: `${(firstTokenMs / 1000).toFixed(2)}s` }));
            }
            fullText += delta;
            const cleaned = cleanAssistantText(fullText);
            setMessages([...nextMessages, { role: 'assistant', content: cleaned, streaming: true }]);
            scrollBottom();
          }
          if (json.model) usedModel = json.model;
          if (json.usage?.total_tokens) totalTokens = json.usage.total_tokens;
        }
      }

      const finalText = cleanAssistantText(fullText);
      setMessages([...nextMessages, { role: 'assistant', content: finalText, streaming: false }]);
      setStats({
        latency: `${((Date.now() - started) / 1000).toFixed(2)}s`,
        firstToken: firstTokenMs === null ? '—' : `${(firstTokenMs / 1000).toFixed(2)}s`,
        model: usedModel,
        tokens: totalTokens,
        rag: usedRag,
        tool: usedTool
      });
    } catch (err) {
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${err.message}`, error: true }]);
    } finally {
      setIsSending(false);
      scrollBottom();
    }
  }

  async function pingBackend() {
    try {
      const started = Date.now();
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/health`);
      const json = await res.json();
      alert(`Backend OK in ${Date.now() - started}ms\nKnowledge chunks: ${json.knowledge_chunks ?? '—'}\nLiteLLM: ${json.litellm_base_url}`);
    } catch (err) {
      alert(`Backend ping failed: ${err.message}`);
    }
  }

  function clearChat() {
    setMessages([]);
    setSources([]);
    setStats({ latency: '—', firstToken: '—', model: '—', tokens: '—', rag: '—', tool: '—' });
  }

  function copyCurl() {
    const body = {
      mode,
      model: model === 'auto' ? null : model,
      messages: [{ role: 'user', content: input || 'Hello' }],
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      use_rag: useRag,
      use_tools: useTools,
      city,
      rag_top_k: ragTopK,
      rag_max_context_chars: ragMaxChars
    };
    navigator.clipboard.writeText(`curl -X POST "${backendUrl.replace(/\/$/, '')}/chat" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body).replaceAll("'", "'\\''")}'`);
  }


  async function generateImage() {
    if (!canGenerateImage) return;
    persist();
    setImageLoading(true);
    setImageError('');
    setGeneratedImage('');
    setImageMeta(null);

    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/image/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt.trim(),
          style: imageStyle,
          size: imageSize
        })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 700)}`);
      }

      const data = await res.json();
      setGeneratedImage(`data:${data.mime_type};base64,${data.image_base64}`);
      setImageMeta({
        model: data.model,
        usageToday: data.usage_today,
        dailyLimit: data.daily_limit
      });
    } catch (err) {
      setImageError(err.message || 'Image generation failed');
    } finally {
      setImageLoading(false);
    }
  }

  function downloadGeneratedImage() {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = 'ai-nonymauz-image.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <h1>AI Nonymauz Tester</h1>
          <p>Fast mode + cached markdown RAG + tools + LiteLLM streaming</p>
        </div>
        <button onClick={pingBackend}>Ping backend</button>
      </header>

      <section className="mode-row">
        {Object.entries(MODE_PRESETS).map(([key, item]) => (
          <button key={key} className={`mode-card ${mode === key ? 'active' : ''}`} onClick={() => applyMode(key)}>
            <b>{item.label}</b>
            <span>{item.hint}</span>
          </button>
        ))}
      </section>

      <section className="panel settings">
        <label className="wide">
          Backend URL
          <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} />
        </label>

        <label>
          Model
          <select value={model} onChange={e => setModel(e.target.value)}>
            {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label>
          City for weather
          <input value={city} onChange={e => setCity(e.target.value)} />
        </label>

        <label>
          Temperature: {temperature.toFixed(1)}
          <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} />
        </label>

        <label>
          Max tokens
          <input type="number" min="64" max="8192" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} />
        </label>

        <label>
          RAG top chunks
          <span className="field-hint">How many relevant .md sections to include. Higher = better context but slower.</span>
          <input type="number" min="0" max="8" value={ragTopK} onChange={e => setRagTopK(Number(e.target.value))} />
        </label>

        <label>
          RAG max chars
          <span className="field-hint">Maximum markdown text sent to AI. Higher = more accurate but uses more tokens.</span>
          <input type="number" min="500" max="20000" step="500" value={ragMaxChars} onChange={e => setRagMaxChars(Number(e.target.value))} />
        </label>

        <div className="checks">
          <label><input type="checkbox" checked={useRag} onChange={e => setUseRag(e.target.checked)} /> Auto-check .md knowledge</label>
          <label><input type="checkbox" checked={useTools} onChange={e => setUseTools(e.target.checked)} /> Use tools, e.g. weather</label>
        </div>

        <label className="wide">
          Extra system prompt
          <textarea rows="3" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="Optional extra instruction..." />
        </label>
      </section>

      <section className="panel chat" ref={chatRef}>
        {messages.length === 0 && <div className="empty">Ask something. Try: “what is the weather today?” or “why OpenRouter free model 404?”</div>}
        {messages.map((m, i) => (
          <div className={`msg ${m.role} ${m.streaming ? 'streaming' : ''} ${m.error ? 'error' : ''}`} key={i}>
            <div className="label">{m.role}</div>
            <div className="bubble">{m.content || (m.streaming ? 'Starting stream...' : '')}</div>
          </div>
        ))}
      </section>

      <section className="stats">
        <span>first token <b>{stats.firstToken}</b></span>
        <span>total <b>{stats.latency}</b></span>
        <span>model <b>{stats.model}</b></span>
        <span>tokens <b>{stats.tokens}</b></span>
        <span>rag <b>{stats.rag}</b></span>
        <span>tool <b>{stats.tool}</b></span>
        <button onClick={copyCurl}>Copy cURL</button>
        <button onClick={clearChat}>Clear</button>
      </section>

      {sources.length > 0 && (
        <section className="sources">
          <b>Knowledge used</b>
          {sources.map((s, i) => <span key={i}>{s.source} / {s.title} · score {s.score}</span>)}
        </section>
      )}

      <section className="panel image-panel">
        <div className="image-header">
          <div>
            <h2>Image Generation</h2>
            <p>Uses your backend <code>/image/generate</code> route with Gemini.</p>
          </div>
          {imageMeta && (
            <span className="image-meta">
              {imageMeta.model} · {imageMeta.usageToday}/{imageMeta.dailyLimit} today
            </span>
          )}
        </div>

        <textarea
          rows="4"
          value={imagePrompt}
          onChange={e => setImagePrompt(e.target.value)}
          placeholder="Describe the image you want. Example: A cute robot coding at a desk, futuristic office, warm lighting"
        />

        <div className="image-controls">
          <label>
            Style
            <select value={imageStyle} onChange={e => setImageStyle(e.target.value)}>
              <option value="realistic">Realistic</option>
              <option value="product">Product</option>
              <option value="poster">Poster</option>
              <option value="logo">Logo</option>
              <option value="anime">Anime</option>
              <option value="ui">UI Mockup</option>
              <option value="infographic">Infographic</option>
              <option value="cinematic">Cinematic</option>
            </select>
          </label>

          <label>
            Size / aspect
            <select value={imageSize} onChange={e => setImageSize(e.target.value)}>
              <option value="1024x1024">Square 1024x1024</option>
              <option value="16:9">Wide 16:9</option>
              <option value="9:16">Portrait 9:16</option>
              <option value="4:3">Landscape 4:3</option>
            </select>
          </label>

          <button disabled={!canGenerateImage} onClick={generateImage}>
            {imageLoading ? 'Generating...' : 'Generate image'}
          </button>

          {generatedImage && <button onClick={downloadGeneratedImage}>Download</button>}
        </div>

        {imageError && <div className="image-error">{imageError}</div>}

        {generatedImage && (
          <div className="image-result">
            <img src={generatedImage} alt="Generated result" />
          </div>
        )}
      </section>

      <section className="composer">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        }} placeholder="Type your question..." />
        <button disabled={!canSend} onClick={sendMessage}>{isSending ? 'Sending...' : 'Send'}</button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
