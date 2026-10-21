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
  error?: string;
}

export async function callGroq(
  turns: ChatTurn[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<LlmResult> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  const model = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
  if (!apiKey) {
    return { ok: false, text: '', latencyMs: 0, error: 'missing_api_key' };
  }

  const started = Date.now();
  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: turns,
          // gpt-oss spends tokens on hidden reasoning; keep it minimal and
          // leave headroom so the actual answer always fits.
          reasoning_effort: 'low',
          max_tokens: options.maxTokens ?? 320,
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
        error: `groq_${response.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = await response.json();
    const text: string = json?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      return { ok: false, text: '', latencyMs, error: 'empty_completion' };
    }
    return { ok: true, text, latencyMs };
  } catch (e) {
    return {
      ok: false,
      text: '',
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : 'network_error',
    };
  }
}
