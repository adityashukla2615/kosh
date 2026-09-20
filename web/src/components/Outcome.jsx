import { api } from '../lib/api.js';
import { inr, pct } from '../lib/format.js';
import { useQuery } from './bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';

/**
 * What following the plan is worth.
 *
 * Everything else on the Overview answers "where do I stand" and "what should I
 * do". This answers "and what does that get me", which is the question people
 * actually came with. It loads after the dashboard rather than holding it up,
 * because it costs a full action ranking plus a comparison.
 */
export default function Outcome({ profileId, assumptions, go }) {
  const { data, loading, error } = useQuery(cacheKeys.outcome(profileId, assumptions), () => api.outcome(profileId, assumptions));

  if (error) return null; // the dashboard is still useful without this
  if (loading) {
    return (
      <div className="card outcome loading-shape" aria-busy="true">
        <div className="skeleton" style={{ height: 14, width: 220 }} />
        <div className="skeleton" style={{ height: 30, width: '70%', marginTop: 10 }} />
      </div>
    );
  }
  if (!data?.available) return null;

  const { biggestMove, healthScore, medianWealth, goalsImproved, goalsTotal, actionsApplied, effortSummary, interestSavedPerYear, basis } = data;

  return (
    <div className="card outcome">
      <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span className="caps">If you do the next {actionsApplied.length} things</span>
          {biggestMove && (
            <h2 className="outcome-head">
              “{biggestMove.name}” goes from <b>{pct(biggestMove.before)}</b> to <b className="up">{pct(biggestMove.after)}</b>
            </h2>
          )}
        </div>
        <button className="btn sm" onClick={() => go('actions')}>
          See the {actionsApplied.length} →
        </button>
      </div>

      <div className="outcome-grid">
        <div>
          <span className="caps">Goals improved</span>
          <div className="v num">
            {goalsImproved} <span className="muted">of {goalsTotal}</span>
          </div>
        </div>
        <div>
          <span className="caps">Health score</span>
          <div className="v num">
            {healthScore.before} <span className="muted">→</span> <span className="up">{healthScore.after}</span>
          </div>
        </div>
        <div>
          <span className="caps">Median wealth, {medianWealth.year}</span>
          <div className="v num">
            <span className="up">+{inr(medianWealth.delta)}</span>
          </div>
          <span className="s muted">
            {inr(medianWealth.before)} → {inr(medianWealth.after)}
          </span>
        </div>
        {interestSavedPerYear > 0 && (
          <div>
            <span className="caps">Interest saved</span>
            <div className="v num">
              <span className="up">{inr(interestSavedPerYear)}</span>
            </div>
            <span className="s muted">a year, guaranteed</span>
          </div>
        )}
      </div>

      <p className="tiny muted" style={{ marginTop: 12 }}>
        {effortSummary} Measured, not promised — {basis.method}
      </p>
    </div>
  );
}
