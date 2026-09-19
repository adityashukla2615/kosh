import { useState } from 'react';
import { PageHead } from '../components/bits.jsx';

// percent-ish keys are shown as % in the UI, stored as fractions
const AS_PCT = (k) => /^(inflation|educationInflation|salaryGrowth|propertyGrowth|returns\.|volatility\.|retirementLifestyle|surplusLeakage)/.test(k);

const LABELS = {
  inflation: 'Inflation',
  educationInflation: 'Education inflation',
  salaryGrowth: 'Salary growth',
  propertyGrowth: 'Property value growth',
  'returns.equity': 'Equity return',
  'returns.debt': 'Debt return',
  'returns.gold': 'Gold return',
  'returns.cash': 'Savings account return',
  'volatility.equity': 'Equity swings (volatility)',
  'volatility.debt': 'Debt swings',
  'volatility.gold': 'Gold swings',
  'volatility.cash': 'Cash swings',
  emergencyMonths: 'Emergency cushion (months)',
  termCoverMultiple: 'Life cover (× yearly income)',
  healthCoverMin: 'Minimum health cover (₹)',
  retirementMultiple: 'Retirement corpus (× yearly expenses)',
  retirementLifestyle: 'Spending after retirement',
  surplusLeakage: 'Unplanned surplus that gets spent',
  simulations: 'Simulated futures per calculation',
};

function getIn(obj, key) {
  const [a, b] = key.split('.');
  return b ? obj?.[a]?.[b] : obj?.[a];
}

function setIn(obj, key, val) {
  const [a, b] = key.split('.');
  const next = { ...obj };
  if (b) {
    next[a] = { ...(next[a] || {}), [b]: val };
    if (val == null) delete next[a][b];
    if (!Object.keys(next[a]).length) delete next[a];
  } else if (val == null) delete next[a];
  else next[a] = val;
  return next;
}

export default function Assumptions({ meta, assumptions, setAssumptions }) {
  const rows = meta?.assumptions?.rows || [];
  const [draft, setDraft] = useState(assumptions);
  const dirty = JSON.stringify(draft) !== JSON.stringify(assumptions);

  const display = (k, v) => (AS_PCT(k) ? +(v * 100).toFixed(2) : v);
  const parse = (k, v) => (v === '' ? null : AS_PCT(k) ? Number(v) / 100 : Number(v));

  return (
    <div>
      <PageHead
        title="Assumptions"
        sub="Every projection in Kosh rests on these numbers. They're reasonable long-run figures for India, not predictions. Change any of them and every page recalculates."
        right={
          <div className="row">
            {Object.keys(assumptions).length > 0 && (
              <button
                className="btn"
                onClick={() => {
                  setDraft({});
                  setAssumptions({});
                }}
              >
                Reset to defaults
              </button>
            )}
            <button className="btn primary" disabled={!dirty} onClick={() => setAssumptions(draft)}>
              Apply
            </button>
          </div>
        }
      />
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Assumption</th>
              <th className="r">Value</th>
              <th>Why this number</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const override = getIn(draft, r.key);
              const val = override ?? r.value;
              return (
                <tr key={r.key}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{LABELS[r.key] || r.key}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <input
                      className={`inline-input ${override != null ? 'changed' : ''}`}
                      type="number"
                      step="any"
                      value={display(r.key, val)}
                      onChange={(e) => {
                        const v = parse(r.key, e.target.value);
                        setDraft((d) => setIn(d, r.key, v == null || v === r.value ? null : v));
                      }}
                    />
                    <span className="small muted" style={{ marginLeft: 4, display: 'inline-block', width: 12 }}>
                      {AS_PCT(r.key) ? '%' : ''}
                    </span>
                  </td>
                  <td className="small muted">{r.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        Returns are nominal, before tax. Probabilities come from a Monte Carlo simulation with normally distributed log-returns - real markets have fatter tails
        than that, which is one more reason we plan for 80% odds rather than 50%.
      </p>
    </div>
  );
}
