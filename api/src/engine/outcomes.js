// What following the plan is actually worth to this household.
//
// Everything else in Kosh answers "what should I do". This answers "and what
// does that get me" - in the two units a person actually feels: the odds of the
// things they said matter, and money.
//
// It is computed, not asserted. Every figure here is the difference between two
// full simulations of this household - the plan as it stands, and the plan with
// the top recommendations applied - run against the same simulated markets, so
// the difference is the change and not noise.

import { compare } from './analysis.js';
import { nextBestActions } from './actions.js';

const r2 = (x) => Math.round(x * 1000) / 1000;

/**
 * Apply the top `take` recommendations together and measure the result.
 *
 * Together, not one at a time: a household does not do the best thing and stop,
 * and the actions interact - clearing a 42% card frees the money that funds the
 * SIP step-up. Summing individual effects would overstate it.
 */
export function projectedOutcome(profile, a, transactions = [], { take = 3 } = {}) {
  const actions = nextBestActions(profile, a, transactions);
  const applicable = actions.filter((x) => x.scenario).slice(0, take);

  if (!applicable.length) {
    return { available: false, reason: 'No simulated action applies to this household.' };
  }

  // Merge the scenarios. Levers are additive where they stack (extra monthly,
  // step-up) and last-wins where they do not.
  const combined = applicable.reduce((acc, x) => {
    for (const [k, v] of Object.entries(x.scenario || {})) {
      if (typeof v === 'number' && typeof acc[k] === 'number') acc[k] += v;
      else acc[k] = v;
    }
    return acc;
  }, {});

  const c = compare(profile, a, combined, { sims: a.simulations });
  const base = c.baseline;
  const after = c.scenario;

  const goals = c.deltas.goals
    .filter((g) => g.before != null && g.after != null)
    .map((g) => ({ id: g.id, name: g.name, before: r2(g.before), after: r2(g.after), delta: r2(g.after - g.before) }))
    .sort((x, y) => y.delta - x.delta);

  const improved = goals.filter((g) => g.delta > 0.01);
  const wealthDelta = after.projection.final.p50 - base.projection.final.p50;

  // Interest saved is a certainty, not a projection, so it is reported
  // separately from anything simulated.
  const interestSaved = applicable
    .filter((x) => x.id.startsWith('debt-'))
    .reduce((sum, x) => {
      const l = (profile.liabilities || []).find((y) => `debt-${y.id}` === x.id);
      return sum + (l ? l.outstanding * l.rate : 0);
    }, 0);

  return {
    available: true,
    actionsApplied: applicable.map((x) => ({ id: x.id, title: x.title, effort: x.effort })),
    effortSummary: summariseEffort(applicable),
    goalsImproved: improved.length,
    goalsTotal: goals.length,
    goals,
    // The headline: the goal that moves most, because that is the one a person
    // will recognise as theirs.
    biggestMove: improved[0] || null,
    healthScore: { before: base.health.score, after: after.health.score, delta: after.health.score - base.health.score },
    medianWealth: {
      year: after.projection.final.year,
      before: Math.round(base.projection.final.p50),
      after: Math.round(after.projection.final.p50),
      delta: Math.round(wealthDelta),
    },
    riskOfRunningOut: { before: r2(base.projection.probRanOut), after: r2(after.projection.probRanOut) },
    interestSavedPerYear: Math.round(interestSaved),
    basis: {
      paths: a.simulations,
      method:
        'The plan as it stands and the plan with these actions applied, simulated against the same market paths. Actions are applied together because they interact - clearing expensive debt frees the money that funds the rest.',
    },
  };
}

function summariseEffort(actions) {
  // Most of what moves a plan is a handful of settings changed once. Worth
  // saying, because "what does it cost me to do this" is the first question.
  const minutes = actions.filter((x) => /min/.test(x.effort || '')).length;
  if (minutes === actions.length) return `${actions.length} settings to change, once.`;
  return `${actions.length} actions: ${actions.map((x) => x.effort).join(', ')}.`;
}
