import { inr as fmt } from './format.js';
import { summarize } from './profile.js';
import { planGoals } from './goals.js';
import { healthScore } from './health.js';
import { projectHousehold } from './projection.js';
import { applyScenario, isEmptyScenario } from './scenario.js';

const pct = (p) => `${Math.round(p * 100)}%`;

export function evaluate(profile, a, scenario = {}, opts = {}) {
  const { profile: p, events, notes, scenario: s } = applyScenario(profile, scenario);
  const summary = summarize(p);
  const goals = planGoals(p, a, events, opts);
  const health = healthScore(p, a, goals);
  const projection = opts.skipProjection ? null : projectHousehold(p, a, events, opts);
  return { profile: p, scenario: s, events, notes, summary, goals, health, projection };
}

export function compare(profile, a, scenario, opts = {}) {
  const base = evaluate(profile, a, {}, opts);
  const alt = isEmptyScenario(scenario) ? base : evaluate(profile, a, scenario, opts);

  const goalDeltas = alt.goals.goals.map((g) => {
    const b = base.goals.goals.find((x) => x.id === g.id);
    return {
      id: g.id,
      name: g.name,
      priority: g.priority,
      before: b ? b.probability : null,
      after: g.probability,
      delta: b ? g.probability - b.probability : null,
      monthlyBefore: b?.monthly ?? 0,
      monthlyAfter: g.monthly,
      synthetic: g.synthetic,
    };
  });

  const nwBefore = base.projection?.final?.p50 ?? 0;
  const nwAfter = alt.projection?.final?.p50 ?? 0;

  return {
    baseline: slim(base),
    scenario: slim(alt),
    deltas: {
      healthScore: alt.health.score - base.health.score,
      netWorthAtHorizon: nwAfter - nwBefore,
      emergencyMonths: alt.summary.emergencyMonths - base.summary.emergencyMonths,
      monthlySurplus: alt.summary.surplus - base.summary.surplus,
      goals: goalDeltas,
    },
    narrative: narrate(base, alt, goalDeltas),
    notes: alt.notes,
  };
}

function slim(r) {
  return { summary: r.summary, goals: r.goals, health: r.health, projection: r.projection, events: r.events };
}

// Plain-English summary of what changed. Deterministic on purpose - the LLM can
// rephrase it, but the facts come from here.
export function narrate(base, alt, goalDeltas) {
  const lines = [];
  const moved = goalDeltas.filter((g) => g.delta != null && Math.abs(g.delta) >= 0.03).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  for (const g of moved.slice(0, 3)) {
    const dir = g.delta > 0 ? 'rises' : 'drops';
    lines.push(`Chance of "${g.name}" ${dir} from ${pct(g.before)} to ${pct(g.after)}.`);
  }
  const added = goalDeltas.filter((g) => g.synthetic);
  for (const g of added) lines.push(`"${g.name}" itself has a ${pct(g.after)} chance of being fully paid from savings on time.`);
  if (!moved.length && !added.length) lines.push('Your goal odds barely move with this change.');

  if (base.projection && alt.projection) {
    const d = alt.projection.final.p50 - base.projection.final.p50;
    if (Math.abs(d) > 50000) {
      lines.push(`In the middle-of-the-road case, net worth in ${alt.projection.final.year} ends ${d > 0 ? 'higher' : 'lower'} by ${fmt(Math.abs(d))} (today's money).`);
    }
    if (alt.projection.probRanOut > base.projection.probRanOut + 0.02) {
      lines.push(`Careful: in ${pct(alt.projection.probRanOut)} of simulated futures you run out of money at some point.`);
    }
  }
  const hd = alt.health.score - base.health.score;
  if (hd) lines.push(`Health score ${hd > 0 ? 'goes up' : 'goes down'} by ${Math.abs(hd)} points (${base.health.score} → ${alt.health.score}).`);
  return lines;
}

export { fmt as formatINR, pct as formatPct };
