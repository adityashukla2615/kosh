import { mulberry32, hashString } from './rng.js';

export const CATEGORY_LABELS = {
  rent: 'Rent',
  groceries: 'Groceries',
  foodDelivery: 'Food delivery & dining',
  transport: 'Transport & fuel',
  utilities: 'Bills & utilities',
  shopping: 'Shopping',
  entertainment: 'Subscriptions & fun',
  travel: 'Travel',
  health: 'Health',
  education: 'School & tuition',
  family: 'Family support',
  household: 'Household help',
  insurance: 'Insurance premiums',
  other: 'Other',
};

// rough "is this a lot?" guide, as a share of take-home. Only used to raise a flag, never to judge.
const BENCHMARK_SHARE = { foodDelivery: 0.06, shopping: 0.07, entertainment: 0.03, travel: 0.08, transport: 0.07 };

const MERCHANTS = {
  rent: ['Rent - NoBroker transfer', 'House rent UPI'],
  groceries: ['BigBasket', 'Blinkit', 'DMart', 'Zepto', 'Local kirana UPI'],
  foodDelivery: ['Swiggy', 'Zomato', 'Swiggy Instamart', 'Cafe Coffee Day', 'Zomato Gold'],
  transport: ['Uber', 'Ola', 'HP Petrol', 'Rapido', 'Indian Oil', 'Namma Metro recharge'],
  utilities: ['BESCOM electricity', 'Airtel postpaid', 'ACT Fibernet', 'Mahanagar Gas', 'Jio recharge'],
  shopping: ['Amazon', 'Myntra', 'Flipkart', 'Nykaa', 'Decathlon', 'Croma'],
  entertainment: ['Netflix', 'Spotify', 'BookMyShow', 'Hotstar', 'YouTube Premium', 'PVR'],
  travel: ['MakeMyTrip', 'IRCTC', 'IndiGo', 'Goibibo', 'OYO'],
  health: ['Apollo Pharmacy', 'Practo', 'Cult.fit', 'Tata 1mg'],
  education: ['School fees', 'Byjus', 'Tuition UPI', 'Unacademy'],
  family: ['Transfer to Amma', 'Transfer to parents', 'Family UPI'],
  household: ['Maid salary UPI', 'Cook salary UPI', 'Urban Company'],
  insurance: ['LIC premium', 'Star Health premium', 'HDFC Life premium'],
  other: ['ATM withdrawal', 'UPI transfer', 'Misc'],
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// only these are worth suggesting a trim on - rent and school fees are not "leaks"
export const DISCRETIONARY = new Set(['foodDelivery', 'shopping', 'entertainment', 'travel', 'transport', 'other']);

// build 6 months of plausible transactions from a monthly budget + optional trends
export function generateTransactions(profile, monthsBack = 6) {
  const rand = mulberry32(hashString(`${profile.id}:txn`));
  const out = [];
  const now = new Date();
  const trends = profile.spendingTrends || {};
  for (let mi = monthsBack - 1; mi >= 0; mi--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - mi, 1);
    const age = monthsBack - 1 - mi; // 0 = oldest
    for (const [cat, amount] of Object.entries(profile.expenses)) {
      if (!amount) continue;
      // trend: expressed as total drift across the window, e.g. 0.3 = up 30% from oldest to newest month
      const drift = trends[cat] ? 1 - trends[cat] / 2 + (trends[cat] * age) / (monthsBack - 1) : 1;
      const monthTotal = amount * drift * (0.9 + rand() * 0.2);
      const fixed = ['rent', 'utilities', 'family', 'household', 'insurance', 'education'].includes(cat);
      const n = fixed ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 9);
      const weights = Array.from({ length: n }, () => 0.3 + rand());
      const wsum = weights.reduce((a, b) => a + b, 0);
      const names = MERCHANTS[cat] || MERCHANTS.other;
      weights.forEach((w) => {
        const day = 1 + Math.floor(rand() * 27);
        out.push({
          date: ymd(new Date(monthDate.getFullYear(), monthDate.getMonth(), day)),
          description: names[Math.floor(rand() * names.length)],
          amount: -Math.round((monthTotal * w) / wsum),
          category: cat,
          source: 'synthetic',
        });
      });
    }
    out.push({
      date: ymd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)),
      description: `Salary credit - ${profile.employer || 'Employer'}`,
      amount: profile.income.monthly,
      category: 'income',
      source: 'synthetic',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const RULES = Object.entries(MERCHANTS).flatMap(([cat, names]) => names.map((n) => [n.toLowerCase().split(' ')[0], cat]));
const EXTRA_RULES = [
  ['salary', 'income'],
  ['swiggy', 'foodDelivery'],
  ['zomato', 'foodDelivery'],
  ['dominos', 'foodDelivery'],
  ['starbucks', 'foodDelivery'],
  ['electricity', 'utilities'],
  ['broadband', 'utilities'],
  ['petrol', 'transport'],
  ['fuel', 'transport'],
  ['emi', 'loan'],
  ['sip', 'investment'],
  ['mutual fund', 'investment'],
  ['groww', 'investment'],
  ['zerodha', 'investment'],
  ['rent', 'rent'],
  ['pharmacy', 'health'],
  ['hospital', 'health'],
  ['school', 'education'],
  ['flight', 'travel'],
  ['hotel', 'travel'],
];

export function categorize(description = '') {
  const d = description.toLowerCase();
  for (const [kw, cat] of EXTRA_RULES) if (d.includes(kw)) return cat;
  for (const [kw, cat] of RULES) if (kw.length > 2 && d.includes(kw)) return cat;
  return 'other';
}

// Very forgiving CSV reader for bank statement exports: date, description, amount
// (or date, description, debit, credit). Quoted commas are handled; nothing fancier.
export function parseStatementCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0 };
  const split = (line) => {
    const cells = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => /date|desc|narration|amount|debit|credit/.test(h));
  const idx = (re, fallback) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const di = hasHeader ? idx(/date/, 0) : 0;
  const ni = hasHeader ? idx(/desc|narration|particular|remark/, 1) : 1;
  const ai = hasHeader ? idx(/^amount|amt/, -1) : 2;
  const dbi = hasHeader ? idx(/debit|withdraw/, -1) : -1;
  const cri = hasHeader ? idx(/credit|deposit/, -1) : -1;

  const rows = [];
  let skipped = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = split(line);
    const clean = (v) => Number(String(v ?? '').replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
    let amount;
    if (ai >= 0) amount = clean(c[ai]);
    else amount = (clean(c[cri]) || 0) - (clean(c[dbi]) || 0);
    const date = normalizeDate(c[di]);
    if (!date || !Number.isFinite(amount) || amount === 0) {
      skipped++;
      continue;
    }
    const description = c[ni] || 'Unknown';
    rows.push({ date, description, amount, category: amount > 0 && /salary|credit/i.test(description) ? 'income' : categorize(description), source: 'import' });
  }
  return { rows, skipped };
}

function normalizeDate(v) {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); // Indian banks: dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
}

export function analyzeSpending(profile, transactions) {
  const spend = transactions.filter((t) => t.amount < 0 && !['investment', 'loan'].includes(t.category));
  const months = [...new Set(spend.map((t) => t.date.slice(0, 7)))].sort();
  const byMonth = {};
  for (const t of spend) {
    const mk = t.date.slice(0, 7);
    byMonth[mk] ??= {};
    byMonth[mk][t.category] = (byMonth[mk][t.category] || 0) - t.amount;
  }
  const cats = [...new Set(spend.map((t) => t.category))];
  const income = profile.income.monthly;
  const half = Math.max(1, Math.floor(months.length / 2));
  const recent = months.slice(-half);
  const earlier = months.slice(0, months.length - half);

  const categories = cats
    .map((c) => {
      const avg = (list) => (list.length ? list.reduce((s, m) => s + (byMonth[m]?.[c] || 0), 0) / list.length : 0);
      const monthlyAvg = avg(months);
      const r = avg(recent);
      const e = avg(earlier);
      const change = e > 0 ? (r - e) / e : 0;
      const share = monthlyAvg / income;
      return {
        category: c,
        label: CATEGORY_LABELS[c] || c,
        monthlyAvg: Math.round(monthlyAvg),
        recentAvg: Math.round(r),
        change,
        share,
        benchmark: BENCHMARK_SHARE[c] ?? null,
        series: months.map((m) => Math.round(byMonth[m]?.[c] || 0)),
      };
    })
    .sort((x, y) => y.monthlyAvg - x.monthlyAvg);

  const flags = [];
  for (const c of categories) {
    if (c.change > 0.15 && c.monthlyAvg > 2000) {
      flags.push({ category: c.category, kind: 'rising', text: `${c.label} is up ${Math.round(c.change * 100)}% over the last ${half} months (₹${c.recentAvg.toLocaleString('en-IN')}/month now).` });
    }
    if (c.benchmark && c.share > c.benchmark * 1.25) {
      flags.push({ category: c.category, kind: 'high', text: `${c.label} takes ${(c.share * 100).toFixed(1)}% of take-home; most people in a similar bracket sit near ${(c.benchmark * 100).toFixed(0)}%.` });
    }
  }
  const subs = new Set(transactions.filter((t) => /netflix|spotify|hotstar|youtube|prime|zomato gold/i.test(t.description)).map((t) => t.description));
  if (subs.size >= 4) flags.push({ category: 'entertainment', kind: 'subscriptions', text: `${subs.size} different subscriptions showing up. Worth a 10-minute audit.` });

  return { months, categories, flags, totalMonthly: Math.round(categories.reduce((s, c) => s + c.monthlyAvg, 0)) };
}
