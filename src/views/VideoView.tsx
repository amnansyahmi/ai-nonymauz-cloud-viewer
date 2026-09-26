import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../api/client';
import { RefreshIcon, TrashIcon, VideoIcon } from '../components/Icons';
import { DEFAULT_VIDEO_REQUEST, VIDEO_JOB_STORAGE_KEY, VIDEO_STAGE_LABELS, videoError } from '../video';
import type {
  ChatSettings, VideoAspectRatio, VideoGenerateRequest, VideoJobResponse,
  VideoQuality, VideoStatusResponse, VideoVariant
} from '../types';

const aspectOptions: Array<[VideoAspectRatio, string]> = [
  ['9:16', 'Portrait · 9:16'], ['16:9', 'Landscape · 16:9'], ['1:1', 'Square · 1:1']
];
const qualityOptions: Array<[VideoQuality, string]> = [
  ['preview', 'Preview · faster'], ['standard', 'Standard · higher resolution']
];
const styles = ['premium-dark', 'minimal', 'product-demo', 'tech', 'cinematic', 'clean-light'];
const activeStatuses = new Set(['queued', 'preparing', 'planning', 'building', 'checking', 'rendering']);

function formatBytes(value?: number): string {
  if (value === undefined) return '—';
  return value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;
}

export function VideoView({ settings }: { settings: ChatSettings }) {
  const client = useMemo(() => new ApiClient(settings.backendUrl, settings.apiKey), [settings.backendUrl, settings.apiKey]);
  const [form, setForm] = useState<VideoGenerateRequest>(DEFAULT_VIDEO_REQUEST);
  const [status, setStatus] = useState<VideoStatusResponse>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [job, setJob] = useState<VideoJobResponse>();
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(VIDEO_JOB_STORAGE_KEY) ?? '');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<VideoVariant | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const result = await client.videoStatus(signal);
      if (signal?.aborted) return;
      setStatus(result);
      setForm(previous => ({
        ...previous,
        duration: Math.min(previous.duration, result.max_duration_seconds ?? 30),
        aspect_ratio: result.allowed_aspect_ratios?.includes(previous.aspect_ratio)
          ? previous.aspect_ratio : result.allowed_aspect_ratios?.[0] ?? previous.aspect_ratio,
        quality: result.qualities?.includes(previous.quality)
          ? previous.quality : result.qualities?.[0] ?? previous.quality
      }));
    } catch (reason) {
      if (signal?.aborted) return;
      setStatus(undefined);
      setStatusError(videoError(reason));
    } finally {
      if (!signal?.aborted) setStatusLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [refreshStatus]);

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const current = await client.videoJob(jobId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(current);
        setError('');
        if (!activeStatuses.has(current.status)) return;
        if (++attempts >= 750) {
          setError('Still rendering after 25 minutes. Refresh the job to check again.');
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (reason) {
        if (!controller.signal.aborted) setError(videoError(reason));
      }
    };
    timer = setTimeout(() => void poll(), job?.job_id === jobId ? 2000 : 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // A newly created job starts this loop; polling updates must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, jobId, pollRevision]);

  useEffect(() => {
    setPreviewUrl('');
    if (!jobId || job?.job_id !== jobId || job.status !== 'completed' || !job.compressed_ready) return;
    const controller = new AbortController();
    let objectUrl = '';
    setPreviewLoading(true);
    void client.videoFile(jobId, 'compressed', controller.signal)
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(videoError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, jobId, job?.job_id, job?.status, job?.compressed_ready]);

  const update = <K extends keyof VideoGenerateRequest>(key: K, value: VideoGenerateRequest[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  async function generate() {
    if (submitting || jobId || !form.prompt.trim() || status?.enabled !== true || status.auth_ready === false || (status.auth_required && !settings.apiKey.trim())) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const next = await client.generateVideo({ ...form, prompt: form.prompt.trim() });
      sessionStorage.setItem(VIDEO_JOB_STORAGE_KEY, next.job_id);
      setJob(next);
      setJobId(next.job_id);
    } catch (reason) {
      setError(videoError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function download(variant: VideoVariant) {
    if (!jobId || downloading) return;
    setDownloading(variant);
    setError('');
    try {
      const blob = await client.videoFile(jobId, variant);
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `ai-nonymauz-video-${jobId}-${variant}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (reason) {
      setError(videoError(reason));
    } finally {
      setDownloading(null);
    }
  }

  async function deleteJob() {
    if (!jobId || deleting || !window.confirm('Delete this render job and its Sandbox?')) return;
    setDeleting(true);
    setError('');
    try {
      await client.deleteVideoJob(jobId);
      sessionStorage.removeItem(VIDEO_JOB_STORAGE_KEY);
      setJobId('');
      setJob(undefined);
      setNotice('Render job deleted.');
    } catch (reason) {
      if (reason instanceof Error && /HTTP 404/.test(reason.message)) {
        sessionStorage.removeItem(VIDEO_JOB_STORAGE_KEY);
        setJobId('');
        setJob(undefined);
        setNotice('Render job is no longer available. Local record cleared.');
      } else setError(videoError(reason));
    } finally {
      setDeleting(false);
    }
  }

  const ready = status?.enabled === true && status.auth_ready !== false && (!status.auth_required || Boolean(settings.apiKey.trim()));
  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));
  const busy = Boolean(jobId && (!job || activeStatuses.has(job.status)));

  return (
    <section className="workspace video-lab">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Multimodal</span>
          <h1>Video Lab</h1>
          <p>Create and inspect Motion Video render jobs in Vercel Sandbox.</p>
        </div>
        <button className="secondary icon-text" type="button" onClick={() => void refreshStatus()} disabled={statusLoading}>
          <RefreshIcon className={statusLoading ? 'spin' : ''} /> Refresh status
        </button>
      </div>

      <div className="panel video-service">
        <div className="video-service-heading">
          <span className={`service-icon ${ready ? 'online' : ''}`}><VideoIcon /></span>
          <div><span>Video service</span><b>{statusLoading && !status ? 'Checking…' : ready ? 'Ready' : status?.enabled === false ? 'Disabled' : 'Unavailable'}</b></div>
        </div>
        <dl>
          <div><dt>Provider</dt><dd>{status?.provider ?? '—'}</dd></div>
          <div><dt>Renderer</dt><dd>{status?.renderer ?? '—'}</dd></div>
          <div><dt>Max duration</dt><dd>{status?.max_duration_seconds ?? '—'} sec</dd></div>
          <div><dt>Compute</dt><dd>{status?.sandbox_vcpus ?? '—'} vCPU</dd></div>
          <div><dt>Snapshot</dt><dd>{status?.snapshot_configured ? 'Ready' : 'Not configured'}</dd></div>
        </dl>
      </div>
      {statusError && <div className="error-banner"><span>{statusError}</span></div>}
      {status?.enabled === false && <div className="error-banner"><span>Video generation is currently disabled on the backend.</span></div>}
      {status?.auth_ready === false && <div className="error-banner"><span>Backend video authentication is not configured.</span></div>}
      {status?.auth_required && !settings.apiKey.trim() && <div className="error-banner"><span>Video jobs require the backend API key. Add it in Connection settings.</span></div>}

      <div className="video-lab-grid">
        <div className="panel video-form-panel">
          <label>
            Prompt
            <textarea rows={6} value={form.prompt} onChange={event => update('prompt', event.target.value)} />
          </label>
          <div className="video-duration">
            <label htmlFor="video-duration">Duration <strong>{form.duration} sec</strong></label>
            <input id="video-duration" type="range" min="6" max={Math.min(30, status?.max_duration_seconds ?? 30)}
              value={form.duration} onChange={event => update('duration', Number(event.target.value))} />
          </div>
          <div className="video-control-grid">
            <label>Aspect ratio
              <select value={form.aspect_ratio} onChange={event => update('aspect_ratio', event.target.value as VideoAspectRatio)}>
                {aspectOptions.filter(([value]) => !status?.allowed_aspect_ratios || status.allowed_aspect_ratios.includes(value))
                  .map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Quality
              <select value={form.quality} onChange={event => update('quality', event.target.value as VideoQuality)}>
                {qualityOptions.filter(([value]) => !status?.qualities || status.qualities.includes(value))
                  .map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Language
              <select value={form.language} onChange={event => update('language', event.target.value as 'ms' | 'en')}>
                <option value="ms">Malay</option><option value="en">English</option>
              </select>
            </label>
            <label>Style direction
              <select value={form.style} onChange={event => update('style', event.target.value)}>
                {styles.map(value => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="video-sound"><input type="checkbox" checked={form.sound_effects}
            onChange={event => update('sound_effects', event.target.checked)} /> Sound effects <small>May add render time</small></label>
          <p className="field-help">Standard quality uses more render compute.</p>
          <button className="primary video-generate" type="button" onClick={() => void generate()}
            disabled={!ready || !form.prompt.trim() || submitting || Boolean(jobId)}>
            <VideoIcon /> {submitting ? 'Starting render…' : 'Generate video'}
          </button>
          {jobId && <p className="field-help">Delete the current job before starting another render.</p>}
        </div>

        <div className="panel video-result-panel">
          {!jobId && (
            <div className="video-empty"><VideoIcon /><h2>No video yet</h2><p>Create a render job to preview it here.</p></div>
          )}
          {jobId && (
            <div className="video-result">
              <div className="video-result-head">
                <div><span className="eyebrow">Render job</span><h2>{job ? VIDEO_STAGE_LABELS[job.status] : 'Loading job…'}</h2></div>
                <button className="secondary video-delete" type="button" onClick={() => void deleteJob()} disabled={deleting}>
                  <TrashIcon /> {deleting ? 'Deleting…' : 'Delete job'}
                </button>
              </div>
              <div className="video-progress-label"><span>{job?.stage || (job ? VIDEO_STAGE_LABELS[job.status] : 'Checking status')}</span><b>{progress}%</b></div>
              <progress className="video-progress" value={progress} max={100} aria-label="Render progress" />
              <p className="video-job-id">Job ID <code>{jobId}</code></p>
              {job?.status === 'failed' && <div className="error-banner"><b>Render failed</b><span>{(job.error || job.detail || 'Check the backend render job.').slice(0, 350)}</span></div>}
              {busy && <p className="muted-copy">Rendering continues on the backend. Status updates every 2 seconds.</p>}
              {job?.status === 'completed' && (
                <div className="video-output">
                  {previewUrl ? <video controls playsInline src={previewUrl} aria-label="Generated video preview" /> :
                    <p className="muted-copy">{previewLoading ? 'Loading compressed preview…' : 'Preview unavailable. You can still download the output.'}</p>}
                  <div className="video-downloads">
                    <button className="secondary" type="button" disabled={!job.compressed_ready || Boolean(downloading)}
                      onClick={() => void download('compressed')}>
                      {downloading === 'compressed' ? 'Downloading…' : `Download compressed · ${formatBytes(job.compressed_bytes)}`}
                    </button>
                    <button className="secondary" type="button" disabled={!job.output_ready || Boolean(downloading)}
                      onClick={() => void download('master')}>
                      {downloading === 'master' ? 'Preparing master…' : `Download master · ${formatBytes(job.output_bytes)}`}
                    </button>
                  </div>
                </div>
              )}
              {error && <div className="error-banner compact-error"><span>{error}</span></div>}
              {error && busy && <button className="secondary" type="button" onClick={() => { setError(''); setPollRevision(value => value + 1); }}>Retry status</button>}
              {error && /HTTP 404/.test(error) && <button className="secondary" type="button" onClick={() => {
                sessionStorage.removeItem(VIDEO_JOB_STORAGE_KEY);
                setJobId('');
                setJob(undefined);
                setError('');
              }}>Clear missing job</button>}
            </div>
          )}
          {!jobId && error && <div className="error-banner compact-error"><span>{error}</span></div>}
          {notice && <p className="muted-copy" role="status">{notice}</p>}
        </div>
      </div>
    </section>
  );
}
