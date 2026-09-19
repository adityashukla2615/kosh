import { api } from '../lib/api.js';
import { inr, pct, greeting, firstName } from '../lib/format.js';
import { useAsync, Loading, ErrorNote, Pillars, ProbBar, StatusChip, ActionItem } from '../components/bits.jsx';
import FanChart from '../components/FanChart.jsx';

export default function Overview({ profileId, assumptions, go, tryScenario }) {
  const { data, error, loading } = useAsync(() => api.overview(profileId, assumptions), [profileId, JSON.stringify(assumptions)]);

  if (error) return <ErrorNote msg={error} />;
  if (loading && !data) return <Loading h={420} label="Running the simulations…" />;

  const { profile, summary: s, health, goals, projection, actions, actionCount } = data;
  const weakest = [...goals.goals].sort((a, b) => a.probability - b.probability)[0];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="caps">
            {greeting()}, {firstName(profile.name)}
          </span>
          <h1 style={{ marginTop: 4 }}>
            {health.score >= 75 ? 'You’re in good shape.' : health.score >= 55 ? 'Solid base, a few gaps.' : 'A few things need attention.'}{' '}
            <span className="muted" style={{ fontWeight: 400 }}>
              “{weakest.name}” needs the most help.
            </span>
          </h1>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="caps">Net worth</span>
          <div className="v">{inr(s.netWorth)}</div>
          <span className="s">
            {inr(s.financialAssets)} investments{s.debts ? ` · ${inr(s.debts)} loans` : ''}
          </span>
        </div>
        <div className="kpi">
          <span className="caps">Left over each month</span>
          <div className="v">{inr(s.surplus)}</div>
          <span className="s">after spending, EMIs & SIPs</span>
        </div>
        <div className="kpi">
          <span className="caps">Emergency runway</span>
          <div className="v">{s.emergencyMonths.toFixed(1)} mo</div>
          <span className="s">target 6 months</span>
        </div>
        <div className="kpi">
          <span className="caps">Savings rate</span>
          <div className="v">{pct(s.savingsRate)}</div>
          <span className="s">incl. EPF</span>
        </div>
      </div>

      <div className="grid g-main">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Where this is heading</h2>
              <p className="small muted">
                Net worth in today’s rupees. Line = middle case, band = 8 in 10 simulated futures. Dips are goals being paid for.
              </p>
            </div>
          </div>
          <FanChart series={projection.series} payouts={projection.payouts} />
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Portfolio as held today: ~{pct(projection.portfolioReturn, 1)} expected return, {pct(projection.portfolioVol, 1)} yearly swings. Assumes half of any
            un-invested surplus gets spent. <button className="btn ghost sm" onClick={() => go('assumptions')}>Change assumptions</button>
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Financial health</h2>
            <span className={`chip ${health.score >= 75 ? 'good' : health.score >= 55 ? 'ok' : 'weak'}`}>{health.band}</span>
          </div>
          <div className="score" style={{ marginBottom: 10 }}>
            <span className="big">{health.score}</span>
            <span className="muted">/ 100</span>
          </div>
          <Pillars pillars={health.pillars} />
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <h2>Goals</h2>
            <button className="btn ghost sm" onClick={() => go('goals')}>
              Details →
            </button>
          </div>
          <div className="stack">
            {goals.goals.map((g) => (
              <div key={g.id}>
                <div className="spread" style={{ marginBottom: 4 }}>
                  <span>
                    {g.name} <span className="small muted">· {g.year}</span>
                  </span>
                  <StatusChip status={g.status} />
                </div>
                <ProbBar value={g.probability} />
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Chance of having the full amount on time, across {assumptionsLabel(assumptions)} simulated markets. Dashed line = 80%.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Do these next</h2>
            <button className="btn ghost sm" onClick={() => go('actions')}>
              All {actionCount} →
            </button>
          </div>
          {actions.map((a) => (
            <ActionItem key={a.id} a={a} compact />
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            {actions[0]?.scenario && (
              <button className="btn sm" onClick={() => tryScenario(actions[0].scenario)}>
                See #1 in What if
              </button>
            )}
            <button className="btn sm" onClick={() => go('ask')}>
              Ask about these
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const assumptionsLabel = (a) => a?.simulations || 800;
