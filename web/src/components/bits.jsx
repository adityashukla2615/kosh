import { useEffect, useRef, useState } from 'react';
import { inr, pct, STATUS_LABEL, PRIORITY_LABEL } from '../lib/format.js';

// fetch-on-deps with stale response protection
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => n === seq.current && setState({ data, error: null, loading: false }))
      .catch((error) => n === seq.current && setState({ data: null, error: error.message, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Loading({ h = 220, label }) {
  return (
    <div className="stack">
      {label && <span className="small muted">{label}</span>}
      <div className="skeleton" style={{ height: h }} />
    </div>
  );
}

export function ErrorNote({ msg }) {
  return <div className="banner err">{msg}</div>;
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
        <div className="pillar" key={p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
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
        </div>
      ))}
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Tap a row to see how it’s scored.
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
            <button className="btn ghost sm" onClick={() => setOpen(!open)}>
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
