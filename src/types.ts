export type AppTab = 'chat' | 'diagnostics' | 'rag' | 'benchmark' | 'image' | 'video';
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatTextPart {
  type: 'text';
  text: string;
}

export interface ChatImagePart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ChatContentPart = ChatTextPart | ChatImagePart;
export type ChatContent = string | ChatContentPart[];

export interface ChatImageAttachment {
  kind: 'image';
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ChatFileAttachment {
  kind: 'file';
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
  text: string;
  extractedChars: number;
  truncated: boolean;
  metadata?: Record<string, unknown>;
}

export type ChatAttachment = ChatImageAttachment | ChatFileAttachment;

export interface ChatDisplayAttachment {
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  width?: number;
  height?: number;
  extractedChars?: number;
  truncated?: boolean;
}

export interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
  displayText?: string;
  displayAttachments?: ChatDisplayAttachment[];
  streaming?: boolean;
  error?: boolean;
  modelAlias?: string;
  servedBy?: string;
}

export interface KnowledgeSource {
  source?: string;
  title?: string;
  score?: number;
  [key: string]: unknown;
}

export interface ResponseMeta {
  mode?: string;
  model?: string;
  served_by?: string;
  large_task_reroute?: boolean;
  self_check?: boolean;
  used_rag?: boolean;
  used_weather_tool?: boolean;
  used_web_search?: boolean;
  used_summary?: boolean;
  tool_iterations?: number;
  server_latency_seconds?: number;
  sources?: KnowledgeSource[];
  [key: string]: unknown;
}

export interface ChatStats {
  firstTokenMs?: number;
  totalMs?: number;
  totalTokens?: number;
}

export interface ChatSettings {
  backendUrl: string;
  apiKey: string;
  rememberApiKey: boolean;
  mode: string;
  model: string;
  temperature: number;
  useCustomMaxTokens: boolean;
  maxTokens: number;
  ragTopK: number;
  ragMaxChars: number;
  city: string;
  useRag: boolean;
  useTools: boolean;
  systemPrompt: string;
}

export interface FileExtractResponse {
  filename: string;
  content_type: string;
  extension: string;
  text: string;
  original_bytes: number;
  extracted_chars: number;
  truncated: boolean;
  metadata?: Record<string, unknown>;
}

export interface FileStatusResponse {
  enabled?: boolean;
  supported_extensions?: string[];
  max_upload_bytes?: number;
  max_extracted_chars?: number;
  storage?: string;
}

export interface ModelsResponse {
  object?: string;
  data?: Array<{
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
}

export interface HealthResponse {
  ok?: boolean;
  app?: string;
  mode?: string;
  knowledge_chunks?: number;
  litellm_models?: string[];
  litellm_deployments?: Array<{
    alias?: string;
    model?: string;
    enabled?: boolean;
    reason?: string | null;
  }>;
  vector_rag_enabled?: boolean;
  bm25_rag_enabled?: boolean;
  embedding_rag_enabled?: boolean;
  embedding_model?: string | null;
  memory?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KnowledgeResponse {
  files?: string[];
  chunks?: number;
  loaded_at?: string | number | null;
  [key: string]: unknown;
}

export interface ImageStatusResponse {
  enabled?: boolean;
  provider?: string;
  model?: string;
  usage_today?: number;
  daily_limit?: number;
  [key: string]: unknown;
}

export interface ImageGenerateResponse {
  image_base64: string;
  mime_type: string;
  model?: string;
  prompt_used?: string;
  usage_today?: number;
  daily_limit?: number;
}

export type VideoAspectRatio = '9:16' | '16:9' | '1:1';
export type VideoQuality = 'preview' | 'standard';
export type VideoJobStatus = 'awaiting_media' | 'queued' | 'preparing' | 'planning' | 'building' | 'checking' | 'rendering' | 'completed' | 'failed';
export type VideoVariant = 'compressed' | 'master';
export type VideoEngine = 'auto' | 'legacy' | 'hyperframes';

export interface VideoStatusResponse {
  enabled: boolean;
  provider?: string;
  renderer?: string;
  auth_required?: boolean;
  auth_ready?: boolean;
  max_duration_seconds?: number;
  allowed_aspect_ratios?: VideoAspectRatio[];
  qualities?: VideoQuality[];
  sandbox_execution_limit_seconds?: number;
  sandbox_vcpus?: number;
  snapshot_configured?: boolean;
  image_input_enabled?: boolean;
  auto_storyboard_enabled?: boolean;
  max_images?: number;
  max_image_bytes?: number;
  max_total_image_bytes?: number;
  /** Per-engine limits; absent on backends without the HyperFrames engine. */
  engines?: Partial<Record<Exclude<VideoEngine, 'auto'>, {
    max_duration_seconds?: number;
    preview?: boolean;
    max_images?: number;
    image_roles?: VideoImageRole[];
    blocks?: FilmBlock[];
    music?: boolean;
    brand_kit?: boolean;
    media_upload?: VideoMediaUpload;
  }>>;
  default_engine?: Exclude<VideoEngine, 'auto'>;
}

export type FilmBlock = 'hook' | 'kinetic' | 'stat' | 'list' | 'steps' | 'compare' | 'quote' | 'image' | 'cta'
  | 'device' | 'chart' | 'map' | 'logo' | 'price' | 'slider' | 'wordswap'
  | 'flow' | 'fan' | 'chaos' | 'tags' | 'ui' | 'tableau';

export type BrandFont = 'inter' | 'grotesk' | 'editorial' | 'condensed' | 'mono'
  | 'montserrat' | 'poppins' | 'outfit' | 'nunito' | 'oswald';

/** A client's look sent with a render: colours and display face. */
export interface BrandKit {
  name: string;
  primary?: string;
  secondary?: string;
  ground?: string;
  font?: BrandFont;
}

export interface FilmBeat {
  block: FilmBlock;
  kicker: string;
  headline: string;
  emphasis: string;
  support: string;
  items: string[];
  metric: string;
  metric_label: string;
  image_index: number | null;
  narration: string;
  transition_in: string;
  narrative_role?: 'auto' | 'problem' | 'mechanism' | 'proof' | 'payoff';
  visual_action?: string;
  stage_action?: 'auto' | 'assemble' | 'journey' | 'resolve';
  composition?: 'auto' | 'hero' | 'editorial' | 'split' | 'cutout';
  camera?: 'auto' | 'locked' | 'push' | 'pan';
  continuity?: boolean;
}

export interface FilmPlan {
  concept: string;
  hook_style: string;
  theme: 'dark' | 'light';
  accent: string;
  font_pair: string;
  energy: 'calm' | 'balanced' | 'energetic';
  beats: FilmBeat[];
}

export interface VideoPreviewResponse {
  engine: 'hyperframes';
  plan: FilmPlan;
  planner_model: string;
  variation_seed: number;
  html: string;
  width: number;
  height: number;
  duration: number;
  transitions: string[];
  editorial_notes?: string[];
  beats: Array<{ block: FilmBlock; start: number; end: number; headline: string;
    narrative_role?: string; visual_action?: string; composition?: string }>;
  /** Background music to synthesise for the player (POST /v1/video/music). */
  music?: VideoMusicSpec | null;
  note?: string;
}

export interface VideoMusicSpec {
  duration: number;
  bpm: number;
  energy: 'calm' | 'balanced' | 'energetic';
  seed: number;
  ducks: Array<[number, number]>;
  sections?: Array<[number, number, 'problem' | 'mechanism' | 'proof' | 'payoff']>;
}

export type VideoImageRole = 'photo' | 'screenshot' | 'logo';

export interface VideoImageInput {
  name: string;
  /** Inline bytes; omitted when the media is sent by reference and uploaded. */
  data_url?: string;
  caption: string;
  fit: 'contain' | 'cover';
  focal_x?: number;
  focal_y?: number;
  /** How the motion-design engine uses the image. Older backends ignore it. */
  role?: VideoImageRole;
  /** By reference: what the backend needs without the bytes. */
  kind?: 'image' | 'video';
  mime?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  seconds?: number;
}

export interface VideoMediaUpload {
  max_media: number;
  max_videos: number;
  chunk_bytes: number;
  max_clip_bytes: number;
  max_clip_seconds: number;
  clip_types: string[];
}

export interface VideoExpectedMedia {
  key: string;
  mime: string;
  size: number;
  parts: number;
  kind: 'image' | 'video';
}

export interface VideoGenerateRequest {
  prompt: string;
  duration: number;
  aspect_ratio: VideoAspectRatio;
  quality: VideoQuality;
  language: 'ms' | 'en';
  style: string;
  sound_effects: boolean;
  voice_over: boolean;
  creative_mode: 'auto' | 'template';
  title?: string;
  images?: VideoImageInput[];
  engine?: VideoEngine;
  variation_seed?: number;
  /** A plan from /v1/video/preview: renders exactly the previewed film. */
  film_plan?: FilmPlan;
  /** Original generated music under the film (motion-design engine). */
  music?: boolean;
  brand?: BrandKit;
}

export interface VideoStoryboardScene {
  kind: 'hero' | 'screen' | 'workflow' | 'stat' | 'outro';
  visual?: 'dashboard' | 'chat' | 'pipeline';
  kicker: string;
  headline: string;
  support: string;
  details: string[];
  action: string;
  image_index: number | null;
}

export interface VideoStoryboard {
  concept: string;
  theme: 'dark' | 'light';
  accent: string;
  scenes: VideoStoryboardScene[];
}

export interface VideoJobResponse {
  job_id: string;
  status: VideoJobStatus;
  temporary?: boolean;
  stage?: string;
  progress?: number;
  renderer?: string;
  output_ready?: boolean;
  compressed_ready?: boolean;
  output_bytes?: number;
  compressed_bytes?: number;
  detail?: string | null;
  error?: string | null;
  storyboard?: VideoStoryboard | null;
  storyboard_model?: string | null;
  storyboard_reference_mode?: 'vision' | 'brief_and_captions' | null;
  engine?: Exclude<VideoEngine, 'auto'>;
  /** Present while the job waits for its uploads. */
  media?: VideoExpectedMedia[];
  film_plan?: FilmPlan | null;
  planner_model?: string | null;
  variation_seed?: number;
  transitions?: string[];
  quality_report?: { ok: boolean; samples: number; method: string; warnings: string[];
    errors: string[]; output?: { ok: boolean; duration: number; width: number; height: number } };
}

export interface RagSearchResponse {
  query?: string;
  vector_rag_enabled?: boolean;
  sources?: KnowledgeSource[];
  context_preview?: string;
  [key: string]: unknown;
}

export type ProfilesResponse = Record<
  string,
  {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    rag_top_k?: number;
    rag_max_context_chars?: number;
    use_rag_default?: boolean;
    [key: string]: unknown;
  }
>;

export interface OpenAiCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

export interface BenchmarkResult {
  model: string;
  status: 'ok' | 'error';
  latencyMs: number;
  responseModel?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  answer?: string;
  error?: string;
}
