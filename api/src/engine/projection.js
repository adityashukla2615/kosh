import { summarize, blend, goalYear, CURRENT_YEAR } from './profile.js';
import { goalCostToday } from './goals.js';
import { mulberry32, normalSampler, hashString, percentile } from './rng.js';

// Whole-household, month-by-month simulation. Money flows:
//   salary -> expenses -> EMIs -> SIP -> whatever is left piles up in the savings account
// Goals are paid out of the pot when they fall due, so the chart dips when you buy the house.

export function projectHousehold(profile, a, events = {}, opts = {}) {
  const s = summarize(profile);
  const retirement = profile.goals.find((g) => g.type === 'retirement');
  const horizonYears = Math.min(35, Math.max(10, retirement ? goalYear(retirement, profile) - CURRENT_YEAR : 25));
  const months = horizonYears * 12;
  const sims = opts.sims ?? Math.min(a.simulations, 600);

  const cash0 = (profile.assets.savingsAccount || 0) + (profile.assets.liquidFunds || 0);
  const invested0 = s.financialAssets - cash0;
  const nonCashMix = { equity: s.mix.equity, debt: s.mix.debt, gold: s.mix.gold, cash: 0 };
  const tot = nonCashMix.equity + nonCashMix.debt + nonCashMix.gold || 1;
  for (const k of Object.keys(nonCashMix)) nonCashMix[k] /= tot;
  const stats = blend(nonCashMix, a);
  const sigmaM = stats.vol / Math.sqrt(12);
  const muM = Math.log(1 + stats.expected) / 12 - (sigmaM * sigmaM) / 2;
  const cashM = Math.pow(1 + a.returns.cash, 1 / 12) - 1;
  const propM = Math.pow(1 + a.propertyGrowth, 1 / 12) - 1;

  // loans are deterministic - pre-compute their balance each month
  const loanPath = new Float64Array(months + 1);
  const emiPath = new Float64Array(months + 1);
  const loans = (profile.liabilities || []).map((l) => ({ ...l }));
  for (let m = 0; m <= months; m++) {
    let bal = 0;
    let emi = 0;
    for (const l of loans) {
      if (l.outstanding <= 0) continue;
      if (m > 0 && l.emi > 0) {
        const interest = (l.outstanding * l.rate) / 12;
        l.outstanding = Math.max(0, l.outstanding + interest - l.emi);
      }
      if (l.outstanding > 0) emi += l.emi || 0;
      bal += l.outstanding;
    }
    loanPath[m] = bal;
    emiPath[m] = emi;
  }

  const payouts = profile.goals
    .filter((g) => g.type !== 'retirement')
    .map((g) => {
      const yrs = Math.max(0, goalYear(g, profile) - CURRENT_YEAR);
      const infl = g.type === 'education' ? a.educationInflation : a.inflation;
      return { id: g.id, name: g.name, month: Math.round(yrs * 12), cost: goalCostToday(g, profile, s, a) * Math.pow(1 + infl, yrs) };
    })
    .filter((p) => p.month < months);

  const rand = mulberry32(hashString(`${profile.id}:household`));
  const z = normalSampler(rand);
  const snapshots = Array.from({ length: horizonYears + 1 }, () => new Float64Array(sims));
  const shortfalls = Object.fromEntries(payouts.map((p) => [p.id, 0]));
  let ranOut = 0;
  let minRunwayHits = 0;

  const incomeBase = s.monthlyIncome;
  const expenseBase = s.monthlyExpenses;
  const stepUp = events.stepUp || 0;
  const jl = events.jobLoss;

  for (let p = 0; p < sims; p++) {
    let cash = cash0;
    let inv = invested0 * (1 - (events.marketShock || 0) * nonCashMix.equity);
    let prop = profile.assets.realEstate || 0;
    let broke = false;
    let dipped = false;
    snapshots[0][p] = cash + inv + prop - loanPath[0];

    for (let m = 0; m < months; m++) {
      const yr = Math.floor(m / 12);
      const jobless = jl && m >= jl.start && m < jl.start + jl.months;
      const income = jobless ? 0 : incomeBase * Math.pow(1 + a.salaryGrowth, yr);
      const spend = expenseBase * Math.pow(1 + a.inflation, yr);
      const sip = jobless ? 0 : s.sip * Math.pow(1 + stepUp, yr);
      const epf = jobless ? 0 : s.epfMonthly * Math.pow(1 + a.salaryGrowth, yr);

      const left = income - spend - emiPath[m] - sip;
      // unplanned surplus mostly leaks into lifestyle; shortfalls are real though
      cash += left > 0 ? left * (1 - a.surplusLeakage) : left;
      inv += sip + epf;
      if (cash < 0) {
        inv += cash;
        cash = 0;
        dipped = true;
        if (inv < 0) {
          broke = true;
          inv = 0;
        }
      }
      cash *= 1 + cashM;
      inv *= Math.exp(muM + sigmaM * z());
      prop *= 1 + propM;

      for (const po of payouts) {
        if (po.month !== m + 1 && !(po.month === 0 && m === 0)) continue;
        let due = po.cost;
        const fromInv = Math.min(inv, due);
        inv -= fromInv;
        due -= fromInv;
        const fromCash = Math.min(cash, due);
        cash -= fromCash;
        due -= fromCash;
        if (due > po.cost * 0.02) shortfalls[po.id]++;
      }

      if ((m + 1) % 12 === 0) {
        const y = (m + 1) / 12;
        const nominal = cash + inv + prop - loanPath[m + 1];
        snapshots[y][p] = nominal / Math.pow(1 + a.inflation, y);
      }
    }
    if (broke) ranOut++;
    if (dipped) minRunwayHits++;
  }

  const series = snapshots.map((arr, y) => {
    const sorted = Array.from(arr).sort((x, y2) => x - y2);
    return {
      year: CURRENT_YEAR + y,
      p10: Math.round(percentile(sorted, 0.1)),
      p50: Math.round(percentile(sorted, 0.5)),
      p90: Math.round(percentile(sorted, 0.9)),
    };
  });

  return {
    horizonYears,
    series,
    portfolioReturn: stats.expected,
    portfolioVol: stats.vol,
    probRanOut: ranOut / sims,
    probDippedIntoInvestments: minRunwayHits / sims,
    goalPayoutShortfall: Object.fromEntries(Object.entries(shortfalls).map(([k, v]) => [k, v / sims])),
    payouts: payouts.map((p) => ({ id: p.id, name: p.name, year: CURRENT_YEAR + Math.round(p.month / 12), cost: Math.round(p.cost) })),
    final: series[series.length - 1],
  };
}
