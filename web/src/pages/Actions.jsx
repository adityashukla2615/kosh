import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync, Loading, ErrorNote, PageHead, ActionItem } from '../components/bits.jsx';

const FILTERS = [
  ['all', 'All'],
  ['protect', 'Protect'],
  ['fix', 'Fix'],
  ['grow', 'Grow'],
  ['spend', 'Spending'],
  ['tax', 'Tax'],
];

export default function Actions({ profileId, assumptions, tryScenario }) {
  const { data, error, loading } = useAsync(() => api.actions(profileId, assumptions), [profileId, JSON.stringify(assumptions)]);
  const [filter, setFilter] = useState('all');
  if (error) return <ErrorNote msg={error} />;
  if (loading && !data) return <Loading h={420} label="Simulating each option against your plan…" />;

  const list = data.actions.filter((a) => filter === 'all' || a.category === filter);
  return (
    <div>
      <PageHead
        title="Next steps"
        sub="Every suggestion below was tested before it was ranked: we apply it to a copy of your plan, re-run the simulations, and order by how much it actually moves your goals, your safety net and your health score."
      />
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {FILTERS.map(([k, l]) => {
          const n = k === 'all' ? data.actions.length : data.actions.filter((a) => a.category === k).length;
          if (!n) return null;
          return (
            <button key={k} className={`chip btnlike ${filter === k ? 'good' : ''}`} onClick={() => setFilter(k)}>
              {l} · {n}
            </button>
          );
        })}
      </div>
      <div className="card">
        {list.map((a, i) => (
          <ActionItem key={a.id} a={a} onTry={tryScenario} defaultOpen={i === 0 && filter === 'all'} />
        ))}
      </div>
      <p className="foot-note">
        Premiums and tax figures are ballparks, clearly labelled. Kosh suggests categories (a term plan, an index fund) and never specific products. For large or
        irreversible decisions, a SEBI-registered adviser or a CA is worth an hour of your time.
      </p>
    </div>
  );
}
