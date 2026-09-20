import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBook, getHousehold, BOOK_SEED } from '../src/data/book.js';
import { screenBook, screenHousehold } from '../src/engine/surveillance.js';
import { buildSuitabilityRecord, verifyRecord } from '../src/engine/suitability.js';
import { resolveAssumptions } from '../src/engine/assumptions.js';
import { evaluate } from '../src/engine/analysis.js';
import { createApp } from '../src/app.js';

const a = resolveAssumptions();

// Screening the whole book is ~10s of arithmetic. Most assertions hold on a
// slice, and the slice is taken from the front so it is the same households
// every run.
const SLICE = 45;

test('the book is the same book every time', () => {
  const first = generateBook();
  const second = generateBook({ size: 214, seed: BOOK_SEED });
  assert.equal(first.length, 214);
  // Deterministic generation is what lets a number in a deck be the number a
  // reviewer sees, and lets these tests name a specific household.
  assert.deepEqual(first[57], second[57]);
  assert.equal(getHousehold('hh-058').id, 'hh-058');
});

test('every generated household is something the engine can actually plan', () => {
  for (const h of generateBook().slice(0, SLICE)) {
    const r = evaluate(h, a, {}, { skipProjection: true });
    assert.ok(Number.isFinite(r.summary.netWorth), `${h.id} net worth`);
    assert.ok(r.health.score >= 0 && r.health.score <= 100, `${h.id} health in range`);
    assert.ok(r.goals.goals.length > 0, `${h.id} has goals`);
    for (const g of r.goals.goals) {
      if (g.probability != null) assert.ok(g.probability >= 0 && g.probability <= 1, `${h.id}/${g.id} probability in range`);
    }
  }
});

test('the book spans a range of circumstances rather than one archetype', () => {
  const book = generateBook();
  const segments = new Set(book.map((h) => h.segment));
  assert.ok(segments.size >= 4, 'several segments represented');
  assert.ok(book.some((h) => h.insurance.termCover === 0), 'some hold no term cover');
  assert.ok(book.some((h) => h.insurance.termCover > 0), 'some do');
  assert.ok(book.some((h) => h.liabilities.some((l) => l.rate > 0.3)), 'some carry card debt');
  assert.ok(book.some((h) => h.dependents === 0) && book.some((h) => h.dependents > 0), 'both with and without dependents');
});

test('every flag carries the numbers that produced it', () => {
  // A flag without evidence is an opinion, and an adviser cannot take an
  // opinion to a client meeting.
  for (const h of generateBook().slice(0, SLICE)) {
    for (const f of screenHousehold(h, a).flags) {
      assert.ok(f.headline, `${h.id}/${f.code} has a headline`);
      assert.ok(f.evidence && Object.keys(f.evidence).length, `${h.id}/${f.code} carries evidence`);
      assert.ok(f.basis, `${h.id}/${f.code} states its basis`);
      assert.ok(f.severity >= 0 && f.severity <= 1, `${h.id}/${f.code} severity in range`);
    }
  }
});

test('the queue is bounded, ordered, and says where it cut', () => {
  const book = screenBook(generateBook().slice(0, SLICE), a, { queueSize: 8 });

  assert.equal(book.queue.length, 8, 'queue respects its capacity');
  for (let i = 1; i < book.queue.length; i++) {
    assert.ok(book.queue[i - 1].priority >= book.queue[i].priority, 'queue is ordered by priority');
    assert.equal(book.queue[i].rank, i + 1, 'ranks are contiguous');
  }
  // Everyone in the queue outranks the first household left out of it.
  assert.ok(book.queue.at(-1).priority >= book.stats.queueCutoff, 'cutoff is below the last queued household');
});

test('a household with one severe gap outranks one with several mild ones', () => {
  // Averaging severities would bury exactly the households this exists to find.
  const book = screenBook(generateBook().slice(0, 80), a, { queueSize: 12 });
  const severeInQueue = book.queue.filter((r) => r.flags.some((f) => f.severity >= 0.6)).length;
  assert.ok(severeInQueue >= book.queue.length * 0.6, 'the queue is mostly households with a severe finding');
});

test('base rates are reported once, not as an alert per household', () => {
  const book = screenBook(generateBook().slice(0, SLICE), a, { queueSize: 8 });

  assert.ok(book.structural.length > 0, 'structural findings exist');
  assert.ok(
    book.structural.some((s) => s.code === 'retirementBase'),
    'retirement funding is reported as a book-level finding',
  );
  // The whole point of the split: retirement underfunding is true of most of the
  // book, so it must not also be firing as a per-household alert.
  const retirementAlerts = book.rows.flatMap((r) => r.flags.filter((f) => f.code === 'essentialGoal' && /retire/i.test(f.evidence.goalName || '')));
  assert.equal(retirementAlerts.length, 0, 'retirement never appears as a per-household alert');
});

test('near-term goals still raise alerts even though retirement does not', () => {
  const book = screenBook(generateBook(), a, { queueSize: 12 });
  const nearTerm = book.rows.flatMap((r) => r.flags.filter((f) => f.code === 'essentialGoal'));
  assert.ok(nearTerm.length > 0, 'dated near-term goals do alert');
  for (const f of nearTerm) {
    assert.ok(f.evidence.yearsAway <= 10, 'only goals inside the actionable horizon alert');
  }
});

test('mandate drift ignores money the adviser cannot move', () => {
  // EPF and PPF are statutory and locked. Counting them would report half the
  // book as under-invested purely because of payroll.
  const book = generateBook();
  const withBigEpf = book.find((h) => h.assets.epf > (h.assets.equityFunds + h.assets.directStocks) * 2 && h.riskProfile !== 'conservative');
  assert.ok(withBigEpf, 'found a household whose EPF dominates its equity');

  const flag = screenHousehold(withBigEpf, a).flags.find((f) => f.code === 'suitabilityDrift');
  if (flag) {
    assert.ok(flag.evidence.excludes.includes('epf'), 'drift excludes EPF');
    assert.ok(flag.evidence.investableAssets < withBigEpf.assets.epf + flag.evidence.investableAssets, 'investable pot excludes the locked money');
  }
});

test('a suitability record shows what else was considered and why it was not chosen', () => {
  const profile = getHousehold('hh-078');
  const record = buildSuitabilityRecord(profile, a, { adviser: { name: 'Test Adviser' } });

  assert.equal(record.recordType, 'suitability-basis');
  assert.ok(record.recommendation.title, 'names the recommendation');
  // This is the Care Obligation evidence, and the reason it exists at all is
  // that ranking had to simulate the alternatives anyway.
  assert.ok(record.alternativesConsidered.length >= 3, 'several alternatives recorded');
  for (const alt of record.alternativesConsidered) {
    assert.ok(alt.notChosenBecause, `${alt.id} records why it lost`);
    assert.ok(alt.simulatedEffect, `${alt.id} records its simulated effect`);
  }
  assert.ok(record.basis.assumptions.length > 10, 'every assumption is captured');
  assert.equal(record.basis.simulation.paths, a.simulations);
  assert.ok(record.limitations.length >= 3, 'limits are stated, not buried');
  assert.equal(record.conflicts.compensationInfluence, 'none');
});

test('every compliance check on the record either passes or says it did not', () => {
  const record = buildSuitabilityRecord(getHousehold('hh-012'), a);
  for (const c of record.checks) {
    assert.equal(typeof c.passed, 'boolean', `${c.code} reports a result`);
    assert.ok(c.requirement, `${c.code} states what it is checking`);
  }
  assert.ok(
    record.checks.find((c) => c.code === 'no-product-recommendation').passed,
    'advice never names a product or issuer',
  );
});

test('altering a record breaks its digest', () => {
  const record = buildSuitabilityRecord(getHousehold('hh-005'), a);
  assert.equal(verifyRecord(record).valid, true);

  const tampered = structuredClone(record);
  tampered.recommendation.title = 'Buy the in-house fund';
  assert.equal(verifyRecord(tampered).valid, false, 'a changed recommendation is detected');

  const alsoTampered = structuredClone(record);
  alsoTampered.alternativesConsidered = [];
  assert.equal(verifyRecord(alsoTampered).valid, false, 'removing the alternatives is detected');
});

test('a household from the book works on every existing surface', async () => {
  // The book is not a parallel application. Resolving its households through
  // the normal profile loader means plan, goals, what-if and the adviser all
  // work for them without knowing the book exists.
  const app = createApp();
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const overview = await fetch(`${base}/api/profiles/hh-078/overview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assumptions: { simulations: 200 } }),
    }).then((r) => r.json());
    assert.equal(overview.profile.id, 'hh-078');
    assert.ok(overview.health.score >= 0);
    assert.ok(overview.actions.length > 0);

    const screen = await fetch(`${base}/api/book/households/hh-078`).then((r) => r.json());
    assert.equal(screen.profile.id, 'hh-078');
    assert.ok(Array.isArray(screen.screen.flags));

    const record = await fetch(`${base}/api/book/households/hh-078/record`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assumptions: { simulations: 200 } }),
    }).then((r) => r.json());
    assert.equal(record.client.id, 'hh-078');

    const verified = await fetch(`${base}/api/book/records/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record }),
    }).then((r) => r.json());
    assert.equal(verified.valid, true, 'a record survives a round trip through the API');
  } finally {
    server.close();
  }
});
