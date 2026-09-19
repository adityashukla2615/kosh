import { TOOL_DEFS, runTool, describeResult } from './tools.js';
import { createMessage, llmInfo, textOf } from './llm.js';
import { groundingCheck } from './grounding.js';
import { offlineAdvisor } from './offline.js';

const MAX_STEPS = 8;

function systemPrompt(ctx) {
  const p = ctx.profile;
  return `You are Kosh, a financial wellness guide inside a planning app for Indian households. You are talking to ${p.name} (${p.age}, ${p.city || 'India'}). Their goal ids are: ${p.goals.map((g) => `${g.id} ("${g.name}")`).join(', ')}. Today is ${new Date().toISOString().slice(0, 10)}.

How to work:
- Every number you state must come from a tool result in this conversation. Use get_snapshot before discussing their situation, run_scenario for any "what if", check_goal for a specific goal, next_best_actions when they ask what to do, analyze_spending for spending questions, search_guides for concepts or rules. It is fine to call several tools before answering.
- If a question needs a number the tools cannot produce, say that plainly instead of estimating.

How to answer:
- Plain, warm, direct language, like a friend who is good with money. Short paragraphs, no jargon without a one-line explanation. Use ₹ with Indian units (₹45,000 / ₹12.4 L / ₹1.2 Cr).
- Lead with the answer, then the 2-3 numbers that matter, then what you'd do next.
- Always name the key assumption behind a projection (e.g. "assuming equity returns ~11.5% a year over the long run") and say probabilities are from simulations, not guarantees.
- Recommend categories (index fund, liquid fund, term plan), never specific funds, stocks, insurers or brokers.
- You are not a SEBI-registered adviser. For tax filings or large irreversible moves, suggest checking with a professional - once, briefly, not as boilerplate on every answer.
- Keep it under ~220 words unless they ask for detail.`;
}

export async function runAdvisor({ ctx, message, history = [] }) {
  const info = llmInfo();
  if (info.provider === 'offline') return offlineAdvisor({ ctx, message });

  const started = Date.now();
  const trace = [{ kind: 'plan', label: 'Reading your question', detail: `Model: ${info.model} via ${info.provider === 'bedrock' ? 'Amazon Bedrock' : 'Claude API'}`, ms: 0 }];
  const toolOutputs = [];
  const messages = [
    ...history
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
      .slice(-8)
      .map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  // the API needs the conversation to start with a user turn
  while (messages.length && messages[0].role !== 'user') messages.shift();

  let final = '';
  let repaired = false;
  let grounding = null;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const t0 = Date.now();
      const res = await createMessage({ system: systemPrompt(ctx), tools: TOOL_DEFS, messages });

      if (res.stop_reason === 'refusal') {
        const off = await offlineAdvisor({ ctx, message });
        off.trace.unshift({ kind: 'note', label: 'Model declined - answered with the offline planner instead', ms: Date.now() - t0 });
        return off;
      }

      messages.push({ role: 'assistant', content: res.content });
      const uses = res.content.filter((b) => b.type === 'tool_use');
      const said = textOf(res);

      if (!uses.length) {
        final = said;
        trace.push({ kind: 'answer', label: repaired ? 'Rewrote the answer after the number check' : 'Wrote the answer', ms: Date.now() - t0 });

        grounding = groundingCheck(final, toolOutputs);
        if (grounding.untraced.length && !repaired && step < MAX_STEPS - 2) {
          repaired = true;
          trace.push({ kind: 'check', label: 'Number check failed', detail: `Couldn't trace: ${grounding.untraced.join(', ')}. Asking the model to verify.`, ms: 0 });
          messages.push({
            role: 'user',
            content: `[automated check, not from the user] These figures in your draft could not be traced to any tool result: ${grounding.untraced.join(', ')}. Verify them with a tool call, or rewrite without them. Reply with the full corrected answer only.`,
          });
          continue;
        }
        break;
      }

      if (said) trace.push({ kind: 'think', label: said.length > 160 ? `${said.slice(0, 157)}…` : said, ms: Date.now() - t0 });

      const results = await Promise.all(
        uses.map(async (u) => {
          const t1 = Date.now();
          const out = await runTool(u.name, u.input, ctx);
          toolOutputs.push(out);
          trace.push({ kind: 'tool', name: u.name, input: u.input, label: describeResult(u.name, out), ms: Date.now() - t1 });
          return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), is_error: !!out?.error };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    console.error('[advisor] LLM call failed, falling back', err?.status || '', err?.message);
    const off = await offlineAdvisor({ ctx, message });
    off.trace.unshift({ kind: 'note', label: 'Couldn’t reach the model - answered with the offline planner', detail: String(err?.message || err).slice(0, 140), ms: 0 });
    return off;
  }

  if (!final) final = "I ran out of steps before finishing that one. Could you ask it a bit more specifically - e.g. one goal or one what-if at a time?";
  grounding ??= groundingCheck(final, toolOutputs);
  trace.push({ kind: 'check', label: grounding.untraced.length ? `${grounding.traced}/${grounding.total} figures traced to calculations` : `All ${grounding.total} figures traced to calculations`, detail: grounding.untraced.length ? `Not traced (likely derived by the model): ${grounding.untraced.join(', ')}` : undefined, ms: 0 });

  return { reply: final, trace, grounding, mode: info.provider, model: info.model, ms: Date.now() - started, suggestions: [] };
}
