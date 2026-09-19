import { inr as fmtL } from './format.js';
import { summarize } from './profile.js';

// Score out of 100. Each pillar gets points on a simple, explainable curve.
// Weights are deliberately round numbers so they're easy to talk about in a demo.

const lerp = (x, x0, x1) => Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));

export function healthScore(profile, a, goalPlan) {
  const s = summarize(profile);
  const pillars = [];

  // 1. emergency runway
  {
    const months = s.emergencyMonths;
    const pts = 20 * lerp(months, 0, a.emergencyMonths);
    pillars.push({
      id: 'emergency',
      label: 'Emergency cushion',
      weight: 20,
      points: pts,
      value: `${months.toFixed(1)} months`,
      detail: `You have ${fmtL(s.emergencyAssets)} in savings/FDs against ${fmtL(s.monthlyNeed)} of monthly expenses + EMIs. We aim for ${a.emergencyMonths} months.`,
    });
  }

  // 2. savings rate
  {
    const r = s.savingsRate;
    pillars.push({
      id: 'savings',
      label: 'Savings rate',
      weight: 20,
      points: 20 * lerp(r, 0.05, 0.35),
      value: `${Math.round(r * 100)}%`,
      detail: `Of every ₹100 you bring home (incl. EPF), about ₹${Math.round(r * 100)} is left after spending and EMIs. 25-35% is a healthy range for most salaried households.`,
    });
  }

  // 3. debt load
  {
    const ratio = s.emi / Math.max(1, s.monthlyIncome);
    const pricey = (profile.liabilities || []).filter((l) => l.rate >= 0.14 && l.outstanding > 0);
    let pts = 15 * (1 - lerp(ratio, 0.2, 0.5));
    if (pricey.length) pts *= 0.6;
    pillars.push({
      id: 'debt',
      label: 'Debt load',
      weight: 15,
      points: pts,
      value: `${Math.round(ratio * 100)}% of income`,
      detail:
        `EMIs take ${Math.round(ratio * 100)}% of monthly income (under 30% is comfortable).` +
        (pricey.length ? ` ${pricey.map((l) => l.type).join(', ')} charge${pricey.length > 1 ? '' : 's'} ${Math.round(pricey[0].rate * 100)}%+ interest, which drags this down.` : ''),
    });
  }

  // 4. protection
  {
    const annual = s.monthlyIncome * 12;
    const needTerm = profile.dependents > 0 ? annual * a.termCoverMultiple : 0;
    const termPts = needTerm ? 8 * lerp(profile.insurance?.termCover || 0, 0, needTerm) : 8;
    const health = profile.insurance?.healthCover || 0;
    const ownHealth = !profile.insurance?.employerHealthOnly;
    const healthPts = 7 * lerp(health, 0, a.healthCoverMin) * (ownHealth ? 1 : 0.7);
    const bits = [];
    if (needTerm) bits.push(`Life cover ${fmtL(profile.insurance?.termCover || 0)} vs ~${fmtL(needTerm)} suggested for ${profile.dependents} dependent${profile.dependents > 1 ? 's' : ''}.`);
    else bits.push('No one depends on your income yet, so term cover is optional for now.');
    bits.push(`Health cover ${fmtL(health)}${ownHealth ? '' : ' (only via employer - it ends if the job does)'}.`);
    pillars.push({ id: 'protection', label: 'Insurance', weight: 15, points: termPts + healthPts, value: needTerm ? `${Math.round(((profile.insurance?.termCover || 0) / needTerm) * 100)}% of need` : 'n/a', detail: bits.join(' ') });
  }

  // 5. goals
  {
    const gs = goalPlan.goals.filter((g) => !g.synthetic);
    const w = { essential: 3, important: 2, nice: 1 };
    const tw = gs.reduce((t, g) => t + w[g.priority], 0) || 1;
    const avg = gs.reduce((t, g) => t + g.probability * w[g.priority], 0) / tw;
    pillars.push({
      id: 'goals',
      label: 'Goal readiness',
      weight: 20,
      points: 20 * lerp(avg, 0.1, 0.9),
      value: `${Math.round(avg * 100)}% avg odds`,
      detail: `Weighted chance of hitting your goals on the current plan (must-haves count 3x, nice-to-haves 1x).`,
    });
  }

  // 6. is long-term money actually working?
  {
    const gap = Math.max(0, s.targetEquity - s.mixPct.equity);
    const idle = Math.max(0, s.emergencyAssets - a.emergencyMonths * s.monthlyNeed * 1.5);
    let pts = 10 * (1 - lerp(gap, 0.05, 0.4));
    if (idle > s.monthlyNeed * 3) pts *= 0.7;
    pillars.push({
      id: 'growth',
      label: 'Money working for you',
      weight: 10,
      points: pts,
      value: `${Math.round(s.mixPct.equity * 100)}% in growth assets`,
      detail: `For a ${profile.riskProfile} investor we'd expect ~${Math.round(s.targetEquity * 100)}% of long-term money in equity.` + (idle > s.monthlyNeed * 3 ? ` About ${fmtL(idle)} is sitting idle beyond your emergency cushion.` : ''),
    });
  }

  for (const p of pillars) {
    p.points = Math.round(p.points * 10) / 10;
    const r = p.points / p.weight;
    p.status = r >= 0.75 ? 'good' : r >= 0.45 ? 'ok' : 'weak';
  }
  const score = Math.round(pillars.reduce((t, p) => t + p.points, 0));
  const band = score >= 75 ? 'Strong' : score >= 55 ? 'Steady' : score >= 40 ? 'Needs attention' : 'Fragile';
  return { score, band, pillars };
}
