import { consumeSse } from './sse';
import type {
  BenchmarkResult,
  ChatMessage,
  ChatSettings,
  HealthResponse,
  ImageGenerateResponse,
  ImageStatusResponse,
  KnowledgeResponse,
  ModelsResponse,
  OpenAiCompletionResponse,
  ProfilesResponse,
  RagSearchResponse,
  ResponseMeta
} from '../types';

export const DEFAULT_BACKEND =
  import.meta.env.VITE_BACKEND_URL || 'https://ai-nonymauz-cloud.onrender.com';

export function normalizeBackendUrl(value: string): string {
  return (value || DEFAULT_BACKEND).trim().replace(/\/+$/, '');
}

function humanErrorBody(body: string): string {
  if (!body) return 'Unknown backend error';

  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: unknown; message?: unknown };
    const message = parsed.detail ?? parsed.error ?? parsed.message;
    if (typeof message === 'string') return message;
    if (message) return JSON.stringify(message);
  } catch {
    // Plain-text backend response; return it below.
  }

  return body.slice(0, 1200);
}

export class ApiClient {
  readonly baseUrl: string;
  readonly apiKey: string;

  constructor(baseUrl: string, apiKey = '') {
    this.baseUrl = normalizeBackendUrl(baseUrl);
    this.apiKey = apiKey.trim();
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);
    return headers;
  }

  private async checkedFetch(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${humanErrorBody(body)}`);
    }

    return response;
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.checkedFetch(path, init);
    return (await response.json()) as T;
  }

  health(): Promise<HealthResponse> {
    return this.json('/health');
  }

  models(): Promise<ModelsResponse> {
    return this.json('/v1/models');
  }

  profiles(): Promise<ProfilesResponse> {
    return this.json('/profiles');
  }

  knowledge(): Promise<KnowledgeResponse> {
    return this.json('/knowledge');
  }

  imageStatus(): Promise<ImageStatusResponse> {
    return this.json('/image/status');
  }

  ragSearch(query: string, topK = 5, maxChars = 8000): Promise<RagSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      top_k: String(topK),
      max_chars: String(maxChars)
    });
    return this.json(`/rag/search?${params.toString()}`);
  }

  generateImage(prompt: string, style: string, size: string): Promise<ImageGenerateResponse> {
    return this.json('/image/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, style, size })
    });
  }

  async streamChat(
    settings: ChatSettings,
    messages: ChatMessage[],
    handlers: {
      onText: (fullText: string) => void;
      onMeta: (meta: ResponseMeta) => void;
      onUsage: (totalTokens: number) => void;
      onFirstToken: () => void;
    },
    signal: AbortSignal
  ): Promise<string> {
    const body = {
      mode: settings.mode,
      model: settings.model === 'auto' ? null : settings.model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      system_prompt: settings.systemPrompt,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
      use_rag: settings.useRag,
      use_tools: settings.useTools,
      city: settings.city,
      rag_top_k: settings.ragTopK,
      rag_max_context_chars: settings.ragMaxChars
    };

    const response = await this.checkedFetch('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      signal
    });

    let fullText = '';
    let firstTokenSeen = false;

    await consumeSse(response, event => {
      if (!event.data || event.data === '[DONE]') return;

      let payload: Record<string, any>;
      try {
        payload = JSON.parse(event.data) as Record<string, any>;
      } catch {
        return;
      }

      if (payload.error) {
        const errorText = typeof payload.error === 'string'
          ? payload.error
          : JSON.stringify(payload.error);
        throw new Error(errorText);
      }

      if (payload.ai_nonymauz_meta) {
        handlers.onMeta(payload.ai_nonymauz_meta as ResponseMeta);
        return;
      }

      if (payload.ai_nonymauz_done && typeof payload.ai_nonymauz_done === 'object') {
        handlers.onMeta(payload.ai_nonymauz_done as ResponseMeta);
        return;
      }

      const delta = payload.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          handlers.onFirstToken();
        }
        fullText += delta;
        handlers.onText(fullText);
      }

      const tokens = payload.usage?.total_tokens;
      if (typeof tokens === 'number') handlers.onUsage(tokens);
    });

    return fullText;
  }

  async openAiCompletion(
    model: string,
    prompt: string,
    maxTokens = 700,
    systemPrompt = ''
  ): Promise<BenchmarkResult> {
    const started = performance.now();

    try {
      const messages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ];

      const data = await this.json<OpenAiCompletionResponse>('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2,
          stream: false
        })
      });

      return {
        model,
        status: 'ok',
        latencyMs: Math.round(performance.now() - started),
        responseModel: data.model,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        answer: data.choices?.[0]?.message?.content || '(empty response)'
      };
    } catch (error) {
      return {
        model,
        status: 'error',
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
