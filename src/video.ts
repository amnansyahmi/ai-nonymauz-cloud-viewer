import type { FilmBlock, VideoEngine, VideoGenerateRequest, VideoImageRole, VideoJobStatus, VideoStatusResponse } from './types';

export const DEFAULT_VIDEO_REQUEST: VideoGenerateRequest = {
  prompt: 'Launch AI Nonymauz. Show a Malay question about building a .NET API, a concise answer with a code preview, then the AI Nonymauz name as the payoff. Use a clean product interface and a confident, modern pace.',
  duration: 10,
  aspect_ratio: '9:16',
  quality: 'preview',
  language: 'ms',
  style: 'premium-dark',
  sound_effects: true,
  voice_over: false,
  music: true,
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

export type ConcreteEngine = 'legacy' | 'hyperframes';

/** The engine a request will actually use, given what the backend offers. */
export function resolveVideoEngine(status: VideoStatusResponse | undefined, choice: VideoEngine | undefined): ConcreteEngine {
  const offered = Boolean(status?.engines?.hyperframes);
  if (choice === 'hyperframes' && offered) return 'hyperframes';
  if (choice === 'legacy') return 'legacy';
  return offered && status?.default_engine === 'hyperframes' ? 'hyperframes' : 'legacy';
}

/** Longest render the chosen engine accepts. Older backends report one cap (30 s). */
export function videoMaxDuration(status: VideoStatusResponse | undefined, engine: ConcreteEngine): number {
  const perEngine = status?.engines?.[engine]?.max_duration_seconds;
  const overall = status?.max_duration_seconds ?? 30;
  if (perEngine !== undefined) return Math.min(perEngine, overall);
  return Math.min(overall, 30);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')} min`;
}

/** Images the chosen engine accepts. Older backends report one limit (3). */
export function videoMaxImages(status: VideoStatusResponse | undefined, engine: ConcreteEngine): number {
  const perEngine = status?.engines?.[engine]?.max_images;
  return Math.min(perEngine ?? Math.min(status?.max_images ?? 3, 3), 5);
}

export const IMAGE_ROLE_LABELS: Record<VideoImageRole, string> = {
  photo: 'Photo',
  screenshot: 'App screenshot',
  logo: 'Logo'
};

export const FILM_BLOCK_LABELS: Record<FilmBlock, string> = {
  hook: 'Hook',
  kinetic: 'Statement',
  stat: 'Number',
  list: 'List',
  steps: 'Steps',
  compare: 'Before / after',
  quote: 'Quote',
  image: 'Image',
  cta: 'Close',
  device: 'App screen',
  chart: 'Chart',
  map: 'Map',
  logo: 'Logo',
  price: 'Price',
  slider: 'Photo before / after',
  wordswap: 'Word flip',
  flow: 'App walkthrough',
  fan: 'Phones side by side',
  chaos: 'Problem tiles',
  tags: 'Feature cloud',
  ui: 'Drawn interface'
};

/** Style directions. Each is a full look in the motion-design engine
 * (backend motion_video/hyperframes/looks.py); keep keys in step. */
export const VIDEO_STYLES: ReadonlyArray<{ value: string; label: string; description: string }> = [
  { value: 'premium-dark', label: 'Premium dark', description: 'Deep night ground, slow aurora light, glass panels and orbiting line art.' },
  { value: 'minimal', label: 'Minimal', description: 'Flat ground, hairline drawings, crop marks and quiet cuts. Type does the work.' },
  { value: 'product-demo', label: 'Product demo', description: 'Clean app canvas: dot grid, floating UI windows, app-tile icons and a cursor.' },
  { value: 'tech', label: 'Tech', description: 'A 3D wireframe and particle field, circuit traces and monospace type.' },
  { value: 'cinematic', label: 'Cinematic', description: 'Warm film: vignette, light leaks, heavy grain, serif titles and slow dissolves.' },
  { value: 'clean-light', label: 'Clean light', description: 'Bright paper, soft pastel shapes that morph and pop, rounded panels.' }
];

export function videoStyleDescription(style: string): string {
  return VIDEO_STYLES.find(item => item.value === style)?.description ?? '';
}
