export type AppTab = 'chat' | 'diagnostics' | 'rag' | 'benchmark' | 'image';
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

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
  streaming?: boolean;
  error?: boolean;
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
  maxTokens: number;
  ragTopK: number;
  ragMaxChars: number;
  city: string;
  useRag: boolean;
  useTools: boolean;
  systemPrompt: string;
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
