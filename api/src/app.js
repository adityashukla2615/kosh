import express from 'express';
import cors from 'cors';
import { personaList } from './data/personas.js';
import { resolveAssumptions, flattenAssumptions, DEFAULT_ASSUMPTIONS } from './engine/assumptions.js';
import { evaluate, compare } from './engine/analysis.js';
import { solveExtraForGoal } from './engine/goals.js';
import { nextBestActions } from './engine/actions.js';
import { projectedOutcome } from './engine/outcomes.js';
import { analyzeSpending, parseStatementCsv, CATEGORY_LABELS } from './engine/spending.js';
import { LEVERS } from './engine/scenario.js';
import { ASSET_LABELS } from './engine/profile.js';
import { runAdvisor } from './agent/advisor.js';
import { runReview } from './agent/review.js';
import { llmInfo } from './agent/llm.js';
import { getStore } from './store/index.js';
import { getScreenedBook, bookStatus, warmBook } from './services/book.js';
import { screenHousehold } from './engine/surveillance.js';
import { buildSuitabilityRecord, verifyRecord } from './engine/suitability.js';
import { loadProfile, createProfile, loadTransactions, saveImportedTransactions, clearImportedTransactions } from './services/profiles.js';

// Whose book this is. Synthetic, like everything else here.
const ADVISER = { name: 'Priya Menon', firm: 'Meridian Wealth Partners', licence: 'INA000009999 (illustrative)' };

export function createApp() {
  const app = express();
  // The container serves the app and the API from one origin, so CORS is not
  // needed there. The GitHub Pages build is a genuine cross-origin caller, so
  // the allowed origins are named rather than left open: a public API that
  // reflects any origin is a habit worth not getting into, even on a demo.
  const ALLOWED_ORIGINS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https:\/\/[a-z0-9-]+\.github\.io$/i, // the GitHub Pages build
    /^https:\/\/[a-z0-9-]+\.onrender\.com$/i,
    /^https:\/\/[a-z0-9-]+\.hf\.space$/i,
  ];

  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin requests, curl and server-to-server calls send no Origin.
        if (!origin) return cb(null, true);
        cb(null, ALLOWED_ORIGINS.some((re) => re.test(origin)));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // loads profile + assumptions + transactions for any /profiles/:id route
  const withCtx = wrap(async (req, res, next) => {
    const profile = await loadProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'profile not found' });
    const assumptions = resolveAssumptions(req.body?.assumptions);
    const transactions = await loadTransactions(profile);
    req.ctx = { profile, assumptions, transactions };
    next();
  });

  // ---- the adviser's book -------------------------------------------------
  // Screening is deterministic and cached per assumption set, so these read as
  // fast lookups after the first call. Assumptions arrive as a query string here
  // rather than a body because these are GETs that clients will want to cache.

  const bookAssumptions = (req) => resolveAssumptions(req.query?.assumptions ? JSON.parse(req.query.assumptions) : undefined);

  app.get('/api/book', wrap(async (req, res) => {
    const a = bookAssumptions(req);
    const book = await getScreenedBook(a, { queueSize: Number(req.query.queue) || 12 });
    // The full 214 rows are only sent when asked for; the queue and the
    // aggregates are what the landing view actually needs.
    const full = req.query.full === '1';
    res.json({
      queue: book.queue,
      structural: book.structural,
      stats: book.stats,
      byFlag: book.byFlag,
      bySegment: book.bySegment,
      generatedAt: book.generatedAt,
      computeMs: book.computeMs,
      rows: full ? book.rows : undefined,
      precomputed: !!book.precomputed,
      assumptions: flattenAssumptions(a),
    });
  }));

  app.get('/api/book/status', wrap(async (req, res) => {
    res.json(bookStatus(bookAssumptions(req)));
  }));

  app.get('/api/book/households/:id', withCtx, wrap(async (req, res) => {
    const { profile, assumptions } = req.ctx;
    res.json({ profile, screen: screenHousehold(profile, assumptions) });
  }));

  // The suitability record for a recommendation: what was advised, what else was
  // simulated, on what assumptions, and a digest so alteration is detectable.
  app.post('/api/book/households/:id/record', withCtx, wrap(async (req, res) => {
    const { profile, assumptions, transactions } = req.ctx;
    const record = buildSuitabilityRecord(profile, assumptions, {
      actionId: req.query.action || null,
      transactions,
      adviser: ADVISER,
    });
    if (!record) return res.status(404).json({ error: 'no recommendation to record for this household' });
    res.json(record);
  }));

  // Hand back a record and it will say whether the digest still matches. A
  // reviewer should not have to take the system's word for its own output.
  app.post('/api/book/records/verify', wrap(async (req, res) => {
    res.json(verifyRecord(req.body?.record || req.body));
  }));

  app.get('/api/health', wrap(async (_req, res) => {
    const store = await getStore();
    res.json({ ok: true, llm: llmInfo(), store: store.kind, version: process.env.APP_VERSION || 'dev' });
  }));

  app.get('/api/meta', (_req, res) => {
    res.json({
      personas: personaList(),
      assumptions: { defaults: DEFAULT_ASSUMPTIONS, rows: flattenAssumptions(DEFAULT_ASSUMPTIONS) },
      levers: LEVERS,
      categories: CATEGORY_LABELS,
      assetLabels: ASSET_LABELS,
      llm: llmInfo(),
      adviser: ADVISER,
    });
  });

  app.post('/api/profiles', wrap(async (req, res) => {
    if (!req.body?.monthlyIncome) return res.status(400).json({ error: 'monthlyIncome is required' });
    const profile = await createProfile(req.body);
    res.status(201).json({ profile });
  }));

  app.get('/api/profiles/:id', withCtx, (req, res) => res.json({ profile: req.ctx.profile }));

  // everything the dashboard needs in one round trip
  app.post('/api/profiles/:id/overview', withCtx, (req, res) => {
    const { profile, assumptions, transactions } = req.ctx;
    const r = evaluate(profile, assumptions);
    const actions = nextBestActions(profile, assumptions, transactions);
    res.json({ profile, summary: r.summary, goals: r.goals, health: r.health, projection: r.projection, actions: actions.slice(0, 3), actionCount: actions.length });
  });

  app.post('/api/profiles/:id/simulate', withCtx, (req, res) => {
    const { profile, assumptions } = req.ctx;
    res.json(compare(profile, assumptions, req.body?.scenario || {}));
  });

  app.post('/api/profiles/:id/goals/:goalId/solve', withCtx, (req, res) => {
    const { profile, assumptions } = req.ctx;
    const out = solveExtraForGoal(profile, assumptions, req.params.goalId, Number(req.body?.targetProbability) || 0.8);
    if (!out) return res.status(404).json({ error: 'goal not found' });
    res.json(out);
  });

  app.post('/api/profiles/:id/actions', withCtx, (req, res) => {
    const { profile, assumptions, transactions } = req.ctx;
    res.json({ actions: nextBestActions(profile, assumptions, transactions) });
  });

  // What following the plan is worth. Its own route rather than part of the
  // overview, because it costs a full action ranking plus a comparison and the
  // dashboard should not wait for it.
  app.post('/api/profiles/:id/outcome', withCtx, (req, res) => {
    const { profile, assumptions, transactions } = req.ctx;
    res.json(projectedOutcome(profile, assumptions, transactions));
  });

  app.post('/api/profiles/:id/spending', withCtx, (req, res) => {
    const { profile, transactions } = req.ctx;
    res.json({ ...analyzeSpending(profile, transactions), recent: transactions.slice(-40).reverse(), source: transactions.some((t) => t.source === 'import') ? 'import' : 'synthetic' });
  });

  app.post('/api/profiles/:id/transactions/import', withCtx, wrap(async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    const { rows, skipped } = parseStatementCsv(text);
    if (rows.length < 5) return res.status(400).json({ error: `Could only read ${rows.length} rows. Expected columns: date, description, amount (or debit/credit).`, skipped });
    await saveImportedTransactions(req.params.id, rows);
    const byCat = {};
    for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
    res.json({ imported: rows.length, skipped, byCategory: byCat });
  }));

  app.delete('/api/profiles/:id/transactions/import', wrap(async (req, res) => {
    await clearImportedTransactions(req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/profiles/:id/chat', withCtx, wrap(async (req, res) => {
    const message = String(req.body?.message || '').slice(0, 1500).trim();
    if (!message) return res.status(400).json({ error: 'empty message' });
    const out = await runAdvisor({ ctx: req.ctx, message, history: req.body?.history || [] });
    res.json(out);
  }));

  app.post('/api/profiles/:id/review', withCtx, wrap(async (req, res) => {
    res.json(await runReview(req.ctx));
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // single-container mode (Docker): serve the built React app from the same origin
  if (process.env.STATIC_DIR) {
    app.use(express.static(process.env.STATIC_DIR, { maxAge: '1h', index: 'index.html' }));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: process.env.STATIC_DIR }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side.', detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  });

  return app;
}
