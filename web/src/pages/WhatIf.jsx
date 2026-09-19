import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { inr, pct, signed } from '../lib/format.js';
import { Loading, ErrorNote, PageHead, ProbBar } from '../components/bits.jsx';
import FanChart from '../components/FanChart.jsx';

const Y = new Date().getFullYear();

const PRESETS = [
  { label: 'Invest ₹5,000 more', s: { extraMonthly: 5000 } },
  { label: '10% yearly step-up', s: { stepUpPct: 10 } },
  { label: 'Automate the surplus', s: { sweepSurplusPct: 60 } },
  { label: 'Lose my job for 6 months', s: { jobLossMonths: 6 } },
  { label: 'Market falls 30%', s: { marketShockPct: 30 } },
  { label: 'Buy a ₹10 L car next year', s: { bigPurchase: { label: 'Car', amount: 1000000, inYears: 1 } } },
  { label: 'Retire 2 years later', s: { retireAgeDelta: 2 } },
];

const ORDER = ['extraMonthly', 'stepUpPct', 'sweepSurplusPct', 'incomeChangePct', 'expenseChangePct', 'jobLossMonths', 'marketShockPct', 'moveIdleCash', 'retireAgeDelta'];

const fmtLever = (k, v, unit) => {
  if (unit?.startsWith('₹')) return v ? inr(v) : '₹0';
  if (k === 'retireAgeDelta') return v ? `${v > 0 ? '+' : ''}${v} yrs` : 'no change';
  if (k === 'jobLossMonths') return v ? `${v} months` : 'none';
  return `${v > 0 && /Change/.test(k) ? '+' : ''}${v}%`;
};

export default function WhatIf({ profileId, meta, assumptions, pendingScenario, clearPendingScenario }) {
  const [s, setS] = useState(() => pendingScenario || {});
  const [purchase, setPurchase] = useState(() => pendingScenario?.bigPurchase || null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef();

  useEffect(() => {
    if (pendingScenario) clearPendingScenario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scenario = useMemo(() => ({ ...s, bigPurchase: purchase && purchase.amount > 0 ? purchase : null }), [s, purchase]);

  // debounce so dragging a slider doesn't fire 40 simulations
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setRes(await api.simulate(profileId, scenario, assumptions));
        setErr(null);
      } catch (e) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [profileId, scenario, assumptions]);

  const levers = meta?.levers || {};
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const reset = () => {
    setS({});
    setPurchase(null);
  };
  const applyPreset = (p) => {
    setS({ ...p.s, bigPurchase: undefined });
    setPurchase(p.s.bigPurchase || null);
  };
  const touched = Object.values(s).some((v) => v) || purchase;

  return (
    <div>
      <PageHead title="What if…" sub="Move a lever and the whole plan re-runs: every goal, the health score and the wealth projection. Same random markets for both lines, so differences are the change, not noise." right={touched && <button className="btn" onClick={reset}>Reset</button>} />

      <div className="presets" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="chip btnlike" onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid g-side">
        <div className="card levers">
          {ORDER.filter((k) => levers[k]).map((k) => {
            const L = levers[k];
            const v = s[k] || 0;
            const max = k === 'moveIdleCash' ? 2000000 : L.max;
            return (
              <div className="lever" key={k}>
                <label>
                  <span>{L.label}</span>
                  <b>{fmtLever(k, v, L.unit)}</b>
                </label>
                <input type="range" min={L.min} max={max} step={k === 'moveIdleCash' ? 25000 : L.step} value={v} onChange={(e) => set(k, Number(e.target.value))} />
              </div>
            );
          })}
          <hr className="rule" />
          <div className="lever">
            <label>
              <span>One-off purchase</span>
              <b>{purchase?.amount ? inr(purchase.amount) : 'none'}</b>
            </label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <input className="inline-input" style={{ width: '100%', textAlign: 'left', fontFamily: 'var(--sans)' }} placeholder="What" value={purchase?.label || ''} onChange={(e) => setPurchase((p) => ({ inYears: 1, amount: 0, ...p, label: e.target.value }))} />
              <input className="inline-input" style={{ width: '100%' }} type="number" placeholder="₹" value={purchase?.amount || ''} onChange={(e) => setPurchase((p) => ({ label: 'Purchase', inYears: 1, ...p, amount: Number(e.target.value) }))} />
              <select className="inline-input" style={{ width: '100%' }} value={purchase?.inYears ?? 1} onChange={(e) => setPurchase((p) => ({ label: 'Purchase', amount: 0, ...p, inYears: Number(e.target.value) }))}>
                {[0, 1, 2, 3, 4, 5, 7, 10].map((y) => (
                  <option key={y} value={y}>
                    {y === 0 ? 'now' : `${Y + y}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="stack-lg">
          {err && <ErrorNote msg={err} />}
          {!res ? (
            <Loading h={360} />
          ) : (
            <>
              <div className="card" style={{ opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
                <div className="card-head">
                  <h2>{touched ? 'What changes' : 'Your plan as it stands'}</h2>
                  {touched && (
                    <div className="row small">
                      <span className="row" style={{ gap: 4 }}>
                        <i style={{ width: 14, borderTop: '2px dashed #1f5c4a' }} /> now
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <i style={{ width: 14, borderTop: '2px solid #2c5a85' }} /> with change
                      </span>
                    </div>
                  )}
                </div>
                {touched && res.narrative.length > 0 && (
                  <ul className="narr" style={{ listStyle: 'none', margin: '0 0 14px' }}>
                    {res.narrative.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                    {res.notes?.map((n) => (
                      <li key={n} className="muted">
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
                <FanChart series={res.baseline.projection.series} compare={touched ? res.scenario.projection.series : null} payouts={res.scenario.projection.payouts} />
              </div>

              <div className="grid g2">
                <div className="card">
                  <h3 style={{ marginBottom: 10 }}>Goal odds</h3>
                  <div className="stack">
                    {res.deltas.goals.map((g) => (
                      <div key={g.id}>
                        <div className="spread small" style={{ marginBottom: 3 }}>
                          <span>{g.name}</span>
                          {g.delta != null && Math.abs(g.delta) >= 0.01 && <span className={g.delta > 0 ? 'delta-up' : 'delta-down'}>{signed(Math.round(g.delta * 100), (x) => `${x} pts`)}</span>}
                          {g.synthetic && <span className="chip">new</span>}
                        </div>
                        <ProbBar value={g.after} before={g.before} />
                      </div>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    Black tick = before.
                  </p>
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: 10 }}>Other numbers</h3>
                  <table className="t">
                    <tbody>
                      <Row label="Health score" a={res.baseline.health.score} b={res.scenario.health.score} f={(x) => x} />
                      <Row label="Left over each month" a={res.baseline.summary.surplus} b={res.scenario.summary.surplus} f={inr} />
                      <Row label="Monthly SIPs" a={res.baseline.summary.sip} b={res.scenario.summary.sip} f={inr} />
                      <Row label="Emergency runway" a={res.baseline.summary.emergencyMonths} b={res.scenario.summary.emergencyMonths} f={(x) => `${x.toFixed(1)} mo`} />
                      <Row label={`Middle-case wealth, ${res.scenario.projection.final.year}`} a={res.baseline.projection.final.p50} b={res.scenario.projection.final.p50} f={inr} />
                      <Row label="Chance of running out" a={res.baseline.projection.probRanOut} b={res.scenario.projection.probRanOut} f={(x) => pct(x)} lowerIsBetter />
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, a, b, f, lowerIsBetter }) {
  const d = b - a;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <tr>
      <td>{label}</td>
      <td className="r num muted">{f(a)}</td>
      <td className="r num" style={{ color: Math.abs(d) < 1e-6 ? undefined : good ? 'var(--green)' : 'var(--red)' }}>
        {f(b)}
      </td>
    </tr>
  );
}
