import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import Welcome from './pages/Welcome.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Overview from './pages/Overview.jsx';
import Goals from './pages/Goals.jsx';
import WhatIf from './pages/WhatIf.jsx';
import Actions from './pages/Actions.jsx';
import Spending from './pages/Spending.jsx';
import Advisor from './pages/Advisor.jsx';
import Review from './pages/Review.jsx';
import Assumptions from './pages/Assumptions.jsx';

const PAGES = [
  { id: 'overview', label: 'Overview', C: Overview },
  { id: 'goals', label: 'Goals', C: Goals },
  { id: 'whatif', label: 'What if…', C: WhatIf },
  { id: 'actions', label: 'Next steps', C: Actions },
  { id: 'spending', label: 'Spending', C: Spending },
  { id: 'ask', label: 'Ask Kosh', C: Advisor },
  { id: 'review', label: 'Monthly review', C: Review },
  { id: 'assumptions', label: 'Assumptions', C: Assumptions },
];

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode etc - fine */
  }
};

function readHash() {
  const [, page, sub] = window.location.hash.match(/^#\/?([\w-]*)\/?([\w-]*)?/) || [];
  return { page: page || '', sub: sub || '' };
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState(null);
  const [profile, setProfile] = useState(() => load('kosh.profile', null)); // { id, name }
  const [assumptions, setAssumptions] = useState(() => load('kosh.assumptions', {}));
  const [route, setRoute] = useState(readHash);
  const [pendingScenario, setPendingScenario] = useState(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setMetaErr(e.message));
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => save('kosh.profile', profile), [profile]);
  useEffect(() => save('kosh.assumptions', assumptions), [assumptions]);

  const go = useCallback((page) => {
    window.location.hash = `/${page}`;
  }, []);

  const pick = (p) => {
    setProfile({ id: p.id, name: p.name, custom: !!p.custom });
    go('overview');
  };

  // open the what-if page with levers pre-set (from Next steps / Goals)
  const tryScenario = (scenario) => {
    setPendingScenario(scenario);
    go('whatif');
  };

  const page = PAGES.find((p) => p.id === route.page);
  const assumptionsChanged = useMemo(() => Object.keys(assumptions).length > 0, [assumptions]);

  if (metaErr) {
    return (
      <div className="welcome">
        <div className="banner err">Can’t reach the Kosh API ({metaErr}). Is the backend running on port 8787?</div>
      </div>
    );
  }

  if (route.page === 'start') return <Onboarding onDone={pick} onBack={() => go('')} />;
  if (!profile || !page) return <Welcome meta={meta} onPick={pick} onCustom={() => go('start')} current={profile} onResume={() => go('overview')} />;

  const Page = page.C;
  const llm = meta?.llm;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <b>Kosh</b>
          <span>wealth, explained</span>
        </div>
        <button className="who" onClick={() => go('')} title="Switch household">
          <span className="caps">Planning for</span>
          <span className="name">{profile.name}</span>
          <span className="small muted">{profile.custom ? 'Your numbers' : 'Sample household'} · switch</span>
        </button>
        <nav className="nav">
          {PAGES.map((p, i) => (
            <button key={p.id} className={p.id === page.id ? 'on' : ''} onClick={() => go(p.id)}>
              <span className="k">{i + 1}</span>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span className="mode">
            <i className={`dot ${llm && llm.provider !== 'offline' ? 'live' : ''}`} />
            {llm ? (llm.provider === 'offline' ? 'Advisor: offline planner' : `Advisor: ${llm.model}`) : '…'}
          </span>
          {assumptionsChanged && (
            <span className="mode">
              <i className="dot" /> Custom assumptions on
            </span>
          )}
          <span className="tiny muted">Synthetic data · not investment advice</span>
        </div>
      </aside>
      <main className="main">
        <Page
          key={`${profile.id}:${page.id}`}
          profileId={profile.id}
          meta={meta}
          assumptions={assumptions}
          setAssumptions={setAssumptions}
          go={go}
          tryScenario={tryScenario}
          pendingScenario={pendingScenario}
          clearPendingScenario={() => setPendingScenario(null)}
        />
      </main>
    </div>
  );
}
