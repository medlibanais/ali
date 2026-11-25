// A tiny stand-in for Groq's chat completions API (OpenAI-compatible SSE),
// so Coach tests never make a paid call. Point the coach function at it with
//   GROQ_BASE_URL=http://127.0.0.1:<port>/openai/v1  GROQ_API_KEY=mock
//
// What it does is chosen by tags in the newest user message:
//   [slow]     one word every 150 ms (time to drop the line mid-reply)
//   [timeout]  accepts the request and never answers (provider timeout)
//   [boom]     HTTP 500 before any text (the provider did no work)
//   otherwise  a short grounded reply, streamed in a few chunks
// GET /calls returns how many completions were requested, per turn tag.
//
// Run: node supabase/tests/mock_groq.mjs [port]   (default 54399)
import http from 'node:http';

const port = Number(process.argv[2] ?? process.env.MOCK_GROQ_PORT ?? 54399);
const calls = [];

function lastUser(messages) {
  return [...(messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
}

/**
 * Names the first pending quest it finds in the system prompt, so a test can
 * check that the user's real quests reached the model.
 */
function replyFor(body) {
  const system = (body.messages ?? []).find((m) => m.role === 'system')?.content ?? '';
  const quest = system.match(/- \[pending\] (.+?) \(/)?.[1] ?? 'one small step';
  return `We can start with "${quest}" today. One small step keeps our streak alive. Let's do it together.`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/calls') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total: calls.length, calls }));
    return;
  }
  if (req.method === 'POST' && req.url === '/reset') {
    calls.length = 0;
    res.writeHead(204).end();
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const user = lastUser(body.messages);
  calls.push({ at: Date.now(), user: user.slice(0, 80) });

  if (user.includes('[timeout]')) return; // never answers
  if (user.includes('[boom]')) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"mock outage"}}');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const words = replyFor(body).split(/(?<= )/);
  const gap = user.includes('[slow]') ? 150 : 15;
  for (const w of words) {
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    await new Promise((r) => setTimeout(r, gap));
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

server.listen(port, '0.0.0.0', () => console.log(`mock groq on :${port}`));
