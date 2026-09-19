// Synthetic households. Every name, employer and number here is made up.
// They're built to be *different* on purpose so each one shows off a different part of the engine:
//   Ananya  - young, high surplus, money idle in savings, credit-card habit
//   Sheikhs - family with a home loan, thin emergency fund, under-insured
//   Iyer    - pre-retiree, FD-heavy, inflation is quietly eating his plan

const Y = new Date().getFullYear();

export const PERSONAS = [
  {
    id: 'ananya',
    name: 'Ananya Rao',
    tagline: 'Product designer, 27, Pune. Earns well, not sure where it goes.',
    age: 27,
    city: 'Pune',
    occupation: 'Product designer',
    employer: 'Northwind Labs',
    household: 'Single, shares a flat',
    dependents: 0,
    riskProfile: 'moderate',
    riskAnswers: { horizon: 'long', drop20: 'hold', experience: 'some', incomeStability: 'stable', priority: 'balance' },
    income: { monthly: 135000, annualBonus: 150000 },
    expenses: {
      rent: 22000,
      groceries: 7500,
      foodDelivery: 12500,
      transport: 4500,
      utilities: 3200,
      shopping: 9000,
      entertainment: 3800,
      travel: 5000,
      health: 1500,
      family: 10000,
      other: 3000,
    },
    spendingTrends: { foodDelivery: 0.35, shopping: 0.2 },
    sip: 22000,
    epfMonthly: 7800,
    assets: {
      savingsAccount: 740000,
      liquidFunds: 0,
      fixedDeposits: 0,
      debtFunds: 0,
      equityFunds: 310000,
      directStocks: 45000,
      epf: 260000,
      ppf: 0,
      nps: 0,
      gold: 30000,
      realEstate: 0,
    },
    liabilities: [{ id: 'cc', type: 'Credit card balance', outstanding: 38000, rate: 0.42, emi: 0 }],
    insurance: { termCover: 0, healthCover: 300000, employerHealthOnly: true },
    goals: [
      { id: 'europe', name: 'Europe trip with college friends', type: 'travel', target: 350000, year: Y + 2, priority: 'nice' },
      { id: 'home', name: 'Down payment for a flat in Pune', type: 'home', target: 2000000, year: Y + 8, priority: 'important' },
      { id: 'retire', name: 'Financial independence by 58', type: 'retirement', retireAge: 58, priority: 'essential' },
    ],
  },
  {
    id: 'sheikh',
    name: 'Farhan & Zoya Sheikh',
    tagline: 'Two incomes, one kid, a home loan in Bengaluru. Stretched but steady.',
    age: 36,
    city: 'Bengaluru',
    occupation: 'Engineering manager & chartered accountant',
    employer: 'Contoso Systems / Kapoor & Associates',
    household: 'Married, son Aarav (5)',
    dependents: 2,
    riskProfile: 'moderate',
    riskAnswers: { horizon: 'long', drop20: 'hold', experience: 'some', incomeStability: 'stable', priority: 'balance' },
    income: { monthly: 260000, annualBonus: 200000 },
    expenses: {
      groceries: 16000,
      foodDelivery: 9000,
      transport: 9000,
      utilities: 6500,
      shopping: 13000,
      entertainment: 3500,
      travel: 10000,
      health: 4000,
      education: 14000,
      household: 12000,
      family: 15000,
      insurance: 3500,
      other: 5000,
    },
    spendingTrends: { shopping: 0.25, travel: 0.15 },
    sip: 50000,
    epfMonthly: 18000,
    assets: {
      savingsAccount: 240000,
      liquidFunds: 0,
      fixedDeposits: 300000,
      debtFunds: 0,
      equityFunds: 1450000,
      directStocks: 180000,
      epf: 2900000,
      ppf: 650000,
      nps: 600000,
      gold: 350000,
      realEstate: 8500000,
    },
    liabilities: [
      { id: 'home', type: 'Home loan', outstanding: 4800000, rate: 0.086, emi: 45000 },
      { id: 'car', type: 'Car loan', outstanding: 320000, rate: 0.095, emi: 16500 },
    ],
    insurance: { termCover: 5000000, healthCover: 500000, employerHealthOnly: true },
    goals: [
      { id: 'college', name: "Aarav's college fund", type: 'education', target: 2500000, year: Y + 13, priority: 'essential' },
      { id: 'japan', name: 'Family trip to Japan', type: 'travel', target: 600000, year: Y + 3, priority: 'nice' },
      { id: 'retire', name: 'Retire at 60', type: 'retirement', retireAge: 60, priority: 'essential' },
    ],
  },
  {
    id: 'iyer',
    name: 'Venkatesh Iyer',
    tagline: 'Bank branch manager, 52, Chennai. Six years to retirement, almost everything in FDs.',
    age: 52,
    city: 'Chennai',
    occupation: 'Branch manager, public sector bank',
    employer: 'Coastal Cooperative Bank',
    household: 'Married, daughter (26), mother lives with them',
    dependents: 2,
    riskProfile: 'conservative',
    riskAnswers: { horizon: 'medium', drop20: 'sell', experience: 'none', incomeStability: 'stable', priority: 'safety' },
    income: { monthly: 185000, annualBonus: 120000 },
    expenses: {
      groceries: 14000,
      foodDelivery: 3000,
      transport: 6000,
      utilities: 5500,
      shopping: 6000,
      entertainment: 2000,
      travel: 4000,
      health: 9000,
      family: 12000,
      household: 8000,
      insurance: 6000,
      other: 5000,
    },
    spendingTrends: { health: 0.3 },
    sip: 10000,
    epfMonthly: 22000,
    assets: {
      savingsAccount: 650000,
      liquidFunds: 0,
      fixedDeposits: 7200000,
      debtFunds: 0,
      equityFunds: 600000,
      directStocks: 0,
      epf: 7800000,
      ppf: 1800000,
      nps: 0,
      gold: 1200000,
      realEstate: 11000000,
    },
    liabilities: [],
    insurance: { termCover: 2500000, healthCover: 1000000, employerHealthOnly: false },
    goals: [
      { id: 'wedding', name: "Meera's wedding", type: 'family', target: 2000000, year: Y + 2, priority: 'important' },
      { id: 'yatra', name: 'Char Dham yatra with Amma', type: 'travel', target: 300000, year: Y + 1, priority: 'nice' },
      { id: 'retire', name: 'Retire at 58 without worry', type: 'retirement', retireAge: 58, priority: 'essential' },
    ],
  },
];

export function personaList() {
  return PERSONAS.map(({ id, name, tagline, age, city }) => ({ id, name, tagline, age, city }));
}

// ---- onboarding form -> profile --------------------------------------------

const RISK_POINTS = {
  horizon: { short: 0, medium: 1, long: 2 },
  drop20: { sell: 0, wait: 1, hold: 2, buy: 3 },
  experience: { none: 0, some: 1, lots: 2 },
  incomeStability: { unstable: 0, variable: 1, stable: 2 },
  priority: { safety: 0, balance: 1, growth: 2 },
};

export function riskFromAnswers(ans = {}) {
  let pts = 0;
  let max = 0;
  for (const [q, table] of Object.entries(RISK_POINTS)) {
    max += Math.max(...Object.values(table));
    pts += table[ans[q]] ?? 1;
  }
  const r = pts / max;
  return { score: Math.round(r * 100), profile: r < 0.4 ? 'conservative' : r < 0.72 ? 'moderate' : 'aggressive' };
}

const n = (v) => Math.max(0, Number(v) || 0);

export function profileFromForm(form, id) {
  const risk = riskFromAnswers(form.riskAnswers);
  const age = Math.min(75, Math.max(18, Number(form.age) || 30));
  const goals = (form.goals || [])
    .filter((g) => g && g.name && (g.type === 'retirement' || n(g.target) > 0))
    .slice(0, 6)
    .map((g, i) => ({
      id: g.id || `g${i + 1}`,
      name: String(g.name).slice(0, 60),
      type: g.type || 'other',
      target: g.type === 'retirement' ? undefined : n(g.target),
      year: g.type === 'retirement' ? undefined : Math.max(Y + 1, Number(g.year) || Y + 5),
      retireAge: g.type === 'retirement' ? Math.max(age + 1, Number(g.retireAge) || 60) : undefined,
      priority: ['essential', 'important', 'nice'].includes(g.priority) ? g.priority : 'important',
    }));
  if (!goals.some((g) => g.type === 'retirement')) {
    goals.push({ id: 'retire', name: 'Retirement', type: 'retirement', retireAge: 60, priority: 'essential' });
  }
  const exp = form.expenses || {};
  const expenses = Object.fromEntries(Object.entries(exp).map(([k, v]) => [k, n(v)]).filter(([, v]) => v > 0));
  if (!Object.keys(expenses).length) expenses.other = n(form.monthlyExpenses) || Math.round(n(form.monthlyIncome) * 0.55);

  return {
    id,
    custom: true,
    name: (form.name || 'You').slice(0, 40),
    tagline: 'Your own numbers',
    age,
    city: form.city || '',
    occupation: form.occupation || '',
    household: form.household || '',
    dependents: Math.min(10, n(form.dependents)),
    riskProfile: risk.profile,
    riskScore: risk.score,
    riskAnswers: form.riskAnswers || {},
    income: { monthly: n(form.monthlyIncome), annualBonus: n(form.annualBonus) },
    expenses,
    sip: n(form.sip),
    epfMonthly: n(form.epfMonthly),
    assets: {
      savingsAccount: n(form.assets?.savingsAccount),
      liquidFunds: 0,
      fixedDeposits: n(form.assets?.fixedDeposits),
      debtFunds: n(form.assets?.debtFunds),
      equityFunds: n(form.assets?.equityFunds),
      directStocks: n(form.assets?.directStocks),
      epf: n(form.assets?.epf),
      ppf: n(form.assets?.ppf),
      nps: n(form.assets?.nps),
      gold: n(form.assets?.gold),
      realEstate: n(form.assets?.realEstate),
    },
    liabilities: (form.liabilities || [])
      .filter((l) => n(l.outstanding) > 0)
      .map((l, i) => ({ id: `l${i + 1}`, type: l.type || 'Loan', outstanding: n(l.outstanding), rate: Math.min(0.6, n(l.rate) > 1 ? n(l.rate) / 100 : n(l.rate)), emi: n(l.emi) })),
    insurance: { termCover: n(form.insurance?.termCover), healthCover: n(form.insurance?.healthCover), employerHealthOnly: !!form.insurance?.employerHealthOnly },
    goals,
  };
}
