import { evaluate, compare, formatINR as inr } from '../engine/analysis.js';
import { nextBestActions } from '../engine/actions.js';
import { analyzeSpending } from '../engine/spending.js';
import { createMessage, llmInfo, textOf } from './llm.js';
import { groundingCheck } from './grounding.js';
import { getStore } from '../store/index.js';

// Monthly review: a fixed pipeline of small "specialists", each doing one job and
// handing a structured result to the next. Deterministic steps do the maths; the
// language model (if connected) only writes the final note, and a fact-checker
// verifies that note against the numbers the pipeline produced.

const pct = (p) => `${Math.round(p * 100)}%`;
// anything that looks like a product/brand recommendation is a compliance problem
const PRODUCT_WORDS = /\b(hdfc|icici|sbi|axis|kotak|nippon|parag parikh|mirae|quant|tata|lic|zerodha|groww|upstox|reliance|adani|infosys|tcs|bajaj)\b/i;

async function step(steps, meta, fn) {
  const t0 = Date.now();
  const entry = { ...meta, status: 'running' };
  steps.push(entry);
  try {
    const res = await fn();
    Object.assign(entry, { status: res.warn ? 'warn' : 'done', summary: res.summary, findings: res.findings || [], ms: Date.now() - t0 });
    return res.data;
  } catch (err) {
    Object.assign(entry, { status: 'error', summary: err.message, findings: [], ms: Date.now() - t0 });
    throw err;
  }
}

export async function runReview(ctx) {
  const steps = [];
  const store = await getStore();
  const started = Date.now();
  const { profile, assumptions: a, transactions } = ctx;

  const intake = await step(steps, { id: 'intake', agent: 'Intake', role: 'Checks the data is complete enough to plan on' }, async () => {
    const findings = [];
    const src = transactions.some((t) => t.source === 'import') ? 'your uploaded statement' : 'sample transactions';
    findings.push(`${transactions.length} transactions from ${src}.`);
    if (!profile.insurance?.healthCover) findings.push('No health cover recorded - treating it as zero.');
    if (!(profile.goals || []).length) findings.push('No goals set - only retirement will be planned.');
    const missing = ['income', 'expenses', 'assets'].filter((k) => !profile[k]);
    return { summary: missing.length ? `Missing: ${missing.join(', ')}` : 'Profile complete', findings, warn: missing.length > 0, data: { src } };
  });

  const spending = await step(steps, { id: 'spending', agent: 'Spending analyst', role: 'Looks for trends and leaks in transactions' }, async () => {
    const sp = analyzeSpending(profile, transactions);
    return { summary: `${inr(sp.totalMonthly)}/month average across ${sp.categories.length} categories`, findings: sp.flags.map((f) => f.text), warn: sp.flags.length > 0, data: sp };
  });

  const plan = await step(steps, { id: 'goals', agent: 'Goal planner', role: 'Re-runs every goal through the simulator' }, async () => {
    const r = evaluate(profile, a, {}, { sims: a.simulations });
    const prev = await store.get(`review#${profile.id}`);
    const findings = r.goals.goals.map((g) => {
      const before = prev?.goals?.[g.id];
      const drift = before != null ? ` (last review ${pct(before)})` : '';
      return `${g.name}: ${pct(g.probability)}${drift}`;
    });
    const off = r.goals.goals.filter((g) => g.status === 'off-track').length;
    return { summary: `${r.goals.goals.length} goals, ${off} off track · health ${r.health.score}/100`, findings, warn: off > 0, data: { r, prev } };
  });

  const stress = await step(steps, { id: 'stress', agent: 'Risk officer', role: 'Stress-tests the plan against bad luck' }, async () => {
    const tests = [
      { name: '6-month job loss', s: { jobLossMonths: 6 } },
      { name: '30% market crash', s: { marketShockPct: 30 } },
      { name: 'Both at once', s: { jobLossMonths: 6, marketShockPct: 30 } },
    ];
    const results = tests.map((t) => {
      const c = compare(profile, a, t.s, { sims: 300 });
      const worst = [...c.deltas.goals].filter((g) => g.delta != null).sort((x, y) => x.delta - y.delta)[0];
      return { name: t.name, worstGoal: worst?.name, worstDelta: worst?.delta ?? 0, ranOut: c.scenario.projection.probRanOut, healthAfter: c.scenario.health.score };
    });
    const fragile = results.filter((x) => x.ranOut > 0.05 || x.worstDelta < -0.15);
    return {
      summary: fragile.length ? `Plan is fragile in ${fragile.length} of ${tests.length} stress tests` : 'Plan holds up in all stress tests',
      findings: results.map((x) => `${x.name}: worst hit "${x.worstGoal}" ${x.worstDelta ? `${Math.round(x.worstDelta * 100)} pts` : 'no change'}${x.ranOut > 0.01 ? `, ${pct(x.ranOut)} chance of running out` : ''}`),
      warn: fragile.length > 0,
      data: results,
    };
  });

  const actions = await step(steps, { id: 'actions', agent: 'Strategist', role: 'Simulates candidate moves and ranks them by impact' }, async () => {
    const list = nextBestActions(profile, a, transactions).slice(0, 5);
    return { summary: `${list.length} actions ranked`, findings: list.map((x) => `#${x.rank} ${x.title} - ${x.impact.headline}`), data: list };
  });

  const compliance = await step(steps, { id: 'compliance', agent: 'Compliance reviewer', role: 'No product pushing, every claim has its assumptions' }, async () => {
    const findings = [];
    for (const x of actions) {
      if (PRODUCT_WORDS.test(`${x.title} ${x.how.join(' ')}`)) findings.push(`"${x.title}" names a specific product - removed.`);
      if (!x.assumptions?.length) findings.push(`"${x.title}" has no stated assumptions.`);
      if (x.confidence === 'low') findings.push(`"${x.title}" is low confidence - labelled "worth checking" in the note.`);
    }
    const clean = actions.filter((x) => !PRODUCT_WORDS.test(`${x.title} ${x.how.join(' ')}`));
    return { summary: findings.length ? `${findings.length} note(s)` : 'All actions pass', findings: findings.length ? findings : ['No product names, every action carries its assumptions.'], data: clean };
  });

  const facts = buildFacts(profile, plan.r, spending, stress, compliance, plan.prev);

  const info = llmInfo();
  let letter;
  let grounding;
  await step(steps, { id: 'writer', agent: 'Writer', role: info.provider === 'offline' ? 'Drafts the note from a template' : `Drafts the note (${info.model})` }, async () => {
    if (info.provider !== 'offline') {
      try {
        letter = await llmLetter(facts);
      } catch (err) {
        console.error('[review] writer fell back to template', err?.message);
      }
    }
    const usedTemplate = !letter;
    if (usedTemplate) letter = templateLetter(facts);
    return { summary: usedTemplate ? `Template note, ${letter.split(/\s+/).length} words` : `${letter.split(/\s+/).length} words`, findings: [] };
  });

  await step(steps, { id: 'factcheck', agent: 'Fact checker', role: 'Every ₹ and % in the note must trace back to the pipeline' }, async () => {
    grounding = groundingCheck(letter, facts, [a.simulations]);
    if (grounding.untraced.length && info.provider !== 'offline') {
      // one repair attempt, then fall back to the template rather than ship an unverified number
      try {
        const fixed = await llmLetter(facts, grounding.untraced);
        const g2 = groundingCheck(fixed, facts, [a.simulations]);
        if (g2.untraced.length < grounding.untraced.length) {
          letter = fixed;
          grounding = g2;
        }
      } catch {}
      if (grounding.untraced.length) {
        letter = templateLetter(facts);
        grounding = groundingCheck(letter, facts, [a.simulations]);
        return { summary: 'Model draft had untraceable figures - replaced with verified template', findings: [], warn: true };
      }
    }
    return { summary: `${grounding.traced}/${grounding.total} figures verified`, findings: grounding.untraced.length ? [`Untraced: ${grounding.untraced.join(', ')}`] : [], warn: grounding.untraced.length > 0 };
  });

  await store.put(`review#${profile.id}`, { at: new Date().toISOString(), goals: Object.fromEntries(plan.r.goals.goals.map((g) => [g.id, g.probability])), health: plan.r.health.score });

  return { steps, letter, grounding, facts, actions: compliance, mode: info.provider, ms: Date.now() - started, at: new Date().toISOString(), previous: plan.prev?.at ?? null };
}

function buildFacts(profile, r, spending, stress, actions, prev) {
  return {
    name: profile.name.split(' ')[0],
    health: { score: r.health.score, band: r.health.band, previous: prev?.health ?? null, weakest: [...r.health.pillars].sort((x, y) => x.points / x.weight - y.points / y.weight)[0].label },
    monthly: { income: r.summary.monthlyIncome, spending: r.summary.monthlyExpenses, emi: r.summary.emi, sip: r.summary.sip, surplus: r.summary.surplus },
    runwayMonths: Math.round(r.summary.emergencyMonths * 10) / 10,
    goals: r.goals.goals.map((g) => ({ name: g.name, probability: g.probability, pct: pct(g.probability), previous: prev?.goals?.[g.id] ?? null, year: g.year, costFuture: g.costFuture, costFutureText: inr(g.costFuture) })),
    spendingFlags: spending.flags.map((f) => f.text).slice(0, 3),
    stress: stress.map((s) => ({ name: s.name, worstGoal: s.worstGoal, drop: Math.round(-s.worstDelta * 100), ranOut: s.ranOut })),
    actions: actions.slice(0, 3).map((x) => ({ title: x.title, why: x.summary, impact: x.impact.headline, confidence: x.confidence })),
  };
}

async function llmLetter(facts, badFigures = null) {
  const res = await createMessage({
    output_config: { effort: 'low' },
    max_tokens: 4000,
    system:
      'You write a short monthly money note for a user of a personal finance app in India. Use ONLY the facts given in the JSON - do not introduce any other rupee amount or percentage, and do not compute new ones. Warm, plain English, second person, no headings, no bullet lists longer than 3 items, under 190 words. Start with the one thing that matters most this month. End with the single next step. Never name specific financial products or companies.',
    messages: [
      {
        role: 'user',
        content: `Facts:\n${JSON.stringify(facts, null, 1)}${badFigures ? `\n\nYour previous draft used figures not present in the facts (${badFigures.join(', ')}). Do not use them.` : ''}`,
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  return textOf(res);
}

function templateLetter(f) {
  const lines = [];
  const change = f.health.previous != null ? f.health.score - f.health.previous : null;
  lines.push(
    `Hi ${f.name}, here's your money check-in. Your health score is ${f.health.score}/100 (${f.health.band.toLowerCase()})${change ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} since last time` : ''}. The weakest area is ${f.health.weakest.toLowerCase()}.`,
  );
  const weakest = [...f.goals].sort((x, y) => x.probability - y.probability)[0];
  const strongest = [...f.goals].sort((x, y) => y.probability - x.probability)[0];
  lines.push(`"${strongest.name}" looks ${strongest.probability >= 0.8 ? 'solid' : 'reasonable'} at ${strongest.pct}. "${weakest.name}" needs attention - ${weakest.pct} chance of reaching ${weakest.costFutureText} by ${weakest.year}.`);
  if (f.spendingFlags.length) lines.push(`On spending: ${f.spendingFlags[0]}`);
  const fragile = f.stress.find((s) => s.drop >= 15);
  if (fragile) lines.push(`In our stress test, a ${fragile.name.toLowerCase()} would knock "${fragile.worstGoal}" down by ${fragile.drop} points - that's the risk worth closing.`);
  const a0 = f.actions[0];
  if (a0) lines.push(`If you do one thing this month: ${a0.title.charAt(0).toLowerCase()}${a0.title.slice(1)}. ${a0.why}`);
  return lines.join('\n\n');
}
