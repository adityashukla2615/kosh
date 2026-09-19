import { useState } from 'react';
import { api } from '../lib/api.js';
import { inr } from '../lib/format.js';

const Y = new Date().getFullYear();

const QUESTIONS = [
  { key: 'horizon', q: 'When will you need most of this money?', opts: [['short', 'Within 3 years'], ['medium', '3 to 8 years'], ['long', '8+ years']] },
  { key: 'drop20', q: 'Your investments fall 20% in a month. You…', opts: [['sell', 'Sell before it gets worse'], ['wait', 'Stop adding, wait'], ['hold', 'Hold and keep SIPs going'], ['buy', 'Invest more while it’s cheap']] },
  { key: 'experience', q: 'Have you invested in equity/mutual funds before?', opts: [['none', 'Not really'], ['some', 'A few years of SIPs'], ['lots', 'Yes, through ups and downs']] },
  { key: 'incomeStability', q: 'How steady is your income?', opts: [['unstable', 'Irregular'], ['variable', 'Mostly steady, some variable'], ['stable', 'Salaried & steady']] },
  { key: 'priority', q: 'What matters more to you?', opts: [['safety', 'Not losing money'], ['balance', 'A bit of both'], ['growth', 'Growing it, even with swings']] },
];

const EXPENSES = [
  ['rent', 'Rent'],
  ['groceries', 'Groceries'],
  ['foodDelivery', 'Eating out / delivery'],
  ['transport', 'Transport & fuel'],
  ['utilities', 'Bills & utilities'],
  ['shopping', 'Shopping'],
  ['education', 'School fees'],
  ['family', 'Family support'],
  ['other', 'Everything else'],
];

const ASSETS = [
  ['savingsAccount', 'Savings account'],
  ['fixedDeposits', 'Fixed deposits'],
  ['equityFunds', 'Equity mutual funds'],
  ['directStocks', 'Stocks'],
  ['epf', 'EPF balance'],
  ['ppf', 'PPF'],
  ['nps', 'NPS'],
  ['gold', 'Gold'],
  ['realEstate', 'Property (value)'],
];

function Num({ label, value, onChange, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
      {hint && <span className="tiny muted">{hint}</span>}
    </label>
  );
}

export default function Onboarding({ onDone, onBack }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({
    name: '',
    age: 30,
    city: '',
    dependents: 0,
    monthlyIncome: '',
    annualBonus: '',
    sip: '',
    epfMonthly: '',
    expenses: {},
    assets: {},
    liabilities: [{ type: 'Home loan', outstanding: '', rate: 8.5, emi: '' }],
    insurance: { termCover: '', healthCover: '', employerHealthOnly: false },
    goals: [
      { name: 'House down payment', type: 'home', target: '', year: Y + 6, priority: 'important' },
      { name: 'Retirement', type: 'retirement', retireAge: 60, priority: 'essential' },
    ],
    riskAnswers: {},
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setIn = (k, sub, v) => setF((s) => ({ ...s, [k]: { ...s[k], [sub]: v } }));
  const totalExp = Object.values(f.expenses).reduce((a, b) => a + (Number(b) || 0), 0);

  const steps = [
    {
      title: 'The basics',
      body: (
        <div className="grid g2">
          <label className="field">
            <span>What should we call you?</span>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="First name is enough" />
          </label>
          <Num label="Age" value={f.age} onChange={(v) => set('age', v)} />
          <label className="field">
            <span>City</span>
            <input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Optional" />
          </label>
          <Num label="People who depend on your income" value={f.dependents} onChange={(v) => set('dependents', v)} hint="Spouse without income, kids, parents you support" />
        </div>
      ),
      ok: () => f.age > 17,
    },
    {
      title: 'Money in, money out',
      body: (
        <div className="stack-lg">
          <div className="grid g2">
            <Num label="Take-home pay per month (₹)" value={f.monthlyIncome} onChange={(v) => set('monthlyIncome', v)} hint="After tax & PF, what hits your account" />
            <Num label="Yearly bonus (₹)" value={f.annualBonus} onChange={(v) => set('annualBonus', v)} />
            <Num label="Current SIPs per month (₹)" value={f.sip} onChange={(v) => set('sip', v)} />
            <Num label="EPF contribution per month (₹)" value={f.epfMonthly} onChange={(v) => set('epfMonthly', v)} hint="Yours + employer’s, from the payslip" />
          </div>
          <div>
            <div className="spread">
              <span className="caps">Monthly spending</span>
              <span className="small muted">Total {inr(totalExp)}</span>
            </div>
            <div className="grid g3" style={{ marginTop: 8 }}>
              {EXPENSES.map(([k, l]) => (
                <Num key={k} label={l} value={f.expenses[k]} onChange={(v) => setIn('expenses', k, v)} />
              ))}
            </div>
          </div>
        </div>
      ),
      ok: () => Number(f.monthlyIncome) > 0,
    },
    {
      title: 'What you own and owe',
      body: (
        <div className="stack-lg">
          <div className="grid g3">
            {ASSETS.map(([k, l]) => (
              <Num key={k} label={`${l} (₹)`} value={f.assets[k]} onChange={(v) => setIn('assets', k, v)} />
            ))}
          </div>
          <div>
            <span className="caps">Loans</span>
            {f.liabilities.map((l, i) => (
              <div className="grid g3" key={i} style={{ gridTemplateColumns: '1.2fr 1fr 0.7fr 1fr', marginTop: 8 }}>
                <label className="field">
                  <span>Type</span>
                  <select value={l.type} onChange={(e) => set('liabilities', f.liabilities.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                    {['Home loan', 'Car loan', 'Personal loan', 'Education loan', 'Credit card balance'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <Num label="Outstanding (₹)" value={l.outstanding} onChange={(v) => set('liabilities', f.liabilities.map((x, j) => (j === i ? { ...x, outstanding: v } : x)))} />
                <Num label="Rate %" value={l.rate} onChange={(v) => set('liabilities', f.liabilities.map((x, j) => (j === i ? { ...x, rate: v } : x)))} />
                <Num label="EMI (₹)" value={l.emi} onChange={(v) => set('liabilities', f.liabilities.map((x, j) => (j === i ? { ...x, emi: v } : x)))} />
              </div>
            ))}
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => set('liabilities', [...f.liabilities, { type: 'Personal loan', outstanding: '', rate: 14, emi: '' }])}>
              + another loan
            </button>
          </div>
          <div className="grid g3">
            <Num label="Life (term) cover (₹)" value={f.insurance.termCover} onChange={(v) => setIn('insurance', 'termCover', v)} />
            <Num label="Health cover (₹)" value={f.insurance.healthCover} onChange={(v) => setIn('insurance', 'healthCover', v)} />
            <label className="field">
              <span>Health cover is only from employer?</span>
              <select value={f.insurance.employerHealthOnly ? 'y' : 'n'} onChange={(e) => setIn('insurance', 'employerHealthOnly', e.target.value === 'y')}>
                <option value="n">No, I have my own</option>
                <option value="y">Yes, only employer</option>
              </select>
            </label>
          </div>
        </div>
      ),
      ok: () => true,
    },
    {
      title: 'What you’re saving for',
      body: (
        <div className="stack">
          {f.goals.map((g, i) => (
            <div className="grid" key={i} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto', alignItems: 'end' }}>
              <label className="field">
                <span>Goal</span>
                <input value={g.name} onChange={(e) => set('goals', f.goals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              </label>
              {g.type === 'retirement' ? (
                <>
                  <Num label="Retire at age" value={g.retireAge} onChange={(v) => set('goals', f.goals.map((x, j) => (j === i ? { ...x, retireAge: v } : x)))} />
                  <span className="small muted" style={{ paddingBottom: 8 }}>
                    We size this from your spending
                  </span>
                </>
              ) : (
                <>
                  <Num label="Cost today (₹)" value={g.target} onChange={(v) => set('goals', f.goals.map((x, j) => (j === i ? { ...x, target: v } : x)))} />
                  <Num label="Year" value={g.year} onChange={(v) => set('goals', f.goals.map((x, j) => (j === i ? { ...x, year: v } : x)))} />
                </>
              )}
              <label className="field">
                <span>Priority</span>
                <select value={g.priority} onChange={(e) => set('goals', f.goals.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}>
                  <option value="essential">Must-have</option>
                  <option value="important">Important</option>
                  <option value="nice">Nice to have</option>
                </select>
              </label>
              {g.type !== 'retirement' ? (
                <button className="btn ghost sm" onClick={() => set('goals', f.goals.filter((_, j) => j !== i))} title="Remove">
                  ✕
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('goals', [...f.goals, { name: '', type: 'other', target: '', year: Y + 3, priority: 'important' }])}>
            + add a goal
          </button>
        </div>
      ),
      ok: () => true,
    },
    {
      title: 'How you feel about risk',
      body: (
        <div className="stack-lg">
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>{q.q}</div>
              <div className="row wrap">
                {q.opts.map(([v, l]) => (
                  <button key={v} className={`chip btnlike ${f.riskAnswers[q.key] === v ? 'good' : ''}`} onClick={() => setIn('riskAnswers', q.key, v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
      ok: () => Object.keys(f.riskAnswers).length >= 3,
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { profile } = await api.createProfile({ ...f, name: f.name || 'You' });
      onDone(profile);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome" style={{ maxWidth: 860 }}>
      <button className="btn ghost sm" onClick={onBack}>
        ← back
      </button>
      <div className="steps-nav" style={{ marginTop: 16 }}>
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="caps">
        Step {step + 1} of {steps.length}
      </div>
      <h1 style={{ margin: '6px 0 20px' }}>{s.title}</h1>
      <div className="card">{s.body}</div>
      {err && (
        <div className="banner err" style={{ marginTop: 12 }}>
          {err}
        </div>
      )}
      <div className="spread" style={{ marginTop: 18 }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        {last ? (
          <button className="btn primary" disabled={!s.ok() || busy} onClick={submit}>
            {busy ? 'Building your plan…' : 'Build my plan'}
          </button>
        ) : (
          <button className="btn primary" disabled={!s.ok()} onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
