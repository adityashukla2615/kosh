import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

// Picks the brain. Order: explicit LLM_PROVIDER, then whatever credentials exist,
// then offline. Offline is a real mode, not an error state - the demo must work on
// a conference Wi-Fi with no keys.

let cached;

export function llmInfo() {
  if (cached) return cached.info;
  const want = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  let provider = 'offline';
  if (want === 'anthropic' || (want === 'auto' && process.env.ANTHROPIC_API_KEY)) provider = 'anthropic';
  else if (want === 'bedrock' || (want === 'auto' && process.env.USE_BEDROCK === '1')) provider = 'bedrock';

  let client = null;
  let model = null;
  if (provider === 'anthropic') {
    client = new Anthropic();
    model = process.env.KOSH_MODEL || 'claude-opus-5';
  } else if (provider === 'bedrock') {
    client = new AnthropicBedrockMantle({ awsRegion: process.env.KOSH_BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1' });
    model = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-opus-5';
  }
  cached = { client, info: { provider, model } };
  return cached.info;
}

export async function createMessage(params) {
  llmInfo();
  const { client, info } = cached;
  if (!client) throw new Error('LLM not configured');
  const base = { model: info.model, max_tokens: 16000, output_config: { effort: 'medium' }, ...params };

  if (info.provider === 'anthropic') {
    // server-side fallback: if Opus declines, the API re-runs on the recommended model
    // instead of handing us a refusal mid-conversation
    return client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  }
  return client.messages.create(base);
}

export function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
