import { summarize, mixForHorizon, blend, goalYear, CURRENT_YEAR } from './profile.js';
import { mulberry32, normalSampler, hashString, percentile } from './rng.js';

// How the monthly budget is shared when it can't cover everything.
// Must-haves get the biggest slice, but a retirement 25 years out shouldn't
// starve a down payment that's due in 6.
const SHARE_WEIGHT = { essential: 1, important: 0.8, nice: 0.5 };

const monthlyRate = (annual) => Math.pow(1 + annual, 1 / 12) - 1;

export function goalCostToday(goal, profile, summary, a) {
  if (goal.type === 'retirement') {
    if (goal.target) return goal.target;
    // today's lifestyle minus things that stop by then: school fees, premiums, half the rent
    const e = profile.expenses;
    const spend = summary.monthlyExpenses - (e.rent || 0) * 0.5 - (e.education || 0) - (e.insurance || 0);
    return Math.round(spend * 12 * a.retirementLifestyle * a.retirementMultiple);
  }
  return goal.target;
}

// contribution at the start of each month, step-up every 12 months
export function sipFactor(months, i, stepUp = 0) {
  let f = 0;
  for (let k = 0; k < months; k++) f += Math.pow(1 + stepUp, Math.floor(k / 12)) * Math.pow(1 + i, months - k);
  return f;
}

// existing money grows at corpusReturn, new SIPs at sipReturn
export function requiredSip(target, corpus, months, corpusReturn, sipReturn = corpusReturn, stepUp = 0) {
  if (months <= 0) return Math.max(0, target - corpus);
  const gap = target - corpus * Math.pow(1 + corpusReturn, months / 12);
  if (gap <= 0) return 0;
  return gap / sipFactor(months, monthlyRate(sipReturn), stepUp);
}

// Annualised return in a mediocre market over `years` - roughly the z-th lower
// percentile of the compounded outcome. Planning on the *average* return gives a
// coin flip; planning on this gives decent odds.
export function prudentReturn(stats, years, z) {
  if (years <= 0) return 0;
  const mu = Math.log(1 + stats.expected) - (stats.vol * stats.vol) / 2;
  return Math.exp(mu - (z * stats.vol) / Math.sqrt(Math.max(years, 0.5))) - 1;
}

// Two money streams share the same market draws: what you already hold (at its
// real mix) and what you add each month (at the goal-horizon mix).
function simulateGoal({ corpus, corpusStats, sip, sipStats, months, stepUp, jobLoss, sims, seed, target }) {
  const rand = mulberry32(seed);
  const z = normalSampler(rand);
  const sc = corpusStats.vol / Math.sqrt(12);
  const mc = Math.log(1 + corpusStats.expected) / 12 - (sc * sc) / 2;
  const ss = sipStats.vol / Math.sqrt(12);
  const ms = Math.log(1 + sipStats.expected) / 12 - (ss * ss) / 2;
  const finals = new Float64Array(sims);
  let hits = 0;
  for (let p = 0; p < sims; p++) {
    let c = corpus;
    let s = 0;
    for (let m = 0; m < months; m++) {
      const paused = jobLoss && m >= jobLoss.start && m < jobLoss.start + jobLoss.months;
      if (!paused) s += sip * Math.pow(1 + stepUp, Math.floor(m / 12));
      const shock = z();
      c *= Math.exp(mc + sc * shock);
      s *= Math.exp(ms + ss * shock);
    }
    finals[p] = c + s;
    if (c + s >= target) hits++;
  }
  const sorted = Array.from(finals).sort((x, y) => x - y);
  return { probability: hits / sims, p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

export function statusFor(prob) {
  if (prob >= 0.8) return 'on-track';
  if (prob >= 0.55) return 'watch';
  return 'off-track';
}

const normalize = (h) => {
  const t = Object.values(h).reduce((s, v) => s + Math.max(0, v), 0);
  return t > 0 ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Math.max(0, v) / t])) : { equity: 0, debt: 1, gold: 0, cash: 0 };
};

// What the money you already have is actually sitting in, split into
// "free" money (goal-able) and retirement accounts.
function holdings(profile, reserve, shock) {
  const A = profile.assets;
  const free = {
    equity: ((A.equityFunds || 0) + (A.directStocks || 0)) * (1 - shock),
    debt: (A.fixedDeposits || 0) + (A.debtFunds || 0),
    gold: A.gold || 0,
    cash: (A.savingsAccount || 0) + (A.liquidFunds || 0),
  };
  // the emergency reserve comes out of cash first, then FDs
  let r = reserve;
  const fromCash = Math.min(free.cash, r);
  free.cash -= fromCash;
  r -= fromCash;
  free.debt -= Math.min(free.debt, r);
  const retire = {
    equity: (A.nps || 0) * 0.5 * (1 - shock),
    debt: (A.epf || 0) + (A.ppf || 0) + (A.nps || 0) * 0.5,
    gold: 0,
    cash: 0,
  };
  const sum = (h) => h.equity + h.debt + h.gold + h.cash;
  return { free, freeTotal: sum(free), retire, retireTotal: sum(retire) };
}

/**
 * Money-bucket planning (this is the order we explain to users):
 *  1. the emergency reserve is set aside - it is not goal money
 *  2. EPF/PPF/NPS belong to retirement only
 *  3. other savings are earmarked to the nearest goals first, enough for ~85% odds
 *  4. the monthly SIP is shared by need, must-haves weighted highest
 *  5. anything left + EPF contributions flow to retirement
 * Earmarked money keeps its *actual* mix (FDs stay FDs); new SIPs follow the
 * mix that suits the goal's horizon.
 */
export function planGoals(profile, a, events = {}, opts = {}) {
  const summary = summarize(profile);
  const stepUp = events.stepUp || 0;
  const shock = events.marketShock || 0;
  const sims = opts.sims ?? a.simulations;

  const reserve = Math.min(summary.emergencyAssets, a.emergencyMonths * summary.monthlyNeed);
  const H = holdings(profile, reserve, shock);
  const freeMix = normalize(H.free);
  const freeStats = blend(freeMix, a);
  let free = H.freeTotal;

  const goals = profile.goals.map((g) => {
    const year = goalYear(g, profile);
    const years = Math.max(0, year - CURRENT_YEAR);
    const months = Math.max(1, Math.round(years * 12));
    const infl = g.type === 'education' ? a.educationInflation : a.inflation;
    const today = goalCostToday(g, profile, summary, a);
    const future = today * Math.pow(1 + infl, years);
    const sipMix = mixForHorizon(profile.riskProfile, years);
    return { goal: g, year, years, months, infl, today, future, sipMix, sipStats: blend(sipMix, a), corpusMix: freeMix, corpusStats: freeStats, corpus: 0, sip: 0 };
  });

  // 3. earmark, nearest goal first
  for (const g of [...goals].filter((x) => x.goal.type !== 'retirement').sort((x, y) => x.years - y.years)) {
    const pv = g.future / Math.pow(1 + prudentReturn(g.corpusStats, g.years, 1.0), g.years);
    g.corpus = Math.min(free, pv);
    free -= g.corpus;
  }
  const retirement = goals.find((x) => x.goal.type === 'retirement');
  if (retirement) {
    const mixed = {};
    for (const k of ['equity', 'debt', 'gold', 'cash']) mixed[k] = H.retire[k] + freeMix[k] * free;
    retirement.corpus = H.retireTotal + free;
    retirement.corpusMix = normalize(mixed);
    retirement.corpusStats = blend(retirement.corpusMix, a);
    free = 0;
  }

  // 4. share the budget
  for (const g of goals) {
    g.need = requiredSip(g.future, g.corpus, g.months, prudentReturn(g.corpusStats, g.years, 1.0), prudentReturn(g.sipStats, g.years, 0.7), stepUp);
  }
  let budget = summary.sip;
  for (let pass = 0; pass < 6 && budget > 1; pass++) {
    const open = goals.filter((g) => g.need - g.sip > 1);
    if (!open.length) break;
    const weight = (g) => (g.need - g.sip) * SHARE_WEIGHT[g.goal.priority || 'important'];
    const tot = open.reduce((s, g) => s + weight(g), 0);
    let spent = 0;
    for (const g of open) {
      const give = Math.min((budget * weight(g)) / tot, g.need - g.sip);
      g.sip += give;
      spent += give;
    }
    budget -= spent;
  }
  // 5. leftovers + EPF
  if (retirement) retirement.sip += budget + summary.epfMonthly;

  const out = goals.map((g) => {
    const sim = simulateGoal({
      corpus: g.corpus,
      corpusStats: g.corpusStats,
      sip: g.sip,
      sipStats: g.sipStats,
      months: g.months,
      stepUp,
      jobLoss: events.jobLoss,
      sims,
      seed: hashString(`${profile.id}:${g.goal.id}`),
      target: g.future,
    });
    return {
      id: g.goal.id,
      name: g.goal.name,
      type: g.goal.type,
      priority: g.goal.priority || 'important',
      synthetic: !!g.goal.synthetic,
      year: g.year,
      years: g.years,
      costToday: Math.round(g.today),
      costFuture: Math.round(g.future),
      inflationUsed: g.infl,
      earmarked: Math.round(g.corpus),
      monthly: Math.round(g.sip),
      requiredMonthly: Math.round(g.need),
      gapMonthly: Math.max(0, Math.round(g.need - g.sip)),
      mix: g.sipMix,
      corpusMix: g.corpusMix,
      corpusReturn: g.corpusStats.expected,
      expectedReturn: g.sipStats.expected,
      volatility: g.sipStats.vol,
      _corpusStats: g.corpusStats,
      probability: sim.probability,
      projected: { p10: Math.round(sim.p10), p50: Math.round(sim.p50), p90: Math.round(sim.p90) },
      status: statusFor(sim.probability),
    };
  });

  return { goals: out, reserve: Math.round(reserve), unallocatedMonthly: retirement ? 0 : Math.round(budget), stepUp };
}

// Smallest extra monthly amount (on top of what the goal already gets) to reach a
// target probability. Bisection over the Monte Carlo - with common random numbers
// the curve is monotone, so this converges cleanly.
export function solveExtraForGoal(profile, a, goalId, targetProb = 0.8, events = {}) {
  const base = planGoals(profile, a, events, { sims: 400 });
  const g = base.goals.find((x) => x.id === goalId);
  if (!g) return null;
  if (g.probability >= targetProb) return { goalId, extra: 0, reached: g.probability, from: g.probability, delay: null };

  const seed = hashString(`${profile.id}:${g.id}`);
  const common = { corpus: g.earmarked, corpusStats: g._corpusStats, stepUp: events.stepUp || 0, sims: 400, seed };
  const run = (extra) => simulateGoal({ ...common, sip: g.monthly + extra, sipStats: { expected: g.expectedReturn, vol: g.volatility }, months: Math.max(1, Math.round(g.years * 12)), jobLoss: events.jobLoss, target: g.costFuture }).probability;

  let lo = 0;
  let hi = Math.max(1000, g.requiredMonthly * 2 + 5000);
  while (run(hi) < targetProb && hi < 5e6) hi *= 2;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2;
    if (run(mid) >= targetProb) hi = mid;
    else lo = mid;
  }
  const extra = Math.ceil(hi / 100) * 100;

  // the other lever: push the date out, same money
  let delay = null;
  for (let y = 1; y <= 10; y++) {
    const yrs = g.years + y;
    const cost = g.costToday * Math.pow(1 + g.inflationUsed, yrs);
    const p = simulateGoal({ ...common, sip: g.monthly, sipStats: blend(mixForHorizon(profile.riskProfile, yrs), a), months: Math.round(yrs * 12), jobLoss: null, target: cost }).probability;
    if (p >= targetProb) {
      delay = { years: y, probability: p };
      break;
    }
  }
  return { goalId, extra, reached: run(extra), from: g.probability, delay };
}
