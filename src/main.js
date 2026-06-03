import './style.css';

const DEFAULT_BASE_URL = import.meta.env.VITE_LITELLM_BASE_URL || 'https://ai-nonymauz-cloud.onrender.com';
const DEFAULT_MODELS = [
  'ai-nonymauz-coding',
  'ai-nonymauz-fast',
  'ai-nonymauz-qwen',
  'ai-nonymauz-free-pool'
];

const els = {
  baseUrl: document.getElementById('base-url'),
  apiKey: document.getElementById('api-key'),
  modelSelect: document.getElementById('model-select'),
  customModel: document.getElementById('custom-model'),
  customModelWrap: document.getElementById('custom-model-wrap'),
  maxTokens: document.getElementById('max-tokens'),
  temperature: document.getElementById('temperature'),
  tempVal: document.getElementById('temp-val'),
  streamToggle: document.getElementById('stream-toggle'),
  systemInput: document.getElementById('system-input'),
  chatWindow: document.getElementById('chat-window'),
  chatForm: document.getElementById('chat-form'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  stopBtn: document.getElementById('stop-btn'),
  clearBtn: document.getElementById('clear-btn'),
  copyCurlBtn: document.getElementById('copy-curl-btn'),
  loadModelsBtn: document.getElementById('load-models-btn'),
  statTokens: document.getElementById('stat-tokens'),
  statLatency: document.getElementById('stat-latency'),
  statModel: document.getElementById('stat-model'),
  connectionStatus: document.getElementById('connection-status')
};

let messages = [];
let activeAbortController = null;
let lastRequestBody = null;

bootstrap();

function bootstrap() {
  els.baseUrl.value = localStorage.getItem('litellm.baseUrl') || DEFAULT_BASE_URL;
  els.apiKey.value = localStorage.getItem('litellm.apiKey') || '';
  els.modelSelect.value = localStorage.getItem('litellm.model') || DEFAULT_MODELS[0];
  els.customModel.value = localStorage.getItem('litellm.customModel') || '';
  els.maxTokens.value = localStorage.getItem('litellm.maxTokens') || '1024';
  els.temperature.value = localStorage.getItem('litellm.temperature') || '0.7';
  els.tempVal.textContent = Number(els.temperature.value).toFixed(1);
  els.streamToggle.checked = localStorage.getItem('litellm.stream') !== 'false';
  toggleCustomModel();

  els.baseUrl.addEventListener('change', () => saveSetting('baseUrl', normaliseBaseUrl(els.baseUrl.value)));
  els.apiKey.addEventListener('change', () => saveSetting('apiKey', els.apiKey.value.trim()));
  els.modelSelect.addEventListener('change', () => {
    saveSetting('model', els.modelSelect.value);
    toggleCustomModel();
  });
  els.customModel.addEventListener('change', () => saveSetting('customModel', els.customModel.value.trim()));
  els.maxTokens.addEventListener('change', () => saveSetting('maxTokens', els.maxTokens.value));
  els.temperature.addEventListener('input', () => {
    els.tempVal.textContent = Number(els.temperature.value).toFixed(1);
    saveSetting('temperature', els.temperature.value);
  });
  els.streamToggle.addEventListener('change', () => saveSetting('stream', String(els.streamToggle.checked)));

  els.chatForm.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage();
  });
  els.stopBtn.addEventListener('click', stopStreaming);
  els.clearBtn.addEventListener('click', clearChat);
  els.copyCurlBtn.addEventListener('click', copyCurl);
  els.loadModelsBtn.addEventListener('click', loadModels);
  els.userInput.addEventListener('input', autoResize);
  els.userInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

function saveSetting(key, value) {
  localStorage.setItem(`litellm.${key}`, value);
}

function toggleCustomModel() {
  const isCustom = els.modelSelect.value === 'custom';
  els.customModelWrap.classList.toggle('hidden', !isCustom);
}

function normaliseBaseUrl(value) {
  return value.trim().replace(/\/$/, '');
}

function getModel() {
  return els.modelSelect.value === 'custom' ? els.customModel.value.trim() : els.modelSelect.value;
}

function getRequestConfig(userText) {
  const model = getModel();
  if (!model) throw new Error('Please choose or enter a model first.');

  const systemPrompt = els.systemInput.value.trim();
  const nextMessages = [...messages, { role: 'user', content: userText }];

  return {
    baseUrl: normaliseBaseUrl(els.baseUrl.value),
    apiKey: els.apiKey.value.trim(),
    body: {
      model,
      messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...nextMessages] : nextMessages,
      max_tokens: Number.parseInt(els.maxTokens.value, 10) || 1024,
      temperature: Number.parseFloat(els.temperature.value),
      stream: els.streamToggle.checked
    },
    nextMessages
  };
}

async function sendMessage() {
  const text = els.userInput.value.trim();
  if (!text || activeAbortController) return;

  let config;
  try {
    config = getRequestConfig(text);
  } catch (error) {
    alert(error.message);
    return;
  }

  if (!config.baseUrl) {
    alert('Base URL is required.');
    return;
  }

  messages = config.nextMessages;
  lastRequestBody = config.body;
  appendMsg('user', text);
  els.userInput.value = '';
  autoResize.call(els.userInput);
  setBusy(true);
  setStatus('pending', 'Sending...');
  resetStats();

  const assistantBubble = appendMsg('assistant', '', true);
  const startedAt = performance.now();
  activeAbortController = new AbortController();

  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: createHeaders(config.apiKey),
      body: JSON.stringify(config.body),
      signal: activeAbortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${trimError(errorText)}`);
    }

    const result = config.body.stream
      ? await readStreamingResponse(response, assistantBubble)
      : await readJsonResponse(response, assistantBubble);

    const latency = ((performance.now() - startedAt) / 1000).toFixed(2);
    messages.push({ role: 'assistant', content: result.text || '(empty response)' });
    assistantBubble.closest('.msg').classList.remove('streaming');
    els.statTokens.textContent = result.totalTokens || '—';
    els.statLatency.textContent = `${latency}s`;
    els.statModel.textContent = result.model || config.body.model;
    setStatus('ok', 'Connected');
  } catch (error) {
    assistantBubble.closest('.msg').remove();
    messages.pop();
    if (error.name === 'AbortError') {
      showError('Request stopped.');
      setStatus('pending', 'Stopped');
    } else {
      showError(error.message);
      setStatus('error', 'Error');
    }
  } finally {
    activeAbortController = null;
    setBusy(false);
  }
}

function createHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function readJsonResponse(response, bubble) {
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content || '';
  bubble.textContent = text;
  scrollToBottom();
  return {
    text,
    totalTokens: json.usage?.total_tokens,
    model: json.model
  };
}

async function readStreamingResponse(response, bubble) {
  if (!response.body) throw new Error('This browser does not support streaming responses.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let totalTokens = 0;
  let usedModel = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || '';
        fullText += delta;
        bubble.textContent = fullText;
        if (json.usage?.total_tokens) totalTokens = json.usage.total_tokens;
        if (json.model) usedModel = json.model;
        scrollToBottom();
      } catch {
        // Ignore malformed keep-alive chunks.
      }
    }
  }

  return { text: fullText, totalTokens, model: usedModel };
}

async function loadModels() {
  const baseUrl = normaliseBaseUrl(els.baseUrl.value);
  const apiKey = els.apiKey.value.trim();
  if (!baseUrl) return alert('Base URL is required.');

  setStatus('pending', 'Loading models...');
  els.loadModelsBtn.disabled = true;

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: createHeaders(apiKey)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${trimError(errorText)}`);
    }

    const json = await response.json();
    const ids = (json.data || []).map(item => item.id).filter(Boolean).sort();
    if (!ids.length) throw new Error('No models returned from /v1/models.');

    hydrateModelSelect(ids);
    setStatus('ok', `${ids.length} models loaded`);
  } catch (error) {
    showError(`Could not load models: ${error.message}`);
    setStatus('error', 'Model load failed');
  } finally {
    els.loadModelsBtn.disabled = false;
  }
}

function hydrateModelSelect(modelIds) {
  const current = getModel();
  els.modelSelect.innerHTML = '';

  for (const modelId of modelIds) {
    const option = document.createElement('option');
    option.value = modelId;
    option.textContent = modelId;
    els.modelSelect.appendChild(option);
  }

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom model...';
  els.modelSelect.appendChild(customOption);

  if (modelIds.includes(current)) {
    els.modelSelect.value = current;
  } else {
    els.modelSelect.value = modelIds[0];
  }

  toggleCustomModel();
  saveSetting('model', els.modelSelect.value);
}

function appendMsg(role, text, streaming = false) {
  const empty = els.chatWindow.querySelector('.empty-state');
  if (empty) empty.remove();

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${streaming ? ' streaming' : ''}`;

  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  wrap.append(label, bubble);
  els.chatWindow.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function showError(message) {
  const error = document.createElement('div');
  error.className = 'error-msg';
  error.textContent = message;
  els.chatWindow.appendChild(error);
  scrollToBottom();
}

function scrollToBottom() {
  els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
}

function setBusy(isBusy) {
  els.sendBtn.disabled = isBusy;
  els.stopBtn.disabled = !isBusy;
  els.loadModelsBtn.disabled = isBusy;
}

function setStatus(type, text) {
  els.connectionStatus.className = `status-pill ${type}`;
  els.connectionStatus.textContent = text;
}

function resetStats() {
  els.statTokens.textContent = '—';
  els.statLatency.textContent = '—';
  els.statModel.textContent = '—';
}

function clearChat() {
  messages = [];
  els.chatWindow.innerHTML = '<div class="empty-state">Send a message to begin.</div>';
  resetStats();
  setStatus('', 'Not tested');
}

function stopStreaming() {
  activeAbortController?.abort();
}

function autoResize() {
  this.style.height = 'auto';
  this.style.height = `${Math.min(this.scrollHeight, 160)}px`;
}

async function copyCurl() {
  const baseUrl = normaliseBaseUrl(els.baseUrl.value || DEFAULT_BASE_URL);
  const body = lastRequestBody || {
    model: getModel() || DEFAULT_MODELS[0],
    messages: [{ role: 'user', content: 'Hello. Reply with one short sentence.' }],
    max_tokens: Number.parseInt(els.maxTokens.value, 10) || 1024,
    temperature: Number.parseFloat(els.temperature.value),
    stream: els.streamToggle.checked
  };

  const apiKey = els.apiKey.value.trim() || '$LITELLM_API_KEY';
  const command = [
    `curl ${shellEscape(`${baseUrl}/v1/chat/completions`)} \\`,
    `  -H ${shellEscape('Content-Type: application/json')} \\`,
    `  -H ${shellEscape(`Authorization: Bearer ${apiKey}`)} \\`,
    `  -d ${shellEscape(JSON.stringify(body, null, 2))}`
  ].join('\n');

  await navigator.clipboard.writeText(command);
  els.copyCurlBtn.textContent = 'Copied';
  setTimeout(() => { els.copyCurlBtn.textContent = 'Copy cURL'; }, 1200);
}

function shellEscape(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function trimError(text) {
  return text.replace(/\s+/g, ' ').slice(0, 500);
}
