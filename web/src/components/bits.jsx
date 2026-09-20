import { useEffect, useReducer, useRef, useState } from 'react';
import { inr, pct, STATUS_LABEL, PRIORITY_LABEL } from '../lib/format.js';
import { fetchQuery, _cache, _subscribe } from '../lib/query.js';

/**
 * Read a cached query. Returns cached data immediately when there is any, and
 * refreshes in the background - so moving between pages is instant after the
 * first visit, and a failed refresh leaves the last good numbers on screen
 * rather than blanking them.
 */
export function useQuery(key, fn) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const off = _subscribe(key, rerender);
    fetchQuery(key, () => fnRef.current()).catch(() => {});
    return off;
  }, [key]);

  const entry = _cache.get(key) || {};
  const hasData = entry.data !== undefined;
  return {
    data: entry.data ?? null,
    // A stale-but-present payload beats an error banner; only surface the error
    // when we have nothing to show.
    error: hasData ? null : entry.error?.message ?? null,
    loading: !hasData && !entry.error,
    revalidating: !!entry.promise && hasData,
    refetch: () => fetchQuery(key, () => fnRef.current(), { force: true }).catch(() => {}),
  };
}

/**
 * Skeletons shaped like the page they stand in for, so nothing jumps when the
 * real content lands. `shape` names the layout, not a pixel height.
 */
export function Loading({ shape = 'page', label }) {
  const bar = (h, w = '100%') => <div className="skeleton" style={{ height: h, width: w }} />;
  return (
    <div className="stack-lg loading-shape" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label || 'Loading'}</span>
      {shape === 'overview' && (
        <>
          <div className="stack" style={{ gap: 8 }}>
            {bar(13, 180)}
            {bar(30, '62%')}
          </div>
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <div className="kpi stack" key={i} style={{ gap: 8 }}>
                {bar(11, 84)}
                {bar(26, 110)}
                {bar(11, 132)}
              </div>
            ))}
          </div>
          <div className="grid g-main">
            <div className="card stack">
              {bar(18, 200)}
              {bar(260)}
            </div>
            <div className="card stack">
              {bar(18, 140)}
              {bar(56, 120)}
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="stack" style={{ gap: 6 }}>
                  {bar(12, `${70 - i * 6}%`)}
                  {bar(6)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {shape === 'list' && (
        <>
          {bar(30, '46%')}
          {[0, 1, 2].map((i) => (
            <div className="card stack" key={i}>
              {bar(16, '40%')}
              {bar(12, '72%')}
              {bar(10)}
            </div>
          ))}
        </>
      )}
      {shape === 'page' && (
        <>
          {bar(30, '46%')}
          <div className="card stack">
            {bar(16, '36%')}
            {bar(220)}
          </div>
        </>
      )}
    </div>
  );
}

export function ErrorNote({ msg, onRetry }) {
  return (
    <div className="banner err spread" role="alert">
      <span>{msg}</span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Quiet marker that cached numbers are being refreshed behind the scenes. */
export function Revalidating({ on }) {
  return on ? (
    <span className="revalidating" aria-hidden="true">
      <i />
      Recalculating
    </span>
  ) : null;
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const probColor = (p) => (p >= 0.8 ? 'var(--green-2)' : p >= 0.55 ? '#c8913a' : '#c0664f');

export function ProbBar({ value, before, showLine = true }) {
  return (
    <div className="prob">
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(2, value * 100)}%`, background: probColor(value) }} />
        {showLine && <div className="line80" title="80% - our 'comfortable' line" />}
        {before != null && Math.abs(before - value) > 0.005 && <div className="ghost" style={{ left: `${before * 100}%` }} title={`Before: ${pct(before)}`} />}
      </div>
      <span className="val">{pct(value)}</span>
    </div>
  );
}

export function StatusChip({ status }) {
  return <span className={`chip ${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function PriorityChip({ priority }) {
  return <span className="chip">{PRIORITY_LABEL[priority] || priority}</span>;
}

const MIX_COLORS = { equity: '#1f5c4a', debt: '#9fb8ad', gold: '#c8a24a', cash: '#d9d2c3' };
export function MixBar({ mix }) {
  const parts = Object.entries(mix || {}).filter(([, v]) => v > 0.005);
  return (
    <div>
      <div className="mixbar">
        {parts.map(([k, v]) => (
          <i key={k} style={{ width: `${v * 100}%`, background: MIX_COLORS[k] }} title={`${k} ${pct(v)}`} />
        ))}
      </div>
      <div className="row wrap tiny muted" style={{ marginTop: 4, gap: 12 }}>
        {parts.map(([k, v]) => (
          <span key={k}>
            <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: MIX_COLORS[k], marginRight: 4 }} />
            {k} {pct(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Pillars({ pillars }) {
  const [open, setOpen] = useState(null);
  return (
    <div>
      {pillars.map((p) => (
        <button
          type="button"
          className="pillar"
          key={p.id}
          aria-expanded={open === p.id}
          onClick={() => setOpen(open === p.id ? null : p.id)}
        >
          <span>
            {p.label} <span className="small muted">· {p.value}</span>
          </span>
          <span className="num small">
            {p.points}
            <span className="muted">/{p.weight}</span>
          </span>
          <div className={`bar ${p.status}`}>
            <i style={{ width: `${(p.points / p.weight) * 100}%` }} />
          </div>
          {open === p.id && <div className="detail">{p.detail}</div>}
        </button>
      ))}
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Select a row to see how it’s scored.
      </p>
    </div>
  );
}

const CAT_LABEL = { protect: 'Protect', grow: 'Grow', fix: 'Fix', spend: 'Spending', tax: 'Tax' };

export function ActionItem({ a, onTry, defaultOpen = false, compact = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="action">
      <div className="rank">{a.rank}</div>
      <div>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="caps" style={{ marginBottom: 2 }}>
              <span className={`cat-${a.category}`}>{CAT_LABEL[a.category]}</span> · {a.effort}
            </div>
            <div className="t">{a.title}</div>
            <p className="muted" style={{ marginTop: 2 }}>
              {a.summary}
            </p>
          </div>
          <span className={`chip ${a.confidence === 'high' ? 'good' : a.confidence === 'medium' ? 'ok' : ''}`} title="How sure we are about this recommendation">
            {a.confidence} confidence
          </span>
        </div>
        <div className="impact">
          <span className="m">
            <b>{a.impact.headline}</b>
          </span>
          {a.impact.metrics.map((m) => (
            <span className="m muted" key={m.label}>
              {m.label}: {m.before} → <b style={{ color: 'var(--ink)' }}>{m.after}</b>
            </span>
          ))}
        </div>
        {!compact && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Hide reasoning' : 'Why, how & assumptions'}
            </button>
            {a.scenario && onTry && (
              <button className="btn ghost sm" onClick={() => onTry(a.scenario)}>
                Try it in What if →
              </button>
            )}
          </div>
        )}
        {open && (
          <div className="cols3">
            <div>
              <div className="caps">Why</div>
              <ul>{a.why.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <div className="caps">How</div>
              <ul>{a.how.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <div className="caps">Assuming</div>
              <ul>{a.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TRACE_ICON = { plan: '◇', tool: '→', think: '…', answer: '✎', check: '✓', note: '!' };

export function Trace({ trace, ms, grounding, open = false }) {
  const tools = trace.filter((t) => t.kind === 'tool').length;
  return (
    <details className="trace" open={open}>
      <summary>
        How I worked this out · {tools} calculation{tools === 1 ? '' : 's'}
        {ms != null && ` · ${(ms / 1000).toFixed(1)}s`}
        {grounding && grounding.total > 0 && (
          <span style={{ marginLeft: 8, color: grounding.untraced.length ? 'var(--amber)' : 'var(--green)' }}>
            {grounding.untraced.length ? `${grounding.traced}/${grounding.total} figures traced` : `all ${grounding.total} figures traced`}
          </span>
        )}
      </summary>
      <ol>
        {trace.map((t, i) => (
          <li key={i}>
            <span className="ic">{TRACE_ICON[t.kind] || '·'}</span>
            <span>
              {t.kind === 'tool' && <code>{t.name}</code>} {t.label}
              {t.input && Object.keys(t.input).length > 0 && (
                <span className="mono muted" style={{ display: 'block', marginTop: 2 }}>
                  {JSON.stringify(t.input)}
                </span>
              )}
              {t.detail && (
                <span className="small muted" style={{ display: 'block' }}>
                  {t.detail}
                </span>
              )}
            </span>
            <span className="mono muted">{t.ms ? `${t.ms}ms` : ''}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function Money({ v, className = '' }) {
  return <span className={`num ${className}`}>{inr(v)}</span>;
}
