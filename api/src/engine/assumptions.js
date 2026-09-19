// Every number the engine leans on lives here, with a sentence explaining it.
// The UI renders this table as-is, and users can override any value.

export const DEFAULT_ASSUMPTIONS = {
  inflation: 0.06,
  educationInflation: 0.09,
  salaryGrowth: 0.07,
  propertyGrowth: 0.05,
  returns: { equity: 0.115, debt: 0.07, gold: 0.08, cash: 0.035 },
  volatility: { equity: 0.18, debt: 0.03, gold: 0.15, cash: 0.005 },
  emergencyMonths: 6,
  termCoverMultiple: 10,
  healthCoverMin: 1000000,
  retirementMultiple: 28,
  retirementLifestyle: 0.8,
  surplusLeakage: 0.5,
  simulations: 800,
};

export const ASSUMPTION_NOTES = {
  inflation: 'General price rise per year. India CPI has averaged roughly 5-6% over the last decade.',
  educationInflation: 'College fees have historically risen faster than general prices, so education goals use this instead.',
  salaryGrowth: 'Yearly raise we assume on take-home pay. SIP step-ups are separate.',
  propertyGrowth: 'Yearly change in the value of property you already own.',
  'returns.equity': 'Long-run yearly return of a diversified Indian equity index fund, before tax. Not a promise - some years are -30%.',
  'returns.debt': 'Yearly return of FDs, PPF, EPF and debt funds, roughly.',
  'returns.gold': 'Long-run gold return in rupees.',
  'returns.cash': 'What money sitting in a savings account earns.',
  'volatility.equity': 'How much equity returns swing year to year (standard deviation). Drives the width of the fan charts.',
  'volatility.debt': 'Debt swings are small.',
  'volatility.gold': 'Gold swings more than people expect.',
  'volatility.cash': 'Close to zero.',
  emergencyMonths: 'Months of expenses + EMIs we want sitting in easy-to-reach money.',
  termCoverMultiple: 'Life cover as a multiple of yearly income, if someone depends on you.',
  healthCoverMin: 'Minimum family health cover we consider adequate for a metro city.',
  retirementMultiple: 'Corpus needed at retirement = this many years of expenses (~3.5% safe withdrawal rate).',
  retirementLifestyle: 'Share of current spending you will need after retiring (no rent/commute, more health).',
  surplusLeakage: 'Share of unplanned monthly surplus that ends up spent rather than saved. Money you automate (SIPs) is not affected - which is why automating matters.',
  simulations: 'Number of random market paths we simulate for every probability you see.',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// merge user overrides without letting silly values break the maths
export function resolveAssumptions(overrides = {}) {
  const a = structuredClone(DEFAULT_ASSUMPTIONS);
  if (!overrides || typeof overrides !== 'object') return a;
  for (const [key, val] of Object.entries(overrides)) {
    if (val == null) continue;
    if ((key === 'returns' || key === 'volatility') && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (k in a[key] && Number.isFinite(Number(v))) a[key][k] = clamp(Number(v), -0.2, 0.6);
      }
    } else if (key in a && Number.isFinite(Number(val))) {
      a[key] = Number(val);
    }
  }
  a.simulations = clamp(Math.round(a.simulations), 100, 3000);
  a.inflation = clamp(a.inflation, 0, 0.2);
  return a;
}

export function flattenAssumptions(a) {
  const rows = [];
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) rows.push({ key: `${k}.${k2}`, value: v2, note: ASSUMPTION_NOTES[`${k}.${k2}`] || '' });
    } else {
      rows.push({ key: k, value: v, note: ASSUMPTION_NOTES[k] || '' });
    }
  }
  return rows;
}
