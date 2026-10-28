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

  it('forwards preview cancellation so edited briefs can abandon planning', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = new ApiClient('https://example.test', 'secret')
      .previewVideo({ ...DEFAULT_VIDEO_REQUEST, engine: 'hyperframes' }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('renders the preview frame at the film aspect ratio with a loading state', () => {
    const html = renderToString(<FilmPreview html="<html></html>" width={720} height={1280} />);
    expect(html).toContain('data-orientation="portrait"');
    expect(html).toContain('aspect-ratio:720 / 1280');
    expect(html).toContain('Loading preview');
  });
});

describe('network failures', () => {
  it('replaces Safari and Chrome bare fetch errors with a readable message', async () => {
    for (const raw of ['Load failed', 'Failed to fetch']) {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(raw)));
      await expect(new ApiClient('https://example.test', 'k').videoStatus())
        .rejects.toThrow(/No response from the backend/);
    }
  });

  it('keeps aborts and other errors unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(new ApiClient('https://example.test', 'k').videoStatus()).rejects.toBe(abort);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Invalid URL')));
    await expect(new ApiClient('https://example.test', 'k').videoStatus()).rejects.toThrow('Invalid URL');
  });

  it('shows the backend error reference from a JSON 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { detail: 'Internal server error (reference abc123def456).', reference: 'abc123def456' }, { status: 500 })));
    await expect(new ApiClient('https://example.test', 'k').videoStatus())
      .rejects.toThrow('HTTP 500: Internal server error (reference abc123def456).');
  });
});

describe('image roles and limits', () => {
  it('allows five images for motion design and three for the classic renderer', async () => {
    const { videoMaxImages } = await import('../video');
    const status = { enabled: true, max_images: 5, engines: {
      legacy: { max_images: 3 }, hyperframes: { max_images: 5, image_roles: ['photo', 'screenshot', 'logo'] as const }
    } } as unknown as VideoStatusResponse;
    expect(videoMaxImages(status, 'hyperframes')).toBe(5);
    expect(videoMaxImages(status, 'legacy')).toBe(3);
    // A backend from before per-engine limits keeps the old cap.
    expect(videoMaxImages({ enabled: true, max_images: 3 }, 'hyperframes')).toBe(3);
  });

  it('guesses screenshots and logos from name and shape, and sends the role', async () => {
    const { guessImageRole, videoImagePayload } = await import('../videoImages');
    expect(guessImageRole('Screenshot 2026-10-28.png', 'image/png', 1179, 2556)).toBe('screenshot');
    expect(guessImageRole('IMG_0001.png', 'image/png', 1179, 2556)).toBe('screenshot');
    expect(guessImageRole('chef-ammar-logo.png', 'image/png', 600, 600)).toBe('logo');
    expect(guessImageRole('IMG_0002.jpg', 'image/jpeg', 3024, 4032)).toBe('photo');
    const payload = videoImagePayload([
      { id: 'a', name: 'a.png', data_url: 'data:image/png;base64,AA==', caption: '', fit: 'contain', sizeBytes: 1, role: 'screenshot' },
      { id: 'b', name: 'b.png', data_url: 'data:image/png;base64,AA==', caption: '', fit: 'contain', sizeBytes: 1 }
    ]);
    expect(payload.map(image => image.role)).toEqual(['screenshot', 'photo']);
    expect(payload[0]).not.toHaveProperty('id');
  });

  it('labels every film block', async () => {
    const { FILM_BLOCK_LABELS } = await import('../video');
    for (const block of ['device', 'chart', 'map', 'logo', 'price', 'slider', 'wordswap'] as const) {
      expect(FILM_BLOCK_LABELS[block]).toBeTruthy();
    }
  });
});
