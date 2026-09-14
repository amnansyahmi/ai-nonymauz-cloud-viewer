import type { AppTab, ChatSettings } from '../types';
import {
  ChatIcon,
  CompareIcon,
  ImageIcon,
  PulseIcon,
  SearchIcon,
  SettingsIcon
} from './Icons';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  settings: ChatSettings;
  onSettingsChange: (patch: Partial<ChatSettings>) => void;
  onReconnect: () => void;
  connectionState: 'checking' | 'online' | 'offline';
  connectionMessage?: string;
}

const navItems: Array<{
  id: AppTab;
  label: string;
  description: string;
  icon: typeof ChatIcon;
}> = [
  { id: 'chat', label: 'Chat', description: 'Test responses', icon: ChatIcon },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Runtime health', icon: PulseIcon },
  { id: 'rag', label: 'RAG Inspector', description: 'Inspect retrieval', icon: SearchIcon },
  { id: 'benchmark', label: 'Benchmark', description: 'Compare models', icon: CompareIcon },
  { id: 'image', label: 'Image', description: 'Generation test', icon: ImageIcon }
];

export function Sidebar({
  activeTab,
  onTabChange,
  settings,
  onSettingsChange,
  onReconnect,
  connectionState,
  connectionMessage
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AN</div>
        <div>
          <strong>AI Nonymauz</strong>
          <span>Console v3</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Console sections">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <Icon />
              <span>
                <b>{item.label}</b>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <details className="connection-card">
        <summary>
          <span className="summary-icon"><SettingsIcon /></span>
          <span>
            <b>Connection</b>
            <small className={`connection-${connectionState}`}>
              <i className="status-dot" />
              {connectionState === 'checking'
                ? 'Checking backend'
                : connectionState === 'online'
                  ? 'Backend online'
                  : 'Backend unavailable'}
            </small>
          </span>
        </summary>

        <div className="connection-fields">
          <label>
            Backend URL
            <input
              value={settings.backendUrl}
              onChange={event => onSettingsChange({ backendUrl: event.target.value })}
              inputMode="url"
              spellCheck={false}
            />
          </label>

          <label>
            API key
            <input
              type="password"
              value={settings.apiKey}
              onChange={event => onSettingsChange({ apiKey: event.target.value })}
              placeholder="Bearer key (optional until auth is enabled)"
              autoComplete="off"
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={settings.rememberApiKey}
              onChange={event => onSettingsChange({ rememberApiKey: event.target.checked })}
            />
            Remember key on this device
          </label>

          <button className="primary compact" type="button" onClick={onReconnect}>
            Save & reconnect
          </button>

          {connectionMessage && <p className="connection-note">{connectionMessage}</p>}
          <p className="connection-note subtle">
            API keys are never read from Vite env variables because browser env values are public.
          </p>
        </div>
      </details>
    </aside>
  );
}
