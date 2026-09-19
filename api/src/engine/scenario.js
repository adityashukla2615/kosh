// A "scenario" is a set of levers applied on top of a profile.
// We never mutate the stored profile; we clone and adjust.

export const LEVERS = {
  extraMonthly: { label: 'Invest more every month', unit: '₹/month', min: 0, max: 100000, step: 500 },
  stepUpPct: { label: 'Raise SIP every year by', unit: '%/year', min: 0, max: 25, step: 1 },
  sweepSurplusPct: { label: 'Auto-invest idle surplus', unit: '%', min: 0, max: 100, step: 5 },
  incomeChangePct: { label: 'Income changes by', unit: '%', min: -50, max: 60, step: 1 },
  expenseChangePct: { label: 'Spending changes by', unit: '%', min: -40, max: 40, step: 1 },
  jobLossMonths: { label: 'Job loss (no income) for', unit: 'months', min: 0, max: 18, step: 1 },
  marketShockPct: { label: 'Market crash right now', unit: '% equity fall', min: 0, max: 60, step: 5 },
  moveIdleCash: { label: 'Move idle savings into investments', unit: '₹', min: 0, max: 5000000, step: 10000 },
  retireAgeDelta: { label: 'Retire later / earlier by', unit: 'years', min: -7, max: 7, step: 1 },
};

export const EMPTY_SCENARIO = {
  extraMonthly: 0,
  stepUpPct: 0,
  sweepSurplusPct: 0,
  incomeChangePct: 0,
  expenseChangePct: 0,
  jobLossMonths: 0,
  jobLossStartMonth: 3,
  marketShockPct: 0,
  moveIdleCash: 0,
  retireAgeDelta: 0,
  bigPurchase: null, // { label, amount, inYears }
  prepay: null, // { liabilityId, amount }
  trim: null, // { category, pct }
  goalDelays: {}, // { goalId: years }
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function normalizeScenario(input = {}) {
  const s = { ...EMPTY_SCENARIO, ...(input || {}) };
  for (const [k, spec] of Object.entries(LEVERS)) {
    s[k] = Math.min(spec.max, Math.max(spec.min, num(s[k])));
  }
  s.jobLossStartMonth = Math.max(0, Math.min(60, num(s.jobLossStartMonth, 3)));
  if (s.bigPurchase && !(num(s.bigPurchase.amount) > 0)) s.bigPurchase = null;
  if (s.prepay && !(num(s.prepay.amount) > 0)) s.prepay = null;
  if (s.trim && !(num(s.trim.pct) > 0)) s.trim = null;
  s.goalDelays = s.goalDelays && typeof s.goalDelays === 'object' ? s.goalDelays : {};
  return s;
}

export function isEmptyScenario(s) {
  const n = normalizeScenario(s);
  return (
    Object.keys(LEVERS).every((k) => !n[k]) &&
    !n.bigPurchase &&
    !n.prepay &&
    !n.trim &&
    !Object.values(n.goalDelays).some(Boolean)
  );
}

export function applyScenario(profile, rawScenario) {
  const s = normalizeScenario(rawScenario);
  const p = structuredClone(profile);
  const notes = [];

  if (s.incomeChangePct) {
    p.income.monthly = Math.round(p.income.monthly * (1 + s.incomeChangePct / 100));
    p.income.annualBonus = Math.round((p.income.annualBonus || 0) * (1 + s.incomeChangePct / 100));
  }
  if (s.expenseChangePct) {
    for (const k of Object.keys(p.expenses)) p.expenses[k] = Math.round(p.expenses[k] * (1 + s.expenseChangePct / 100));
  }
  if (s.trim && p.expenses[s.trim.category] != null) {
    const before = p.expenses[s.trim.category];
    p.expenses[s.trim.category] = Math.round(before * (1 - s.trim.pct / 100));
    notes.push(`Trimmed ${s.trim.category} from ₹${before} to ₹${p.expenses[s.trim.category]} a month.`);
  }

  if (s.prepay) {
    const loan = (p.liabilities || []).find((l) => l.id === s.prepay.liabilityId);
    if (loan) {
      const pay = Math.min(loan.outstanding, s.prepay.amount);
      loan.outstanding -= pay;
      // take it from the savings account first, then FDs
      let left = pay;
      for (const bucket of ['savingsAccount', 'liquidFunds', 'fixedDeposits', 'debtFunds']) {
        const take = Math.min(left, p.assets[bucket] || 0);
        p.assets[bucket] = (p.assets[bucket] || 0) - take;
        left -= take;
      }
      if (loan.outstanding <= 1) {
        const freed = loan.emi || 0;
        loan.outstanding = 0;
        loan.emi = 0;
        notes.push(freed ? `${loan.type} closed, which frees ₹${freed.toLocaleString('en-IN')} a month.` : `${loan.type} cleared.`);
      }
    }
  }

  if (s.moveIdleCash) {
    const amt = Math.min(s.moveIdleCash, p.assets.savingsAccount || 0);
    p.assets.savingsAccount -= amt;
    // split like a sensible first step: mostly a flexi-cap / index fund, some short debt
    p.assets.equityFunds = (p.assets.equityFunds || 0) + amt * 0.7;
    p.assets.debtFunds = (p.assets.debtFunds || 0) + amt * 0.3;
  }

  if (s.retireAgeDelta) {
    for (const g of p.goals) if (g.type === 'retirement') g.retireAge = (g.retireAge ?? 58) + s.retireAgeDelta;
  }
  for (const [gid, yrs] of Object.entries(s.goalDelays)) {
    const g = p.goals.find((x) => x.id === gid);
    if (g && yrs) {
      if (g.type === 'retirement') g.retireAge = (g.retireAge ?? 58) + Number(yrs);
      else if (g.year) g.year += Number(yrs);
      else g.inYears = (g.inYears ?? 5) + Number(yrs);
    }
  }

  // surplus sweep has to be computed after income/expense changes
  const income = p.income.monthly + (p.income.annualBonus || 0) / 12;
  const spend = Object.values(p.expenses).reduce((a, b) => a + b, 0);
  const emi = (p.liabilities || []).reduce((a, l) => a + (l.emi || 0), 0);
  const idle = income - spend - emi - (p.sip || 0) - s.extraMonthly;
  const swept = idle > 0 ? Math.round((idle * s.sweepSurplusPct) / 100) : 0;
  p.sip = Math.max(0, (p.sip || 0) + s.extraMonthly + swept);

  if (s.bigPurchase) {
    p.goals = [
      ...p.goals,
      {
        id: '__purchase',
        name: s.bigPurchase.label || 'Big purchase',
        type: 'purchase',
        target: Number(s.bigPurchase.amount),
        inYears: Math.max(0, Number(s.bigPurchase.inYears ?? 1)),
        priority: 'important',
        synthetic: true,
      },
    ];
  }

  const events = {
    stepUp: s.stepUpPct / 100,
    jobLoss: s.jobLossMonths ? { start: s.jobLossStartMonth, months: s.jobLossMonths } : null,
    marketShock: s.marketShockPct / 100,
    sweptMonthly: swept,
  };

  return { profile: p, events, scenario: s, notes };
}
