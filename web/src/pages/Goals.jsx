import { useState } from 'react';
import { api } from '../lib/api.js';
import { inr, pct } from '../lib/format.js';
import { useQuery, Loading, ErrorNote, PageHead, ProbBar, StatusChip, PriorityChip, MixBar } from '../components/bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';

function Solver({ profileId, goal, assumptions, tryScenario }) {
  const [target, setTarget] = useState(0.8);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setRes(await api.solveGoal(profileId, goal.id, target, assumptions));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#f7f3e9', borderRadius: 8, padding: '10px 12px' }}>
      <div className="row wrap">
        <span className="small">What would it take to reach</span>
        <select className="inline-input" style={{ width: 76 }} value={target} onChange={(e) => (setTarget(Number(e.target.value)), setRes(null))}>
          {[0.6, 0.7, 0.8, 0.9].map((t) => (
            <option key={t} value={t}>
              {pct(t)}
            </option>
          ))}
        </select>
        <button className="btn sm" onClick={run} disabled={busy}>
          {busy ? 'Solving…' : 'Work it out'}
        </button>
      </div>
      {res && (
        <div className="small" style={{ marginTop: 8 }}>
          {res.extra === 0 ? (
            <span>Already there - no change needed.</span>
          ) : (
            <>
              <div>
                <b>Option A:</b> add <b className="num">{inr(res.extra)}</b>/month → {pct(res.reached)} odds.{' '}
                <button className="btn ghost sm" onClick={() => tryScenario({ extraMonthly: res.extra })}>
                  try it
                </button>
              </div>
              <div>
                <b>Option B:</b>{' '}
                {res.delay ? (
                  <>
                    push it out by {res.delay.years} year{res.delay.years > 1 ? 's' : ''} with no extra money → {pct(res.delay.probability)} odds.
                  </>
                ) : (
                  'waiting up to 10 years doesn’t get there alone; the target itself needs a rethink.'
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Goals({ profileId, assumptions, tryScenario }) {
  const { data, error, loading, refetch } = useQuery(cacheKeys.overview(profileId, assumptions), () =>
    api.overview(profileId, assumptions),
  );
  if (error) return <ErrorNote msg={error} onRetry={refetch} />;
  if (loading) return <Loading shape="list" label="Planning each goal" />;
  const { goals } = data;

  return (
    <div>
      <PageHead
        title="Goals"
        sub="Each goal gets its own bucket of money. Probabilities come from simulating the markets hundreds of times with the money that is actually set aside for it."
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="caps" style={{ marginBottom: 6 }}>
          How money is shared out
        </div>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)' }}>
          <li>
            {inr(goals.reserve)} is kept aside as your emergency cushion. It is never counted towards goals.
          </li>
          <li>EPF, PPF and NPS only count towards retirement.</li>
          <li>Other savings are set aside for the nearest goals first - enough to be comfortable, not just “on average”.</li>
          <li>Your monthly SIPs are shared by what each goal still needs, with must-haves weighted highest. EPF contributions go to retirement.</li>
          <li>Money already set aside stays in whatever it is invested in today. New money follows a mix that suits the goal’s timeline.</li>
        </ol>
      </div>

      <div className="grid g2">
        {goals.goals.map((g) => (
          <div className="card goal-card" key={g.id}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2>{g.name}</h2>
                <div className="row small muted" style={{ marginTop: 4 }}>
                  <PriorityChip priority={g.priority} />
                  <span>
                    by {g.year} · {g.years} yr{g.years === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <StatusChip status={g.status} />
            </div>

            <ProbBar value={g.probability} />

            <div className="meta small">
              <div>
                <span className="muted">Costs today</span>
                <span className="num">{inr(g.costToday)}</span>
              </div>
              <div>
                <span className="muted">At {pct(g.inflationUsed)} inflation, by {g.year}</span>
                <span className="num">{inr(g.costFuture)}</span>
              </div>
              <div>
                <span className="muted">Set aside now</span>
                <span className="num">{inr(g.earmarked)}</span>
              </div>
              <div>
                <span className="muted">Monthly: getting / needs</span>
                <span className="num">
                  {inr(g.monthly)} / {inr(g.requiredMonthly)}
                </span>
              </div>
              <div>
                <span className="muted">Middle-case value at goal date</span>
                <span className="num">{inr(g.projected.p50)}</span>
              </div>
              <div>
                <span className="muted">Bad-luck case (1 in 10)</span>
                <span className="num">{inr(g.projected.p10)}</span>
              </div>
            </div>

            <div>
              <div className="tiny muted" style={{ marginBottom: 4 }}>
                Money already set aside is invested like this today
              </div>
              <MixBar mix={g.corpusMix} />
            </div>
            <div>
              <div className="tiny muted" style={{ marginBottom: 4 }}>
                New money for this goal goes in like this ({g.years < 3 ? 'short timeline, so mostly safe' : 'long enough to ride out dips'})
              </div>
              <MixBar mix={g.mix} />
            </div>

            <Solver profileId={profileId} goal={g} assumptions={assumptions} tryScenario={tryScenario} />
          </div>
        ))}
      </div>
    </div>
  );
}
