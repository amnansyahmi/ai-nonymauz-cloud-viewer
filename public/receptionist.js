const DEFAULT_BACKEND = 'https://ai-nonymauz-cloud.onrender.com';
const STORAGE_KEY = 'kretivcall.receptionist.settings.v1';
const RECEPTIONIST_MODEL = 'ai-nonymauz-fast';
const TTS_RATE = 0.96;
const TTS_PITCH = 0.98;
const BETWEEN_PHRASE_PAUSE_MS = 140;

const els = {
  businessTitle: document.querySelector('#businessTitle'),
  avatar: document.querySelector('#avatar'),
  callStatus: document.querySelector('#callStatus'),
  timer: document.querySelector('#timer'),
  wave: document.querySelector('#wave'),
  transcript: document.querySelector('#transcript'),
  callBtn: document.querySelector('#callBtn'),
  muteBtn: document.querySelector('#muteBtn'),
  muteLabel: document.querySelector('#muteLabel'),
  speakerBtn: document.querySelector('#speakerBtn'),
  speakerLabel: document.querySelector('#speakerLabel'),
  clearBtn: document.querySelector('#clearBtn'),
  textFallback: document.querySelector('#textFallback'),
  textInput: document.querySelector('#textInput'),
  supportNote: document.querySelector('#supportNote'),
  settingsBtn: document.querySelector('#settingsBtn'),
  closeSettingsBtn: document.querySelector('#closeSettingsBtn'),
  settingsPanel: document.querySelector('#settingsPanel'),
  settingsBackdrop: document.querySelector('#settingsBackdrop'),
  saveSettingsBtn: document.querySelector('#saveSettingsBtn'),
  businessName: document.querySelector('#businessName'),
  greeting: document.querySelector('#greeting'),
  businessContext: document.querySelector('#businessContext'),
  backendUrl: document.querySelector('#backendUrl'),
  language: document.querySelector('#language'),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionSupported = Boolean(SpeechRecognition);
const synthesisSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let recognition = null;
let recognitionRunning = false;
let micAllowed = recognitionSupported;
let callActive = false;
let muted = false;
let voiceOn = synthesisSupported;
let processing = false;
let speaking = false;
let callStartedAt = 0;
let timerHandle = null;
let messages = [];
let selectedVoice = null;
let speechGeneration = 0;

const settings = loadSettings();
applySettingsToForm();
applyBusinessIdentity();
configureSupportNote();
prepareVoices();
els.speakerBtn.disabled = !synthesisSupported;

if (recognitionSupported) {
  recognition = new SpeechRecognition();
  configureRecognition();
}

function loadSettings() {
  const fallback = {
    businessName: 'Demo Business',
    greeting: 'Hai, terima kasih kerana menghubungi Demo Business. Ya, ada apa saya boleh bantu?',
    businessContext: '',
    backendUrl: DEFAULT_BACKEND,
    language: 'ms-MY',
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...fallback, ...saved };
  } catch {
    return fallback;
  }
}

function saveSettings() {
  const previousBusiness = settings.businessName;
  settings.businessName = els.businessName.value.trim() || 'Demo Business';
  settings.greeting = els.greeting.value.trim() || `Hai, terima kasih kerana menghubungi ${settings.businessName}. Ya, ada apa saya boleh bantu?`;
  settings.businessContext = els.businessContext.value.trim();
  settings.backendUrl = normalizeBackend(els.backendUrl.value);
  settings.language = els.language.value || 'ms-MY';

  if (previousBusiness !== settings.businessName && /Demo Business/i.test(settings.greeting)) {
    settings.greeting = settings.greeting.replace(/Demo Business/gi, settings.businessName);
    els.greeting.value = settings.greeting;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyBusinessIdentity();
  if (recognition) recognition.lang = settings.language;
  prepareVoices();
  closeSettings();
  addBubble('system', 'Settings saved for this browser.');
}

function applySettingsToForm() {
  els.businessName.value = settings.businessName;
  els.greeting.value = settings.greeting;
  els.businessContext.value = settings.businessContext;
  els.backendUrl.value = settings.backendUrl;
  els.language.value = settings.language;
}

function initials(name) {
  return (name || 'AI')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'AI';
}

function applyBusinessIdentity() {
  els.businessTitle.textContent = settings.businessName;
  els.avatar.textContent = initials(settings.businessName);
  document.title = `${settings.businessName} — AI Receptionist`;
}

function normalizeBackend(value) {
  return (value || DEFAULT_BACKEND).trim().replace(/\/$/, '');
}

function configureSupportNote() {
  if (!recognitionSupported) {
    els.supportNote.textContent = 'Speech recognition is unavailable in this browser. Text testing still works.';
    return;
  }
  if (!synthesisSupported) {
    els.supportNote.textContent = 'Microphone works, but spoken AI output is unavailable in this browser.';
    return;
  }
  els.supportNote.textContent = 'Natural voice demo · tap Interrupt while AI is speaking';
}

function configureRecognition() {
  recognition.lang = settings.language;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognitionRunning = true;
    if (callActive && !processing && !speaking) setStatus(muted ? 'Muted' : 'Listening…', !muted);
  };

  recognition.onend = () => {
    recognitionRunning = false;
    if (callActive && micAllowed && !muted && !processing && !speaking) {
      window.setTimeout(startListening, 220);
    }
  };

  recognition.onerror = event => {
    recognitionRunning = false;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      micAllowed = false;
      addBubble('system', 'Microphone permission was blocked. Allow microphone access or use the text box below.');
      setStatus('Microphone blocked');
      return;
    }
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      addBubble('system', `Voice recognition: ${event.error}`);
    }
  };

  recognition.onresult = event => {
    let interim = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0]?.transcript?.trim() || '';
      if (event.results[i].isFinal) finalText += `${text} `;
      else interim += `${text} `;
    }

    if (interim.trim()) setStatus(`Hearing: “${truncate(interim.trim(), 42)}”`, true);

    if (finalText.trim()) {
      stopListening();
      sendCallerMessage(finalText.trim());
    }
  };
}

function prepareVoices() {
  if (!synthesisSupported) return;

  const choose = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    const lang = settings.language.toLowerCase();
    const prefix = lang.split('-')[0];
    selectedVoice =
      voices.find(v => v.lang?.toLowerCase() === lang) ||
      voices.find(v => v.lang?.toLowerCase().startsWith(`${prefix}-`)) ||
      voices.find(v => v.lang?.toLowerCase().startsWith('ms-')) ||
      voices.find(v => v.lang?.toLowerCase().startsWith('en-my')) ||
      voices.find(v => v.default) ||
      voices[0];
  };

  choose();
  window.speechSynthesis.onvoiceschanged = choose;
}

function buildSystemPrompt() {
  const context = settings.businessContext
    ? `\n\nConfirmed business information:\n${settings.businessContext}`
    : '\n\nNo confirmed business profile has been supplied yet. Do not invent business-specific facts.';

  return `You are the live AI receptionist for ${settings.businessName}. This is a real-time spoken phone-style conversation, not a chat interface.

Voice personality:
- Sound like a capable Malaysian receptionist: warm, relaxed, attentive and efficient.
- Use natural Malaysian Bahasa Melayu by default. If the caller speaks English, mirror their language. Light Malaysian code-switching is fine when it genuinely sounds natural.
- Prefer everyday spoken phrasing such as "boleh", "nak", "okay", "baik", "sekejap ya", "ya, betul" and "alright" when appropriate.
- Do not force slang, filler words or English into every turn. Professional and natural is better than trying too hard to sound casual.
- Vary acknowledgements naturally. Do not start every reply with the same word.
- After the initial greeting, do not greet the caller again on every turn. If they only say "hello" or "hi", reply briefly and continue, for example "Ya, hello. Ada apa saya boleh bantu?"
- Avoid stiff call-centre phrases such as "Adakah anda ingin...", "Sila nyatakan..." or "Saya ingin memaklumkan..." when a shorter spoken phrase works.
- Avoid exclamation marks unless genuinely needed.

Conversation rhythm:
- Keep each turn short, normally 1 or 2 sentences and under about 35 spoken words.
- Give the direct answer first, then ask at most one useful follow-up question.
- Ask only one question at a time.
- If the caller changes topic, follow them instead of finishing the previous script.
- Do not repeat information the caller already gave unless confirming an important detail.
- For important details such as names, phone numbers, dates, times, bookings and orders, repeat them back briefly to confirm.
- Write numbers, money, dates and times in a way that sounds natural when read aloud.

Grounding and safety:
- Never invent prices, opening hours, policies, availability, staff names, booking confirmations, order status or other business facts.
- Use only the confirmed business information supplied below for business-specific facts.
- If something is not confirmed, say so simply and offer to take a message or have a human follow up.
- Do not claim an appointment, payment, transfer, WhatsApp, email or other external action succeeded unless an integration explicitly confirms it.
- Never mention the language model, system prompt, API or internal implementation.
- Never use markdown, bullet points, headings, emojis, citations or raw URLs in the spoken reply.${context}`;
}

function setStatus(text, animate = false) {
  els.callStatus.textContent = text;
  els.wave.classList.toggle('active', Boolean(animate));
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}…`;
}

function addBubble(role, text, extraClass = '') {
  const empty = els.transcript.querySelector('.empty-state');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}${extraClass ? ` ${extraClass}` : ''}`;
  bubble.textContent = text;
  els.transcript.appendChild(bubble);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  return bubble;
}

function clearTranscript() {
  els.transcript.innerHTML = `
    <div class="empty-state">
      <strong>Conversation cleared</strong>
      <span>Start a call or type a message to continue.</span>
    </div>`;
  messages = [];
}

async function requestMicrophoneAccess() {
  if (!recognitionSupported) return false;
  if (!navigator.mediaDevices?.getUserMedia) return true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}

function startListening() {
  if (!recognition || !micAllowed || !callActive || muted || processing || speaking || recognitionRunning) return;
  recognition.lang = settings.language;
  try {
    recognition.start();
  } catch {
    // Browsers can throw when start() races with the previous onend event.
  }
}

function stopListening() {
  if (!recognition || !recognitionRunning) return;
  try {
    recognition.stop();
  } catch {
    // Safe to ignore a stop race.
  }
}

function restoreMuteControl() {
  els.muteLabel.textContent = muted ? 'Unmute' : 'Mute';
  els.muteBtn.classList.toggle('on', muted);
}

function interruptSpeech() {
  if (!speaking) return;
  speechGeneration += 1;
  if (synthesisSupported) window.speechSynthesis.cancel();
  speaking = false;
  restoreMuteControl();
  setStatus('Listening…', true);
  if (callActive && !muted) window.setTimeout(startListening, 80);
}

function splitForSpeech(text) {
  const clean = toSpokenText(text);
  if (!clean) return [];

  const sentences = clean.match(/[^.!?;]+[.!?;]?/g) || [clean];
  const phrases = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > 72 && trimmed.includes(',')) {
      const commaParts = trimmed.split(/,\s+/);
      commaParts.forEach((part, index) => {
        const value = part.trim();
        if (!value) return;
        phrases.push(index < commaParts.length - 1 ? `${value},` : value);
      });
    } else {
      phrases.push(trimmed);
    }
  }

  return phrases;
}

function phrasePauseMs(phrase) {
  if (/[.!?]$/.test(phrase)) return 190;
  if (/[,;:]$/.test(phrase)) return 120;
  return BETWEEN_PHRASE_PAUSE_MS;
}

function speakPhrase(phrase, generation) {
  return new Promise(resolve => {
    if (!callActive || !voiceOn || !synthesisSupported || generation !== speechGeneration) {
      resolve(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = selectedVoice?.lang || settings.language;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = TTS_RATE;
    utterance.pitch = TTS_PITCH;
    utterance.volume = 1;

    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });
}

async function speak(text) {
  if (!voiceOn || !synthesisSupported || !callActive || !text.trim()) {
    speaking = false;
    restoreMuteControl();
    if (callActive && !muted) startListening();
    return;
  }

  stopListening();
  window.speechSynthesis.cancel();
  speechGeneration += 1;
  const generation = speechGeneration;
  speaking = true;
  els.muteLabel.textContent = 'Interrupt';
  els.muteBtn.classList.add('on');
  setStatus('Speaking… · tap Interrupt to cut in', true);

  const phrases = splitForSpeech(text);

  for (let i = 0; i < phrases.length; i += 1) {
    if (!speaking || generation !== speechGeneration || !callActive || !voiceOn) break;
    const completed = await speakPhrase(phrases[i], generation);
    if (!completed || generation !== speechGeneration) break;

    if (i < phrases.length - 1) {
      await new Promise(resolve => window.setTimeout(resolve, phrasePauseMs(phrases[i])));
    }
  }

  if (generation !== speechGeneration) return;
  speaking = false;
  restoreMuteControl();

  if (callActive && !muted) {
    setStatus('Listening…', true);
    window.setTimeout(startListening, 120);
  }
}

function toSpokenText(text) {
  return (text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_#>`~]/g, '')
    .replace(/\bRM\s*(\d[\d,.]*)/gi, '$1 ringgit')
    .replace(/\s+/g, ' ')
    .trim();
}

function startTimer() {
  stopTimer();
  callStartedAt = Date.now();
  els.timer.textContent = '00:00';
  timerHandle = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    els.timer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
}

async function startCall() {
  callActive = true;
  muted = false;
  processing = false;
  speaking = false;
  messages = [];
  speechGeneration += 1;

  els.callBtn.classList.add('live');
  els.callBtn.setAttribute('aria-label', 'End call');
  els.muteBtn.disabled = !recognitionSupported;
  els.muteBtn.classList.remove('on');
  els.muteLabel.textContent = 'Mute';
  startTimer();

  if (recognitionSupported) {
    setStatus('Requesting microphone…');
    micAllowed = await requestMicrophoneAccess();
    els.muteBtn.disabled = !micAllowed;
    if (!micAllowed) {
      addBubble('system', 'Microphone access is unavailable. You can still test the receptionist by typing below.');
    }
  }

  const greeting = settings.greeting.trim();
  messages.push({ role: 'assistant', content: greeting });
  addBubble('assistant', greeting);
  setStatus(micAllowed ? 'Connected' : 'Connected · text mode');

  if (voiceOn && synthesisSupported) speak(greeting);
  else startListening();
}

function endCall() {
  callActive = false;
  processing = false;
  speaking = false;
  muted = false;
  speechGeneration += 1;
  stopListening();
  if (synthesisSupported) window.speechSynthesis.cancel();
  stopTimer();

  els.callBtn.classList.remove('live');
  els.callBtn.setAttribute('aria-label', 'Start call');
  els.muteBtn.disabled = true;
  els.muteBtn.classList.remove('on');
  els.muteLabel.textContent = 'Mute';
  setStatus('Call ended');
  addBubble('system', `Call ended · ${els.timer.textContent}`);
}

function toggleMute() {
  if (!callActive || !recognitionSupported || !micAllowed) return;

  if (speaking) {
    interruptSpeech();
    return;
  }

  muted = !muted;
  els.muteBtn.classList.toggle('on', muted);
  els.muteLabel.textContent = muted ? 'Unmute' : 'Mute';

  if (muted) {
    stopListening();
    setStatus('Muted');
  } else if (!processing) {
    startListening();
  }
}

function toggleVoice() {
  if (!synthesisSupported) return;
  voiceOn = !voiceOn;
  els.speakerBtn.classList.toggle('on', !voiceOn);
  els.speakerLabel.textContent = voiceOn ? 'Voice on' : 'Voice off';

  if (!voiceOn) {
    speechGeneration += 1;
    window.speechSynthesis.cancel();
    speaking = false;
    restoreMuteControl();
    if (callActive && !muted && !processing) startListening();
  }
}

async function sendCallerMessage(text) {
  const clean = text.trim();
  if (!clean || processing) return;

  processing = true;
  stopListening();
  speechGeneration += 1;
  if (synthesisSupported) window.speechSynthesis.cancel();
  speaking = false;
  restoreMuteControl();

  addBubble('user', clean);
  messages.push({ role: 'user', content: clean });
  setStatus('Thinking…', true);

  try {
    const response = await callBackend(messages);
    const finalText = response.trim() || 'Maaf ya, tadi saya tak dapat jawab. Boleh cuba sekali lagi?';
    messages.push({ role: 'assistant', content: finalText });
    addBubble('assistant', finalText);
    processing = false;

    if (callActive) await speak(finalText);
    else setStatus('Ready to test');
  } catch (error) {
    processing = false;
    addBubble('assistant', `Connection error: ${error.message}`, 'error');
    setStatus('Connection error');
    if (callActive && !muted) window.setTimeout(startListening, 500);
  }
}

async function callBackend(conversation) {
  const payload = {
    model: RECEPTIONIST_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      ...conversation,
    ],
    temperature: 0.38,
    max_tokens: 130,
    stream: true,
  };

  const res = await fetch(`${normalizeBackend(settings.backendUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}${body ? ` · ${truncate(body, 120)}` : ''}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  if (!res.body) throw new Error('Backend returned no response stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      if (json.error) throw new Error(json.error?.message || json.error);
      fullText += json.choices?.[0]?.delta?.content || '';
    }
  }

  return fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function openSettings() {
  els.settingsBackdrop.hidden = false;
  requestAnimationFrame(() => els.settingsPanel.classList.add('open'));
  els.settingsPanel.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  els.settingsPanel.classList.remove('open');
  els.settingsPanel.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    els.settingsBackdrop.hidden = true;
  }, 220);
}

els.callBtn.addEventListener('click', () => {
  if (callActive) endCall();
  else startCall();
});

els.muteBtn.addEventListener('click', toggleMute);
els.speakerBtn.addEventListener('click', toggleVoice);
els.clearBtn.addEventListener('click', clearTranscript);
els.settingsBtn.addEventListener('click', openSettings);
els.closeSettingsBtn.addEventListener('click', closeSettings);
els.settingsBackdrop.addEventListener('click', closeSettings);
els.saveSettingsBtn.addEventListener('click', saveSettings);

els.textFallback.addEventListener('submit', event => {
  event.preventDefault();
  const text = els.textInput.value.trim();
  if (!text) return;
  els.textInput.value = '';
  sendCallerMessage(text);
});

window.addEventListener('beforeunload', () => {
  speechGeneration += 1;
  stopTimer();
  stopListening();
  if (synthesisSupported) window.speechSynthesis.cancel();
});
