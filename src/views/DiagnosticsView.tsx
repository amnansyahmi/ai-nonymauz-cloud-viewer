import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../api/client';
import { RefreshIcon } from '../components/Icons';
import type {
  ChatSettings,
  HealthResponse,
  ImageStatusResponse,
  KnowledgeResponse,
  ModelsResponse,
  ProfilesResponse
} from '../types';

interface DiagnosticsViewProps {
  settings: ChatSettings;
}

interface DiagnosticData {
  health?: HealthResponse;
  models?: ModelsResponse;
  profiles?: ProfilesResponse;
  knowledge?: KnowledgeResponse;
  imageStatus?: ImageStatusResponse;
}

function yesNo(value: unknown): string {
  if (value === true) return 'Enabled';
  if (value === false) return 'Disabled';
  return 'Unknown';
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DiagnosticsView({ settings }: DiagnosticsViewProps) {
  const [data, setData] = useState<DiagnosticData>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [roundTripMs, setRoundTripMs] = useState<number>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const client = new ApiClient(settings.backendUrl, settings.apiKey);
    const started = performance.now();

    const requests = await Promise.allSettled([
      client.health(),
      client.models(),
      client.profiles(),
      client.knowledge(),
      client.imageStatus()
    ]);

    setRoundTripMs(Math.round(performance.now() - started));

    const next: DiagnosticData = {};
    const nextErrors: string[] = [];
    const keys: Array<keyof DiagnosticData> = ['health', 'models', 'profiles', 'knowledge', 'imageStatus'];

    requests.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        (next as Record<string, unknown>)[keys[index]] = result.value;
      } else {
        nextErrors.push(`${keys[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    });

    setData(next);
    setErrors(nextErrors);
    setLoading(false);
  }, [settings.apiKey, settings.backendUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const modelIds = useMemo(
    () => data.models?.data?.map(item => item.id).filter(Boolean) ?? [],
    [data.models]
  );

  const memoryEntries = Object.entries(data.health?.memory ?? {});
  const profileEntries = Object.entries(data.profiles ?? {});

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Diagnostics</h1>
          <p>Read the backend's live state instead of relying on frontend assumptions.</p>
        </div>
        <button className="secondary icon-text" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshIcon className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {errors.length > 0 && (
        <div className="error-banner">
          <b>Some diagnostic endpoints failed.</b>
          {errors.map(error => <span key={error}>{error}</span>)}
        </div>
      )}

      <div className="metric-grid">
        <div className="metric-card"><span>Backend</span><strong>{data.health?.ok ? 'Online' : loading ? 'Checking' : 'Unknown'}</strong><small>{data.health?.app ?? settings.backendUrl}</small></div>
        <div className="metric-card"><span>Console round trip</span><strong>{roundTripMs === undefined ? '—' : `${roundTripMs} ms`}</strong><small>5 diagnostic requests</small></div>
        <div className="metric-card"><span>Models exposed</span><strong>{modelIds.length || '—'}</strong><small>from /v1/models</small></div>
        <div className="metric-card"><span>Knowledge chunks</span><strong>{data.health?.knowledge_chunks ?? data.knowledge?.chunks ?? '—'}</strong><small>{data.knowledge?.files?.length ?? '—'} markdown files</small></div>
      </div>

      <div className="diagnostic-grid">
        <div className="panel diagnostic-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Retrieval</span><h2>RAG status</h2></div>
          </div>
          <div className="status-cards">
            <div><span>BM25</span><b className={data.health?.bm25_rag_enabled ? 'good' : ''}>{yesNo(data.health?.bm25_rag_enabled)}</b></div>
            <div><span>Vector RAG</span><b className={data.health?.vector_rag_enabled ? 'good' : ''}>{yesNo(data.health?.vector_rag_enabled)}</b></div>
            <div><span>Embeddings</span><b className={data.health?.embedding_rag_enabled ? 'good' : ''}>{yesNo(data.health?.embedding_rag_enabled)}</b></div>
          </div>
          <dl className="detail-list">
            <div><dt>Embedding model</dt><dd>{valueText(data.health?.embedding_model)}</dd></div>
            <div><dt>Knowledge loaded</dt><dd>{valueText(data.knowledge?.loaded_at)}</dd></div>
            <div><dt>Backend mode</dt><dd>{valueText(data.health?.mode)}</dd></div>
          </dl>
        </div>

        <div className="panel diagnostic-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Memory</span><h2>Runtime footprint</h2></div>
          </div>
          {memoryEntries.length ? (
            <dl className="detail-list">
              {memoryEntries.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{valueText(value)}</dd></div>)}
            </dl>
          ) : <p className="muted-copy">Memory metrics were not returned by this deployment.</p>}
        </div>

        <div className="panel diagnostic-panel wide-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Router</span><h2>Available model aliases</h2></div>
            <span className="count-badge">{modelIds.length}</span>
          </div>
          <div className="model-chip-grid">
            {modelIds.length
              ? modelIds.map(model => <code key={model}>{model}</code>)
              : <p className="muted-copy">No model list available.</p>}
          </div>
        </div>

        <div className="panel diagnostic-panel wide-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Profiles</span><h2>Mode routing</h2></div>
            <span className="count-badge">{profileEntries.length}</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Mode</th><th>Model</th><th>Temp</th><th>Max tokens</th><th>RAG K</th><th>RAG default</th></tr></thead>
              <tbody>
                {profileEntries.map(([name, profile]) => (
                  <tr key={name}>
                    <td><b>{name}</b></td>
                    <td><code>{profile.model ?? '—'}</code></td>
                    <td>{profile.temperature ?? '—'}</td>
                    <td>{profile.max_tokens ?? '—'}</td>
                    <td>{profile.rag_top_k ?? '—'}</td>
                    <td>{yesNo(profile.use_rag_default)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel diagnostic-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Knowledge</span><h2>Loaded files</h2></div>
            <span className="count-badge">{data.knowledge?.files?.length ?? 0}</span>
          </div>
          <div className="file-list">
            {data.knowledge?.files?.map(file => <code key={file}>{file}</code>) ?? <p className="muted-copy">No file list returned.</p>}
          </div>
        </div>

        <div className="panel diagnostic-panel">
          <div className="panel-title-row"><div><span className="eyebrow">Media</span><h2>Image service</h2></div></div>
          <dl className="detail-list">
            <div><dt>Status</dt><dd className={data.imageStatus?.enabled ? 'good' : ''}>{yesNo(data.imageStatus?.enabled)}</dd></div>
            <div><dt>Provider</dt><dd>{valueText(data.imageStatus?.provider)}</dd></div>
            <div><dt>Model</dt><dd>{valueText(data.imageStatus?.model)}</dd></div>
            <div><dt>Usage today</dt><dd>{data.imageStatus?.usage_today ?? '—'}{data.imageStatus?.daily_limit !== undefined ? ` / ${data.imageStatus.daily_limit}` : ''}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
