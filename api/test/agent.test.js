import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from '../src/data/personas.js';
import { resolveAssumptions } from '../src/engine/assumptions.js';
import { generateTransactions, parseStatementCsv, categorize } from '../src/engine/spending.js';
import { groundingCheck, extractFigures } from '../src/agent/grounding.js';
import { parseAmount, offlineAdvisor } from '../src/agent/offline.js';
import { search } from '../src/agent/retrieval.js';
import { runTool } from '../src/agent/tools.js';

const ctxFor = (p) => ({ profile: p, assumptions: resolveAssumptions({ simulations: 300 }), transactions: generateTransactions(p) });

test('amount parser understands Indian units', () => {
  assert.equal(parseAmount('can I buy a car for 12 lakh next year'), 1200000);
  assert.equal(parseAmount('what if I save ₹5,000 more'), 5000);
  assert.equal(parseAmount('invest 5k extra'), 5000);
  assert.equal(parseAmount('a flat worth 1.2 cr in 2030'), 12000000);
  assert.equal(parseAmount('retire at 50'), null);
});

test('figure extraction handles rupees, lakh, crore and percent', () => {
  const f = extractFigures('You need ₹12.4 L by 2031, about 63% odds, or ₹1.2 Cr later and ₹45,000/month.');
  assert.deepEqual(f.map((x) => Math.round(x.value)), [1240000, 12000000, 45000, 63]);
});

test('grounding flags invented numbers and passes real ones', () => {
  const tools = [{ probability: 0.63, cost: 1238000 }];
  assert.equal(groundingCheck('About 63% odds for ₹12.4 L.', tools).untraced.length, 0);
  assert.deepEqual(groundingCheck('You will have ₹3.7 Cr.', tools).untraced, ['₹3.7 Cr']);
});

test('csv import reads a typical Indian bank export', () => {
  const csv = [
    'Txn Date,Narration,Debit,Credit',
    '01/08/2026,SALARY CREDIT NORTHWIND,,135000',
    '03/08/2026,UPI-SWIGGY-ORDER,640,',
    '05/08/2026,"AMAZON PAY, INDIA",2399,',
    '07/08/2026,ACH D- HOME LOAN EMI,45000,',
    '09/08/2026,NETFLIX.COM,649,',
  ].join('\n');
  const { rows, skipped } = parseStatementCsv(csv);
  assert.equal(rows.length, 5);
  assert.equal(skipped, 0);
  assert.equal(rows[0].category, 'income');
  assert.equal(rows[1].category, 'foodDelivery');
  assert.equal(rows[1].amount, -640);
  assert.equal(rows[3].category, 'loan');
  assert.equal(rows[0].date, '2026-08-01');
  assert.equal(categorize('BESCOM electricity bill'), 'utilities');
});

test('retrieval finds the right note', () => {
  assert.equal(search('do I need term insurance with kids')[0].id, 'term-insurance');
  assert.equal(search('how much emergency fund in liquid fund')[0].id, 'emergency-fund');
  assert.equal(search('old vs new tax regime 80c')[0].id, 'tax-regimes');
});

test('tools return errors instead of throwing', async () => {
  assert.ok((await runTool('check_goal', { goal_id: 'nope' }, ctxFor(PERSONAS[0]))).error);
  assert.ok((await runTool('does_not_exist', {}, ctxFor(PERSONAS[0]))).error);
});

test('offline advisor runs a multi-step plan and every figure is traced', async () => {
  const cases = [
    ['Can I afford a car of 10 lakh next year?', 'run_scenario'],
    ['What if I lose my job for 6 months?', 'run_scenario'],
    ['Am I on track for the college fund?', 'check_goal'],
    ['What should I do first?', 'next_best_actions'],
    ['Where is my money going?', 'analyze_spending'],
    ['Do I need term insurance?', 'search_guides'],
  ];
  for (const [q, expectTool] of cases) {
    const res = await offlineAdvisor({ ctx: ctxFor(PERSONAS[1]), message: q });
    const tools = res.trace.filter((t) => t.kind === 'tool').map((t) => t.name);
    assert.ok(tools.length >= 2, `${q}: only ${tools.length} tool calls`);
    assert.ok(tools.includes(expectTool), `${q}: expected ${expectTool}, got ${tools}`);
    assert.equal(res.grounding.untraced.length, 0, `${q}: untraced ${res.grounding.untraced}`);
    assert.ok(res.reply.length > 40);
  }
});

test('rupee formatting keeps significant zeros', async () => {
  const { inr } = await import('../src/engine/format.js');
  assert.deepEqual([1000000, 1240000, 12000000, 45000].map(inr), ['₹10 L', '₹12.4 L', '₹1.2 Cr', '₹45,000']);
});
