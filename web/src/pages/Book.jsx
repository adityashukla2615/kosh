import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useQuery, ErrorNote } from '../components/bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';

const cr = (n) => `₹${(n / 1e7).toFixed(n >= 1e9 ? 0 : 1)} Cr`;
const money = (n) => (Math.abs(n) >= 1e7 ? cr(n) : `₹${(n / 1e5).toFixed(1)} L`);

const SEVERITY = (s) => (s >= 0.6 ? 'weak' : s >= 0.3 ? 'watch' : '');

export default function Book({ meta, assumptions, onOpenHousehold }) {
  const { data, error, loading, refetch } = useQuery(cacheKeys.book(assumptions), () => api.book(assumptions));
  const [open, setOpen] = useState(null);

  if (error) return <ErrorNote msg={error} onRetry={refetch} />;
  // Default assumptions are screened at build time and arrive immediately.
  // Changing one is a real question the engine has not answered yet, so say so
  // and show it working rather than showing a skeleton for forty seconds.
  if (loading) return <Screening assumptions={assumptions} />;

  const { stats, structural, queue, byFlag, bySegment, computeMs, precomputed } = data;
  const adviser = meta?.adviser;

  return (
    <div className="book">
      <header className="book-head">
        <div>
          <span className="caps">Adviser book{adviser ? ` · ${adviser.firm}` : ''}</span>
          <h1>{adviser?.name || 'Your book'}</h1>
          <p className="muted">
            {stats.households} households · {money(stats.assetsUnderAdvice)} under advice · median household {money(stats.medianNetWorth)}
          </p>
        </div>
        <div className="compute" title="Every household in this book was simulated to produce this page.">
          <span className="num">{stats.simulationsRun.toLocaleString('en-IN')}</span>
          <span className="tiny muted">
            market paths · {stats.pathsPerHousehold} per household ·{' '}
            {precomputed ? `screened at build in ${(computeMs / 1000).toFixed(1)}s` : `screened in ${(computeMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      </header>

      {/* Base rates first, stated once. These are the conversations for the
          quarter; the queue below is the work for the week. */}
      <section className="stack" style={{ marginBottom: 26 }}>
        <h2 className="sec">True of this book</h2>
        <div className="grid g3">
          {structural.map((s) => (
            <div className="card structural" key={s.code}>
              <b>{s.headline}</b>
              <p className="small muted">{s.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="spread sec-head">
          <h2 className="sec">This week</h2>
          <span className="small muted">
            {stats.queueSize} of {stats.flagged} flagged. Ranked by severity of the worst finding, then by what else is stacked behind it.
          </span>
        </div>

        <div className="card queue">
          {queue.map((row) => {
            const isOpen = open === row.id;
            return (
              <div className={`qrow ${isOpen ? 'open' : ''}`} key={row.id}>
                <button className="qmain" onClick={() => setOpen(isOpen ? null : row.id)} aria-expanded={isOpen}>
                  <span className="rank num">{row.rank}</span>
                  <span className="who">
                    <b>{row.name}</b>
                    <span className="tiny muted">
                      {row.segmentLabel} · {row.age} · {row.city}
                      {row.dependents ? ` · ${row.dependents} dependent${row.dependents > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                  <span className="worth num">{money(row.netWorth)}</span>
                  <span className="flagchips">
                    {row.flags.slice(0, 3).map((f) => (
                      <span className={`chip ${SEVERITY(f.severity)}`} key={f.code}>
                        {f.label}
                      </span>
                    ))}
                    {row.flags.length > 3 && <span className="chip">+{row.flags.length - 3}</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className="qdetail">
                    {row.flags.map((f) => (
                      <div className="finding" key={f.code}>
                        <div className="spread">
                          <b>
                            {f.label} — {f.headline}
                          </b>
                          <span className="tiny muted">severity {Math.round(f.severity * 100)}</span>
                        </div>
                        <p className="small">{f.detail}</p>
                        <p className="tiny muted">Basis: {f.basis}</p>
                      </div>
                    ))}
                    <div className="row" style={{ marginTop: 12 }}>
                      <button className="btn primary sm" onClick={() => onOpenHousehold(row)}>
                        Open this household →
                      </button>
                      <a className="btn sm" href={`#/record/${row.id}`}>
                        Suitability record
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid g2" style={{ marginTop: 26 }}>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Findings across the book</h3>
          <table className="t">
            <thead>
              <tr>
                <th>Finding</th>
                <th className="r">Households</th>
                <th className="r">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {byFlag.map((f) => (
                <tr key={f.code}>
                  <td>{f.label}</td>
                  <td className="r num">{f.households}</td>
                  <td className="r num muted">{f.exposure ? money(f.exposure) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Exposure is only summed where it means something: uncovered life cover, and interest running on high-rate debt.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>By segment</h3>
          <table className="t">
            <thead>
              <tr>
                <th>Segment</th>
                <th className="r">Households</th>
                <th className="r">Assets</th>
                <th className="r">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {bySegment.map((s) => (
                <tr key={s.segment}>
                  <td>{s.segment}</td>
                  <td className="r num">{s.households}</td>
                  <td className="r num">{money(s.assets)}</td>
                  <td className="r num muted">{s.needingAttention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="foot-note">
        Every household here is synthetic and generated from a fixed seed, so this book is the same book on every run. The screening is the same
        engine the household pages use — no separate model, no scoring shortcut.
      </p>
    </div>
  );
}

/** Progress for a screening the engine is genuinely running now. */
function Screening({ assumptions }) {
  const [p, setP] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.bookStatus(assumptions);
        if (alive) setP(s);
      } catch {
        /* the book request itself reports failure; this is only the commentary */
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [assumptions]);

  const done = p?.done ?? 0;
  const total = p?.total ?? 0;
  const share = total ? done / total : 0;

  return (
    <div className="card stack screening" aria-live="polite">
      <b>Re-screening the book on your assumptions</b>
      <p className="small muted">
        Every household is being simulated again. Nothing is cached for assumptions the engine has not seen before, which is the point of being
        able to change them.
      </p>
      <div className="bar" style={{ height: 8 }}>
        <i style={{ width: `${Math.max(3, share * 100)}%` }} />
      </div>
      <span className="small muted num">
        {total ? `${done} of ${total} households` : 'starting…'}
      </span>
    </div>
  );
}
