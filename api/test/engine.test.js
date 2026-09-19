import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from '../src/data/personas.js';
import { resolveAssumptions } from '../src/engine/assumptions.js';
import { evaluate, compare } from '../src/engine/analysis.js';
import { planGoals, requiredSip, solveExtraForGoal } from '../src/engine/goals.js';
import { nextBestActions } from '../src/engine/actions.js';
import { applyScenario } from '../src/engine/scenario.js';

const a = resolveAssumptions();
const quick = { sims: 300 };
const [ananya, sheikh, iyer] = PERSONAS;

test('simulation is deterministic for the same profile', () => {
  const r1 = planGoals(ananya, a, {}, quick);
  const r2 = planGoals(ananya, a, {}, quick);
  assert.deepEqual(r1.goals.map((g) => g.probability), r2.goals.map((g) => g.probability));
});

test('investing more never lowers any goal probability', () => {
  for (const p of PERSONAS) {
    const c = compare(p, a, { extraMonthly: 10000 }, { ...quick, skipProjection: true });
    for (const g of c.deltas.goals) assert.ok(g.delta >= -0.001, `${p.id}/${g.id} went down by ${g.delta}`);
  }
});

test('a market crash never raises goal probabilities', () => {
  const c = compare(sheikh, a, { marketShockPct: 40 }, { ...quick, skipProjection: true });
  for (const g of c.deltas.goals) assert.ok(g.delta <= 0.001);
});

test('requiredSip is zero when corpus already covers the target', () => {
  assert.equal(requiredSip(100000, 200000, 60, 0.07), 0);
  const sip = requiredSip(1000000, 0, 120, 0.1);
  assert.ok(sip > 4000 && sip < 6000, `got ${sip}`);
});

test('solver finds an amount that actually reaches the target', () => {
  const res = solveExtraForGoal(sheikh, a, 'college', 0.8);
  assert.ok(res.extra > 0);
  assert.ok(res.reached >= 0.8);
});

test('scenario does not mutate the stored profile', () => {
  const before = JSON.stringify(iyer);
  applyScenario(iyer, { incomeChangePct: 20, moveIdleCash: 100000, retireAgeDelta: 2, bigPurchase: { amount: 500000, inYears: 1 } });
  assert.equal(JSON.stringify(iyer), before);
});

test('health score stays within 0-100 and pillars add up', () => {
  for (const p of PERSONAS) {
    const r = evaluate(p, a, {}, { ...quick, skipProjection: true });
    const sum = r.health.pillars.reduce((s, x) => s + x.points, 0);
    assert.ok(r.health.score >= 0 && r.health.score <= 100);
    assert.ok(Math.abs(sum - r.health.score) <= 1);
  }
});

test('every next-best action explains itself', () => {
  for (const p of PERSONAS) {
    const acts = nextBestActions(p, a, []);
    assert.ok(acts.length >= 3, `${p.id} only got ${acts.length} actions`);
    for (const x of acts) {
      assert.ok(x.why.length && x.how.length, x.id);
      assert.ok(x.assumptions.length, `${x.id} has no assumptions`);
      assert.ok(['high', 'medium', 'low'].includes(x.confidence));
    }
  }
});

test('people with dependents and thin cover get a term-insurance action', () => {
  assert.ok(nextBestActions(sheikh, a, []).some((x) => x.id === 'term'));
  assert.ok(!nextBestActions(ananya, a, []).some((x) => x.id === 'term'));
});

test('moving FDs into equity helps a long-dated goal for an FD-heavy saver', () => {
  const acts = nextBestActions(iyer, a, []);
  const rb = acts.find((x) => x.id === 'rebalance');
  assert.ok(rb, 'rebalance suggested');
  assert.ok(rb.impact.metrics.length > 0, 'and it shows a measurable effect');
});

test('overriding assumptions changes the outcome in the expected direction', () => {
  const pessimistic = resolveAssumptions({ returns: { equity: 0.08 } });
  const base = planGoals(sheikh, a, {}, quick).goals.find((g) => g.id === 'retire');
  const worse = planGoals(sheikh, pessimistic, {}, quick).goals.find((g) => g.id === 'retire');
  assert.ok(worse.probability < base.probability);
});
