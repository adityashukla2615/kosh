// A synthetic book of business: the households one adviser is responsible for.
//
// Kosh's engine plans a single household well. An adviser does not have one
// household, they have a few hundred, and their real problem is knowing which
// of them needs attention this week and being able to say why. Everything here
// exists to give that problem something to run against.
//
// The book is generated, not stored, and generated deterministically: the same
// seed always produces the same households, so a number quoted in a deck is the
// number a judge sees, and a regression test can assert on household #57.
//
// None of these people exist. The distributions are shaped to be plausible for
// urban Indian households with an adviser relationship, not sampled from real data.

import { mulberry32 } from '../engine/rng.js';

const CURRENT_YEAR = new Date().getFullYear();

const FIRST_M = ['Arjun', 'Rohit', 'Vikram', 'Sanjay', 'Aditya', 'Karthik', 'Imran', 'Rahul', 'Nikhil', 'Suresh', 'Deepak', 'Anand', 'Pranav', 'Gaurav', 'Manish', 'Rajesh', 'Varun', 'Siddharth', 'Harish', 'Tarun'];
const FIRST_F = ['Ananya', 'Priya', 'Meera', 'Divya', 'Kavya', 'Sneha', 'Nisha', 'Ritu', 'Shreya', 'Aisha', 'Lakshmi', 'Pooja', 'Anjali', 'Swati', 'Rekha', 'Neha', 'Sunita', 'Preeti', 'Vidya', 'Radhika'];
const LAST = ['Rao', 'Sharma', 'Iyer', 'Nair', 'Patel', 'Reddy', 'Sheikh', 'Menon', 'Gupta', 'Kulkarni', 'Banerjee', 'Desai', 'Joshi', 'Chopra', 'Pillai', 'Bose', 'Malhotra', 'Shetty', 'Kaur', 'Mehta', 'Varma', 'Ghosh', 'Nambiar', 'Trivedi'];
const CITIES = ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Kochi', 'Jaipur'];

// Segment drives almost everything else. The weights decide what the adviser's
// book looks like, and therefore what kinds of problems surveillance has to find.
const SEGMENTS = [
  { id: 'early', label: 'Early career', weight: 18, age: [24, 31], income: [60_000, 160_000], dependents: [0, 0] },
  { id: 'family', label: 'Young family', weight: 26, age: [31, 42], income: [110_000, 320_000], dependents: [1, 2] },
  { id: 'established', label: 'Established', weight: 24, age: [40, 52], income: [180_000, 550_000], dependents: [1, 3] },
  { id: 'preretire', label: 'Pre-retirement', weight: 20, age: [50, 59], income: [150_000, 600_000], dependents: [0, 2] },
  { id: 'hni', label: 'High net worth', weight: 12, age: [38, 62], income: [500_000, 1_600_000], dependents: [0, 3] },
];

const OCCUPATIONS = {
  early: ['Software engineer', 'Product designer', 'Analyst', 'Consultant', 'Marketing associate'],
  family: ['Engineering manager', 'Doctor', 'Architect', 'Sales lead', 'Teacher'],
  established: ['Director', 'Surgeon', 'Partner', 'Business owner', 'Branch manager'],
  preretire: ['Senior manager', 'Professor', 'Civil servant', 'Business owner', 'Bank manager'],
  hni: ['Founder', 'Managing director', 'Cardiologist', 'Investment banker', 'Business owner'],
};

/** Pick from a weighted list. */
function weighted(rand, items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const between = (rand, [lo, hi]) => lo + rand() * (hi - lo);
const intBetween = (rand, range) => Math.round(between(rand, range));
const round = (n, to) => Math.round(n / to) * to;

/**
 * Log-normal-ish draw. Wealth is not symmetric: most of a book sits well below
 * the mean and a handful of accounts sit far above it, and a book generated from
 * uniform draws looks obviously fake to anyone who has seen a real one.
 */
function skewed(rand, median, sigma = 0.55) {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}

function buildExpenses(rand, income, dependents, city) {
  // Metro rent eats a much larger share, which is what makes some high earners
  // look fragile once you actually run the numbers.
  const metro = ['Mumbai', 'Delhi', 'Bengaluru'].includes(city);
  const rentShare = between(rand, metro ? [0.2, 0.32] : [0.12, 0.22]);
  const base = income * between(rand, [0.42, 0.66]) + dependents * between(rand, [8_000, 22_000]);
  const rent = round(income * rentShare, 500);
  const split = (share, jitter = 0.35) => round(base * share * between(rand, [1 - jitter, 1 + jitter]), 250);
  return {
    rent,
    groceries: split(0.17),
    foodDelivery: split(0.07),
    transport: split(0.08),
    utilities: split(0.06),
    shopping: split(0.1),
    entertainment: split(0.05),
    travel: split(0.07),
    health: split(0.05),
    family: split(0.12),
    other: split(0.05),
  };
}

function buildAssets(rand, seg, income, age) {
  // Years of saving matters more than income for how much has accumulated.
  const years = Math.max(1, age - 24);
  const capacity = income * 12 * between(rand, [0.12, 0.34]);
  const total = Math.max(150_000, skewed(rand, capacity * years * between(rand, [0.5, 1.3]), 0.5));

  // How that pile is split is the interesting part: an FD-heavy saver and an
  // all-equity saver with identical net worth have completely different problems.
  const style = weighted(rand, [
    { id: 'cash-heavy', weight: 22 },
    { id: 'balanced', weight: 34 },
    { id: 'equity-heavy', weight: 24 },
    { id: 'fd-heavy', weight: 20 },
  ]).id;

  const mixes = {
    'cash-heavy': { savingsAccount: 0.34, liquidFunds: 0.1, fixedDeposits: 0.2, debtFunds: 0.05, equityFunds: 0.14, directStocks: 0.02, gold: 0.06 },
    balanced: { savingsAccount: 0.1, liquidFunds: 0.07, fixedDeposits: 0.13, debtFunds: 0.1, equityFunds: 0.36, directStocks: 0.08, gold: 0.06 },
    'equity-heavy': { savingsAccount: 0.06, liquidFunds: 0.04, fixedDeposits: 0.05, debtFunds: 0.05, equityFunds: 0.5, directStocks: 0.22, gold: 0.03 },
    'fd-heavy': { savingsAccount: 0.12, liquidFunds: 0.04, fixedDeposits: 0.52, debtFunds: 0.12, equityFunds: 0.12, directStocks: 0.01, gold: 0.07 },
  };

  const mix = mixes[style];
  const assets = { savingsAccount: 0, liquidFunds: 0, fixedDeposits: 0, debtFunds: 0, equityFunds: 0, directStocks: 0, epf: 0, ppf: 0, nps: 0, gold: 0, realEstate: 0 };
  for (const [k, share] of Object.entries(mix)) assets[k] = round(total * share, 1000);

  // Retirement pots track salaried tenure rather than the liquid portfolio.
  assets.epf = round(income * 0.12 * 12 * years * between(rand, [0.5, 1.1]), 5000);
  assets.ppf = rand() < 0.45 ? round(skewed(rand, 400_000, 0.6), 5000) : 0;
  assets.nps = rand() < 0.3 ? round(skewed(rand, 300_000, 0.7), 5000) : 0;
  assets.realEstate = rand() < (seg === 'early' ? 0.12 : 0.55) ? round(skewed(rand, income * 12 * 4, 0.45), 100_000) : 0;

  return { assets, style };
}

function buildLiabilities(rand, seg, income, assets) {
  const out = [];
  if (assets.realEstate > 0 && rand() < 0.75) {
    const outstanding = round(assets.realEstate * between(rand, [0.25, 0.7]), 50_000);
    out.push({ id: 'home', type: 'Home loan', outstanding, rate: between(rand, [0.082, 0.094]), emi: round((outstanding * 0.0095), 500) });
  }
  if (rand() < 0.3) {
    const outstanding = round(skewed(rand, 400_000, 0.5), 10_000);
    out.push({ id: 'car', type: 'Car loan', outstanding, rate: between(rand, [0.089, 0.108]), emi: round(outstanding * 0.022, 500) });
  }
  // Revolving card debt at 36-45% is the single most destructive thing in a
  // retail balance sheet, and it turns up in every real book.
  if (rand() < 0.22) {
    out.push({ id: 'cc', type: 'Credit card balance', outstanding: round(skewed(rand, 90_000, 0.7), 1000), rate: between(rand, [0.36, 0.45]), emi: 0 });
  }
  if (seg !== 'early' && rand() < 0.14) {
    const outstanding = round(skewed(rand, 700_000, 0.5), 25_000);
    out.push({ id: 'edu', type: 'Education loan', outstanding, rate: between(rand, [0.095, 0.125]), emi: round(outstanding * 0.018, 500) });
  }
  return out;
}

function buildGoals(rand, seg, age, income, dependents, childAges) {
  const goals = [];
  const retireAge = intBetween(rand, seg === 'hni' ? [55, 62] : [57, 63]);
  goals.push({ id: 'retire', name: `Retire at ${retireAge}`, type: 'retirement', retireAge, priority: 'essential' });

  childAges.forEach((childAge, i) => {
    const yearsToCollege = Math.max(1, 18 - childAge);
    goals.push({
      id: `edu${i + 1}`,
      name: `${pick(rand, [...FIRST_M, ...FIRST_F])}’s education`,
      type: 'education',
      target: round(skewed(rand, 2_500_000, 0.35), 100_000),
      year: CURRENT_YEAR + yearsToCollege,
      priority: 'essential',
    });
  });

  if (rand() < 0.4) {
    goals.push({ id: 'home', name: 'Property purchase', type: 'home', target: round(skewed(rand, income * 12 * 3, 0.4), 100_000), year: CURRENT_YEAR + intBetween(rand, [3, 9]), priority: 'important' });
  }
  if (rand() < 0.5) {
    goals.push({ id: 'travel', name: pick(rand, ['Family trip abroad', 'Sabbatical year', 'Pilgrimage with parents']), type: 'travel', target: round(skewed(rand, 600_000, 0.4), 25_000), year: CURRENT_YEAR + intBetween(rand, [1, 4]), priority: 'nice' });
  }
  if (dependents > 0 && age > 45 && rand() < 0.45) {
    goals.push({ id: 'wedding', name: 'Wedding fund', type: 'other', target: round(skewed(rand, 2_000_000, 0.4), 100_000), year: CURRENT_YEAR + intBetween(rand, [3, 10]), priority: 'important' });
  }
  return goals;
}

function buildHousehold(rand, index) {
  const seg = weighted(rand, SEGMENTS);
  const age = intBetween(rand, seg.age);
  const income = round(skewed(rand, between(rand, seg.income), 0.4), 1000);
  const dependents = intBetween(rand, seg.dependents);
  const city = pick(rand, CITIES);

  const female = rand() < 0.42;
  const first = female ? pick(rand, FIRST_F) : pick(rand, FIRST_M);
  const last = pick(rand, LAST);
  const married = seg.id !== 'early' || rand() < 0.3;
  const name = married && dependents > 0 ? `${first} & ${pick(rand, female ? FIRST_M : FIRST_F)} ${last}` : `${first} ${last}`;

  const childAges = Array.from({ length: dependents }, () => intBetween(rand, [1, 17]));
  const { assets, style } = buildAssets(rand, seg.id, income, age);
  const liabilities = buildLiabilities(rand, seg.id, income, assets);

  const riskProfile = weighted(rand, [
    { id: 'conservative', weight: age > 50 ? 40 : 18 },
    { id: 'moderate', weight: 46 },
    { id: 'aggressive', weight: age < 38 ? 32 : 14 },
  ]).id;

  // Under-insurance is the most common real finding in an Indian book, so it has
  // to be common here too: a third carry no term cover at all.
  const termMultiple = weighted(rand, [
    { id: 0, weight: 32 },
    { id: 2, weight: 24 },
    { id: 5, weight: 24 },
    { id: 10, weight: 20 },
  ]).id;

  return {
    id: `hh-${String(index + 1).padStart(3, '0')}`,
    name,
    segment: seg.id,
    segmentLabel: seg.label,
    tagline: `${pick(rand, OCCUPATIONS[seg.id])}, ${age}, ${city}.`,
    age,
    city,
    occupation: pick(rand, OCCUPATIONS[seg.id]),
    household: married ? (dependents ? `Married, ${dependents} ${dependents === 1 ? 'child' : 'children'}` : 'Married') : 'Single',
    dependents,
    riskProfile,
    portfolioStyle: style,
    income: { monthly: income, annualBonus: round(income * between(rand, [0, 3]), 10_000) },
    expenses: buildExpenses(rand, income, dependents, city),
    sip: round(income * between(rand, [0.02, 0.22]), 500),
    epfMonthly: round(income * 0.12, 100),
    assets,
    liabilities,
    insurance: {
      termCover: termMultiple ? round(income * 12 * termMultiple, 500_000) : 0,
      healthCover: weighted(rand, [
        { id: 0, weight: 14 },
        { id: 300_000, weight: 26 },
        { id: 500_000, weight: 34 },
        { id: 1_000_000, weight: 26 },
      ]).id,
      employerHealthOnly: rand() < 0.42,
    },
    goals: buildGoals(rand, seg.id, age, income, dependents, childAges),
    // Reviews go stale; an adviser needs to see that as plainly as a funding gap.
    lastReviewedDaysAgo: Math.round(skewed(rand, 95, 0.75)),
  };
}

let cached = null;

/**
 * The adviser's book. Deterministic for a given size and seed, and memoised so
 * repeated calls in one process are free.
 */
export function generateBook({ size = 214, seed = 20260920 } = {}) {
  if (cached && cached.size === size && cached.seed === seed) return cached.households;
  const rand = mulberry32(seed);
  const households = Array.from({ length: size }, (_, i) => buildHousehold(rand, i));
  cached = { size, seed, households };
  return households;
}

export function getHousehold(id) {
  return generateBook().find((h) => h.id === id) || null;
}

export const BOOK_SEED = 20260920;
