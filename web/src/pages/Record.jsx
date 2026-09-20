import { useState } from 'react';
import { api } from '../lib/api.js';
import { useQuery, Loading, ErrorNote } from '../components/bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';

const money = (n) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

/**
 * The suitability record, laid out the way somebody reviewing it two years later
 * would want to read it: what was advised, what else was on the table, and on
 * what basis - in that order.
 */
export default function Record({ householdId, assumptions, onBack }) {
  const { data, error, loading, refetch } = useQuery(cacheKeys.record(householdId, assumptions), () =>
    api.record(householdId, assumptions),
  );
  const [verify, setVerify] = useState(null);

  if (error) return <ErrorNote msg={error} onRetry={refetch} />;
  if (loading) return <Loading shape="page" label="Assembling the record" />;

  const r = data;
  const passed = r.checks.filter((c) => c.passed).length;

  const download = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suitability-${r.client.id}-${r.recommendation.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const check = async () => {
    setVerify({ state: 'checking' });
    try {
      setVerify({ state: 'done', ...(await api.verifyRecord(r)) });
    } catch (e) {
      setVerify({ state: 'done', valid: false, reason: e.message });
    }
  };

  return (
    <article className="record">
      <header className="rec-head">
        <div>
          <span className="caps">Suitability record · basis for advice</span>
          <h1>{r.client.name}</h1>
          <p className="muted small">
            {r.adviser?.name} · {r.adviser?.firm} · generated {new Date(r.generatedAt).toLocaleString('en-IN')} · engine {r.engineVersion}
          </p>
        </div>
        <div className="row">
          {onBack && (
            <button className="btn sm" onClick={onBack}>
              ← Book
            </button>
          )}
          <button className="btn sm" onClick={download}>
            Export JSON
          </button>
          <button className="btn sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <section className="card rec-section">
        <h2>Recommendation</h2>
        <p className="rec-title">{r.recommendation.title}</p>
        <p className="muted">{r.recommendation.summary}</p>
        <div className="impact" style={{ marginTop: 10 }}>
          <span className="m">
            <b>{r.recommendation.simulatedEffect}</b>
          </span>
          {r.recommendation.metrics.map((m) => (
            <span className="m muted" key={m}>
              {m}
            </span>
          ))}
        </div>
        <div className="cols3" style={{ marginTop: 14 }}>
          <div>
            <div className="caps">Why this household</div>
            <ul>
              {r.recommendation.rationale.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="caps">How it is implemented</div>
            <ul>
              {r.recommendation.implementation.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="caps">Stated caveats</div>
            <ul>
              {r.recommendation.caveats.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The clause firms usually cannot evidence, because the alternatives were
          never written down. Here they are the by-product of how the
          recommendation was ranked in the first place. */}
      <section className="card rec-section">
        <h2>Alternatives considered</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Each was applied to a copy of this household and the whole plan re-simulated before the recommendation above was chosen.
        </p>
        <table className="t">
          <thead>
            <tr>
              <th>Option</th>
              <th>Simulated effect</th>
              <th>Not chosen because</th>
            </tr>
          </thead>
          <tbody>
            {r.alternativesConsidered.map((alt) => (
              <tr key={alt.id}>
                <td>
                  <b>{alt.title}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {alt.confidence} confidence
                  </span>
                </td>
                <td className="small">
                  {alt.simulatedEffect}
                  {alt.metrics.map((m) => (
                    <span className="tiny muted" style={{ display: 'block' }} key={m}>
                      {m}
                    </span>
                  ))}
                </td>
                <td className="small muted">{alt.notChosenBecause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid g2 rec-section">
        <div className="card">
          <h2>Client circumstances relied on</h2>
          <table className="t">
            <tbody>
              <tr>
                <td>Age</td>
                <td className="r num">{r.client.age}</td>
              </tr>
              <tr>
                <td>Dependents</td>
                <td className="r num">{r.client.dependents}</td>
              </tr>
              <tr>
                <td>Stated risk profile</td>
                <td className="r">{r.client.statedRiskProfile}</td>
              </tr>
              <tr>
                <td>Monthly income</td>
                <td className="r num">{money(r.client.monthlyIncome)}</td>
              </tr>
              <tr>
                <td>Net worth</td>
                <td className="r num">{money(r.client.netWorth)}</td>
              </tr>
            </tbody>
          </table>
          <div className="caps" style={{ margin: '14px 0 6px' }}>
            Goals at the time of advice
          </div>
          <table className="t">
            <tbody>
              {r.client.goals.map((g) => (
                <tr key={g.name}>
                  <td>
                    {g.name} <span className="tiny muted">{g.priority}</span>
                  </td>
                  <td className="r num">{g.probabilityBefore == null ? '—' : `${Math.round(g.probabilityBefore * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Checks</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            {passed} of {r.checks.length} passed. A failed check is recorded, not suppressed.
          </p>
          {r.checks.map((c) => (
            <div className="checkrow" key={c.code}>
              <span className={`tick ${c.passed ? 'ok' : 'no'}`} aria-hidden="true">
                {c.passed ? '✓' : '✕'}
              </span>
              <span>
                <b className="small">{c.code}</b>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {c.requirement}
                </span>
                {c.detail && (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {c.detail}
                  </span>
                )}
              </span>
            </div>
          ))}
          <hr className="rule" />
          <div className="caps">Conflicts</div>
          <p className="small">{r.conflicts.statement}</p>
        </div>
      </section>

      <section className="card rec-section">
        <h2>Basis</h2>
        <p className="small">{r.basis.method}</p>
        <p className="small muted" style={{ marginTop: 6 }}>
          {r.basis.simulation.technique} {r.basis.simulation.paths} paths per household. {r.basis.simulation.seedPolicy}
        </p>
        <details className="trace" style={{ marginTop: 12 }}>
          <summary>Every assumption this projection depends on · {r.basis.assumptions.length}</summary>
          <table className="t" style={{ marginTop: 10 }}>
            <tbody>
              {r.basis.assumptions.map((x) => (
                <tr key={x.key}>
                  <td className="mono">{x.key}</td>
                  <td className="r num">{typeof x.value === 'number' && x.value < 1 && x.value > 0 ? `${(x.value * 100).toFixed(1)}%` : x.value}</td>
                  <td className="small muted">{x.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card rec-section">
        <h2>Integrity</h2>
        <p className="small muted">
          The record is digested when it is generated, so alteration afterwards is detectable. Verification recomputes the digest over the record
          as it stands.
        </p>
        <p className="mono small" style={{ marginTop: 8 }}>
          {r.integrity.algorithm}: {r.integrity.digest}
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={check} disabled={verify?.state === 'checking'}>
            {verify?.state === 'checking' ? 'Verifying…' : 'Verify this record'}
          </button>
          {verify?.state === 'done' && (
            <span className={`chip ${verify.valid ? 'good' : 'weak'}`}>{verify.reason}</span>
          )}
        </div>
      </section>

      <section className="rec-section">
        <div className="caps">Limitations</div>
        <ul className="small muted">
          {r.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="caps" style={{ marginTop: 14 }}>
          Regulatory context
        </div>
        <ul className="small muted">
          {r.regulatoryContext.map((x) => (
            <li key={x.regime}>
              <b>{x.regime}</b> — {x.provision}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
