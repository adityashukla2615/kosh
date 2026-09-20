import { TARGET_EQUITY } from './profile.js';
import { evaluate, formatINR as inr, formatPct as pct } from './analysis.js';
import { solveExtraForGoal, planGoals } from './goals.js';
import { healthScore } from './health.js';
import { analyzeSpending, CATEGORY_LABELS, DISCRETIONARY } from './spending.js';

// Next-best-action engine.
// Every candidate is *simulated*, not guessed: we apply the change to a copy of the
// profile, re-run goals + health, and rank by what actually moved.

const PRIORITY_W = { essential: 3, important: 2, nice: 1 };

function goalGain(base, alt) {
  let g = 0;
  for (const b of base.goals.goals) {
    if (b.synthetic) continue;
    const a = alt.goals.goals.find((x) => x.id === b.id);
    if (a) g += (a.probability - b.probability) * PRIORITY_W[b.priority];
  }
  return g;
}

function goalMetrics(base, alt, limit = 2) {
  return base.goals.goals
    .filter((b) => !b.synthetic)
    .map((b) => {
      const a = alt.goals.goals.find((x) => x.id === b.id);
      return { label: `${b.name} odds`, before: pct(b.probability), after: pct(a.probability), d: a.probability - b.probability };
    })
    .filter((m) => m.d >= 0.02)
    .sort((x, y) => y.d - x.d)
    .slice(0, limit)
    .map(({ d, ...m }) => m);
}

// crude premium ballparks - clearly labelled as such in the UI
function termPremiumPerCrore(age) {
  if (age < 30) return 9000;
  if (age < 40) return 13500;
  if (age < 50) return 26000;
  return 48000;
}

export function nextBestActions(profile, a, transactions = []) {
  // same path count as every other probability the user sees - the cards sit next to the
  // goals panel on the Overview, so a cheaper simulation here reads as a contradiction
  const opts = { sims: a.simulations, skipProjection: true };
  const base = evaluate(profile, a, {}, opts);
  const s = base.summary;
  const out = [];

  const tryScenario = (scenario) => evaluate(profile, a, scenario, opts);

  // 1. expensive debt
  for (const l of profile.liabilities || []) {
    if (l.rate < 0.14 || l.outstanding <= 0) continue;
    const spareCash = Math.max(0, s.emergencyAssets - 3 * s.monthlyNeed);
    const amount = Math.min(l.outstanding, spareCash);
    const scenario = amount > 0 ? { prepay: { liabilityId: l.id, amount } } : null;
    const alt = scenario ? tryScenario(scenario) : base;
    out.push({
      id: `debt-${l.id}`,
      category: 'fix',
      title: amount >= l.outstanding ? `Pay off your ${l.type.toLowerCase()} this month` : `Chip away at your ${l.type.toLowerCase()}`,
      summary: `It costs ${Math.round(l.rate * 100)}% a year. No investment reliably beats that.`,
      why: [
        `${inr(l.outstanding)} outstanding at ${Math.round(l.rate * 100)}% interest ≈ ${inr(l.outstanding * l.rate)} a year in interest.`,
        amount > 0 ? `You can do this and still keep 3 months of expenses (${inr(3 * s.monthlyNeed)}) in the bank.` : `Your cash is already thin, so we'd route new savings here first before investing more.`,
      ],
      how: amount > 0 ? [`Pay ${inr(amount)} from your savings account towards the ${l.type.toLowerCase()}.`, 'If it is a credit card, switch to paying the full statement every month (autopay "total due").'] : ['Put any surplus above your SIP towards it every month until it is cleared.'],
      impact: { headline: `Saves ~${inr(Math.min(amount || l.outstanding, l.outstanding) * l.rate)}/year in interest`, metrics: [{ label: 'Health score', before: base.health.score, after: alt.health.score }] },
      assumptions: ['Interest rate stays as quoted by the lender.', 'We never let the emergency cushion drop below 3 months for this.'],
      confidence: 'high',
      effort: '10 min',
      scenario,
      score: 40 + (alt.health.score - base.health.score) * 2,
    });
  }

  // 2. emergency cushion
  const target = a.emergencyMonths * s.monthlyNeed;
  if (s.emergencyMonths < a.emergencyMonths - 0.5) {
    const gap = target - s.emergencyAssets;
    const monthly = Math.ceil(gap / 12 / 500) * 500;
    const patched = structuredClone(profile);
    patched.assets.liquidFunds = (patched.assets.liquidFunds || 0) + gap;
    const hs = healthScore(patched, a, planGoals(patched, a, {}, { sims: a.simulations }));
    out.push({
      id: 'emergency',
      category: 'protect',
      title: `Build your emergency cushion to ${inr(target)}`,
      summary: `You'd last about ${s.emergencyMonths.toFixed(1)} months without income today.`,
      why: [`Monthly needs (expenses + EMIs) are ${inr(s.monthlyNeed)}.`, `${a.emergencyMonths} months of that is ${inr(target)}; you have ${inr(s.emergencyAssets)} in easy-to-reach money.`],
      how: [`Set up a ${inr(monthly)}/month auto-transfer into a liquid fund or sweep-in FD for the next 12 months.`, 'Keep it in a separate account so it does not get spent.'],
      impact: { headline: `Covers a job loss of up to ${a.emergencyMonths} months`, metrics: [{ label: 'Runway', before: `${s.emergencyMonths.toFixed(1)} mo`, after: `${a.emergencyMonths} mo` }, { label: 'Health score', before: base.health.score, after: hs.score }] },
      assumptions: ['Job search in India typically takes 3-6 months for salaried roles.', 'Liquid funds can be redeemed in 1 working day.'],
      confidence: 'high',
      effort: '5 min',
      scenario: null,
      score: (s.emergencyMonths < 3 ? 45 : 20) + (hs.score - base.health.score) * 2,
    });
  }

  // 3. idle cash beyond the cushion
  const idle = (profile.assets.savingsAccount || 0) - Math.max(0, target - (profile.assets.fixedDeposits || 0) - (profile.assets.liquidFunds || 0)) - s.monthlyNeed;
  if (idle > 100000) {
    const amount = Math.floor(idle / 10000) * 10000;
    const scenario = { moveIdleCash: amount };
    const alt = tryScenario(scenario);
    out.push({
      id: 'idle-cash',
      category: 'grow',
      title: `Put ${inr(amount)} of idle savings to work`,
      summary: `It's earning ~${Math.round(a.returns.cash * 1000) / 10}% in a savings account while prices rise ~${Math.round(a.inflation * 100)}%.`,
      why: [`After keeping ${a.emergencyMonths} months aside and one month of float, ${inr(amount)} is just sitting there.`, `At ${Math.round(a.inflation * 100)}% inflation, idle cash loses about ${inr(amount * (a.inflation - a.returns.cash))} of buying power every year.`],
      how: ['Move it in 3-6 monthly tranches (an STP) rather than all at once, to avoid bad timing.', 'Roughly 70% to a diversified equity index fund, 30% to a short-duration debt fund.'],
      impact: { headline: 'Makes long-term money actually grow', metrics: goalMetrics(base, alt) },
      assumptions: [`Equity ${pct(a.returns.equity)}/yr and debt ${pct(a.returns.debt)}/yr over the long run.`, 'You will not need this money for 5+ years.'],
      confidence: 'medium',
      effort: '20 min',
      scenario,
      score: goalGain(base, alt) * 100 + (alt.health.score - base.health.score) * 2 + 5,
    });
  }

  // 4. automate the monthly surplus
  if (s.surplus > 5000) {
    const scenario = { sweepSurplusPct: 60 };
    const alt = tryScenario(scenario);
    const amt = Math.round((s.surplus * 0.6) / 500) * 500;
    out.push({
      id: 'sweep',
      category: 'grow',
      title: `Automate ${inr(amt)}/month of your leftover money`,
      summary: `About ${inr(s.surplus)} is left over each month after spending, EMIs and SIPs - and it quietly disappears.`,
      why: [`Income ${inr(s.monthlyIncome)} − spending ${inr(s.monthlyExpenses)} − EMIs ${inr(s.emi)} − SIPs ${inr(s.sip)} = ${inr(s.surplus)} unplanned.`, 'Money that is not given a job on payday usually gets spent.'],
      how: [`Add a SIP of ${inr(amt)} dated 2 days after salary credit.`, 'Leave the other 40% as buffer for irregular expenses.'],
      impact: { headline: 'Biggest lever on your long-term goals', metrics: goalMetrics(base, alt) },
      assumptions: ['Your spending stays roughly where it has been for the last 6 months.', 'SIP gets split across goals by priority (must-haves first).'],
      confidence: 'high',
      effort: '5 min',
      scenario,
      score: goalGain(base, alt) * 100 + (alt.health.score - base.health.score) * 2 + 8,
    });
  }

  // 5. step-up
  if (s.sip > 0) {
    const scenario = { stepUpPct: 10 };
    const alt = tryScenario(scenario);
    out.push({
      id: 'step-up',
      category: 'grow',
      title: 'Turn on a 10% yearly SIP step-up',
      summary: 'Grow your SIP along with your salary instead of keeping it flat for years.',
      why: [`Your SIP of ${inr(s.sip)} stays flat while we expect income to grow ~${pct(a.salaryGrowth)} a year.`, 'Most AMCs and apps let you set a yearly top-up once and forget it.'],
      how: ['In your fund app, edit each SIP → "Top-up / step-up" → 10% yearly.', 'Time it with your appraisal month so it never feels like a pay cut.'],
      impact: { headline: 'Small now, very large by year 10+', metrics: goalMetrics(base, alt) },
      assumptions: [`Salary grows at least ${pct(a.salaryGrowth)} a year on average.`],
      confidence: 'high',
      effort: '5 min',
      scenario,
      score: goalGain(base, alt) * 100 + 4,
    });
  }

  // 6. goals that are clearly off track
  const weak = base.goals.goals.filter((g) => !g.synthetic && g.probability < 0.6).sort((x, y) => PRIORITY_W[y.priority] - PRIORITY_W[x.priority] || x.probability - y.probability);
  for (const g of weak.slice(0, 2)) {
    const fix = solveExtraForGoal(profile, a, g.id, 0.8);
    if (!fix) continue;
    const affordable = fix.extra <= Math.max(0, s.surplus) * 0.8;
    out.push({
      id: `goal-${g.id}`,
      category: 'fix',
      title: `Rescue "${g.name}"`,
      summary: `Only a ${pct(g.probability)} chance today. Needs ${inr(g.costFuture)} by ${g.year}.`,
      why: [
        `Cost today ${inr(g.costToday)}, grows to ${inr(g.costFuture)} at ${pct(g.inflationUsed)} inflation.`,
        `It currently gets ${inr(g.monthly)}/month; it needs ~${inr(g.requiredMonthly)}/month to be ~80% likely.`,
      ],
      how: [
        `Option A: add ${inr(fix.extra)}/month earmarked for this goal → ~${pct(fix.reached)} odds.`,
        fix.delay ? `Option B: move the date out by ${fix.delay.years} year${fix.delay.years > 1 ? 's' : ''} with no extra money → ~${pct(fix.delay.probability)} odds.` : 'Option B: reduce the target amount.',
        affordable ? 'Option A fits inside your current monthly surplus.' : 'Option A is more than your spare cash flow today - B, or a mix, is more realistic.',
      ],
      impact: { headline: `${pct(g.probability)} → ${pct(fix.reached)} odds`, metrics: [{ label: 'Extra needed', before: inr(0), after: `${inr(fix.extra)}/mo` }] },
      assumptions: [`New money for this goal goes in ~${Math.round(g.mix.equity * 100)}% equity / ${Math.round(g.mix.debt * 100)}% debt / ${Math.round(g.mix.gold * 100)}% gold because it is ${g.years} years away; money already set aside stays where it is invested today.`, `${a.simulations} simulated market paths; 80% odds is our "comfortable" line.`],
      confidence: 'medium',
      effort: 'a conversation at home',
      scenario: { extraMonthly: fix.extra },
      goalId: g.id,
      score: 18 * PRIORITY_W[g.priority] * (0.8 - g.probability) + (affordable ? 10 : 0),
    });
  }

  // 7. term cover
  if (profile.dependents > 0) {
    const need = s.monthlyIncome * 12 * a.termCoverMultiple + s.debts;
    const have = profile.insurance?.termCover || 0;
    if (have < need * 0.8) {
      const cover = Math.ceil((need - have) / 2.5e6) * 2.5e6;
      const prem = (cover / 1e7) * termPremiumPerCrore(profile.age);
      const patched = structuredClone(profile);
      patched.insurance.termCover = have + cover;
      const hs = healthScore(patched, a, base.goals);
      out.push({
        id: 'term',
        category: 'protect',
        title: `Add ${inr(cover)} of pure term life cover`,
        summary: `${profile.dependents} ${profile.dependents > 1 ? 'people depend' : 'person depends'} on your income. Current cover: ${inr(have)}.`,
        why: [`${a.termCoverMultiple}x yearly income (${inr(s.monthlyIncome * 12)}) plus outstanding loans (${inr(s.debts)}) ≈ ${inr(need)}.`, 'Endowment/ULIP policies mix insurance and investment and usually give too little cover for the premium.'],
        how: ['Compare pure term plans on an aggregator; pick an insurer with a claim settlement ratio above 97%.', `Cover till age 60-65. Ballpark premium: ~${inr(prem)}/year at your age (non-smoker).`, 'Disclose health history fully - it is the #1 reason claims get rejected.'],
        impact: { headline: `Closes a ${inr(need - have)} protection gap`, metrics: [{ label: 'Health score', before: base.health.score, after: hs.score }] },
        assumptions: ['Premium is a rough market ballpark, not a quote.', 'Cover need = income replacement + debts; existing savings not netted off (conservative).'],
        confidence: 'high',
        effort: '1-2 hours + medical',
        scenario: null,
        score: 50 + (hs.score - base.health.score),
      });
    }
  }

  // 8. health cover
  const hc = profile.insurance?.healthCover || 0;
  if (hc < a.healthCoverMin || profile.insurance?.employerHealthOnly) {
    const patched = structuredClone(profile);
    patched.insurance.healthCover = Math.max(hc, a.healthCoverMin);
    patched.insurance.employerHealthOnly = false;
    const hs = healthScore(patched, a, base.goals);
    out.push({
      id: 'health',
      category: 'protect',
      title: profile.insurance?.employerHealthOnly ? 'Get a health policy that is yours, not your employer’s' : `Raise health cover to at least ${inr(a.healthCoverMin)}`,
      summary: profile.insurance?.employerHealthOnly ? 'Company cover stops the day you leave or lose the job.' : `A single hospital stay in a metro can cost ${inr(500000)}+.`,
      why: [`Current cover: ${inr(hc)}${profile.insurance?.employerHealthOnly ? ' (employer group policy)' : ''}.`, 'Buying later means waiting periods restart and pre-existing conditions get excluded.'],
      how: ['A base policy of ₹5-10 L plus a super top-up to ₹25-50 L is usually the cheapest way to get large cover.', `Ballpark: ${inr(profile.age < 35 ? 12000 : profile.age < 45 ? 18000 : 32000)}-${inr(profile.age < 35 ? 18000 : profile.age < 45 ? 28000 : 50000)}/year for a family floater.`],
      impact: { headline: 'Stops one hospital bill from wiping out a goal', metrics: [{ label: 'Health score', before: base.health.score, after: hs.score }] },
      assumptions: ['Premium ranges are rough; they vary a lot by city and health history.'],
      confidence: 'high',
      effort: '1 hour',
      scenario: null,
      score: 30 + (hs.score - base.health.score),
    });
  }

  // 9. too conservative for the horizon
  const eqGap = (TARGET_EQUITY[profile.riskProfile] ?? 0.6) - s.mixPct.equity;
  if (eqGap > 0.15 && (profile.assets.fixedDeposits || 0) > 300000) {
    const shift = Math.round(((profile.assets.fixedDeposits || 0) * 0.4) / 10000) * 10000;
    const patched = structuredClone(profile);
    patched.assets.fixedDeposits -= shift;
    patched.assets.equityFunds = (patched.assets.equityFunds || 0) + shift;
    const alt = evaluate(patched, a, {}, opts);
    out.push({
      id: 'rebalance',
      category: 'grow',
      title: `Shift ${inr(shift)} from FDs into equity over 12 months`,
      summary: `Only ${pct(s.mixPct.equity)} of your money is in growth assets; for your goals we'd expect ~${pct(TARGET_EQUITY[profile.riskProfile])}.`,
      why: [`FDs give ~${pct(a.returns.debt)} before tax. After tax at 30% and ${pct(a.inflation)} inflation, that is close to zero real growth.`, 'Your retirement is far enough away to ride out equity dips.'],
      how: ['As each FD matures, move it to an equity index fund via a 12-month STP instead of renewing.', 'Keep FDs that are part of the emergency cushion as they are.'],
      impact: { headline: 'Beats inflation on long-term money', metrics: goalMetrics(base, alt) },
      assumptions: [`Equity ${pct(a.returns.equity)} with ${pct(a.volatility.equity)} yearly swings - some years will show losses.`],
      confidence: 'medium',
      effort: 'as FDs mature',
      scenario: null,
      score: goalGain(base, alt) * 100 + 6,
    });
  }

  // 10. spending leaks
  if (transactions.length) {
    const sp = analyzeSpending(profile, transactions);
    const flag = sp.flags.find((f) => (f.kind === 'rising' || f.kind === 'high') && DISCRETIONARY.has(f.category));
    if (flag) {
      const cat = sp.categories.find((c) => c.category === flag.category);
      const cut = Math.round((cat.recentAvg * 0.25) / 100) * 100;
      const scenario = { trim: { category: flag.category, pct: 25 }, extraMonthly: cut };
      const alt = tryScenario(scenario);
      out.push({
        id: `spend-${flag.category}`,
        category: 'spend',
        title: `Trim ${CATEGORY_LABELS[flag.category] || flag.category} by a quarter`,
        summary: flag.text,
        why: [flag.text, `A 25% cut frees ${inr(cut)}/month, which we'd route straight into your SIP.`],
        how: ['Set a monthly cap in your UPI app or card for this category.', 'Look at the last 30 days of transactions - the fix is usually 2-3 habits, not a lifestyle change.'],
        impact: { headline: `${inr(cut * 12)}/year back into goals`, metrics: goalMetrics(base, alt) },
        assumptions: ['The money saved is actually invested, not spent elsewhere.'],
        confidence: 'medium',
        effort: 'habit',
        scenario,
        score: goalGain(base, alt) * 100 + 3,
      });
    }
  }

  // 11. employer NPS (tax) - informational, low confidence on purpose
  if (!profile.assets.nps && s.monthlyIncome > 120000 && !profile.selfEmployed) {
    out.push({
      id: 'nps-employer',
      category: 'tax',
      title: 'Ask HR about employer NPS contribution',
      summary: 'One of the few deductions that still works under the new tax regime.',
      why: ['Employer contribution to NPS under Section 80CCD(2) is deductible in both regimes (up to 14% of basic in the new regime, as of FY 2025-26).', `At your income level this can plausibly save you several thousand rupees a year in tax.`],
      how: ['Check with payroll whether they offer corporate NPS and restructure part of the CTC into it.', 'Money is locked till 60 (partial withdrawals allowed for specific needs) - only do it for retirement money.'],
      impact: { headline: 'Lower tax, retirement money on autopilot', metrics: [] },
      assumptions: ['Tax rules change every Budget - verify the current limit with a CA or your payroll team.', 'We do not know your exact salary structure, so no rupee figure is shown.'],
      confidence: 'low',
      effort: 'email to HR',
      scenario: null,
      score: 8,
    });
  }

  out.sort((x, y) => y.score - x.score);
  return out.map((x, i) => ({ ...x, rank: i + 1, score: Math.round(x.score * 10) / 10 }));
}

