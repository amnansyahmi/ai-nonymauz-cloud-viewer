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
  art_direction: 'auto',
  motion_energy: 'balanced',
  title: '',
  images: []
};

export const ART_DIRECTIONS = [
  ['auto', 'Surprise me'], ['editorial', 'Editorial · bold composition'],
  ['kinetic', 'Kinetic · moving typography'], ['playful', 'Playful · expressive movement'],
  ['cinematic', 'Cinematic · deliberate reveals'], ['interface', 'Interface · app interactions']
] as const;

export function freshVariationSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
}

export function directedVideoRequest(form: VideoGenerateRequest, supported: boolean, lockSeed: boolean): VideoGenerateRequest {
  const { art_direction, motion_energy, variation_seed, ...legacy } = form;
  if (!supported || form.creative_mode !== 'auto') return legacy;
  return { ...legacy, art_direction: art_direction ?? 'auto', motion_energy: motion_energy ?? 'balanced',
    variation_seed: lockSeed ? variation_seed ?? 0 : freshVariationSeed() };
}

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

