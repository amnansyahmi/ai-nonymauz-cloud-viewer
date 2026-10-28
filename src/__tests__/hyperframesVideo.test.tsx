import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ApiClient } from '../api/client';
import { FilmPreview } from '../components/FilmPreview';
import { DEFAULT_VIDEO_REQUEST, formatDuration, resolveVideoEngine, videoMaxDuration } from '../video';
import type { VideoStatusResponse } from '../types';

afterEach(() => vi.unstubAllGlobals());

const withEngines: VideoStatusResponse = {
  enabled: true,
  max_duration_seconds: 120,
  default_engine: 'legacy',
  engines: { legacy: { max_duration_seconds: 30 }, hyperframes: { max_duration_seconds: 120, preview: true } }
};
const olderBackend: VideoStatusResponse = { enabled: true, max_duration_seconds: 30 };

describe('HyperFrames engine in Video Lab', () => {
  it('uses HyperFrames only when the backend offers it', () => {
    expect(resolveVideoEngine(withEngines, 'hyperframes')).toBe('hyperframes');
    expect(resolveVideoEngine(withEngines, 'auto')).toBe('legacy');
    expect(resolveVideoEngine({ ...withEngines, default_engine: 'hyperframes' }, undefined)).toBe('hyperframes');
    expect(resolveVideoEngine(olderBackend, 'hyperframes')).toBe('legacy');
  });

  it('allows two minutes for HyperFrames and keeps 30 seconds elsewhere', () => {
    expect(videoMaxDuration(withEngines, 'hyperframes')).toBe(120);
    expect(videoMaxDuration(withEngines, 'legacy')).toBe(30);
    expect(videoMaxDuration(olderBackend, 'legacy')).toBe(30);
    // A backend capped lower than the engine wins.
    expect(videoMaxDuration({ ...withEngines, max_duration_seconds: 60 }, 'hyperframes')).toBe(60);
  });

  it('formats long durations as minutes', () => {
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(60)).toBe('1:00 min');
    expect(formatDuration(120)).toBe('2:00 min');
    expect(formatDuration(95)).toBe('1:35 min');
  });

  it('previews through /v1/video/preview with the bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ engine: 'hyperframes', html: '<html></html>' }));
    vi.stubGlobal('fetch', fetchMock);
    await new ApiClient('https://example.test', 'secret').previewVideo({ ...DEFAULT_VIDEO_REQUEST, engine: 'hyperframes' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/video/preview');
    expect(init.method).toBe('POST');
    expect(init.headers.get('Authorization')).toBe('Bearer secret');
    expect(JSON.parse(init.body).engine).toBe('hyperframes');
  });

  it('renders the preview frame at the film aspect ratio with a loading state', () => {
    const html = renderToString(<FilmPreview html="<html></html>" width={720} height={1280} />);
    expect(html).toContain('data-orientation="portrait"');
    expect(html).toContain('aspect-ratio:720 / 1280');
    expect(html).toContain('Loading preview');
  });
});
