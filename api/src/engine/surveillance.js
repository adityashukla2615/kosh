// Book surveillance: which of an adviser's households need attention, and why.
//
// The unit of work here is not "score a household" but "find the households a
// human should look at this week, and hand that human the reason". Two rules
// follow from that and shape everything below:
//
//   1. Every flag carries the numbers that produced it. A flag that says
//      "protection gap" is an opinion; one that says "₹50 L of cover against a
//      ₹3.8 Cr need, 2 dependents" is a finding the adviser can act on and
//      defend. Severity is computed from those numbers, never assigned.
//
//   2. Nothing here is a rule about products. These are gaps between a
//      household's position and its own stated goals and risk profile, measured
//      by simulation. What to do about a gap is the adviser's call.

import { evaluate } from './analysis.js';
import { summarize, TARGET_EQUITY } from './profile.js';

// Severity is 0-1 within a flag. Weight is how much that flag matters relative
// to the others when the book is ranked. Protection and liquidity outrank
// optimisation because their failure modes are not recoverable.
const FLAGS = {
  protection: { weight: 1.0, label: 'Protection gap' },
  liquidity: { weight: 0.9, label: 'Thin emergency cover' },
  costlyDebt: { weight: 0.95, label: 'High-cost debt' },
  essentialGoal: { weight: 0.85, label: 'Near-term goal at risk' },
  concentration: { weight: 0.6, label: 'Concentration' },
  suitabilityDrift: { weight: 0.65, label: 'Allocation off mandate' },
  healthCover: { weight: 0.7, label: 'Health cover gap' },
  stale: { weight: 0.45, label: 'Review overdue' },
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const cr = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;
const lakh = (n) => `₹${(n / 1e5).toFixed(1)} L`;
const money = (n) => (!n ? 'none' : Math.abs(n) >= 1e7 ? cr(n) : lakh(n));
const pct = (p) => `${Math.round(p * 100)}%`;

/**
 * Term cover a household plausibly needs: enough to clear debt and replace
 * income while dependents are still dependent. Deliberately a rule of thumb,
 * and labelled as one wherever it surfaces.
 */
function coverNeed(profile, s) {
  if (!profile.dependents) return 0;
  const years = Math.min(20, Math.max(8, 60 - profile.age));
  return Math.round(s.monthlyIncome * 12 * years * 0.6 + s.debts);
}

function protectionFlag(profile, s) {
  if (!profile.dependents) return null;
  const need = coverNeed(profile, s);
  const have = profile.insurance?.termCover || 0;
  const gap = need - have;
  // Most households are somewhat under-covered; that is a fact about the market,
  // not an alert. Flag only a gap large enough to change the outcome.
  if (gap <= need * 0.5) return null;

  return {
    code: 'protection',
    severity: clamp01(gap / Math.max(need, 1)),
    headline: `${money(gap)} of life cover missing`,
    detail: `${profile.dependents} ${profile.dependents === 1 ? 'dependent' : 'dependents'}, ${have ? `${money(have)} of term cover` : 'no term cover at all'} against roughly ${money(need)} of need.`,
    evidence: { dependents: profile.dependents, termCover: have, estimatedNeed: need, gap, monthlyIncome: s.monthlyIncome, debts: s.debts },
    basis: 'Income replacement for the years dependents remain dependent, plus outstanding debt. A rule of thumb, not an underwriting figure.',
  };
}

function healthCoverFlag(profile, s) {
  const cover = profile.insurance?.healthCover || 0;
  const employerOnly = !!profile.insurance?.employerHealthOnly;
  const floor = Math.max(500_000, s.monthlyIncome * 4);
  const shortfall = Math.max(0, floor - cover);
  // No cover at all, or employer-only cover that would leave them badly short.
  // Merely being under a comfortable floor is the norm and is reported as a
  // book-level finding instead.
  const exceptional = cover === 0 || (employerOnly && cover < floor * 0.6) || cover < floor * 0.4;
  if (!exceptional) return null;
  // Employer-only cover is its own risk: it ends with the job, which is exactly
  // when a household can least afford to replace it.
  const severity = cover === 0 ? 1 : clamp01((shortfall / floor) * 0.7 + (employerOnly ? 0.4 : 0));
  return {
    code: 'healthCover',
    severity,
    headline: cover === 0 ? 'No health cover recorded' : employerOnly ? 'Health cover is the employer’s' : `${money(shortfall)} below a sensible floor`,
    detail: employerOnly
      ? `${money(cover)} of cover, held through the employer - it ends the day the job does.`
      : `${money(cover)} of cover against a ${money(floor)} floor for this income.`,
    evidence: { healthCover: cover, floor, employerHealthOnly: employerOnly },
    basis: 'A single hospital admission is the most common cause of a household breaking its own plan.',
  };
}

function liquidityFlag(profile, s, a) {
  const months = s.emergencyMonths;
  // Under half the target is thin; under three months is the number that
  // actually breaks a household during a job search.
  if (months >= Math.min(3, a.emergencyMonths * 0.5)) return null;
  return {
    code: 'liquidity',
    severity: clamp01(1 - months / a.emergencyMonths),
    headline: `${months.toFixed(1)} months of cover`,
    detail: `${money(s.emergencyAssets)} reachable against ${money(s.monthlyNeed)} a month of needs. Target is ${a.emergencyMonths} months.`,
    evidence: { emergencyMonths: months, target: a.emergencyMonths, emergencyAssets: s.emergencyAssets, monthlyNeed: s.monthlyNeed },
    basis: 'Salaried job searches in India commonly run three to six months.',
  };
}

function costlyDebtFlag(profile, s) {
  const expensive = (profile.liabilities || []).filter((l) => l.rate >= 0.18 && l.outstanding > 0);
  if (!expensive.length) return null;
  const worst = expensive.reduce((m, l) => (l.rate * l.outstanding > m.rate * m.outstanding ? l : m));
  const annualInterest = expensive.reduce((sum, l) => sum + l.outstanding * l.rate, 0);

  return {
    code: 'costlyDebt',
    severity: clamp01(annualInterest / Math.max(s.monthlyIncome * 3, 1)),
    headline: `${pct(worst.rate)} on ${money(worst.outstanding)}`,
    detail: `${money(annualInterest)} a year in interest across ${expensive.length} ${expensive.length === 1 ? 'balance' : 'balances'}. No investment reliably beats that rate.`,
    evidence: { annualInterest, balances: expensive.map((l) => ({ type: l.type, outstanding: l.outstanding, rate: l.rate })) },
    basis: 'Paying down debt at this rate is a guaranteed return equal to the rate.',
  };
}

const ACTIONABLE_YEARS = 10;

function essentialGoalFlag(profile, goalPlan) {
  // Horizon decides whether a shortfall is an alert or a fact about the book.
  //
  // Retirement underfunding is true of most Indian households and true of most
  // of this book; surfacing it 170 times tells an adviser nothing they can act
  // on this week, and buries the households that need them. It is reported once,
  // as a structural finding, with its own number.
  //
  // A school fee due in three years is the opposite: specific, dated, and still
  // fixable if somebody moves now. Those are the alerts.
  const horizon = (g) => (g.year ? g.year - new Date().getFullYear() : ACTIONABLE_YEARS + 1);
  const essentials = goalPlan.goals.filter(
    (g) => g.priority === 'essential' && g.probability != null && g.type !== 'retirement' && horizon(g) <= ACTIONABLE_YEARS,
  );
  if (!essentials.length) return null;
  const worst = essentials.reduce((m, g) => (g.probability < m.probability ? g : m));
  if (worst.probability >= 0.55) return null;

  return {
    code: 'essentialGoal',
    severity: clamp01((0.55 - worst.probability) / 0.55),
    headline: `“${worst.name}” at ${pct(worst.probability)}`,
    detail: `Must-have goal, due ${worst.year}. ${pct(worst.probability)} chance of being funded in full and on time. Close enough to matter and still early enough to fix.`,
    evidence: { goalId: worst.id, goalName: worst.name, year: worst.year, yearsAway: horizon(worst), probability: worst.probability, priority: worst.priority, monthlyNeeded: worst.monthlyNeeded ?? null },
    basis: 'Probability of full funding by the goal date, from the same Monte Carlo the household’s own plan uses.',
  };
}

function concentrationFlag(profile, s) {
  const mix = s.mixPct || {};
  const entries = Object.entries(mix).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  const [topClass, topShare] = entries.reduce((m, e) => (e[1] > m[1] ? e : m));
  if (topShare < 0.72) return null;

  // Cash and FDs concentrated in a long-horizon household is a different problem
  // from equities concentrated in a short-horizon one, but both are one number.
  const isDefensive = topClass === 'cash' || topClass === 'debt';
  return {
    code: 'concentration',
    severity: clamp01((topShare - 0.6) / 0.4),
    headline: `${pct(topShare)} in ${topClass}`,
    detail: isDefensive
      ? `${pct(topShare)} of financial assets sit in ${topClass}. Safe in nominal terms, and losing to inflation over this household’s horizon.`
      : `${pct(topShare)} of financial assets sit in ${topClass}. A single bad year lands disproportionately here.`,
    evidence: { topClass, topShare, mix, financialAssets: s.financialAssets },
    basis: 'Share of financial assets by class, excluding property and EPF.',
  };
}

// EPF and PPF are statutory, locked and debt-like. An adviser cannot rebalance
// them and was never asked to, so counting them against a risk mandate reads
// "under-invested" for anyone with a long salaried career - a property of the
// payroll system, not of advice. Mandate drift is measured on the money the
// household can actually choose what to do with.
const LOCKED = new Set(['epf', 'ppf', 'realEstate']);
const EQUITY_WEIGHT = { equityFunds: 1, directStocks: 1, nps: 0.5 };

function discretionaryEquity(profile) {
  const assets = profile.assets || {};
  let investable = 0;
  let equity = 0;
  for (const [k, v] of Object.entries(assets)) {
    if (LOCKED.has(k) || !v) continue;
    investable += v;
    equity += v * (EQUITY_WEIGHT[k] || 0);
  }
  return investable > 0 ? { share: equity / investable, investable } : null;
}

function suitabilityDriftFlag(profile, s) {
  const target = TARGET_EQUITY[profile.riskProfile];
  if (target == null) return null;
  const d = discretionaryEquity(profile);
  // Too small a pot for the ratio to mean anything.
  if (!d || d.investable < 200_000) return null;
  const actual = d.share;
  const drift = actual - target;
  if (Math.abs(drift) < 0.28) return null;

  return {
    code: 'suitabilityDrift',
    severity: clamp01((Math.abs(drift) - 0.18) / 0.4),
    headline: `${pct(Math.abs(drift))} ${drift > 0 ? 'above' : 'below'} mandate`,
    detail: `Recorded as ${profile.riskProfile} (${pct(target)} equity); discretionary portfolio is ${pct(actual)} equity. ${
      drift > 0 ? 'Carrying more risk than the file says they agreed to.' : 'Carrying less risk than their own stated profile implies.'
    }`,
    evidence: { riskProfile: profile.riskProfile, targetEquity: target, actualEquity: actual, drift, investableAssets: d.investable, excludes: ['epf', 'ppf', 'realEstate'] },
    basis: 'Stated risk profile against the discretionary portfolio, excluding EPF, PPF and property - money the adviser can actually reallocate. A gap either way is a conversation the file should show happened.',
  };
}

function staleFlag(profile) {
  const days = profile.lastReviewedDaysAgo ?? 0;
  if (days < 365) return null;
  return {
    code: 'stale',
    severity: clamp01((days - 365) / 730),
    headline: `Last reviewed ${Math.round(days / 30)} months ago`,
    detail: `No recorded review in ${days} days.`,
    evidence: { lastReviewedDaysAgo: days },
    basis: 'Annual review cadence.',
  };
}

/**
 * Screen one household. `result` may be passed in when the caller has already
 * run the engine, so a drill-down does not re-simulate.
 */
export function screenHousehold(profile, a, result = null) {
  const r = result || evaluate(profile, a, {}, { skipProjection: true });
  const s = r.summary;

  const flags = [
    protectionFlag(profile, s),
    healthCoverFlag(profile, s),
    liquidityFlag(profile, s, a),
    costlyDebtFlag(profile, s),
    essentialGoalFlag(profile, r.goals),
    concentrationFlag(profile, s),
    suitabilityDriftFlag(profile, s),
    staleFlag(profile),
  ]
    .filter(Boolean)
    .map((f) => ({ ...f, label: FLAGS[f.code].label, weighted: f.severity * FLAGS[f.code].weight }))
    .sort((x, y) => y.weighted - x.weighted);

  // Ranking: the worst problem dominates, and the rest add with diminishing
  // weight. A household with one severe gap should outrank one with four mild
  // ones - averaging would bury exactly the households this is built to surface.
  const priority = flags.reduce((sum, f, i) => sum + f.weighted / (i + 1), 0);

  return {
    id: profile.id,
    name: profile.name,
    segment: profile.segment,
    segmentLabel: profile.segmentLabel,
    age: profile.age,
    city: profile.city,
    dependents: profile.dependents,
    riskProfile: profile.riskProfile,
    netWorth: s.netWorth,
    financialAssets: s.financialAssets,
    monthlyIncome: s.monthlyIncome,
    surplus: s.surplus,
    healthScore: r.health.score,
    healthBand: r.health.band,
    lastReviewedDaysAgo: profile.lastReviewedDaysAgo ?? null,
    goals: r.goals.goals.map((g) => ({ id: g.id, name: g.name, priority: g.priority, probability: g.probability, status: g.status })),
    flags,
    priority: Number(priority.toFixed(4)),
  };
}

/**
 * Things that are true of most of the book.
 *
 * Under-insurance and retirement underfunding are not events; they are the
 * state of the market this book was sold into. Raising them as 130 separate
 * alerts would bury the eleven households with a fire to put out this week,
 * which is the classic way a surveillance system becomes shelfware. They are
 * counted once, with their aggregate exposure, and belong in a quarterly
 * conversation rather than a queue.
 */
function structuralFindings(rows, a) {
  const n = rows.length;
  const share = (count) => count / n;
  const out = [];

  const retirementShort = rows.filter((r) => {
    const g = r.goals.find((x) => x.id === 'retire' || x.name.toLowerCase().startsWith('retire'));
    return g && g.probability != null && g.probability < 0.7;
  }).length;
  if (retirementShort) {
    out.push({
      code: 'retirementBase',
      headline: `${Math.round(share(retirementShort) * 100)}% of the book is below a 70% chance of funding retirement`,
      detail: `${retirementShort} of ${n} households, planning on the same assumptions the household sees. This is a book-wide funding level, not a list of emergencies - it moves with contribution rates, not with individual calls.`,
      households: retirementShort,
      share: share(retirementShort),
    });
  }

  const thinCover = rows.filter((r) => r.flags.some((f) => f.code === 'healthCover')).length;
  if (thinCover) {
    out.push({
      code: 'healthBase',
      headline: `${Math.round(share(thinCover) * 100)}% carry no health cover of their own`,
      detail: `${thinCover} of ${n} households hold nothing, or hold it only through an employer. Employer cover ends with the job - the moment a household is least able to replace it.`,
      households: thinCover,
      share: share(thinCover),
    });
  }

  const protectionRows = rows.flatMap((r) => r.flags.filter((f) => f.code === 'protection'));
  if (protectionRows.length) {
    const exposure = protectionRows.reduce((sum, f) => sum + f.evidence.gap, 0);
    out.push({
      code: 'protectionBase',
      headline: `${cr(exposure)} of uncovered life exposure across ${protectionRows.length} households`,
      detail: 'Estimated income replacement need less cover actually held, summed across every household with dependents. A rule of thumb, and the largest single number on this book.',
      households: protectionRows.length,
      share: share(protectionRows.length),
      exposure,
    });
  }

  return out;
}

/**
 * Screen a whole book. Returns the rows plus the aggregates an adviser is
 * actually asked about: how much is at risk, and where.
 *
 * `queueSize` is a deliberate constraint rather than a display limit. An adviser
 * can have a real conversation with roughly a dozen households in a week, so the
 * product's job is to choose those twelve and defend the choice - not to hand
 * over 206 red rows and call it coverage.
 */
export function screenBook(households, a, { onProgress, queueSize = 12 } = {}) {
  const started = Date.now();
  const rows = [];

  for (let i = 0; i < households.length; i++) {
    rows.push(screenHousehold(households[i], a));
    if (onProgress && (i % 20 === 0 || i === households.length - 1)) onProgress(i + 1, households.length);
  }

  rows.sort((x, y) => y.priority - x.priority);

  const aum = rows.reduce((sum, r) => sum + r.financialAssets, 0);
  const byFlag = {};
  for (const row of rows) {
    for (const f of row.flags) {
      byFlag[f.code] = byFlag[f.code] || { code: f.code, label: f.label, households: 0, exposure: 0 };
      byFlag[f.code].households++;
      // Exposure means different things per flag; only sum where it is meaningful.
      if (f.code === 'protection') byFlag[f.code].exposure += f.evidence.gap;
      if (f.code === 'costlyDebt') byFlag[f.code].exposure += f.evidence.annualInterest;
    }
  }

  const bySegment = {};
  for (const row of rows) {
    const key = row.segmentLabel;
    bySegment[key] = bySegment[key] || { segment: key, households: 0, assets: 0, needingAttention: 0 };
    bySegment[key].households++;
    bySegment[key].assets += row.financialAssets;
    if (row.flags.length) bySegment[key].needingAttention++;
  }

  const structural = structuralFindings(rows, a);

  return {
    rows,
    // This week's calls, and the reason it is these and not the next twelve.
    queue: rows.slice(0, queueSize).map((r, i) => ({ ...r, rank: i + 1 })),
    structural,
    generatedAt: new Date().toISOString(),
    computeMs: Date.now() - started,
    stats: {
      households: rows.length,
      assetsUnderAdvice: aum,
      medianNetWorth: rows.map((r) => r.netWorth).sort((x, y) => x - y)[Math.floor(rows.length / 2)],
      queueSize: Math.min(queueSize, rows.length),
      // The cut line, stated out loud: everyone above it is in the queue, and
      // the adviser can see how close the next household was.
      queueCutoff: rows[queueSize] ? rows[queueSize].priority : 0,
      flagged: rows.filter((r) => r.flags.length > 0).length,
      severe: rows.filter((r) => r.flags.some((f) => f.severity >= 0.6)).length,
      reviewsOverdue: rows.filter((r) => (r.lastReviewedDaysAgo ?? 0) >= 365).length,
      simulationsRun: rows.length * a.simulations,
      pathsPerHousehold: a.simulations,
    },
    byFlag: Object.values(byFlag).sort((x, y) => y.households - x.households),
    bySegment: Object.values(bySegment).sort((x, y) => y.assets - x.assets),
  };
}

export { FLAGS };
