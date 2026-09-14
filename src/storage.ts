import { DEFAULT_BACKEND } from './api/client';
import type { ChatSettings } from './types';

const SETTINGS_KEY = 'ai-nonymauz-console.settings.v3';
const SESSION_KEY = 'ai-nonymauz-console.api-key';
const LEGACY_API_KEY = 'litellm.apiKey';

const defaults: ChatSettings = {
  backendUrl: DEFAULT_BACKEND,
  apiKey: '',
  rememberApiKey: false,
  mode: 'normal',
  model: 'auto',
  temperature: 0.2,
  useCustomMaxTokens: false,
  maxTokens: 2048,
  ragTopK: 3,
  ragMaxChars: 5000,
  city: 'Shah Alam',
  useRag: true,
  useTools: true,
  systemPrompt: ''
};

function safeParse(value: string | null): Partial<ChatSettings> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Partial<ChatSettings>;
  } catch {
    return {};
  }
}

export function loadSettings(): ChatSettings {
  const saved = safeParse(localStorage.getItem(SETTINGS_KEY));
  const rememberedKey = typeof saved.apiKey === 'string' ? saved.apiKey : '';
  const sessionKey = sessionStorage.getItem(SESSION_KEY) || '';
  const legacyKey = localStorage.getItem(LEGACY_API_KEY) || '';

  return {
    ...defaults,
    ...saved,
    // Existing v3 users previously always sent max_tokens. Treat a missing
    // opt-in flag as OFF so the backend's dynamic token budget becomes the
    // default immediately after this upgrade.
    useCustomMaxTokens: saved.useCustomMaxTokens === true,
    apiKey: rememberedKey || sessionKey || legacyKey
  };
}

export function saveSettings(settings: ChatSettings): void {
  const sanitized: ChatSettings = {
    ...settings,
    apiKey: settings.rememberApiKey ? settings.apiKey : ''
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));

  if (settings.rememberApiKey) {
    sessionStorage.removeItem(SESSION_KEY);
  } else if (settings.apiKey) {
    sessionStorage.setItem(SESSION_KEY, settings.apiKey);
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // Remove the old key after a successful migration to the v3 settings model.
  localStorage.removeItem(LEGACY_API_KEY);
}
