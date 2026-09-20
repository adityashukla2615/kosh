// The suitability record: the file an adviser has to be able to produce when
// someone asks, two years later, why this recommendation was made to this
// household.
//
// Kosh already does the hard part. Every candidate action is applied to a copy
// of the household and the whole plan is re-simulated, so at the moment a
// recommendation is ranked the engine is holding exactly the thing a reviewer
// will later want: what was recommended, what else was considered, what each one
// was projected to do, and on what assumptions. Ordinarily that is thrown away
// and only the winner is shown. This keeps it.
//
// Two regimes ask for materially the same evidence:
//
//   SEBI (Investment Advisers) Regulations 2013, reg. 17 - an adviser must have
//   a reasonable basis for advice, considering the client's circumstances, and
//   must maintain records of that basis.
//
//   SEC Regulation Best Interest, the Care Obligation - a broker-dealer must
//   have a reasonable basis to believe the recommendation is in the client's
//   best interest, having considered reasonably available alternatives.
//
// "Considered reasonably available alternatives" is the clause that usually
// costs firms the most to evidence, because the alternatives were never written
// down. Here they are a by-product of how the recommendation was produced.
//
// This generates evidence. It does not certify compliance, and nothing in it is
// a substitute for a firm's own supervisory review.

import { createHash } from 'node:crypto';
import { evaluate } from './analysis.js';
import { nextBestActions } from './actions.js';
import { flattenAssumptions } from './assumptions.js';
import { BOOK_SEED } from '../data/book.js';

const ENGINE_VERSION = process.env.APP_VERSION || 'dev';

// Anything that would make this advice about a product rather than a position.
// The same list the monthly review's compliance stage uses.
const PRODUCT_WORDS = /\b(hdfc|icici|sbi|axis|kotak|nippon|parag parikh|mirae|quant|tata|lic|zerodha|groww|upstox|reliance|adani|infosys|tcs|bajaj)\b/i;

/** Stable digest of the record's substance, so alteration is detectable. */
function digest(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function metricLine(m) {
  return `${m.label}: ${m.before} → ${m.after}`;
}

/**
 * Why an alternative was not chosen. The engine ranks by simulated effect, so
 * the honest answer is almost always "it moved the plan less" - and saying so
 * with both numbers is worth more than a category label.
 */
function rejectionReason(candidate, chosen) {
  if (candidate.confidence === 'low' && chosen.confidence !== 'low') {
    return 'Lower confidence: the engine could not put a reliable number on the benefit for this household.';
  }
  const gap = chosen.score - candidate.score;
  if (gap <= 0) return 'Ranked close behind; either would be defensible and this one remains available.';
  return `Simulated to move this household's plan less than the recommendation (relative effect ${candidate.score} against ${chosen.score}).`;
}

/**
 * Build the record for one recommendation.
 *
 * `actionId` selects which of the ranked actions is being recorded; omitting it
 * records the top recommendation.
 */
export function buildSuitabilityRecord(profile, a, { actionId = null, adviser = null, transactions = [] } = {}) {
  const actions = nextBestActions(profile, a, transactions);
  if (!actions.length) return null;

  const chosen = (actionId && actions.find((x) => x.id === actionId)) || actions[0];
  const baseline = evaluate(profile, a, {}, { skipProjection: true });

  // Everything else the engine weighed. This is the Care Obligation evidence,
  // and it exists only because ranking simulated all of them.
  const alternatives = actions
    .filter((x) => x.id !== chosen.id)
    .map((x) => ({
      id: x.id,
      title: x.title,
      category: x.category,
      simulatedEffect: x.impact.headline,
      metrics: (x.impact.metrics || []).map(metricLine),
      relativeScore: x.score,
      confidence: x.confidence,
      notChosenBecause: rejectionReason(x, chosen),
    }));

  const client = {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    dependents: profile.dependents,
    statedRiskProfile: profile.riskProfile,
    city: profile.city,
    occupation: profile.occupation,
    monthlyIncome: baseline.summary.monthlyIncome,
    netWorth: baseline.summary.netWorth,
    // The circumstances the recommendation was actually conditioned on. A
    // reviewer needs to know the plan was built on these and not on a template.
    goals: baseline.goals.goals.map((g) => ({ name: g.name, priority: g.priority, year: g.year ?? null, probabilityBefore: g.probability })),
  };

  const basis = {
    method:
      'Each candidate was applied to a copy of this household and the entire plan re-simulated. Ranking is by measured effect on that household, not by category or product.',
    simulation: {
      paths: a.simulations,
      technique: 'Monte Carlo with common random numbers: the recommendation and the baseline are scored against the same simulated markets, so the difference is the change and not sampling noise.',
      seedPolicy: 'Deterministic per household, so this record reproduces exactly.',
      bookSeed: BOOK_SEED,
    },
    assumptions: flattenAssumptions(a).map((row) => ({ key: row.key, value: row.value, note: row.note })),
    assumptionsSource: a === undefined ? 'defaults' : 'as configured at the time of the recommendation, listed in full above',
  };

  // Checks that either pass or do not. Recording a failed check is more useful
  // than suppressing it, so the result is reported either way.
  const text = [chosen.title, chosen.summary, ...(chosen.why || []), ...(chosen.how || [])].join(' ');
  const checks = [
    {
      code: 'no-product-recommendation',
      requirement: 'Advice identifies a position to change, not a product, issuer or scheme to buy.',
      passed: !PRODUCT_WORDS.test(text),
    },
    {
      code: 'alternatives-considered',
      requirement: 'Reasonably available alternatives were evaluated and the basis for rejecting them recorded.',
      passed: alternatives.length > 0,
      detail: `${alternatives.length} alternatives simulated against this household.`,
    },
    {
      code: 'assumptions-disclosed',
      requirement: 'Every assumption the projection depends on is recorded with the record.',
      passed: basis.assumptions.length > 0,
      detail: `${basis.assumptions.length} assumptions captured.`,
    },
    {
      code: 'client-specific',
      requirement: "Recommendation is conditioned on this household's own goals, dependents and stated risk profile.",
      passed: client.goals.length > 0 && !!client.statedRiskProfile,
    },
    {
      code: 'caveats-recorded',
      requirement: 'Limits of the recommendation are stated alongside it.',
      passed: (chosen.assumptions || []).length > 0,
      detail: `${(chosen.assumptions || []).length} caveats recorded.`,
    },
  ];

  const conflicts = {
    // Worth stating plainly rather than leaving to inference: the ranking has
    // nothing to sell, so there is no conflict to disclose.
    statement:
      'No product, issuer or scheme is recommended, and no commission, revenue share or distribution arrangement influences the ranking. Candidates are ordered solely by simulated effect on this household.',
    compensationInfluence: 'none',
  };

  const record = {
    recordType: 'suitability-basis',
    version: 1,
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    adviser: adviser || null,
    client,
    recommendation: {
      id: chosen.id,
      rank: chosen.rank,
      category: chosen.category,
      title: chosen.title,
      summary: chosen.summary,
      rationale: chosen.why || [],
      implementation: chosen.how || [],
      caveats: chosen.assumptions || [],
      confidence: chosen.confidence,
      simulatedEffect: chosen.impact.headline,
      metrics: (chosen.impact.metrics || []).map(metricLine),
      relativeScore: chosen.score,
    },
    alternativesConsidered: alternatives,
    basis,
    checks,
    conflicts,
    limitations: [
      'Projections are probabilities from simulated markets, not forecasts. An 80% chance of funding a goal means one in five simulated futures did not fund it.',
      'Returns are modelled as normally distributed log-returns. Real markets have fatter tails than this model allows for.',
      'Insurance figures are rules of thumb by age band, not underwritten quotes.',
      'Tax is not computed; salary structure is not collected.',
      'This record evidences the basis for a recommendation. It is not a compliance certification and does not replace a firm’s supervisory review.',
    ],
    regulatoryContext: [
      { regime: 'SEBI (Investment Advisers) Regulations 2013', provision: 'Regulation 17 - reasonable basis for advice and record of that basis' },
      { regime: 'SEC Regulation Best Interest', provision: 'Care Obligation - reasonably available alternatives considered' },
    ],
  };

  return { ...record, integrity: { algorithm: 'sha256', digest: digest(record) } };
}

/** Recompute the digest over a record and report whether it still matches. */
export function verifyRecord(record) {
  if (!record?.integrity?.digest) return { valid: false, reason: 'No digest on record.' };
  const { integrity, ...rest } = record;
  const recomputed = digest(rest);
  return {
    valid: recomputed === integrity.digest,
    expected: integrity.digest,
    recomputed,
    reason: recomputed === integrity.digest ? 'Digest matches; the record is unaltered.' : 'Digest does not match; the record has been altered since it was generated.',
  };
}
