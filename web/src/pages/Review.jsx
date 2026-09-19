import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { PageHead, ErrorNote } from '../components/bits.jsx';

const STAGES = [
  ['intake', 'Intake', 'Checks the data is complete enough to plan on'],
  ['spending', 'Spending analyst', 'Looks for trends and leaks in transactions'],
  ['goals', 'Goal planner', 'Re-runs every goal through the simulator'],
  ['stress', 'Risk officer', 'Stress-tests the plan against bad luck'],
  ['actions', 'Strategist', 'Simulates candidate moves and ranks them'],
  ['compliance', 'Compliance reviewer', 'No product pushing; every claim has its assumptions'],
  ['writer', 'Writer', 'Drafts your note'],
  ['factcheck', 'Fact checker', 'Every ₹ and % must trace back to the pipeline'],
];

export default function Review({ profileId, assumptions, meta }) {
  const [res, setRes] = useState(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // the pipeline returns in one go; reveal stages one by one so people can follow it
  useEffect(() => {
    if (!res || shown >= res.steps.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 380);
    return () => clearTimeout(t);
  }, [res, shown]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    setShown(0);
    try {
      setRes(await api.review(profileId, assumptions));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const done = res && shown >= res.steps.length;

  return (
    <div>
      <PageHead
        title="Monthly review"
        sub="A small team of specialist agents goes through your finances in order, each handing its findings to the next. The maths is deterministic; the language model only writes the note, and a fact checker verifies it before you see it."
        right={
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? 'Running…' : res ? 'Run again' : 'Run this month’s review'}
          </button>
        }
      />
      {err && <ErrorNote msg={err} />}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="pipe">
            {STAGES.map(([id, agent, role], i) => {
              const step = res?.steps.find((s) => s.id === id);
              const visible = step && i < shown;
              const state = visible ? step.status : busy && i === 0 ? 'running' : 'pending';
              return (
                <div key={id} className={`stage ${visible ? state : 'pending'}`}>
                  <span className="node">{visible ? (state === 'warn' ? '!' : '✓') : i + 1}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{agent}</div>
                    <div className="small muted">{visible && id === 'writer' ? step.role : role}</div>
                    {visible && (
                      <>
                        <div className="small" style={{ marginTop: 4 }}>
                          {step.summary}
                        </div>
                        {step.findings?.length > 0 && (
                          <ul>
                            {step.findings.slice(0, 5).map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  <span className="mono muted">{visible ? `${step.ms}ms` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ minHeight: 280 }}>
          <div className="caps" style={{ marginBottom: 10 }}>
            Your note{res?.previous ? ` · compared with ${new Date(res.previous).toLocaleDateString('en-IN')}` : ''}
          </div>
          {done ? (
            <>
              <div className="letter">{res.letter}</div>
              <hr className="rule" />
              <div className="small muted">
                {res.grounding.untraced.length === 0 ? `✓ All ${res.grounding.total} figures in this note were checked against the calculations.` : `${res.grounding.traced}/${res.grounding.total} figures verified.`}{' '}
                Written by {res.mode === 'offline' ? 'the template writer (no model connected)' : meta?.llm?.model}.
              </div>
            </>
          ) : (
            <p className="muted">{busy || res ? 'Waiting for the team to finish…' : 'Run the review to get this month’s note.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
