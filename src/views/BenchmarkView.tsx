import { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { CompareIcon } from '../components/Icons';
import { MarkdownMessage } from '../components/MarkdownMessage';
import type { BenchmarkResult, ChatSettings } from '../types';

interface BenchmarkViewProps {
  settings: ChatSettings;
  modelOptions: string[];
}

export function BenchmarkView({ settings, modelOptions }: BenchmarkViewProps) {
  const [prompt, setPrompt] = useState('Build a concise .NET API endpoint using EF Core and explain the important design choices.');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [maxTokens, setMaxTokens] = useState(700);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [activeModel, setActiveModel] = useState('');

  useEffect(() => {
    setSelectedModels(current => {
      const valid = current.filter(model => modelOptions.includes(model));
      if (valid.length) return valid;
      return modelOptions.slice(0, 3);
    });
  }, [modelOptions]);

  function toggleModel(model: string) {
    setSelectedModels(current => {
      if (current.includes(model)) return current.filter(item => item !== model);
      if (current.length >= 4) return current;
      return [...current, model];
    });
  }

  async function run() {
    if (!prompt.trim() || !selectedModels.length || running) return;
    setRunning(true);
    setResults([]);
    const client = new ApiClient(settings.backendUrl, settings.apiKey);
    const next: BenchmarkResult[] = [];

    for (const model of selectedModels) {
      setActiveModel(model);
      const result = await client.openAiCompletion(model, prompt.trim(), maxTokens, settings.systemPrompt);
      next.push(result);
      setResults([...next]);
    }

    setActiveModel('');
    setRunning(false);
  }

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Model QA</span>
          <h1>Benchmark</h1>
          <p>Run the same prompt through live model aliases and compare latency, token use, and answer quality.</p>
        </div>
      </div>

      <div className="panel benchmark-config">
        <label className="benchmark-prompt">
          Benchmark prompt
          <textarea rows={4} value={prompt} onChange={event => setPrompt(event.target.value)} />
        </label>

        <div className="benchmark-controls">
          <div className="model-selector">
            <div className="field-label">Models <span>select up to 4</span></div>
            <div className="model-checkboxes">
              {modelOptions.map(model => (
                <label key={model} className={selectedModels.includes(model) ? 'selected' : ''}>
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model)}
                    disabled={!selectedModels.includes(model) && selectedModels.length >= 4}
                    onChange={() => toggleModel(model)}
                  />
                  {model}
                </label>
              ))}
              {!modelOptions.length && <span className="muted-copy">Reconnect to load models.</span>}
            </div>
          </div>

          <label className="token-field">
            Max output tokens
            <input type="number" min="64" max="4096" value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} />
          </label>

          <button className="primary icon-text benchmark-run" type="button" onClick={() => void run()} disabled={running || !prompt.trim() || !selectedModels.length}>
            <CompareIcon /> {running ? `Running ${activeModel}…` : 'Run benchmark'}
          </button>
        </div>

        <p className="field-help">Runs sequentially to reduce free-tier rate-limit collisions. Each selected model receives the same prompt, temperature 0.2, and token limit.</p>
      </div>

      {results.length > 0 && (
        <>
          <div className="table-scroll panel benchmark-table-panel">
            <table className="data-table benchmark-table">
              <thead>
                <tr><th>Model</th><th>Status</th><th>Latency</th><th>Prompt</th><th>Completion</th><th>Total tokens</th><th>Resolved model</th></tr>
              </thead>
              <tbody>
                {results.map(result => (
                  <tr key={result.model}>
                    <td><b>{result.model}</b></td>
                    <td><span className={`result-status ${result.status}`}>{result.status}</span></td>
                    <td>{result.latencyMs} ms</td>
                    <td>{result.promptTokens ?? '—'}</td>
                    <td>{result.completionTokens ?? '—'}</td>
                    <td>{result.totalTokens ?? '—'}</td>
                    <td><code>{result.responseModel ?? '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="benchmark-answer-grid">
            {results.map(result => (
              <article className={`panel benchmark-answer ${result.status}`} key={result.model}>
                <div className="benchmark-answer-head">
                  <div><span className="eyebrow">{result.latencyMs} ms</span><h2>{result.model}</h2></div>
                  <span className={`result-status ${result.status}`}>{result.status}</span>
                </div>
                {result.status === 'ok' ? (
                  <div className="markdown-body"><MarkdownMessage content={result.answer || '(empty response)'} /></div>
                ) : (
                  <div className="error-copy">{result.error}</div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {!results.length && !running && (
        <div className="benchmark-empty">
          <CompareIcon />
          <h2>Compare the models you actually deploy.</h2>
          <p>This view uses the backend's dynamic <code>/v1/models</code> list, so new provider aliases appear automatically.</p>
        </div>
      )}
    </section>
  );
}
