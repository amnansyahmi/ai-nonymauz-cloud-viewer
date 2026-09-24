import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient, normalizeBackendUrl } from './api/client';
import { Sidebar } from './components/Sidebar';
import { BenchmarkView } from './views/BenchmarkView';
import { ChatView } from './views/ChatView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { ImageView } from './views/ImageView';
import { RagView } from './views/RagView';
import { loadSettings, saveSettings } from './storage';
import type { AppTab, ChatSettings, HealthResponse, ProfilesResponse } from './types';

function backendHost(url: string): string {
  try {
    return new URL(normalizeBackendUrl(url)).host;
  } catch {
    return url || 'backend';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('chat');
  const [settings, setSettings] = useState<ChatSettings>(() => loadSettings());
  const [models, setModels] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfilesResponse>({});
  const [health, setHealth] = useState<HealthResponse>();
  const [connectionState, setConnectionState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateViewport = () => {
      document.documentElement.style.setProperty('--mobile-viewport-height', `${viewport.height}px`);
      const focused = document.activeElement;
      setKeyboardOpen(
        (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) &&
        viewport.height < window.innerHeight * 0.8
      );
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    window.addEventListener('focusin', updateViewport);
    window.addEventListener('focusout', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      window.removeEventListener('focusin', updateViewport);
      window.removeEventListener('focusout', updateViewport);
      document.documentElement.style.removeProperty('--mobile-viewport-height');
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<ChatSettings>) => {
    setSettings(current => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const refreshCore = useCallback(async () => {
    setConnectionState('checking');
    setConnectionMessage('');
    const client = new ApiClient(settings.backendUrl, settings.apiKey);
    const started = performance.now();

    const [healthResult, modelResult, profileResult] = await Promise.allSettled([
      client.health(),
      client.models(),
      client.profiles()
    ]);

    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value);
      setConnectionState('online');
      setConnectionMessage(`Connected in ${Math.round(performance.now() - started)} ms`);
    } else {
      setHealth(undefined);
      setConnectionState('offline');
      setConnectionMessage(healthResult.reason instanceof Error ? healthResult.reason.message : String(healthResult.reason));
    }

    if (modelResult.status === 'fulfilled') {
      setModels(modelResult.value.data?.map(item => item.id).filter(Boolean) ?? []);
    } else if (healthResult.status === 'fulfilled' && Array.isArray(healthResult.value.litellm_models)) {
      setModels(healthResult.value.litellm_models);
    } else {
      setModels([]);
    }

    if (profileResult.status === 'fulfilled') setProfiles(profileResult.value);
    else setProfiles({});
  }, [settings.apiKey, settings.backendUrl]);

  useEffect(() => {
    void refreshCore();
  }, [refreshCore]);

  useEffect(() => {
    if (settings.model !== 'auto' && models.length && !models.includes(settings.model)) {
      updateSettings({ model: 'auto' });
    }
  }, [models, settings.model, updateSettings]);

  const topSubtitle = useMemo(() => {
    const chunks = health?.knowledge_chunks;
    const parts = [backendHost(settings.backendUrl)];
    if (models.length) parts.push(`${models.length} models`);
    if (typeof chunks === 'number') parts.push(`${chunks} RAG chunks`);
    return parts.join(' · ');
  }, [health?.knowledge_chunks, models.length, settings.backendUrl]);

  return (
    <div className={`app-shell ${keyboardOpen ? 'keyboard-open' : ''}`}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        settings={settings}
        onSettingsChange={updateSettings}
        onReconnect={() => void refreshCore()}
        connectionState={connectionState}
        connectionMessage={connectionMessage}
      />

      <main className="main-shell">
        <header className="topbar">
          <div className="mobile-title"><span className="mobile-title-mark">AN</span><strong>AI Nonymauz</strong></div>
          <div className="topbar-context">
            <span className={`top-status ${connectionState}`}><i /></span>
            <span>{topSubtitle}</span>
          </div>
          <div className="topbar-meta">
            <span>backend-driven</span>
            <span>React 19</span>
            <span>v3.0</span>
          </div>
        </header>

        <div hidden={activeTab !== 'chat'}>
          <ChatView
            settings={settings}
            modelOptions={models}
            profiles={profiles}
            onSettingsChange={updateSettings}
          />
        </div>
        {activeTab === 'diagnostics' && <DiagnosticsView settings={settings} />}
        {activeTab === 'rag' && <RagView settings={settings} />}
        {activeTab === 'benchmark' && <BenchmarkView settings={settings} modelOptions={models} />}
        {activeTab === 'image' && <ImageView settings={settings} />}
      </main>
    </div>
  );
}
