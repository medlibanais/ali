// Minimal Groq chat-completions caller (OpenAI-compatible API).
// Key comes ONLY from Edge Function env — never from the client.

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResult {
  ok: boolean;
  text: string;
  latencyMs: number;
  model?: string;
  error?: string;
}

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt timeout. A hung request should fall through, not spin. */
  timeoutMs?: number;
  /** Extra attempts after the first (transient errors / empty output only). */
  retries?: number;
  /** Try GROQ_FALLBACK_MODEL if the primary model keeps failing. */
  useFallbackModel?: boolean;
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
// Overridable so local runs can point at a mock; production uses Groq.
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_FALLBACK_MODEL = 'llama-3.3-70b-versatile';

// gpt-oss (and other reasoning models) count hidden reasoning against
// max_tokens and reject nothing; non-reasoning models reject the
// reasoning_effort field outright, so only send it where it is understood.
function isReasoningModel(model: string): boolean {
  return /gpt-oss|qwen3|deepseek-r1/i.test(model);
}

async function attempt(
  model: string,
  apiKey: string,
  turns: ChatTurn[],
  options: LlmOptions,
): Promise<LlmResult & { retryable: boolean }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  const reasoning = isReasoningModel(model);
  try {
    const baseUrl = (Deno.env.get('GROQ_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const response = await fetch(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: turns,
          ...(reasoning ? { reasoning_effort: 'low' } : {}),
          // Reasoning tokens come out of the same budget; leave headroom so
          // the visible answer is never starved to an empty string.
          max_tokens: (options.maxTokens ?? 320) + (reasoning ? 400 : 0),
          temperature: options.temperature ?? 0.7,
        }),
      },
    );
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        text: '',
        latencyMs,
        model,
        error: `groq_${response.status}: ${body.slice(0, 200)}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    const json = await response.json();
    const text: string = json?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      return {
        ok: false,
        text: '',
        latencyMs,
        model,
        error: `empty_completion(${json?.choices?.[0]?.finish_reason ?? '?'})`,
        retryable: true,
      };
    }
    return { ok: true, text, latencyMs, model, retryable: false };
  } catch (e) {
    return {
      ok: false,
      text: '',
      latencyMs: Date.now() - started,
      model,
      error:
        e instanceof DOMException && e.name === 'AbortError'
          ? 'timeout'
          : e instanceof Error
            ? e.message
            : 'network_error',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** False when the GROQ_API_KEY secret is not set on the project. */
export function hasGroqKey(): boolean {
  return Boolean(Deno.env.get('GROQ_API_KEY'));
}

export async function callGroq(
  turns: ChatTurn[],
  options: LlmOptions = {},
): Promise<LlmResult> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    return { ok: false, text: '', latencyMs: 0, error: 'missing_api_key' };
  }
  const primary = Deno.env.get('GROQ_MODEL') || DEFAULT_MODEL;
  const models = [primary];
  if (options.useFallbackModel) {
    const fallback = Deno.env.get('GROQ_FALLBACK_MODEL') || DEFAULT_FALLBACK_MODEL;
    if (fallback !== primary) models.push(fallback);
  }

  let last: LlmResult = { ok: false, text: '', latencyMs: 0, error: 'not_called' };
  for (const model of models) {
    const tries = 1 + (options.retries ?? 0);
    for (let i = 0; i < tries; i += 1) {
      const { retryable, ...result } = await attempt(model, apiKey, turns, options);
      if (result.ok) return result;
      last = result;
      if (!retryable) break;
    }
  }
  return last;
}

// ---- streaming -------------------------------------------------------------

export interface StreamOptions extends LlmOptions {
  /** Abort the Groq request (client stopped or went away). */
  signal?: AbortSignal;
  /** Max silence between two chunks once the stream has started. */
  idleTimeoutMs?: number;
}

export type StreamEvent =
  | { type: 'start'; model: string }
  | { type: 'delta'; text: string };

/**
 * Splits an OpenAI-compatible SSE body into content deltas. Pure, so the
 * Deno tests can feed it hand-made chunks. Returns the leftover partial line.
 */
export function parseSseLines(
  buffer: string,
): { deltas: string[]; done: boolean; error: string | null; rest: string } {
  const deltas: string[] = [];
  let done = false;
  let error: string | null = null;
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    if (data === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const json = JSON.parse(data);
      if (json?.error) {
        error = String(json.error?.message ?? json.error).slice(0, 200);
        continue;
      }
      const piece = json?.choices?.[0]?.delta?.content;
      if (typeof piece === 'string' && piece.length > 0) deltas.push(piece);
    } catch {
      // A malformed line is skipped; the rest of the stream still counts.
    }
  }
  return { deltas, done, error, rest };
}

/**
 * Streams a Groq completion (stream: true). Retries and the fallback model
 * apply only until the first token arrives: after that a failure ends the
 * stream and the caller keeps what it already has.
 */
export async function* streamGroq(
  turns: ChatTurn[],
  options: StreamOptions = {},
): AsyncGenerator<StreamEvent, void, void> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('missing_api_key');
  const primary = Deno.env.get('GROQ_MODEL') || DEFAULT_MODEL;
  const models = [primary];
  if (options.useFallbackModel) {
    const fallback = Deno.env.get('GROQ_FALLBACK_MODEL') || DEFAULT_FALLBACK_MODEL;
    if (fallback !== primary) models.push(fallback);
  }
  const baseUrl = (Deno.env.get('GROQ_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
  let lastError = 'not_called';

  for (const model of models) {
    const tries = 1 + (options.retries ?? 0);
    for (let i = 0; i < tries; i += 1) {
      if (options.signal?.aborted) return;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort);
      // First-token timeout, then an idle timeout between chunks.
      let timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
      const reasoning = isReasoningModel(model);
      let started = false;
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: turns,
            stream: true,
            ...(reasoning ? { reasoning_effort: 'low' } : {}),
            max_tokens: (options.maxTokens ?? 320) + (reasoning ? 400 : 0),
            temperature: options.temperature ?? 0.7,
          }),
        });
        if (!response.ok || !response.body) {
          const body = response.body ? await response.text() : '';
          lastError = `groq_${response.status}: ${body.slice(0, 200)}`;
          if (response.status === 429 || response.status >= 500) continue;
          break; // 4xx: this model will not get better on retry
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const parsed = parseSseLines(buffer);
          buffer = parsed.rest;
          if (parsed.error && !started) throw new Error(parsed.error);
          for (const text of parsed.deltas) {
            if (!started) {
              started = true;
              yield { type: 'start', model };
            }
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), options.idleTimeoutMs ?? 8000);
            yield { type: 'delta', text };
          }
          if (parsed.done || parsed.error) break;
        }
        if (started) return;
        lastError = 'empty_completion';
      } catch (e) {
        if (started) return; // keep the partial answer
        lastError =
          e instanceof DOMException && e.name === 'AbortError'
            ? 'timeout'
            : e instanceof Error
              ? e.message
              : 'network_error';
        if (options.signal?.aborted) return;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    }
  }
  throw new Error(lastError);
}
