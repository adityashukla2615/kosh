import { runTool, describeResult } from './tools.js';
import { groundingCheck } from './grounding.js';
import { formatINR as inr } from '../engine/analysis.js';

// Offline planner: same tools, same numbers, but the "reasoning" is a small
// intent router + templates. Used when no model is configured, when the model
// errors out, or when it declines. Honest about being simpler.

const pct = (p) => `${Math.round(p * 100)}%`;
// "an 86%", "an 11%", "a 64%"
const aPct = (p) => (/^(8|11|18)/.test(String(Math.round(p * 100))) ? `an ${pct(p)}` : `a ${pct(p)}`);

export function parseAmount(text) {
  const t = text.toLowerCase().replace(/rs\.?|inr/g, '₹');
  const re = /(₹\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l\b|cr\b|crores?)?/g;
  let m;
  let best = null;
  while ((m = re.exec(t))) {
    const n = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const u = (m[3] || '').trim();
    const mult = /^k|thousand/.test(u) ? 1e3 : /^(l|lakh|lac)/.test(u) ? 1e5 : /^(cr|crore)/.test(u) ? 1e7 : 1;
    const val = n * mult;
    const strong = !!m[1] || mult > 1;
    // ignore bare numbers that are obviously years / ages / percents
    const after = t.slice(re.lastIndex, re.lastIndex + 2);
    if (!strong && (after.startsWith('%') || (n >= 1900 && n <= 2100) || n < 1000)) continue;
    if (!best || (strong && !best.strong)) best = { value: val, strong };
  }
  return best?.value ?? null;
}

function parsePct(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s?(%|percent)/i);
  return m ? Number(m[1]) : null;
}

function parseYears(text) {
  const m = text.match(/(?:in|after|within)\s+(\d{1,2})\s*(?:years?|yrs?)/i) || text.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:from now|later)/i);
  if (m) return Number(m[1]);
  if (/next year/i.test(text)) return 1;
  const y = text.match(/\b(20[2-6]\d)\b/);
  if (y) return Math.max(0, Number(y[1]) - new Date().getFullYear());
  return null;
}

function parseMonths(text) {
  const m = text.match(/(\d{1,2})\s*(?:months?|mos?)/i);
  return m ? Number(m[1]) : null;
}

function matchGoal(text, goals) {
  const t = text.toLowerCase();
  const hints = { home: /house|flat|home|down ?payment/, education: /college|education|school|study/, retirement: /retire|retirement|fire|independen/, travel: /trip|travel|vacation|holiday|europe|japan|yatra/, family: /wedding|marriage/ };
  for (const g of goals) {
    if (t.includes(g.id) || g.name.toLowerCase().split(/\W+/).some((w) => w.length > 4 && t.includes(w))) return g;
  }
  for (const g of goals) if (hints[g.type]?.test(t)) return g;
  return null;
}

function classify(text) {
  const t = text.toLowerCase();
  if (/job|laid off|layoff|fired|lose (my )?income|unemploy/.test(t)) return 'jobloss';
  if (/crash|market (fall|drop|correction)|recession|bear market|sensex|nifty (falls|drops)/.test(t)) return 'shock';
  if (/(afford|buy|purchase|spend .* on|get a (car|bike)|renovat)/.test(t) && parseAmount(t)) return 'purchase';
  if (/step[- ]?up|top[- ]?up/.test(t)) return 'stepup';
  if (/retire (early|earlier|later|at)|early retirement|retire by/.test(t)) return 'retire';
  if (/(save|invest|put|add|increase).*(more|extra)|extra .*(month|sip)|if i (save|invest)/.test(t) && parseAmount(t)) return 'savemore';
  if (/(raise|hike|increment|appraisal|promotion|salary (goes|increase)|pay cut|salary cut)/.test(t)) return 'income';
  if (/spend|spending|expense|where.*money go|budget|swiggy|zomato|food|shopping|leak/.test(t)) return 'spending';
  if (/on track|goal|house|flat|college|trip|wedding|down ?payment|retire/.test(t)) return 'goal';
  if (/what should i|next|priorit|advice|improve|first|start|do now|focus/.test(t)) return 'actions';
  if (/assum|how do you|how does|calculate|probabilit|monte carlo/.test(t)) return 'method';
  if (/insurance|term|health cover|mediclaim|tax|ppf|nps|epf|fd|fixed deposit|emergency|sip|index fund|gold|elss|80c|loan|credit card|prepay/.test(t)) return 'concept';
  return 'overview';
}

export async function offlineAdvisor({ ctx, message }) {
  const started = Date.now();
  const trace = [];
  const outputs = [];
  const call = async (name, input = {}) => {
    const t0 = Date.now();
    const out = await runTool(name, input, ctx);
    outputs.push(out);
    trace.push({ kind: 'tool', name, input, label: describeResult(name, out), ms: Date.now() - t0 });
    return out;
  };

  const intent = classify(message);
  trace.push({ kind: 'plan', label: `Understood this as: ${INTENT_LABEL[intent]}`, detail: 'Offline planner (no language model connected) - same calculations, simpler wording.', ms: 0 });

  const snap = await call('get_snapshot');
  const goals = snap.goals;
  let reply = '';
  let suggestions = [];

  const scenarioReply = (res, lead) => {
    const lines = [lead, '', ...res.summary.map((s) => `• ${s}`)];
    const surplus = res.monthly_surplus;
    if (surplus.after < 0) lines.push(`• Monthly cash flow turns negative (${inr(surplus.after)}), so savings would be drawn down.`);
    return lines.join('\n');
  };

  switch (intent) {
    case 'purchase': {
      const amount = parseAmount(message);
      const years = parseYears(message) ?? 1;
      const label = (message.match(/\b(car|bike|house|flat|phone|laptop|wedding|renovation|trip|course|mba)\b/i)?.[1] || 'purchase').replace(/^\w/, (c) => c.toUpperCase());
      const res = await call('run_scenario', { big_purchase: { label, amount, in_years: years } });
      const g = res.goals.find((x) => x.id === '__purchase');
      const hurt = res.goals.filter((x) => x.before != null && x.after - x.before <= -0.05).sort((x, y) => x.after - x.before - (y.after - y.before));
      // "affordable" isn't just "the money exists" - it's "without wrecking something else"
      const bigHit = hurt.some((x) => x.before - x.after >= 0.15);
      const verdict = g.after >= 0.75 ? (bigHit ? 'you can pay for it, but the money would come out of another goal' : 'yes, comfortably') : g.after >= 0.5 ? 'yes, but it will squeeze other goals' : 'not without borrowing or delaying something';
      reply = scenarioReply(
        res,
        `Short answer: ${verdict}. A ${inr(amount)} ${label.toLowerCase()} ${years ? `in ${years} year${years > 1 ? 's' : ''}` : 'now'} has ${aPct(g.after)} chance of being paid from savings on time.`,
      );
      if (g.after < 0.75) {
        reply += `\n\nIt would cost about ${inr(g.cost_at_goal_date)} by then. Only ${inr(g.earmarked_from_savings)} of your savings is free for it - we keep ${inr(res.emergency_reserve_kept_aside)} aside as your emergency cushion and don't count that.`;
      }
      if (hurt.length) reply += `\n\nThe trade-off is mostly "${hurt[0].name}", which drops from ${pct(hurt[0].before)} to ${pct(hurt[0].after)}.`;
      const guide = await call('search_guides', { query: `${label} loan prepay emi` });
      reply += `\n\nIf you'd take a loan instead, keep total EMIs under ~35-40% of take-home (see "${guide[0].title}").`;
      suggestions = ['What if I wait one more year?', 'What should I do first?'];
      break;
    }
    case 'jobloss': {
      const months = parseMonths(message) ?? 6;
      const res = await call('run_scenario', { job_loss_months: months });
      reply = scenarioReply(res, `If income stopped for ${months} months, your ${snap.emergency_runway_months.toFixed(1)} months of easy-to-reach savings ${snap.emergency_runway_months >= months ? 'would carry you through without touching investments' : 'would run out first, and the rest would come out of investments'}.`);
      const guide = await call('search_guides', { query: 'emergency fund job loss liquid fund' });
      reply += `\n\n${guide[0].title}: aim for 6 months of expenses + EMIs; single-income homes 9-12.`;
      suggestions = ['How do I build my emergency fund?', 'What if the market also crashes?'];
      break;
    }
    case 'shock': {
      const drop = parsePct(message) ?? 30;
      const res = await call('run_scenario', { market_shock_pct: drop });
      reply = scenarioReply(res, `A ${drop}% equity crash right now would hit near-term goals hardest; long-dated goals have time to recover.`);
      const guide = await call('search_guides', { query: 'sequence risk crash near goal glide path' });
      reply += `\n\nWhat protects you: money for goals less than 3 years away should already sit mostly in debt ("${guide[0].title}"). Keep SIPs running through the fall - that's when they buy cheapest.`;
      suggestions = ['Is my asset mix right?', 'What should I do first?'];
      break;
    }
    case 'savemore': {
      const amount = parseAmount(message);
      const res = await call('run_scenario', { extra_monthly: amount });
      reply = scenarioReply(res, `Investing an extra ${inr(amount)} a month:`);
      reply += `\n\nThe extra goes to must-have goals first, then important ones, then nice-to-haves. Assumes long-run equity returns around the figure on the Assumptions page - probabilities come from ${ctx.assumptions.simulations} simulated markets, not a promise.`;
      suggestions = ['What about a 10% yearly step-up instead?', 'Which goal needs it most?'];
      break;
    }
    case 'stepup': {
      const p = parsePct(message) ?? 10;
      const res = await call('run_scenario', { step_up_pct: p });
      reply = scenarioReply(res, `Raising your SIP by ${p}% every year (starting from ${inr(snap.monthly.sip)}):`);
      reply += '\n\nStep-ups feel painless because they ride on salary hikes, and they compound hard in the later years.';
      suggestions = ['And if I also invest ₹5,000 more?', 'What should I do first?'];
      break;
    }
    case 'retire': {
      const age = message.match(/retire (?:at|by) (\d{2})/i)?.[1];
      const ret = ctx.profile.goals.find((g) => g.type === 'retirement');
      const delta = age && ret ? Number(age) - (ret.retireAge ?? 58) : /early|earlier/i.test(message) ? -3 : 2;
      const res = await call('run_scenario', { retire_age_delta: delta });
      reply = scenarioReply(res, `Retiring ${Math.abs(delta)} year${Math.abs(delta) > 1 ? 's' : ''} ${delta < 0 ? 'earlier' : 'later'} (at ${(ret?.retireAge ?? 58) + delta}):`);
      const guide = await call('search_guides', { query: 'retirement corpus withdrawal rate' });
      reply += `\n\nWe size the retirement pot at ~${ctx.assumptions.retirementMultiple}x yearly expenses ("${guide[0].title}").`;
      suggestions = ['What would it take to retire at 50?', 'How is the retirement number calculated?'];
      break;
    }
    case 'income': {
      const p = (parsePct(message) ?? 15) * (/cut|drop|less/i.test(message) ? -1 : 1);
      const withSweep = await call('run_scenario', { income_change_pct: p, sweep_surplus_pct: p > 0 ? 50 : 0 });
      reply = scenarioReply(withSweep, p > 0 ? `A ${p}% raise only helps your goals if some of it gets invested. Assuming you auto-invest half of the extra surplus:` : `A ${Math.abs(p)}% pay cut:`);
      suggestions = ['What should I do first?', 'Where is my money going?'];
      break;
    }
    case 'spending': {
      const sp = await call('analyze_spending');
      const top = sp.top_categories.slice(0, 4).map((c) => `${c.label} ${inr(c.monthly_avg)}`).join(', ');
      reply = `You spend about ${inr(sp.total_monthly_avg)} a month. The biggest buckets: ${top}.`;
      if (sp.flags.length) reply += `\n\nThings that stood out:\n${sp.flags.slice(0, 3).map((f) => `• ${f}`).join('\n')}`;
      const topFlag = sp.top_categories.find((c) => sp.flags.some((f) => f.startsWith(c.label)));
      if (topFlag) {
        const cut = Math.round((topFlag.recent_avg * 0.25) / 100) * 100;
        const res = await call('run_scenario', { expense_change_pct: 0, extra_monthly: cut });
        reply += `\n\nIf you trimmed ${topFlag.label.toLowerCase()} by a quarter and invested the ${inr(cut)}/month instead: ${res.summary[0] || 'small but steady improvement.'}`;
      }
      suggestions = ['What should I do first?', 'What if I save ₹5,000 more a month?'];
      break;
    }
    case 'goal': {
      const g = matchGoal(message, goals) || [...goals].sort((a, b) => a.probability - b.probability)[0];
      const d = await call('check_goal', { goal_id: g.id });
      const eqPct = Math.round(d.investment_mix_for_this_horizon.equity * 100);
      reply = `"${d.name}" - ${d.status === 'on-track' ? 'on track' : d.status === 'watch' ? 'close, but worth watching' : 'off track right now'}: ${aPct(d.probability)} chance of being fully funded by ${d.year}.`;
      reply += `\n\n• It costs ${inr(d.cost_today)} today; with ${pct(d.inflation_used)} yearly inflation that becomes ${inr(d.cost_at_goal_date)}.`;
      reply += `\n• ${inr(d.earmarked_now)} of your current savings is set aside for it, plus ${inr(d.monthly_allocated)}/month.`;
      reply += `\n• Because it's ${d.year - new Date().getFullYear()} years away we'd hold it ~${eqPct}% in equity.`;
      if (d.to_reach.extra_monthly_needed > 0) {
        reply += `\n\nTo get to ${pct(d.to_reach.target_probability)}: add about ${inr(d.to_reach.extra_monthly_needed)}/month`;
        reply += d.to_reach.or_delay_years ? `, or push the date out by ${d.to_reach.or_delay_years} year${d.to_reach.or_delay_years > 1 ? 's' : ''}.` : '.';
      }
      suggestions = goals.filter((x) => x.id !== g.id).slice(0, 2).map((x) => `Am I on track for ${x.name.toLowerCase()}?`);
      break;
    }
    case 'method': {
      const guide = await call('search_guides', { query: 'how kosh works monte carlo probability assumption' });
      const as = await call('get_assumptions');
      const pick = (k) => as.find((x) => x.key === k)?.value;
      reply = `${guide[0].text}\n\nKey assumptions right now: inflation ${pct(pick('inflation'))}, equity ${pct(pick('returns.equity'))} a year with ${pct(pick('volatility.equity'))} swings, debt ${pct(pick('returns.debt'))}. You can change any of these on the Assumptions page and every number updates.`;
      suggestions = ['What should I do first?', 'What if the market crashes 30%?'];
      break;
    }
    case 'concept': {
      const guide = await call('search_guides', { query: message });
      const actions = await call('next_best_actions', { limit: 6 });
      reply = guide[0].title === 'No match' ? "I don't have a note on that one." : `From the notes - ${guide[0].title}:\n\n${guide[0].text.split('\n').slice(0, 3).join('\n')}`;
      const related = actions.find((a) => message.toLowerCase().split(/\W+/).some((w) => w.length > 3 && a.title.toLowerCase().includes(w)));
      if (related) reply += `\n\nFor you specifically: ${related.title}. ${related.summary}`;
      suggestions = ['What should I do first?', 'Am I on track?'];
      break;
    }
    case 'actions': {
      const actions = await call('next_best_actions', { limit: 3 });
      reply = `Here's where I'd start, in order:\n\n${actions.map((a, i) => `${i + 1}. ${a.title} - ${a.summary} (${a.impact.headline.toLowerCase()})`).join('\n')}`;
      reply += '\n\nEach one was simulated against your plan before ranking. Open "Next steps" for the reasoning and assumptions behind each.';
      suggestions = [`Tell me more about #1`, 'What if I save ₹5,000 more a month?'];
      break;
    }
    default: {
      const actions = await call('next_best_actions', { limit: 2 });
      const weakest = [...goals].sort((a, b) => a.probability - b.probability)[0];
      reply = `Quick read on where you stand: health score ${snap.health_score.score}/100 (${snap.health_score.band.toLowerCase()}), ${inr(snap.monthly.unplanned_surplus)} a month not yet given a job, and ${snap.emergency_runway_months.toFixed(1)} months of emergency runway.`;
      reply += `\n\nThe goal that needs the most help is "${weakest.name}" at ${pct(weakest.probability)}. Top move right now: ${actions[0].title.toLowerCase()}.`;
      suggestions = ['What should I do first?', `Am I on track for ${weakest.name.toLowerCase()}?`, 'What if I lose my job for 6 months?'];
    }
  }

  const grounding = groundingCheck(reply, outputs, [ctx.assumptions.simulations, ctx.assumptions.retirementMultiple]);
  trace.push({ kind: 'answer', label: 'Composed the answer from the tool results', ms: 0 });
  trace.push({ kind: 'check', label: grounding.untraced.length ? `${grounding.traced}/${grounding.total} figures traced` : `All ${grounding.total} figures traced to calculations`, detail: grounding.untraced.length ? `Untraced: ${grounding.untraced.join(', ')}` : undefined, ms: 0 });

  return { reply, trace, grounding, mode: 'offline', model: null, ms: Date.now() - started, suggestions };
}

const INTENT_LABEL = {
  purchase: 'can I afford a purchase',
  jobloss: 'what if I lose my income',
  shock: 'what if markets crash',
  savemore: 'what if I invest more',
  stepup: 'what if I step up my SIP',
  retire: 'changing retirement age',
  income: 'a change in salary',
  spending: 'where is my money going',
  goal: 'am I on track for a goal',
  actions: 'what should I do next',
  method: 'how the numbers work',
  concept: 'explain a concept',
  overview: 'general check-in',
};
