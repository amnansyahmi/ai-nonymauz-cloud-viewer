import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ApiClient } from '../api/client';
import { VideoView } from '../views/VideoView';
import { DEFAULT_VIDEO_REQUEST, videoError } from '../video';
import { videoImagePayload } from '../videoImages';
import type { AppTab, ChatSettings } from '../types';

afterEach(() => vi.unstubAllGlobals());

describe('Video Lab', () => {
  it('supports the video tab and safe 10-second preview defaults', () => {
    const tab: AppTab = 'video';
    expect(tab).toBe('video');
    expect(DEFAULT_VIDEO_REQUEST).toMatchObject({
      duration: 10, aspect_ratio: '9:16', quality: 'preview',
      language: 'ms', sound_effects: true, creative_mode: 'auto'
    });
  });

  it('uses the video routes, payload, and existing bearer key for every request', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/download')) return new Response(new Blob(['video'], { type: 'video/mp4' }));
      if (url.endsWith('/status')) return Response.json({ enabled: true });
      return Response.json({ job_id: 'vid_test', status: 'queued' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://example.test/', 'secret');
    await client.videoStatus();
    await client.generateVideo(DEFAULT_VIDEO_REQUEST);
    await client.videoJob('vid_test');
    const blob = await client.videoFile('vid_test', 'compressed');
    await client.deleteVideoJob('vid_test');

    expect(blob.type).toBe('video/mp4');
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://example.test/v1/video/status',
      'https://example.test/v1/video/generate',
      'https://example.test/v1/video/jobs/vid_test',
      'https://example.test/v1/video/jobs/vid_test/download?variant=compressed',
      'https://example.test/v1/video/jobs/vid_test'
    ]);
    expect(fetchMock.mock.calls.map(call => call[1].headers.get('Authorization'))).toEqual(Array(5).fill('Bearer secret'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(DEFAULT_VIDEO_REQUEST);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
  });

  it('renders an empty state and does not crash when a job status is unavailable', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'vid_test' });
    const settings = { backendUrl: 'https://example.test', apiKey: '', rememberApiKey: false } as ChatSettings;
    const html = renderToString(<VideoView settings={settings} />);
    expect(html).toContain('Video Lab');
    expect(html).toContain('Loading job');
    expect(videoError(new Error('HTTP 401: unauthorized'))).toMatch(/API key/);
    expect(videoError(new Error('HTTP 429: quota'))).toMatch(/quota/);
    expect(videoError(new Error('HTTP 503: Storyboard providers are temporarily unavailable.')))
      .toContain('Storyboard providers are temporarily unavailable.');
    expect(videoError(new Error('HTTP 403: Forbidden by deployment firewall.')))
      .toContain('Forbidden by deployment firewall.');
  });

  it('sends ordered image scenes without UI-only fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ job_id: 'vid_test', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const images = videoImagePayload([
      { id: 'first', name: 'a.png', data_url: 'data:image/png;base64,AA==', caption: 'Intro', fit: 'contain', sizeBytes: 1 },
      { id: 'second', name: 'b.png', data_url: 'data:image/png;base64,AA==', caption: 'End', fit: 'cover', sizeBytes: 1 }
    ]);
    await new ApiClient('https://example.test', 'secret').generateVideo({
      ...DEFAULT_VIDEO_REQUEST, title: 'A product story', images
    });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.images).toEqual(images);
    expect(payload.images[0]).not.toHaveProperty('sizeBytes');
    expect(payload.images[0]).not.toHaveProperty('id');
  });
});
