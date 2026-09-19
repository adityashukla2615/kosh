import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_PROVIDER = 'offline';
const { createApp } = await import('../src/app.js');

let base;
let server;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
const fast = { assumptions: { simulations: 200 } };

test('health endpoint reports the advisor mode', async () => {
  const r = await (await fetch(`${base}/health`)).json();
  assert.equal(r.ok, true);
  assert.equal(r.llm.provider, 'offline');
});

test('overview returns the full dashboard payload', async () => {
  const r = await post('/profiles/iyer/overview', fast);
  assert.equal(r.status, 200);
  const j = await r.json();
  for (const k of ['summary', 'goals', 'health', 'projection', 'actions']) assert.ok(j[k], k);
  assert.ok(j.projection.series.length > 5);
});

test('unknown profile is a 404, not a crash', async () => {
  assert.equal((await post('/profiles/nobody/overview')).status, 404);
});

test('onboarding creates a usable profile', async () => {
  const r = await post('/profiles', {
    name: 'Test',
    age: 31,
    monthlyIncome: 90000,
    expenses: { rent: 18000, groceries: 8000, other: 12000 },
    sip: 8000,
    assets: { savingsAccount: 150000, equityFunds: 200000 },
    goals: [{ name: 'Car', type: 'purchase', target: 600000, year: new Date().getFullYear() + 3, priority: 'nice' }],
    riskAnswers: { horizon: 'long', drop20: 'hold', experience: 'some', incomeStability: 'stable', priority: 'growth' },
  });
  assert.equal(r.status, 201);
  const { profile } = await r.json();
  assert.equal(profile.riskProfile, 'aggressive');
  assert.ok(profile.goals.some((g) => g.type === 'retirement'), 'retirement auto-added');
  assert.equal((await post(`/profiles/${profile.id}/overview`, fast)).status, 200);
});

test('simulate returns baseline, scenario and a narrative', async () => {
  const j = await (await post('/profiles/sheikh/simulate', { ...fast, scenario: { stepUpPct: 10 } })).json();
  assert.ok(j.baseline && j.scenario && j.deltas);
  assert.ok(j.narrative.length > 0);
});

test('chat answers with a trace', async () => {
  const j = await (await post('/profiles/ananya/chat', { ...fast, message: 'What if I invest 10k more every month?' })).json();
  assert.equal(j.mode, 'offline');
  assert.ok(j.trace.length >= 3);
  assert.match(j.reply, /₹10,000/);
});

test('statement import replaces synthetic transactions', async () => {
  const csv = ['date,description,amount', ...Array.from({ length: 8 }, (_, i) => `2026-08-0${i + 1},Swiggy order ${i},-${400 + i * 10}`)].join('\n');
  const r = await fetch(`${base}/profiles/ananya/transactions/import`, { method: 'POST', headers: { 'content-type': 'text/csv' }, body: csv });
  assert.equal(r.status, 200);
  const sp = await (await post('/profiles/ananya/spending', fast)).json();
  assert.equal(sp.source, 'import');
  await fetch(`${base}/profiles/ananya/transactions/import`, { method: 'DELETE' });
});

test('monthly review runs every stage', async () => {
  const j = await (await post('/profiles/sheikh/review', fast)).json();
  assert.deepEqual(j.steps.map((s) => s.id), ['intake', 'spending', 'goals', 'stress', 'actions', 'compliance', 'writer', 'factcheck']);
  assert.ok(j.steps.every((s) => s.status !== 'error'));
  assert.ok(j.letter.length > 100);
  assert.equal(j.grounding.untraced.length, 0, j.grounding.untraced.join(', '));
});
