import { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { ImageIcon, RefreshIcon } from '../components/Icons';
import type { ChatSettings, ImageGenerateResponse, ImageStatusResponse } from '../types';

const styles = ['realistic', 'product', 'poster', 'logo', 'anime', 'ui', 'infographic', 'cinematic'];
const sizes = [
  ['1024x1024', 'Square · 1024×1024'],
  ['16:9', 'Wide · 16:9'],
  ['9:16', 'Portrait · 9:16'],
  ['4:3', 'Landscape · 4:3']
];

export function ImageView({ settings }: { settings: ChatSettings }) {
  const [status, setStatus] = useState<ImageStatusResponse>();
  const [prompt, setPrompt] = useState('A premium futuristic AI operations console on a dark desk, subtle cyan lighting, realistic product photography');
  const [style, setStyle] = useState('realistic');
  const [size, setSize] = useState('1024x1024');
  const [result, setResult] = useState<ImageGenerateResponse>();
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const client = new ApiClient(settings.backendUrl, settings.apiKey);
      setStatus(await client.imageStatus());
    } catch {
      setStatus(undefined);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    // Deliberately keyed only to connection settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.backendUrl, settings.apiKey]);

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(undefined);

    try {
      const client = new ApiClient(settings.backendUrl, settings.apiKey);
      const generated = await client.generateImage(prompt.trim(), style, size);
      setResult(generated);
      setStatus(previous => ({
        ...previous,
        model: generated.model ?? previous?.model,
        usage_today: generated.usage_today,
        daily_limit: generated.daily_limit
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const link = document.createElement('a');
    link.href = `data:${result.mime_type};base64,${result.image_base64}`;
    link.download = `ai-nonymauz-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Multimodal</span>
          <h1>Image Lab</h1>
          <p>Test the backend image route, quota state, style presets, and output in one place.</p>
        </div>
        <button className="secondary icon-text" type="button" onClick={() => void loadStatus()} disabled={statusLoading}>
          <RefreshIcon className={statusLoading ? 'spin' : ''} /> Refresh status
        </button>
      </div>

      <div className="image-lab-grid">
        <div className="panel image-form-panel">
          <div className="image-service-card">
            <div className={`service-icon ${status?.enabled ? 'online' : ''}`}><ImageIcon /></div>
            <div><span>Image service</span><b>{status?.enabled === true ? 'Ready' : status?.enabled === false ? 'Disabled' : 'Unknown'}</b></div>
            <div><span>Provider</span><b>{status?.provider ?? '—'}</b></div>
            <div><span>Model</span><b title={status?.model}>{status?.model ?? '—'}</b></div>
            <div><span>Usage</span><b>{status?.usage_today ?? '—'}{status?.daily_limit !== undefined ? ` / ${status.daily_limit}` : ''}</b></div>
          </div>

          <label className="image-prompt-field">
            Prompt
            <textarea rows={7} value={prompt} onChange={event => setPrompt(event.target.value)} />
          </label>

          <div className="image-control-grid">
            <label>
              Style
              <select value={style} onChange={event => setStyle(event.target.value)}>
                {styles.map(item => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Size / aspect
              <select value={size} onChange={event => setSize(event.target.value)}>
                {sizes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <button className="primary image-generate-button" type="button" onClick={() => void generate()} disabled={loading || !prompt.trim() || status?.enabled === false}>
            <ImageIcon /> {loading ? 'Generating…' : 'Generate image'}
          </button>
          <p className="field-help">Generation uses the backend quota. The API key is attached automatically when authentication is enabled.</p>
          {error && <div className="error-banner compact-error"><span>{error}</span></div>}
        </div>

        <div className="panel image-preview-panel">
          {loading && (
            <div className="image-placeholder loading-placeholder">
              <div className="generation-loader"><span /><span /><span /></div>
              <h2>Generating</h2>
              <p>The result will appear here when the backend finishes.</p>
            </div>
          )}

          {!loading && !result && (
            <div className="image-placeholder">
              <ImageIcon />
              <h2>No image yet</h2>
              <p>Use the controls on the left to test the current image model.</p>
            </div>
          )}

          {!loading && result && (
            <div className="generated-image-wrap">
              <img src={`data:${result.mime_type};base64,${result.image_base64}`} alt={result.prompt_used || prompt} />
              <div className="generated-image-meta">
                <div><span>Model</span><b>{result.model ?? '—'}</b></div>
                <div><span>Quota</span><b>{result.usage_today ?? '—'} / {result.daily_limit ?? '—'}</b></div>
                <button className="secondary" type="button" onClick={download}>Download result</button>
              </div>
              {result.prompt_used && <p className="prompt-used"><b>Prompt used:</b> {result.prompt_used}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
