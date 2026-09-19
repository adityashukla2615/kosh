import express from 'express';
import cors from 'cors';
import { personaList } from './data/personas.js';
import { resolveAssumptions, flattenAssumptions, DEFAULT_ASSUMPTIONS } from './engine/assumptions.js';
import { evaluate, compare } from './engine/analysis.js';
import { solveExtraForGoal } from './engine/goals.js';
import { nextBestActions } from './engine/actions.js';
import { analyzeSpending, parseStatementCsv, CATEGORY_LABELS } from './engine/spending.js';
import { LEVERS } from './engine/scenario.js';
import { ASSET_LABELS } from './engine/profile.js';
import { runAdvisor } from './agent/advisor.js';
import { runReview } from './agent/review.js';
import { llmInfo } from './agent/llm.js';
import { getStore } from './store/index.js';
import { loadProfile, createProfile, loadTransactions, saveImportedTransactions, clearImportedTransactions } from './services/profiles.js';

export function createApp() {
  const app = express();
  app.use(cors());
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
