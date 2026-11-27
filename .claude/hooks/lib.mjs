// Shared helpers for the project's Claude Code hooks.
export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Exit code 2 blocks the tool call; stderr is shown to Claude.
export function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}
