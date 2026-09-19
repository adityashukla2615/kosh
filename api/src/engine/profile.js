// Turns a raw profile into the handful of numbers everything else needs.

const CURRENT_YEAR = new Date().getFullYear();

// which bucket each holding counts towards
const ASSET_CLASS = {
  savingsAccount: { cash: 1 },
  liquidFunds: { cash: 1 },
  fixedDeposits: { debt: 1 },
  debtFunds: { debt: 1 },
  epf: { debt: 1 },
  ppf: { debt: 1 },
  nps: { equity: 0.5, debt: 0.5 },
  equityFunds: { equity: 1 },
  directStocks: { equity: 1 },
  gold: { gold: 1 },
};

export const ASSET_LABELS = {
  savingsAccount: 'Savings account',
  liquidFunds: 'Liquid funds',
  fixedDeposits: 'Fixed deposits',
  debtFunds: 'Debt funds',
  epf: 'EPF',
  ppf: 'PPF',
  nps: 'NPS',
  equityFunds: 'Equity mutual funds',
  directStocks: 'Stocks',
  gold: 'Gold',
  realEstate: 'Property',
};

// money you could reach within a week or so without a big penalty
const EMERGENCY_BUCKETS = ['savingsAccount', 'liquidFunds', 'fixedDeposits'];
const RETIREMENT_BUCKETS = ['epf', 'ppf', 'nps'];

export const TARGET_EQUITY = { conservative: 0.35, moderate: 0.6, aggressive: 0.8 };

const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);

export function goalYear(goal, profile) {
  if (goal.type === 'retirement') return CURRENT_YEAR + Math.max(1, (goal.retireAge ?? 58) - profile.age);
  if (goal.year) return goal.year;
  return CURRENT_YEAR + (goal.inYears ?? 5);
}

export function summarize(profile) {
  const assets = profile.assets || {};
  const monthlyIncome = profile.income.monthly + (profile.income.annualBonus || 0) / 12;
  const monthlyExpenses = sum(profile.expenses);
  const emi = (profile.liabilities || []).reduce((s, l) => s + (l.emi || 0), 0);
  const invested = profile.sip || 0;
  const epf = profile.epfMonthly || 0;
  const surplus = monthlyIncome - monthlyExpenses - emi - invested;
  const savingsRate = (monthlyIncome - monthlyExpenses - emi + epf) / (monthlyIncome + epf);

  const financialAssets = Object.entries(assets)
    .filter(([k]) => k !== 'realEstate')
    .reduce((s, [, v]) => s + (v || 0), 0);
  const debts = (profile.liabilities || []).reduce((s, l) => s + (l.outstanding || 0), 0);
  const netWorth = financialAssets + (assets.realEstate || 0) - debts;

  const emergencyAssets = EMERGENCY_BUCKETS.reduce((s, k) => s + (assets[k] || 0), 0);
  const monthlyNeed = monthlyExpenses + emi;
  const retirementAssets = RETIREMENT_BUCKETS.reduce((s, k) => s + (assets[k] || 0), 0);

  const mix = { equity: 0, debt: 0, gold: 0, cash: 0 };
  for (const [k, v] of Object.entries(assets)) {
    const cls = ASSET_CLASS[k];
    if (!cls) continue;
    for (const [c, w] of Object.entries(cls)) mix[c] += (v || 0) * w;
  }
  const mixTotal = sum(mix) || 1;
  const mixPct = Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, v / mixTotal]));

  return {
    monthlyIncome: Math.round(monthlyIncome),
    monthlyExpenses: Math.round(monthlyExpenses),
    emi: Math.round(emi),
    sip: invested,
    epfMonthly: epf,
    surplus: Math.round(surplus),
    savingsRate,
    financialAssets,
    debts,
    netWorth,
    emergencyAssets,
    emergencyMonths: monthlyNeed > 0 ? emergencyAssets / monthlyNeed : 0,
    monthlyNeed,
    retirementAssets,
    mix,
    mixPct,
    targetEquity: TARGET_EQUITY[profile.riskProfile] ?? 0.6,
  };
}

// Asset mix we'd use for money meant for a goal N years away.
// Short horizon money shouldn't be sitting in equity - that's the whole point.
export function mixForHorizon(riskProfile, years) {
  let eq = TARGET_EQUITY[riskProfile] ?? 0.6;
  if (years < 2) eq = 0;
  else if (years < 3) eq = Math.min(eq, 0.15);
  else if (years < 5) eq = Math.min(eq, 0.35);
  else if (years < 8) eq = Math.min(eq, 0.55);
  const gold = years < 3 ? 0 : 0.1;
  return { equity: eq, gold, debt: Math.max(0, 1 - eq - gold), cash: 0 };
}

// rough correlations, good enough for a planning tool
const CORR = {
  'equity|debt': 0.1,
  'equity|gold': -0.05,
  'debt|gold': 0.1,
};

export function blend(mix, assumptions) {
  const keys = Object.keys(mix).filter((k) => mix[k] > 0);
  let ret = 0;
  let variance = 0;
  for (const k of keys) ret += mix[k] * assumptions.returns[k];
  for (const a of keys) {
    for (const b of keys) {
      const rho = a === b ? 1 : CORR[`${a}|${b}`] ?? CORR[`${b}|${a}`] ?? 0;
      variance += mix[a] * mix[b] * assumptions.volatility[a] * assumptions.volatility[b] * rho;
    }
  }
  return { expected: ret, vol: Math.sqrt(Math.max(variance, 0)) };
}

export { CURRENT_YEAR };
