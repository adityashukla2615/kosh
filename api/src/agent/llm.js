import Anthropic from '@anthropic-ai/sdk';

// Picks the brain. With an API key the advisor runs on Claude; without one it
// runs the offline planner.
//
// Offline is a real mode, not an error state: it calls the same tools and
// quotes the same engine numbers in plainer wording, so the demo works on
// conference wifi with no keys, and the deployed instance runs on it.

let cached;

export function llmInfo() {
  if (cached) return cached.info;
  const want = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  const provider = want === 'anthropic' || (want === 'auto' && process.env.ANTHROPIC_API_KEY) ? 'anthropic' : 'offline';

  const client = provider === 'anthropic' ? new Anthropic() : null;
  const model = provider === 'anthropic' ? process.env.KOSH_MODEL || 'claude-opus-5' : null;

  cached = { client, info: { provider, model } };
  return cached.info;
}

export async function createMessage(params) {
  llmInfo();
  const { client, info } = cached;
  if (!client) throw new Error('LLM not configured');

  return client.beta.messages.create({
    model: info.model,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    // Server-side fallback: if Opus declines, the API re-runs the request on the
    // recommended model rather than handing us a refusal mid-conversation.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...params,
  });
}

export function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
