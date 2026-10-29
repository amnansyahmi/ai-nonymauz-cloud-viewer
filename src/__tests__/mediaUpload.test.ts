import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { withMedia } from '../components/FilmPreview';
import { videoMaxImages, videoUsesUploads } from '../video';
import { mediaKey, previewMedia, videoImagePayload, type VideoImageDraft } from '../videoImages';
import type { VideoStatusResponse } from '../types';

afterEach(() => vi.unstubAllGlobals());

const status = { enabled: true, max_images: 5, engines: {
  legacy: { max_images: 3 },
  hyperframes: { max_images: 5, media_upload: { max_media: 12, max_videos: 3, chunk_bytes: 3145728,
    max_clip_bytes: 20971520, max_clip_seconds: 30, clip_types: ['video/mp4'] } }
} } as unknown as VideoStatusResponse;

const shot: VideoImageDraft = { id: 'a', name: 'jobs.png', data_url: 'data:image/png;base64,AA==', caption: '', fit: 'contain',
  sizeBytes: 10, role: 'screenshot', kind: 'image', width: 600, height: 1300 };
const clip: VideoImageDraft = { id: 'b', name: 'hq.mov', data_url: 'data:video/quicktime;base64,AA==', caption: '', fit: 'cover',
  sizeBytes: 5000, role: 'screenshot', kind: 'video', mime: 'video/quicktime', width: 590, height: 1280, seconds: 6 };

describe('media by reference', () => {
  it('raises the media limit only where uploads exist', () => {
    expect(videoMaxImages(status, 'hyperframes')).toBe(12);
    expect(videoMaxImages(status, 'legacy')).toBe(3);
    expect(videoUsesUploads(status, 'hyperframes')).toBe(true);
    expect(videoUsesUploads({ enabled: true }, 'hyperframes')).toBe(false);
  });

  it('sends sizes and types instead of bytes, and keys media the way the backend does', () => {
    const payload = videoImagePayload([shot, clip], true);
    expect(payload[0]).toEqual({ name: 'jobs.png', caption: '', fit: 'contain', role: 'screenshot', kind: 'image',
      mime: 'image/png', width: 600, height: 1300, size_bytes: 10 });
    expect(payload[1]).toMatchObject({ kind: 'video', mime: 'video/quicktime', seconds: 6, size_bytes: 5000 });
    expect(payload.some(item => 'data_url' in item)).toBe(false);
    expect([mediaKey(shot, 0), mediaKey(clip, 1)]).toEqual(['img0', 'vid1']);
    expect(Object.keys(previewMedia([shot, clip]))).toEqual(['img0', 'vid1']);
  });

  it('injects local media ahead of the composition', () => {
    const html = withMedia('<!doctype html><html><head><title>x</title></head></html>', { img0: 'data:image/png;base64,AA==' });
    expect(html).toContain('<head><script>window.__hfMedia={"img0":"data:image/png;base64,AA=="};</script><title>');
    expect(withMedia('<html></html>', {})).toBe('<html></html>');
    expect(withMedia('<head>', { img0: '</script><b>' })).not.toContain('</script><b>');
  });

  it('uploads raw chunks and starts the job', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ job_id: 'vid_x', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://example.test', 'secret');
    await client.uploadVideoMedia('vid_x', 'vid1', 1, new Blob(['abc']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/video/jobs/vid_x/media/vid1?part=1');
    expect(init.method).toBe('PUT');
    expect(init.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(init.headers.get('Authorization')).toBe('Bearer secret');
    await client.startVideoJob('vid_x');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/v1/video/jobs/vid_x/start');
  });
});
