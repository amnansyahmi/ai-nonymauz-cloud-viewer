import { useState } from 'react';
import { ApiClient } from '../api/client';
import { SearchIcon } from '../components/Icons';
import type { ChatSettings, RagSearchResponse } from '../types';

export function RagView({ settings }: { settings: ChatSettings }) {
  const [query, setQuery] = useState('how should I structure a .NET API with Entity Framework?');
  const [topK, setTopK] = useState(5);
  const [maxChars, setMaxChars] = useState(8000);
  const [result, setResult] = useState<RagSearchResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState<number>();

  async function inspect() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError('');
    const started = performance.now();

    try {
      const client = new ApiClient(settings.backendUrl, settings.apiKey);
      setResult(await client.ragSearch(query.trim(), topK, maxChars));
      setLatencyMs(performance.now() - started);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Retrieval QA</span>
          <h1>RAG Inspector</h1>
          <p>See exactly what the knowledge layer retrieves before an LLM gets involved.</p>
        </div>
      </div>

      <div className="panel rag-query-panel">
        <div className="rag-query-row">
          <label className="grow-field">
            Test query
            <textarea
              rows={3}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void inspect();
                }
              }}
            />
          </label>
          <label>
            Top K
            <input type="number" min="1" max="12" value={topK} onChange={event => setTopK(Number(event.target.value))} />
          </label>
          <label>
            Context chars
            <input type="number" min="500" max="30000" step="500" value={maxChars} onChange={event => setMaxChars(Number(event.target.value))} />
          </label>
          <button className="primary icon-text rag-run" type="button" disabled={loading || !query.trim()} onClick={() => void inspect()}>
            <SearchIcon /> {loading ? 'Inspecting' : 'Inspect retrieval'}
          </button>
        </div>
        <small className="field-help">Ctrl/Cmd + Enter to run. This calls <code>/rag/search</code> only; it does not spend model tokens.</small>
      </div>

      {error && <div className="error-banner"><b>RAG search failed</b><span>{error}</span></div>}

      <div className="rag-results-grid">
        <div className="panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Ranked matches</span><h2>Sources</h2></div>
            <span className="count-badge">{result?.sources?.length ?? 0}</span>
          </div>

          {result?.sources?.length ? (
            <div className="rag-source-list">
              {result.sources.map((source, index) => (
                <div className="rag-source" key={`${source.source}-${source.title}-${index}`}>
                  <div className="rank-number">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <b>{source.title || 'Untitled chunk'}</b>
                    <span>{source.source || 'unknown source'}</span>
                  </div>
                  {source.score !== undefined && <code>{String(source.score)}</code>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-panel-copy">Run a query to inspect ranked chunks.</div>
          )}
        </div>

        <div className="panel context-panel">
          <div className="panel-title-row">
            <div><span className="eyebrow">Injected text</span><h2>Context preview</h2></div>
            {latencyMs !== undefined && <span className="latency-badge">{latencyMs.toFixed(1)} ms</span>}
          </div>
          <pre className="context-preview">{result?.context_preview || 'Retrieved context will appear here.'}</pre>
          {result && (
            <div className="context-footer">
              <span>Vector RAG: <b>{result.vector_rag_enabled ? 'on' : 'off'}</b></span>
              <span>Query: <b>{result.query || query}</b></span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
