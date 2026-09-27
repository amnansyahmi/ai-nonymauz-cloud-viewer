import type { VideoGenerateRequest, VideoJobStatus } from './types';

export const DEFAULT_VIDEO_REQUEST: VideoGenerateRequest = {
  prompt: 'Launch AI Nonymauz. Show a Malay question about building a .NET API, a concise answer with a code preview, then the AI Nonymauz name as the payoff. Use a clean product interface and a confident, modern pace.',
  duration: 10,
  aspect_ratio: '9:16',
  quality: 'preview',
  language: 'ms',
  style: 'premium-dark',
  sound_effects: true,
  voice_over: false,
  creative_mode: 'auto',
  title: '',
  images: []
};

export const VIDEO_JOB_STORAGE_KEY = 'ai-nonymauz-video-job';

export const VIDEO_STAGE_LABELS: Record<VideoJobStatus, string> = {
  queued: 'Preparing render',
  preparing: 'Preparing Sandbox',
  planning: 'Planning direction',
  building: 'Building scenes',
  checking: 'Checking scenes',
  rendering: 'Rendering MP4',
  completed: 'Video ready',
  failed: 'Render failed'
};

export function videoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP 401/.test(message)) return 'Missing or invalid API key. Check Connection settings.';
  // The public status endpoint can be Ready while storyboard planning fails.
  // Keep the backend's error detail so the user can tell quota, provider,
  // configuration and permission failures apart.
  if (/HTTP (403|503)/.test(message)) return message.slice(0, 350);
  if (/HTTP 409/.test(message)) return 'Video is not ready yet. Try again when rendering finishes.';
  if (/HTTP 429/.test(message)) return 'Video quota or rate limit reached. Try again later.';
  return message.slice(0, 350);
}
