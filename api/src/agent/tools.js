import { evaluate, compare, formatINR as inr } from '../engine/analysis.js';
import { solveExtraForGoal } from '../engine/goals.js';
import { nextBestActions } from '../engine/actions.js';
import { analyzeSpending } from '../engine/spending.js';
import { flattenAssumptions } from '../engine/assumptions.js';
import { search } from './retrieval.js';

// Tools the advisor can call. Same functions back both the Claude tool-use loop
// and the offline planner, so the numbers are identical whichever brain is on.

const r2 = (x) => Math.round(x * 100) / 100;

export const TOOL_DEFS = [
  {
    name: 'get_snapshot',
    description:
      "Current financial picture of the user: income, spending, EMIs, SIPs, monthly surplus, net worth, emergency runway, asset mix, health score with pillars, and each goal with its probability of success. Call this first in almost every conversation.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_scenario',
    description:
      'Simulate a what-if against the current plan and return baseline vs scenario: goal probabilities, health score, net worth at horizon and a plain-English summary. Combine levers freely. Amounts are in rupees per month unless stated.',
    input_schema: {
      type: 'object',
      properties: {
        extra_monthly: { type: 'number', description: 'Extra rupees invested every month' },
        step_up_pct: { type: 'number', description: 'Yearly SIP increase in percent, e.g. 10' },
        sweep_surplus_pct: { type: 'number', description: 'Percent of idle monthly surplus auto-invested' },
        income_change_pct: { type: 'number', description: 'Change in take-home pay, percent (negative for a cut)' },
        expense_change_pct: { type: 'number', description: 'Change in monthly spending, percent' },
        job_loss_months: { type: 'number', description: 'Months with zero income, starting ~3 months from now' },
        market_shock_pct: { type: 'number', description: 'Immediate fall in equity holdings, percent' },
        move_idle_cash: { type: 'number', description: 'Rupees moved from savings account into investments' },
        retire_age_delta: { type: 'number', description: 'Years to retire later (positive) or earlier (negative)' },
        big_purchase: {
          type: 'object',
          description: 'A one-off purchase to be paid from savings',
          properties: { label: { type: 'string' }, amount: { type: 'number' }, in_years: { type: 'number' } },
          required: ['amount'],
        },
        prepay: {
          type: 'object',
          description: 'Prepay a loan from savings',
          properties: { liability_id: { type: 'string' }, amount: { type: 'number' } },
          required: ['liability_id', 'amount'],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'check_goal',
    description: 'Deep dive into one goal: cost today and at the goal date, money earmarked, monthly allocation, probability, and what it would take (extra SIP or a delay) to reach a target probability.',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: { type: 'string' },
        target_probability: { type: 'number', description: 'Between 0.5 and 0.95. Default 0.8' },
      },
      required: ['goal_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'next_best_actions',
    description: 'Ranked list of the most valuable things this user could do next, each already simulated for impact, with reasons and assumptions.',
    input_schema: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
  },
  {
    name: 'analyze_spending',
    description: 'Spending by category over the last months from the (synthetic or imported) transaction history, with trends and flags.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_guides',
    description: 'Search the built-in plain-language finance notes (Indian context: insurance, PPF/EPF/NPS, tax regimes, emergency fund, asset allocation, etc). Use for concepts and rules of thumb; cite the note title.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'get_assumptions',
    description: 'The assumptions (inflation, returns, volatility, targets) behind every calculation, with a one-line note each.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export function toScenario(input = {}) {
  const s = {
    extraMonthly: input.extra_monthly,
    stepUpPct: input.step_up_pct,
    sweepSurplusPct: input.sweep_surplus_pct,
    incomeChangePct: input.income_change_pct,
    expenseChangePct: input.expense_change_pct,
    jobLossMonths: input.job_loss_months,
    marketShockPct: input.market_shock_pct,
    moveIdleCash: input.move_idle_cash,
    retireAgeDelta: input.retire_age_delta,
  };
  if (input.big_purchase?.amount) s.bigPurchase = { label: input.big_purchase.label || 'Purchase', amount: input.big_purchase.amount, inYears: input.big_purchase.in_years ?? 1 };
  if (input.prepay?.amount) s.prepay = { liabilityId: input.prepay.liability_id, amount: input.prepay.amount };
  return s;
}

function compactGoal(g) {
  return {
    id: g.id,
    name: g.name,
    priority: g.priority,
    year: g.year,
    cost_today: g.costToday,
    cost_at_goal_date: g.costFuture,
    earmarked_now: g.earmarked,
    monthly_allocated: g.monthly,
    monthly_needed_for_about_80pct_odds: g.requiredMonthly,
    probability: r2(g.probability),
    status: g.status,
  };
}

export const EXECUTORS = {
  get_snapshot(_, ctx) {
    // same path count as the dashboard: a probability the advisor quotes has to match the
    // one the user is looking at, or "every number traced" stops being true
    const r = evaluate(ctx.profile, ctx.assumptions, {}, { sims: ctx.assumptions.simulations });
    const s = r.summary;
    return {
      name: ctx.profile.name,
      age: ctx.profile.age,
      city: ctx.profile.city,
      dependents: ctx.profile.dependents,
      risk_profile: ctx.profile.riskProfile,
      monthly: { take_home_incl_bonus: s.monthlyIncome, spending: s.monthlyExpenses, emis: s.emi, sip: s.sip, epf: s.epfMonthly, unplanned_surplus: s.surplus },
      savings_rate: r2(s.savingsRate),
      net_worth: s.netWorth,
      financial_assets: s.financialAssets,
      debts: (ctx.profile.liabilities || []).map((l) => ({ id: l.id, type: l.type, outstanding: l.outstanding, rate: l.rate, emi: l.emi })),
      emergency_runway_months: r2(s.emergencyMonths),
      asset_mix: Object.fromEntries(Object.entries(s.mixPct).map(([k, v]) => [k, r2(v)])),
      insurance: ctx.profile.insurance,
      health_score: { score: r.health.score, band: r.health.band, pillars: r.health.pillars.map((p) => ({ label: p.label, points: p.points, of: p.weight, value: p.value })) },
      goals: r.goals.goals.map(compactGoal),
      net_worth_projection_todays_money: r.projection ? { year: r.projection.final.year, pessimistic_p10: r.projection.final.p10, median: r.projection.final.p50, optimistic_p90: r.projection.final.p90 } : null,
    };
  },

  run_scenario(input, ctx) {
    const c = compare(ctx.profile, ctx.assumptions, toScenario(input), { sims: ctx.assumptions.simulations });
    return {
      levers_applied: input,
      summary: c.narrative,
      notes: c.notes,
      health_score: { before: c.baseline.health.score, after: c.scenario.health.score },
      goals: c.deltas.goals.map((g) => {
        const full = c.scenario.goals.goals.find((x) => x.id === g.id);
        return { id: g.id, name: g.name, before: g.before == null ? null : r2(g.before), after: r2(g.after), monthly_before: g.monthlyBefore, monthly_after: g.monthlyAfter, cost_at_goal_date: full.costFuture, earmarked_from_savings: full.earmarked };
      }),
      emergency_reserve_kept_aside: c.scenario.goals.reserve,
      net_worth_median_at_horizon: { year: c.scenario.projection.final.year, before: c.baseline.projection.final.p50, after: c.scenario.projection.final.p50 },
      chance_of_running_out: { before: r2(c.baseline.projection.probRanOut), after: r2(c.scenario.projection.probRanOut) },
      monthly_surplus: { before: c.baseline.summary.surplus, after: c.scenario.summary.surplus },
    };
  },

  check_goal(input, ctx) {
    const r = evaluate(ctx.profile, ctx.assumptions, {}, { sims: ctx.assumptions.simulations, skipProjection: true });
    const g = r.goals.goals.find((x) => x.id === input.goal_id) || r.goals.goals.find((x) => x.name.toLowerCase().includes(String(input.goal_id).toLowerCase()));
    if (!g) return { error: `No goal with id ${input.goal_id}. Known: ${r.goals.goals.map((x) => x.id).join(', ')}` };
    const tp = Math.min(0.95, Math.max(0.5, Number(input.target_probability) || 0.8));
    const fix = solveExtraForGoal(ctx.profile, ctx.assumptions, g.id, tp);
    return {
      ...compactGoal(g),
      inflation_used: g.inflationUsed,
      investment_mix_for_this_horizon: g.mix,
      expected_return: r2(g.expectedReturn),
      projected_value_at_date: g.projected,
      to_reach: { target_probability: tp, extra_monthly_needed: fix?.extra ?? 0, probability_with_extra: fix ? r2(fix.reached) : null, or_delay_years: fix?.delay?.years ?? null, probability_with_delay: fix?.delay ? r2(fix.delay.probability) : null },
    };
  },

  next_best_actions(input, ctx) {
    const list = nextBestActions(ctx.profile, ctx.assumptions, ctx.transactions);
    return list.slice(0, Math.min(6, input.limit || 4)).map((a) => ({ rank: a.rank, id: a.id, title: a.title, summary: a.summary, why: a.why, how: a.how, impact: a.impact, confidence: a.confidence, assumptions: a.assumptions }));
  },

  analyze_spending(_, ctx) {
    const sp = analyzeSpending(ctx.profile, ctx.transactions);
    return {
      months: sp.months,
      total_monthly_avg: sp.totalMonthly,
      top_categories: sp.categories.slice(0, 7).map((c) => ({ category: c.category, label: c.label, monthly_avg: c.monthlyAvg, recent_avg: c.recentAvg, change: r2(c.change), share_of_income: r2(c.share) })),
      flags: sp.flags.map((f) => f.text),
    };
  },

  search_guides(input) {
    const hits = search(input.query || '', 3);
    return hits.length ? hits.map((h) => ({ title: h.title, text: h.body })) : [{ title: 'No match', text: 'Nothing in the notes matches that. Answer from general principles and say so.' }];
  },

  get_assumptions(_, ctx) {
    return flattenAssumptions(ctx.assumptions);
  },
};

export async function runTool(name, input, ctx) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `unknown tool ${name}` };
  try {
    return fn(input || {}, ctx);
  } catch (err) {
    return { error: err.message };
  }
}

// one-liner for the trace UI
export function describeResult(name, out) {
  if (out?.error) return out.error;
  switch (name) {
    case 'get_snapshot':
      return `Health ${out.health_score.score}/100 · surplus ${inr(out.monthly.unplanned_surplus)}/mo · ${out.goals.length} goals`;
    case 'run_scenario':
      return out.summary[0] || 'No material change';
    case 'check_goal':
      return `${out.name}: ${Math.round(out.probability * 100)}% odds, needs +${inr(out.to_reach.extra_monthly_needed)}/mo for ${Math.round(out.to_reach.target_probability * 100)}%`;
    case 'next_best_actions':
      return out.map((a) => a.title).slice(0, 3).join(' · ');
    case 'analyze_spending':
      return `${inr(out.total_monthly_avg)}/mo across ${out.top_categories.length}+ categories, ${out.flags.length} flag(s)`;
    case 'search_guides':
      return out.map((h) => h.title).join(' · ');
    case 'get_assumptions':
      return `${out.length} assumptions`;
    default:
      return 'done';
  }
}
