import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { inr, pct } from '../lib/format.js';
import { useQuery, Loading, ErrorNote, PageHead } from '../components/bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';
import { invalidate } from '../lib/query.js';

function Spark({ values }) {
  const max = Math.max(...values, 1);
  const w = 90;
  const h = 24;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#1f5c4a" strokeWidth="1.5" />
    </svg>
  );
}

export default function Spending({ profileId }) {
  const { data, error, loading, refetch } = useQuery(cacheKeys.spending(profileId), () => api.spending(profileId));
  const [msg, setMsg] = useState(null);
  const fileRef = useRef();

  const upload = async (file) => {
    if (!file) return;
    setMsg(null);
    try {
      const text = await file.text();
      const r = await api.importCsv(profileId, text);
      setMsg({ ok: true, text: `Read ${r.imported} transactions${r.skipped ? ` (skipped ${r.skipped} rows we couldn't parse)` : ''}. Everything on this page and in your plan now uses them.` });
      invalidate(`overview:${profileId}`);
      invalidate(`actions:${profileId}`);
      refetch();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    fileRef.current.value = '';
  };

  const reset = async () => {
    await api.clearImport(profileId);
    setMsg(null);
    invalidate(`overview:${profileId}`);
    invalidate(`actions:${profileId}`);
    refetch();
  };

  if (error) return <ErrorNote msg={error} onRetry={refetch} />;
  if (loading) return <Loading shape="list" label="Reading your transactions" />;

  const maxAvg = Math.max(...data.categories.map((c) => c.monthlyAvg), 1);

  return (
    <div>
      <PageHead
        title="Spending"
        sub={`Average of the last ${data.months.length} months, from ${data.source === 'import' ? 'your uploaded statement' : 'sample UPI and card transactions'}. Flags are nudges, not judgements.`}
        right={
          <div className="row">
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => upload(e.target.files[0])} />
            <button className="btn" onClick={() => fileRef.current.click()}>
              Upload bank statement (CSV)
            </button>
            {data.source === 'import' && (
              <button className="btn ghost" onClick={reset}>
                Back to sample data
              </button>
            )}
          </div>
        }
      />
      {msg && (
        <div className={`banner ${msg.ok ? '' : 'err'}`} style={{ marginBottom: 14 }}>
          {msg.text}
        </div>
      )}

      <div className="grid g-main">
        <div className="card">
          <div className="card-head">
            <h2>{inr(data.totalMonthly)} a month</h2>
            <span className="small muted">last {data.months.length} months →</span>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Category</th>
                <th className="r">Avg / month</th>
                <th style={{ width: '32%' }} />
                <th className="r">Trend</th>
                <th className="r">Change</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.label}</td>
                  <td className="r num">{inr(c.monthlyAvg, { short: false })}</td>
                  <td>
                    <div className="bar">
                      <i style={{ width: `${(c.monthlyAvg / maxAvg) * 100}%` }} />
                    </div>
                  </td>
                  <td className="r">
                    <Spark values={c.series} />
                  </td>
                  <td className={`r small ${c.change > 0.15 ? 'delta-down' : c.change < -0.1 ? 'delta-up' : 'muted'}`}>{c.change ? `${c.change > 0 ? '+' : ''}${pct(c.change)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stack-lg">
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Worth a look</h3>
            {data.flags.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
                {data.flags.map((f) => (
                  <li key={f.text}>{f.text}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing unusual. Spending looks steady.</p>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Try it with your own statement</h3>
            <p className="small muted">
              Export a CSV from your bank (date, description, amount - or debit/credit columns). We categorise each line with simple merchant rules; nothing is
              sent anywhere else. <a href="/statement.csv" download>Sample file</a>
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Recent transactions</h3>
        <table className="t">
          <tbody>
            {data.recent.slice(0, 15).map((t, i) => (
              <tr key={i}>
                <td className="mono muted" style={{ width: 110 }}>
                  {t.date}
                </td>
                <td>{t.description}</td>
                <td className="small muted">{t.category}</td>
                <td className={`r num ${t.amount > 0 ? 'delta-up' : ''}`}>{inr(t.amount, { short: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
